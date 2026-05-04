const { Bet } = require('../models');
const logger = require('../config/logger');
const gsCache = require('../utils/gameSettings');
const crypto = require('crypto');

// Wheel: 15 segments — 0=WHITE(14x), odd=RED(2x), even non-zero=BLACK(2x)
const TOTAL_SEGS = 15;
const SEG_COLORS = Array.from({ length: TOTAL_SEGS }, (_, i) =>
  i === 0 ? 'white' : i % 2 === 1 ? 'red' : 'black'
);
const MULTIPLIERS = { red: 2, black: 2, white: 14 };
const PHASES = { BETTING: 12000, SPINNING: 5000, RESULT: 4000 };

function newSeed() { return crypto.randomBytes(32).toString('hex'); }
function hashSeed(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function deriveSeg(serverSeed, nonce) {
  const h = crypto.createHmac('sha256', serverSeed).update(String(nonce)).digest('hex');
  return parseInt(h.slice(0, 8), 16) % TOTAL_SEGS;
}

let roundState = {
  id: null, nonce: 0, serverSeedHash: null, serverSeed: null,
  phase: 'result', phaseEndsAt: 0,
  resultSegment: null, result: null, resolvedServerSeed: null,
};
let pendingBets = {};
let history = [];
let roundNonce = 0;

function startRound() {
  roundNonce++;
  const serverSeed = newSeed();
  roundState = {
    id: `d_${roundNonce}_${Date.now()}`,
    nonce: roundNonce,
    serverSeedHash: hashSeed(serverSeed),
    serverSeed,
    phase: 'betting',
    phaseEndsAt: Date.now() + PHASES.BETTING,
    resultSegment: null, result: null, resolvedServerSeed: null,
  };
  pendingBets = {};
  setTimeout(startSpinning, PHASES.BETTING);
}

function startSpinning() {
  const seg = deriveSeg(roundState.serverSeed, roundState.nonce);
  roundState.resultSegment = seg;
  roundState.result = SEG_COLORS[seg];
  roundState.phase = 'spinning';
  roundState.phaseEndsAt = Date.now() + PHASES.SPINNING;
  setTimeout(startResult, PHASES.SPINNING);
}

async function startResult() {
  roundState.phase = 'result';
  roundState.resolvedServerSeed = roundState.serverSeed;
  roundState.phaseEndsAt = Date.now() + PHASES.RESULT;

  history.unshift({
    nonce: roundState.nonce,
    result: roundState.result,
    resultSegment: roundState.resultSegment,
    serverSeedHash: roundState.serverSeedHash,
    resolvedServerSeed: roundState.resolvedServerSeed,
  });
  if (history.length > 50) history.length = 50;

  await settleBets(roundState.result, roundState.resultSegment);
  setTimeout(startRound, PHASES.RESULT);
}

async function settleBets(result, seg) {
  const snapshot = { ...pendingBets };
  const mult = MULTIPLIERS[result];
  for (const [userId, bet] of Object.entries(snapshot)) {
    try {
      const { User } = require('../models');
      const user = await User.findByPk(userId);
      if (!user) continue;
      const field = bet.coin === 'ETC' ? 'balanceETC' : bet.coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
      const isWin = bet.color === result;
      const win = isWin ? parseFloat((bet.amount * mult).toFixed(2)) : 0;
      if (win > 0) {
        await user.increment(field, { by: win });
        await user.increment('totalWon', { by: win }).catch(() => {});
        await user.increment('vipPoints', { by: Math.floor(win * 0.1) }).catch(() => {});
      }
      await Bet.create({
        userId, uid: userId, gameType: 'double',
        amount: bet.amount, result: `${result}:seg${seg}`,
        goal: win, coin: bet.coin,
        status: isWin ? 'won' : 'lost',
        multiplier: isWin ? mult : 0,
        ipAddress: '', userAgent: '',
      }).catch(() => {});
    } catch (e) { logger.error('[DOUBLE] settle error:', e.message); }
  }
}

// Boot the round loop
startRound();

const getStatus = (req, res) => {
  const now = Date.now();
  const timeLeft = Math.max(0, Math.ceil((roundState.phaseEndsAt - now) / 1000));
  res.json({
    code: 200,
    data: {
      roundId: roundState.id,
      phase: roundState.phase,
      timeLeft,
      serverSeedHash: roundState.serverSeedHash,
      nonce: roundState.nonce,
      result: roundState.phase !== 'betting' ? roundState.result : null,
      resultSegment: roundState.phase !== 'betting' ? roundState.resultSegment : null,
      resolvedServerSeed: roundState.phase === 'result' ? roundState.resolvedServerSeed : null,
      userBet: pendingBets[req.user.id] || null,
      history: history.slice(0, 30),
    },
  });
};

const placeBet = async (req, res) => {
  try {
    const settings = await gsCache.get('double');
    if (!settings.isOpen) return res.status(400).json({ code: 400, msg: 'Jogo temporariamente fechado' });
    if (roundState.phase !== 'betting') return res.status(400).json({ code: 400, msg: 'Apostas encerradas para esta rodada' });
    if (roundState.phaseEndsAt - Date.now() < 1500) return res.status(400).json({ code: 400, msg: 'Tempo esgotado' });
    if (pendingBets[req.user.id]) return res.status(400).json({ code: 400, msg: 'Você já apostou nesta rodada' });

    const { color, amount, coin } = req.body;
    const user = req.user;
    const field = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    if (parseFloat(user[field]) < amount) return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });

    await user.decrement(field, { by: amount });
    await user.increment('totalWagered', { by: amount }).catch(() => {});
    await user.reload();

    pendingBets[req.user.id] = { color, amount: parseFloat(amount), coin };
    res.json({ code: 200, data: { balance: parseFloat(user[field]), bet: pendingBets[req.user.id], roundId: roundState.id } });
  } catch (e) {
    logger.error('[DOUBLE] bet error:', e);
    res.status(500).json({ code: 500, msg: e.message });
  }
};

module.exports = { getStatus, placeBet };
