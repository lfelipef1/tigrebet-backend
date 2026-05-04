const { User, Bet } = require('../models');
const SecureRNG = require('../utils/rng');
const { auditLogger } = require('../utils/auditLogger');
const logger = require('../config/logger');
const gsCache = require('../utils/gameSettings');

const getCommonData = async (req, res, next) => {
  try {
    const user = req.user;
    res.json({
      code: 200,
      data: {
        app: 'TigerBet',
        vip: user.vipLevel.toString(),
        vipPoints: user.vipPoints,
      },
    });
  } catch (error) {
    logger.error('Get common data error:', error);
    next(error);
  }
};

const gameFetch = async (req, res, next) => {
  try {
    const { coin } = req.body;
    const period = Date.now().toString();
    const result = SecureRNG.randomInt(0, 9);
    res.json({
      code: 200,
      data: { period, win: result },
    });
  } catch (error) {
    logger.error('Game fetch error:', error);
    next(error);
  }
};

const placeBet = async (req, res, next) => {
  try {
    const settings = await gsCache.get('wingo');
    if (!settings.isOpen) return res.status(400).json({ code: 400, msg: 'Jogo temporariamente fechado' });

    const { period, select, amount, coin } = req.body;
    const user = req.user;

    // Get balance based on coin
    const balanceField = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    const currentBalance = user[balanceField];

    if (currentBalance < amount) {
      return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });
    }

    // Atomic deduction
    await user.decrement(balanceField, { by: amount });
    await user.increment('totalWagered', { by: amount });
    await user.reload();

    const result = SecureRNG.randomInt(0, 9);
    let goal = 0;
    const fee = amount * 0.02;

    if (typeof select === 'number' && select === result) {
      goal = amount * 9;
    } else if (select === 'red' && [2, 4, 6, 8].includes(result)) {
      goal = amount * 2;
    } else if (select === 'green' && [1, 3, 7, 9].includes(result)) {
      goal = amount * 2;
    } else if (select === 'violet' && [0, 5].includes(result)) {
      goal = amount * 4.5;
    } else if (select === 'large' && result >= 5) {
      goal = amount * 2;
    } else if (select === 'small' && result < 5) {
      goal = amount * 2;
    }

    goal = parseFloat((goal * settings.rtp / 100).toFixed(2));

    if (goal > 0) {
      await user.increment(balanceField, { by: (goal - fee) });
      await user.increment('totalWon', { by: (goal - fee) });
      await user.increment('vipPoints', { by: Math.floor((goal - fee) * 0.1) });
    }

    await Bet.create({
      userId: user.id,
      uid: user.id,
      gameType: 'wingo',
      period,
      select: select.toString(),
      amount,
      result,
      goal,
      coin,
      fee,
      status: goal > 0 ? 'won' : 'lost',
      multiplier: goal > 0 ? (goal / amount) : 0,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await user.reload();

    res.json({
      code: 200,
      data: {
        result,
        goal,
        balance: user[balanceField],
        vipPoints: user.vipPoints
      },
    });
  } catch (error) {
    logger.error('Wingo bet error:', error);
    next(error);
  }
};

const getBetOrders = async (req, res, next) => {
  try {
    const { coin, page = 1 } = req.body;
    const user = req.user;
    const bets = await Bet.findAll({
      where: { userId: user.id, coin },
      order: [['createdAt', 'DESC']],
      limit: 10,
      offset: (page - 1) * 10
    });
    const total = await Bet.count({ where: { userId: user.id, coin } });
    res.json({
      code: 200,
      data: {
        fetch: bets.map(b => ({
          period: b.period,
          select: b.select,
          amount: b.amount,
          result: b.result,
          goal: b.goal,
          time: b.createdAt,
        })),
        total,
      },
    });
  } catch (error) {
    logger.error('Get bet orders error:', error);
    next(error);
  }
};

const getTrend = async (req, res, next) => {
  try {
    const { coin } = req.query;
    const bets = await Bet.findAll({
      where: { gameType: 'wingo', coin },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    const recentResults = bets.map(b => b.result);
    res.json({ code: 200, data: recentResults });
  } catch (error) {
    logger.error('Get trend error:', error);
    next(error);
  }
};

const getBalance = async (req, res, next) => {
  try {
    const { coin } = req.query;
    const user = req.user;
    const balanceField = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    res.json({ code: 200, data: { money: user[balanceField] || 0 } });
  } catch (error) {
    logger.error('Get balance error:', error);
    next(error);
  }
};

module.exports = {
  getCommonData,
  gameFetch,
  placeBet,
  getBetOrders,
  getTrend,
  getBalance,
};