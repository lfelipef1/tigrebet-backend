const { Sequelize } = require('sequelize');
const path = require('path');

// Database configuration
const isDevelopment = process.env.NODE_ENV !== 'production';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../database.sqlite'),
  logging: isDevelopment ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
  } catch (error) {
    console.error('❌ Unable to connect to database:', error);
    throw error;
  }
};

module.exports = { sequelize, testConnection };
