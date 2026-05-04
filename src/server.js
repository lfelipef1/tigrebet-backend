require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');
const { authLimiter, apiLimiter, gameLimiter } = require('./middleware/rateLimiter');
const { syncDatabase, redis } = require('./models');


// Controllers
const authController = require('./controllers/authController');
const wingoController = require('./controllers/wingoController');
const slotsController = require('./controllers/slotsController');
const minesweeperController = require('./controllers/minesweeperController');
const envelopesController = require('./controllers/envelopesController');
const vipController = require('./controllers/vipController');
const commissionController = require('./controllers/commissionController');
const referralController = require('./controllers/referralController');
const tigerController = require('./controllers/tigerController');
const crashController = require('./controllers/crashController');
const plinkoController = require('./controllers/plinkoController');
const paymentController = require('./controllers/paymentController');
const kycController = require('./controllers/kycController');
const missionController = require('./controllers/missionController');
const caixaController = require('./controllers/caixaController');
const scratchController = require('./controllers/scratchController');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware with advanced configuration (ISO 27001)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || 'http://localhost:3000', 'https://bet.roleplaymedellin.com.br', 'https://tigrebet.roleplaymedellin.com.br', 'https://backend-production-9f2a.up.railway.app', 'http://127.0.0.1:3000'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://tigrebet.roleplaymedellin.com.br',
    'https://bet.roleplaymedellin.com.br',
    'http://127.0.0.1:3000',
    'http://localhost:3000'
  ],
  credentials: true,
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

const authenticate = require('./middleware/auth');
const { validate, registerSchema, loginSchema, wingoBetSchema, slotsBetSchema, minesweeperOrderSchema, envelopeOrderSchema, tigerBetSchema, crashBetSchema, plinkoBetSchema, caixaBetSchema, scratchBetSchema } = require('./validations');

// API v1 routes
app.get('/api/v1/health', async (req, res) => {
  try {
    const dbStatus = await require('./config/database-postgres').healthCheck();
    res.json({ 
      status: 'ok', 
      message: 'Fortune Tiger Pro API v1 is running',
      database: dbStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Service unavailable',
      error: error.message 
    });
  }
});

// Auth routes (public)
app.post('/api/v1/register', authLimiter, validate(registerSchema), authController.register);
app.post('/api/v1/login', authLimiter, validate(loginSchema), authController.login);
app.post('/api/v1/auth/forgot-password', authLimiter, authController.forgotPassword);
app.post('/api/v1/auth/reset-password', authLimiter, authController.resetPassword);

// Payment webhook — public (MercadoPago calls this directly)
app.post('/api/v1/payment/webhook/mercadopago', paymentController.receiveWebhook);

// Caixa Premiada status (public — visitors can see current pot)
app.get('/api/v1/caixa/status', apiLimiter, caixaController.getStatus);

// Protected routes (require JWT)
app.use('/api/v1', authenticate);

app.post('/api/v1/register_check', apiLimiter, authController.registerCheck);

// Wingo game routes
app.get('/api/v1/wingo/common_data', apiLimiter, wingoController.getCommonData);
app.get('/api/v1/wingo/trend', apiLimiter, wingoController.getTrend);
app.get('/api/v1/wingo/balance', apiLimiter, wingoController.getBalance);
app.post('/api/v1/wingo/game_fetch', gameLimiter, wingoController.gameFetch);
app.post('/api/v1/wingo/bet', gameLimiter, validate(wingoBetSchema), wingoController.placeBet);
app.post('/api/v1/wingo/bet_orders', apiLimiter, wingoController.getBetOrders);

// Slots game routes
app.post('/api/v1/slots/play', gameLimiter, validate(slotsBetSchema), slotsController.playSlots);

// Tiger game routes
app.post('/api/v1/tiger/play', gameLimiter, validate(tigerBetSchema), tigerController.playTiger);

// Crash game routes
app.post('/api/v1/crash/play', gameLimiter, validate(crashBetSchema), crashController.playCrash);

// Plinko game routes
app.post('/api/v1/plinko/play', gameLimiter, validate(plinkoBetSchema), plinkoController.playPlinko);

