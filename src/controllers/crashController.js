const { User, Bet } = require('../models');
const logger = require('../config/logger');
const SecureRNG = require('../utils/rng');

/**
 * Crash Game Logic
 * In a real app, this would use WebSockets for real-time sync.
 * For this MVP, we'll simulate the "Crash" result.
 */
const playCrash = async (req, res, next) => {
  try {
    const { amount, coin, autoCashout } = req.body;
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

    /**
     * Crash Point Calculation
     * Formula: 0.99 / (1 - X) where X is a random float [0, 1)
     * This gives a house edge and a distribution similar to Aviator.
     */
    const E = 100; // House edge control
    const random = SecureRNG.randomInt(1, 1000000);
    const crashPoint = Math.max(1, (1000000 * 0.99) / (1000000 - random));
    
    let win = 0;
    let finalMultiplier = crashPoint;

    // If autoCashout is set and crashPoint is higher than autoCashout, user wins
    if (autoCashout && crashPoint >= autoCashout) {
      win = amount * autoCashout;
      finalMultiplier = autoCashout;
    }

    if (win > 0) {
      await user.increment(balanceField, { by: win });
      await user.increment('totalWon', { by: win });
      await user.increment('vipPoints', { by: Math.floor(win * 0.1) });
    }

    await Bet.create({
      userId: user.id,
      uid: user.id,
      gameType: 'crash',
      amount,
      result: crashPoint.toFixed(2),
      goal: win,
      coin,
      status: win > 0 ? 'won' : 'lost',
      multiplier: finalMultiplier,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await user.reload();

    res.json({
      code: 200,
      data: {
        crashPoint: parseFloat(crashPoint.toFixed(2)),
        win: parseFloat(win.toFixed(2)),
        balance: user[balanceField],
        vipPoints: user.vipPoints
      }
    });

  } catch (error) {
    logger.error('Crash game error:', error);
    next(error);
  }
};

module.exports = { playCrash };