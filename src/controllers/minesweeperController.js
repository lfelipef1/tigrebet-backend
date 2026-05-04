const { Bet } = require('../models');
const logger = require('../config/logger');
const SecureRNG = require('../utils/rng');
const crypto = require('crypto');
const gsCache = require('../utils/gameSettings');

// In-memory session store (short-lived game state)
const sessions = new Map();
const SESSION_TTL = 600_000; // 10 minutes

function cleanupSessions() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.createdAt > SESSION_TTL) sessions.delete(id);
  }
}

function calcMultiplier(safeRevealed, totalCells, mineCount) {
  let m = 0.97;
  for (let i = 0; i < safeRevealed; i++) {
    m *= (totalCells - i) / (totalCells - mineCount - i);
  }
  return parseFloat(m.toFixed(3));
}

const GRID = 25; // 5x5

const createOrder = async (req, res, next) => {
  console.log('[MINES] createOrder:', req.body);
  try {
    const settings = await gsCache.get('mines');
    if (!settings.isOpen) return res.status(400).json({ code: 400, msg: 'Jogo temporariamente fechado' });

    const { amount, mineCount, coin } = req.body;
    const user = req.user;

    const balanceField = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    const currentBalance = parseFloat(user[balanceField]);

    if (currentBalance < amount) {
      return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });
    }

    const safeMineCount = Math.min(Math.max(1, mineCount), 24);

    await user.decrement(balanceField, { by: amount });
    await user.increment('totalWagered', { by: amount });
    await user.reload();

    // Generate mine positions server-side
    const mineSet = new Set();
    while (mineSet.size < safeMineCount) {
      mineSet.add(SecureRNG.randomInt(0, GRID - 1));
    }

    const orderId = crypto.randomBytes(16).toString('hex');
    sessions.set(orderId, {
      userId: user.id,
      amount,
      coin,
      balanceField,
      mineCount: safeMineCount,
      minePositions: Array.from(mineSet),
      safeRevealed: 0,
      createdAt: Date.now(),
      active: true,
      rtp: settings.rtp,
    });

    cleanupSessions();

    console.log(`[MINES] Session created: ${orderId} mines=${safeMineCount}`);

    res.json({
      code: 200,
      data: {
        orderId,
        balance: parseFloat(user[balanceField]),
        gridSize: 5,
        mineCount: safeMineCount,
      },
    });
  } catch (error) {
    console.error('[MINES] createOrder error:', error.message);
    logger.error('Minesweeper order error:', error);
    next(error);
  }
};

const revealCell = async (req, res, next) => {
  try {
    const { orderId, cellIndex } = req.body;
    const user = req.user;

    const session = sessions.get(orderId);
    if (!session || session.userId !== user.id || !session.active) {
      return res.status(400).json({ code: 400, msg: 'Sessão inválida ou expirada' });
    }

    if (cellIndex < 0 || cellIndex >= GRID) {
      return res.status(400).json({ code: 400, msg: 'Célula inválida' });
    }

    const isMine = session.minePositions.includes(cellIndex);

    if (isMine) {
      session.active = false;
      sessions.delete(orderId);

      try {
        await Bet.create({
          userId: user.id, uid: user.id, gameType: 'minesweeper',
          amount: session.amount, result: `mine:${cellIndex}`, goal: 0,
          coin: session.coin, status: 'lost', multiplier: 0,
          ipAddress: req.ip || '', userAgent: req.headers['user-agent'] || ''
        });
      } catch (e) { /* non-fatal */ }

      return res.json({
        code: 200,
        data: {
          isMine: true,
          cellIndex,
          minePositions: session.minePositions,
          currentMultiplier: 0,
          winAmount: 0,
          gameOver: true,
        }
      });
    }

    session.safeRevealed += 1;
    const multiplier = calcMultiplier(session.safeRevealed, GRID, session.mineCount);
    const winAmount = parseFloat((session.amount * multiplier).toFixed(2));

    // Auto-cashout if all safe cells revealed
    const allSafe = session.safeRevealed >= (GRID - session.mineCount);

    res.json({
      code: 200,
      data: {
        isMine: false,
        cellIndex,
        minePositions: allSafe ? session.minePositions : [],
        safeRevealed: session.safeRevealed,
        currentMultiplier: multiplier,
        winAmount,
        gameOver: allSafe,
      }
    });
  } catch (error) {
    console.error('[MINES] revealCell error:', error.message);
    logger.error('Minesweeper reveal error:', error);
    next(error);
  }
};

const getReward = async (req, res, next) => {
  console.log('[MINES] getReward:', req.body);
  try {
    const { orderId, coin } = req.body;
    const user = req.user;

    const session = sessions.get(orderId);
    if (!session || session.userId !== user.id || !session.active) {
      return res.status(400).json({ code: 400, msg: 'Sessão inválida ou expirada' });
    }

    if (session.safeRevealed === 0) {
      return res.status(400).json({ code: 400, msg: 'Revele pelo menos uma célula' });
    }

    const multiplier = calcMultiplier(session.safeRevealed, GRID, session.mineCount);
    const winAmount = parseFloat((session.amount * multiplier * (session.rtp || 95) / 100).toFixed(2));
    const balanceField = session.balanceField;

    await user.increment(balanceField, { by: winAmount });
    try {
      await user.increment('totalWon', { by: winAmount });
      await user.increment('vipPoints', { by: Math.floor(winAmount * 0.1) });
    } catch (e) { /* non-fatal */ }

    try {
      await Bet.create({
        userId: user.id, uid: user.id, gameType: 'minesweeper',
        amount: session.amount, result: `safe:${session.safeRevealed}`, goal: winAmount,
        coin: session.coin, status: 'won', multiplier,
        ipAddress: req.ip || '', userAgent: req.headers['user-agent'] || ''
      });
    } catch (e) { /* non-fatal */ }

    sessions.delete(orderId);
    await user.reload();

    console.log(`[MINES] Cashout: mult=${multiplier} win=${winAmount}`);

    res.json({
      code: 200,
      data: {
        winAmount,
        multiplier,
        balance: parseFloat(user[balanceField]),
        safeRevealed: session.safeRevealed,
      },
    });
  } catch (error) {
    console.error('[MINES] getReward error:', error.message);
    logger.error('Minesweeper reward error:', error);
    next(error);
  }
};

module.exports = { createOrder, revealCell, getReward };
