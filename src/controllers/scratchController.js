const { Bet } = require('../models');
const logger = require('../config/logger');
const SecureRNG = require('../utils/rng');
const gsCache = require('../utils/gameSettings');

// Scratch card symbols with prizes
const SYMBOLS = [
  { id: 'cash10',   label: 'R$ 10',     emoji: '💵', multiplier: 5,    weight: 30 },
  { id: 'cash50',   label: 'R$ 50',     emoji: '💴', multiplier: 10,   weight: 20 },
  { id: 'cash100',  label: 'R$ 100',    emoji: '💶', multiplier: 20,   weight: 12 },
  { id: 'cash500',  label: 'R$ 500',    emoji: '💷', multiplier: 50,   weight: 6  },
  { id: 'moto50',   label: 'Moto 50cc', emoji: '🛵', multiplier: 30,   weight: 10 },
  { id: 'moto125',  label: 'Moto 125',  emoji: '🏍️', multiplier: 75,   weight: 5  },
  { id: 'motopro',  label: 'Moto Pro',  emoji: '🏎️', multiplier: 200,  weight: 2  },
  { id: 'diamond',  label: 'Jackpot',   emoji: '💎', multiplier: 1000, weight: 1  },
  { id: 'star',     label: 'Estrela',   emoji: '⭐', multiplier: 3,    weight: 14 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((acc, s) => acc + s.weight, 0);

function pickSymbol() {
  let r = SecureRNG.randomInt(0, TOTAL_WEIGHT - 1);
  for (const sym of SYMBOLS) {
    if (r < sym.weight) return sym;
    r -= sym.weight;
  }
  return SYMBOLS[0];
}

function generateCard(betAmount) {
  // Decide win outcome first (~35% win rate)
  const winRoll = SecureRNG.randomInt(0, 99);
  const isWin = winRoll < 35;

  let cells = [];

  if (isWin) {
    // Pick a winning symbol and place 3 matching cells
    const winner = pickSymbol();
    const winPositions = new Set();
    while (winPositions.size < 3) winPositions.add(SecureRNG.randomInt(0, 8));

    // Fill remaining cells with non-matching symbols
    for (let i = 0; i < 9; i++) {
      if (winPositions.has(i)) {
        cells.push(winner);
      } else {
        let sym;
        do { sym = pickSymbol(); } while (sym.id === winner.id);
        cells.push(sym);
      }
    }

    const winAmount = parseFloat((betAmount * winner.multiplier).toFixed(2));
    return { cells, winAmount, winSymbolId: winner.id, winPositions: Array.from(winPositions) };
  } else {
    // No match — fill 9 unique-ish symbols (max 2 of any)
    const counts = {};
    for (let i = 0; i < 9; i++) {
      let sym;
      let tries = 0;
      do {
        sym = pickSymbol();
        tries++;
      } while ((counts[sym.id] || 0) >= 2 && tries < 50);
      counts[sym.id] = (counts[sym.id] || 0) + 1;
      cells.push(sym);
    }
    return { cells, winAmount: 0, winSymbolId: null, winPositions: [] };
  }
}

const playScratch = async (req, res, next) => {
  console.log('[SCRATCH] New play:', req.body);
  try {
    const settings = await gsCache.get('scratch');
    if (!settings.isOpen) return res.status(400).json({ code: 400, msg: 'Jogo temporariamente fechado' });

    const { amount, coin } = req.body;
    const user = req.user;

    const balanceField = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    const currentBalance = parseFloat(user[balanceField]);

    if (currentBalance < amount) {
      return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });
    }

    await user.decrement(balanceField, { by: amount });
    await user.increment('totalWagered', { by: amount });
    await user.reload();

    const raw = generateCard(amount);
    const { cells, winSymbolId, winPositions } = raw;
    const winAmount = parseFloat((raw.winAmount * settings.rtp / 100).toFixed(2));

    if (winAmount > 0) {
      await user.increment(balanceField, { by: winAmount });
      try {
        await user.increment('totalWon', { by: winAmount });
        await user.increment('vipPoints', { by: Math.floor(winAmount * 0.1) });
      } catch (e) { /* non-fatal */ }
    }

    try {
      await Bet.create({
        userId: user.id, uid: user.id, gameType: 'scratch',
        amount, result: winSymbolId || 'no_match', goal: winAmount,
        coin, status: winAmount > 0 ? 'won' : 'lost',
        multiplier: winAmount > 0 ? winAmount / amount : 0,
        ipAddress: req.ip || '', userAgent: req.headers['user-agent'] || ''
      });
    } catch (e) { /* non-fatal */ }

    await user.reload();

    // Return cells as clean data (no reveal logic — frontend handles scratch animation)
    const cellData = cells.map(c => ({ id: c.id, label: c.label, emoji: c.emoji, multiplier: c.multiplier }));

    console.log(`[SCRATCH] win=${winAmount} symbol=${winSymbolId}`);

    res.json({
      code: 200,
      data: {
        cells: cellData,
        winAmount,
        winSymbolId,
        winPositions,
        balance: parseFloat(user[balanceField]),
        vipPoints: user.vipPoints,
      }
    });
  } catch (error) {
    console.error('[SCRATCH] FATAL:', error.message);
    logger.error('Scratch game error:', error);
    next(error);
  }
};

module.exports = { playScratch };
