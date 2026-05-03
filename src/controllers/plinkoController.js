const { Bet } = require('../models');
const logger = require('../config/logger');
const SecureRNG = require('../utils/rng');

const MULTIPLIERS = {
  8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
  12: [10, 5, 2, 1.1, 1.0, 0.5, 0.3, 0.5, 1.0, 1.1, 2, 5, 10],
  16: [20, 10, 5, 2, 1.1, 1.0, 0.5, 0.3, 0.2, 0.3, 0.5, 1.0, 1.1, 2, 5, 10, 20]
};

const playPlinko = async (req, res, next) => {
  console.log('[PLINKO] New play:', req.body);
  try {
    const { amount, coin, rows = 8 } = req.body;
    const user = req.user;

    const balanceField = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    const currentBalance = parseFloat(user[balanceField]);

    if (currentBalance < amount) {
      return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });
    }

    await user.decrement(balanceField, { by: amount });
    await user.increment('totalWagered', { by: amount });
    await user.reload();

    const numRows = [8, 12, 16].includes(rows) ? rows : 8;
    const pyramidMultipliers = MULTIPLIERS[numRows];

    let finalIndex = 0;
    const path = [];
    for (let i = 0; i < numRows; i++) {
      const step = SecureRNG.randomInt(0, 1);
      finalIndex += step;
      path.push(step);
    }

    const multiplier = pyramidMultipliers[finalIndex];
    const win = parseFloat((amount * multiplier).toFixed(2));

    if (win > 0) {
      await user.increment(balanceField, { by: win });
      try {
        await user.increment('totalWon', { by: win });
        await user.increment('vipPoints', { by: Math.floor(win * 0.1) });
      } catch (e) { /* non-fatal */ }
    }

    try {
      await Bet.create({
        userId: user.id,
        uid: user.id,
        gameType: 'plinko',
        amount,
        result: `rows:${numRows},index:${finalIndex},mult:${multiplier}`,
        goal: win,
        coin,
        status: win >= amount ? 'won' : 'lost',
        multiplier,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || ''
      });
    } catch (e) {
      logger.warn('[PLINKO] Bet record failed (non-fatal):', e.message);
    }

    await user.reload();
    console.log(`[PLINKO] Done: index=${finalIndex} mult=${multiplier} win=${win}`);

    res.json({
      code: 200,
      data: {
        path,
        finalIndex,
        multiplier,
        win,
        balance: parseFloat(user[balanceField]),
        vipPoints: user.vipPoints,
      }
    });

  } catch (error) {
    console.error('[PLINKO] FATAL:', error.message);
    logger.error('Plinko game error:', error);
    next(error);
  }
};

module.exports = { playPlinko };
