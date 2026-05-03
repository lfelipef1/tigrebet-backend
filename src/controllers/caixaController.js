const { User, Bet, Jackpot } = require('../models');
const SecureRNG = require('../utils/rng');
const ProvablyFair = require('../utils/provablyFair');
const logger = require('../config/logger');

const SEED_AMOUNT = 500;
const CONTRIBUTION_RATE = 0.70; // 70% vai pro pote
const HOUSE_RATE = 0.30;

const BET_OPTIONS = [
  { amount: 5,   winChance: 0.04, label: 'R$ 5'   },
  { amount: 10,  winChance: 0.07, label: 'R$ 10'  },
  { amount: 25,  winChance: 0.14, label: 'R$ 25'  },
  { amount: 50,  winChance: 0.24, label: 'R$ 50'  },
  { amount: 100, winChance: 0.38, label: 'R$ 100' },
  { amount: 250, winChance: 0.58, label: 'R$ 250' },
];

async function getOrCreatePot() {
  let pot = await Jackpot.findOne({ where: { gameType: 'caixa_premiada', jackpotType: 'grand' } });
  if (!pot) {
    pot = await Jackpot.create({
      gameType: 'caixa_premiada',
      jackpotType: 'grand',
      currentAmount: SEED_AMOUNT,
      seedAmount: SEED_AMOUNT,
      contributionPercent: CONTRIBUTION_RATE * 100,
      minimumTrigger: 0,
      isActive: true
    });
  }
  return pot;
}

const getStatus = async (req, res) => {
  try {
    const pot = await getOrCreatePot();

    const recentWins = await Bet.findAll({
      where: { gameType: 'caixa_premiada', status: 'won' },
      order: [['createdAt', 'DESC']],
      limit: 8
    });

    const totalBets = await Bet.count({ where: { gameType: 'caixa_premiada' } });
    const totalPaidOut = await Bet.sum('goal', { where: { gameType: 'caixa_premiada', status: 'won' } });

    res.json({
      code: 200,
      data: {
        currentPot: parseFloat(pot.currentAmount),
        seedAmount: SEED_AMOUNT,
        betOptions: BET_OPTIONS,
        lastWonAt: pot.lastWonAt,
        lastWonAmount: pot.lastWonAmount ? parseFloat(pot.lastWonAmount) : null,
        totalBetsAllTime: totalBets || 0,
        totalPaidOut: parseFloat(totalPaidOut || 0),
        recentWinners: recentWins.map(b => ({
          amount: parseFloat(b.goal),
          betAmount: parseFloat(b.amount),
          time: b.createdAt,
          multiplier: parseFloat(b.multiplier)
        }))
      }
    });
  } catch (error) {
    logger.error('Caixa status error:', error);
    res.status(500).json({ code: 500, msg: error.message });
  }
};

const play = async (req, res) => {
  try {
    const user = req.user;
    const { amount, coin } = req.body;

    const betOption = BET_OPTIONS.find(b => b.amount === Number(amount));
    if (!betOption) {
      return res.status(400).json({ code: 400, msg: 'Valor de aposta inválido. Use: 5, 10, 25, 50, 100 ou 250' });
    }

    const validCoins = ['ETC', 'ETH', 'BTC'];
    if (!validCoins.includes(coin)) {
      return res.status(400).json({ code: 400, msg: 'Moeda inválida' });
    }

    const balanceField = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    if (parseFloat(user[balanceField]) < betOption.amount) {
      return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });
    }

    const pot = await getOrCreatePot();
    const currentPot = parseFloat(pot.currentAmount);

    // Deduct bet atomically
    await user.decrement(balanceField, { by: betOption.amount });
    await user.increment('totalWagered', { by: betOption.amount });

    // Add 70% to pot
    const contribution = betOption.amount * CONTRIBUTION_RATE;
    await pot.increment('currentAmount', { by: contribution });
    await pot.reload();

    const newPot = parseFloat(pot.currentAmount);

    // Win chance scales up when pot is big (excitement factor)
    const potGrowthFactor = Math.min((newPot / SEED_AMOUNT - 1) * 0.08, 0.25);
    const finalChance = Math.min(betOption.winChance + potGrowthFactor, 0.80);

    // Provably fair roll
    const serverSeed = ProvablyFair.generateServerSeed();
    const { hash, resultInt } = ProvablyFair.generateResult(serverSeed, user.id, Date.now());
    const roll = (resultInt % 1000000) / 1000000; // 0 to <1

    const won = roll < finalChance;

    let winAmount = 0;
    let finalPot = newPot;

    if (won) {
      winAmount = newPot;

      await user.increment(balanceField, { by: winAmount });
      await user.increment('totalWon', { by: winAmount });
      await user.increment('vipPoints', { by: Math.floor(winAmount * 0.05) });

      await pot.update({
        currentAmount: SEED_AMOUNT,
        lastWonAt: new Date(),
        lastWonBy: user.id,
        lastWonAmount: winAmount
      });

      finalPot = SEED_AMOUNT;
    }

    await Bet.create({
      userId: user.id,
      uid: user.id,
      gameType: 'caixa_premiada',
      amount: betOption.amount,
      result: roll.toFixed(8),
      goal: winAmount,
      coin,
      status: won ? 'won' : 'lost',
      multiplier: won && betOption.amount > 0 ? parseFloat((winAmount / betOption.amount).toFixed(2)) : 0,
      provablyFairHash: hash,
      provablyFairSeed: serverSeed,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await user.reload();

    logger.info(`Caixa: user=${user.id} bet=${betOption.amount} won=${won} pot_won=${winAmount.toFixed(2)}`);

    res.json({
      code: 200,
      data: {
        won,
        roll: parseFloat(roll.toFixed(6)),
        winChance: parseFloat(finalChance.toFixed(4)),
        winAmount: parseFloat(winAmount.toFixed(2)),
        potBefore: parseFloat(currentPot.toFixed(2)),
        potAfter: parseFloat(finalPot.toFixed(2)),
        contribution: parseFloat(contribution.toFixed(2)),
        balance: parseFloat(user[balanceField]),
        vipPoints: user.vipPoints,
        provablyFairHash: hash
      }
    });
  } catch (error) {
    logger.error('Caixa play error:', error);
    res.status(500).json({ code: 500, msg: error.message });
  }
};

module.exports = { getStatus, play };
