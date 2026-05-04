const { User, Bet } = require('../models');
const logger = require('../config/logger');
const SecureRNG = require('../utils/rng');
const gsCache = require('../utils/gameSettings');

const playSlots = async (req, res, next) => {
  try {
    const settings = await gsCache.get('slots');
    if (!settings.isOpen) return res.status(400).json({ code: 400, msg: 'Jogo temporariamente fechado' });

    const { amount, coin } = req.body;
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

    const symbols = [1, 2, 3, 4, 5, 6, 7, 8];
    const reels = [
      [symbols[SecureRNG.randomInt(0, 7)], symbols[SecureRNG.randomInt(0, 7)], symbols[SecureRNG.randomInt(0, 7)]],
      [symbols[SecureRNG.randomInt(0, 7)], symbols[SecureRNG.randomInt(0, 7)], symbols[SecureRNG.randomInt(0, 7)]],
      [symbols[SecureRNG.randomInt(0, 7)], symbols[SecureRNG.randomInt(0, 7)], symbols[SecureRNG.randomInt(0, 7)]],
    ];

    let win = 0;
    const symbolValues = { 1: 2, 2: 3, 3: 5, 4: 8, 5: 10, 6: 20, 7: 50, 8: 100 };

    for (let row = 0; row < 3; row++) {
      if (reels[0][row] === reels[1][row] && reels[1][row] === reels[2][row]) {
        win += amount * symbolValues[reels[0][row]];
      }
    }

    if (reels[0][0] === reels[1][1] && reels[1][1] === reels[2][2]) {
      win += amount * symbolValues[reels[0][0]] * 2;
    }
    if (reels[0][2] === reels[1][1] && reels[1][1] === reels[2][0]) {
      win += amount * symbolValues[reels[0][2]] * 2;
    }

    win = parseFloat((win * settings.rtp / 100).toFixed(2));

    if (win > 0) {
      await user.increment(balanceField, { by: win });
      await user.increment('totalWon', { by: win });
      await user.increment('vipPoints', { by: Math.floor(win * 0.1) });
    }

    await Bet.create({
      userId: user.id,
      uid: user.id,
      gameType: 'slots',
      amount,
      result: reels.flat().join(','),
      goal: win,
      coin,
      status: win > 0 ? 'won' : 'lost',
      multiplier: win > 0 ? (win / amount) : 0,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await user.reload();

    res.json({
      code: 200,
      data: {
        reels,
        win,
        balance: user[balanceField],
        vipPoints: user.vipPoints
      },
    });
  } catch (error) {
    logger.error('Slots error:', error);
    next(error);
  }
};

module.exports = {
  playSlots,
};