// Caixa Premiada play (requires auth)
app.post('/api/v1/caixa/play', gameLimiter, validate(caixaBetSchema), caixaController.play);

// Minesweeper game routes
app.post('/api/v1/minesweeper/order', gameLimiter, validate(minesweeperOrderSchema), minesweeperController.createOrder);
app.post('/api/v1/minesweeper/reveal', gameLimiter, minesweeperController.revealCell);
app.post('/api/v1/minesweeper/reward', gameLimiter, minesweeperController.getReward);

// Scratch (Raspadinha) routes
app.post('/api/v1/scratch/play', gameLimiter, validate(scratchBetSchema), scratchController.playScratch);

// Envelopes routes
app.get('/api/v1/redenvelope/info', apiLimiter, envelopesController.getInfo);
app.get('/api/v1/redenvelope/list', apiLimiter, envelopesController.getList);
app.post('/api/v1/redenvelope/order', gameLimiter, validate(envelopeOrderSchema), envelopesController.orderEnvelope);

// VIP routes
app.get('/api/v1/vip/privilege', apiLimiter, vipController.getPrivilege);
app.get('/api/v1/vip/level_info', apiLimiter, vipController.getLevelInfo);
app.get('/api/v1/vip/info', apiLimiter, vipController.getVipInfo);
app.post('/api/v1/vip/upgrade', apiLimiter, vipController.upgradeLevel);
app.post('/api/v1/vip/claim_weekly', apiLimiter, vipController.claimWeeklyBonus);
app.post('/api/v1/vip/claim_monthly', apiLimiter, vipController.claimMonthlyBonus);

// Commission routes
app.get('/api/v1/commission', apiLimiter, commissionController.getCommission);

// Referral routes
app.get('/api/v1/referral', apiLimiter, referralController.getReferralStatistics);

// Payment routes
app.post('/api/v1/payment/deposit', apiLimiter, paymentController.createDeposit);
app.get('/api/v1/payment/deposit/:transactionId/status', apiLimiter, paymentController.checkDepositStatus);
app.post('/api/v1/payment/withdraw', apiLimiter, paymentController.createWithdrawal);
app.get('/api/v1/payment/history', apiLimiter, paymentController.getTransactionHistory);

// KYC routes
app.post('/api/v1/kyc/submit', apiLimiter, kycController.submitKYC);
app.get('/api/v1/kyc/status', apiLimiter, kycController.getKYCStatus);
app.post('/api/v1/kyc/review', apiLimiter, kycController.reviewKYC); // Admin only

// Mission routes
app.get('/api/v1/missions/daily', apiLimiter, missionController.getDailyMissions);
app.post('/api/v1/missions/:missionId/claim', apiLimiter, missionController.claimMissionReward);
app.get('/api/v1/missions/history', apiLimiter, missionController.getMissionHistory);

// Legacy routes (for backward compatibility)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Raspadinha API is running' });
});

// Dev-only: add R$1000 to logged-in user (never available in production)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/v1/dev/topup', authenticate, async (req, res) => {
    try {
      const { User } = require('./models');
      const amount = parseFloat(req.body.amount) || 1000;
      await req.user.increment(['balanceETC', 'balanceETH', 'balanceBTC'], { by: amount });
      await req.user.reload();
      res.json({
        code: 200,
        msg: `R$ ${amount} adicionado em cada moeda`,
        data: {
          balanceETC: parseFloat(req.user.balanceETC),
          balanceETH: parseFloat(req.user.balanceETH),
          balanceBTC: parseFloat(req.user.balanceBTC),
        }
      });
    } catch (error) {
      res.status(500).json({ code: 500, msg: error.message });
    }
  });
}

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    msg: 'Route not found',
  });
});

// Global error handler for uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Close Redis connection
    if (redis) {
      await redis.disconnect();
      logger.info('Redis connection closed');
    }
    
    // Close database connection
    await require('./config/database-postgres').closeConnections();
    logger.info('Database connections closed');
    
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server with database sync
const startServer = async () => {
  try {
    // Test connections first
    await require('./config/database-postgres').testConnections();
    
    // Sync database
    await syncDatabase(false);
    
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Fortune Tiger Pro API running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
