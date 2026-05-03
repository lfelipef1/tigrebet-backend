const { Sequelize } = require('sequelize');
const Redis = require('ioredis');

// PostgreSQL Configuration
const sequelize = new Sequelize(
  process.env.DB_NAME || 'fortune_tiger_pro',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV !== 'production' ? console.log : false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false
    }
  }
);

// Redis Configuration for caching and sessions
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
  db: process.env.REDIS_DB || 0,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null, // disable auto-retry — fail fast in dev
  lazyConnect: true,
  enableOfflineQueue: false,
});

// Swallow connection errors so Redis absence doesn't crash the process
redis.on('error', () => {});

// Connection testing
const testConnections = async () => {
  // PostgreSQL is required — throws if unavailable
  await sequelize.authenticate();
  console.log('✅ PostgreSQL connection established successfully');

  // Redis is optional — warn but don't crash
  try {
    await redis.connect();
    console.log('✅ Redis connection established successfully');
  } catch (err) {
    console.warn('⚠️  Redis unavailable — running without cache (dev mode OK):', err.message);
  }

  return true;
};

// Health check for load balancers
const healthCheck = async () => {
  try {
    await sequelize.authenticate();
    await redis.ping();
    return { postgres: 'healthy', redis: 'healthy' };
  } catch (error) {
    return { postgres: 'unhealthy', redis: 'unhealthy', error: error.message };
  }
};

// Graceful shutdown
const closeConnections = async () => {
  try {
    await sequelize.close();
    await redis.disconnect();
    console.log('✅ All connections closed gracefully');
  } catch (error) {
    console.error('❌ Error closing connections:', error);
  }
};

module.exports = {
  sequelize,
  redis,
  testConnections,
  healthCheck,
  closeConnections
};
