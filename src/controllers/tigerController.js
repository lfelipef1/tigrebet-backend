const { User, Bet, Jackpot } = require('../models');
const SecureRNG = require('../utils/rng');
const ProvablyFair = require('../utils/provablyFair');
const logger = require('../config/logger');
const gsCache = require('../utils/gameSettings');

const playTiger = async (req, res, next) => {
  console.log('\n[TIGER] ===== NEW PLAY REQUEST =====');
  try {
    const settings = await gsCache.get('tiger');
    if (!settings.isOpen) return res.status(400).json({ code: 400, msg: 'Jogo temporariamente fechado' });

    const { amount, coin } = req.body;
    const user = req.user;

    console.log(`[TIGER] User: ${user?.id} | Coin: ${coin} | Amount: ${amount}`);

    const balanceField = coin === 'ETC' ? 'balanceETC' : coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    const currentBalance = parseFloat(user[balanceField]);
    console.log(`[TIGER] Balance field: ${balanceField} | Current: ${currentBalance}`);

    if (currentBalance < amount) {
      return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });
    }

    // Step 1: Deduct bet
    console.log('[TIGER] Step 1: Decrementing balance...');
    try {
      await user.decrement(balanceField, { by: amount });
      console.log('[TIGER] Step 1 OK');
    } catch (e) {
      console.error('[TIGER] Step 1 FAIL:', e.message);
      throw e;
    }

    // Step 2: Update wagered total
    console.log('[TIGER] Step 2: Incrementing totalWagered...');
    try {
      await user.increment('totalWagered', { by: amount });
      console.log('[TIGER] Step 2 OK');
    } catch (e) {
      console.error('[TIGER] Step 2 FAIL:', e.message);
      // Non-fatal: continue
    }

    await user.reload();

    // Step 3: Generate reels
    const symbols = ['🍊', '🔔', '🧧', '💰', '💎', '🐯'];
    const symbolMultipliers = {
      '🍊': 3, '🔔': 5, '🧧': 10, '💰': 20, '💎': 50, '🐯': 100
    };

    const reels = [
      [symbols[SecureRNG.randomInt(0, 5)], symbols[SecureRNG.randomInt(0, 5)], symbols[SecureRNG.randomInt(0, 5)]],
      [symbols[SecureRNG.randomInt(0, 5)], symbols[SecureRNG.randomInt(0, 5)], symbols[SecureRNG.randomInt(0, 5)]],
      [symbols[SecureRNG.randomInt(0, 5)], symbols[SecureRNG.randomInt(0, 5)], symbols[SecureRNG.randomInt(0, 5)]]
    ];
    console.log('[TIGER] Step 3: Reels generated:', JSON.stringify(reels));

    // Step 4: Calculate win
    let totalWin = 0;
    const winLines = [];

    const lines = [
      [[0,0],[1,0],[2,0]],
      [[0,1],[1,1],[2,1]],
      [[0,2],[1,2],[2,2]],
      [[0,0],[1,1],[2,2]],
      [[0,2],[1,1],[2,0]]
    ];

    lines.forEach((line, index) => {
      const s1 = reels[line[0][0]][line[0][1]];
      const s2 = reels[line[1][0]][line[1][1]];
      const s3 = reels[line[2][0]][line[2][1]];

      const isWild = (s) => s === '🐯';
      const allSame = s1 === s2 && s2 === s3;
      const twoSame = (s1 === s2 && isWild(s3)) || (s1 === s3 && isWild(s2)) || (s2 === s3 && isWild(s1));
      const allWild = isWild(s1) && isWild(s2) && isWild(s3);

      if (allSame || allWild) {
        const winnerSymbol = allWild ? '🐯' : s1;
        const mult = symbolMultipliers[winnerSymbol] || 2;
        totalWin += amount * mult;
        winLines.push(index);
      } else if (twoSame) {
        const nonWild = isWild(s1) ? (isWild(s2) ? s3 : s2) : s1;
        const mult = Math.floor((symbolMultipliers[nonWild] || 2) * 0.5);
        totalWin += amount * mult;
        winLines.push(index);
      }
    });

    let isTigerLuck = false;
    if (SecureRNG.randomInt(0, 100) < 5) {
      totalWin *= 10;
      isTigerLuck = true;
    }

    // Apply RTP factor
    totalWin = parseFloat((totalWin * settings.rtp / 100).toFixed(2));

    console.log(`[TIGER] Step 4: Win=${totalWin} | WinLines=${JSON.stringify(winLines)} | TigerLuck=${isTigerLuck}`);

    // Step 5: Credit win
    if (totalWin > 0) {
      console.log('[TIGER] Step 5: Crediting win...');
      try {
        await user.increment(balanceField, { by: totalWin });
        await user.increment('totalWon', { by: totalWin });
        await user.increment('vipPoints', { by: Math.floor(totalWin * 0.1) });
        console.log('[TIGER] Step 5 OK');
      } catch (e) {
        console.error('[TIGER] Step 5 FAIL:', e.message);
        // Non-fatal: continue
      }
    }

    // Step 6: Provably fair
    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = user.id;
    const nonce = Date.now();
    const { hash: provablyFairHash } = ProvablyFair.generateResult(serverSeed, clientSeed, nonce);
    console.log('[TIGER] Step 6: provablyFairHash generated');

    // Step 7: Record bet
    console.log('[TIGER] Step 7: Creating Bet record...');
    try {
      await Bet.create({
        userId: user.id,
        uid: user.id,
        gameType: 'fortune_tiger',
        amount,
        result: reels.flat().join(','),
        goal: totalWin,
        coin,
        status: totalWin > 0 ? 'won' : 'lost',
        multiplier: totalWin > 0 ? (totalWin / amount) : 0,
        isTigerLuck,
        provablyFairHash,
        provablyFairSeed: serverSeed,
        ipAddress: req.ip || '127.0.0.1',
        userAgent: req.headers['user-agent'] || ''
      });
      console.log('[TIGER] Step 7 OK');
    } catch (e) {
      console.error('[TIGER] Step 7 FAIL:', e.message, e.original?.message);
      // Non-fatal: bet recording failure should not block the user
    }

    // Step 8: Jackpot check (optional)
    let jackpotWin = 0;
    let jackpotType = null;
    console.log('[TIGER] Step 8: Jackpot check...');
    try {
      const jackpotRoll = SecureRNG.randomInt(0, 9999);
      if (jackpotRoll === 0) {
        const miniJackpot = await Jackpot.findOne({
          where: { gameType: 'fortune_tiger', jackpotType: 'mini', isActive: true }
        });
        if (miniJackpot && parseFloat(miniJackpot.currentAmount) >= parseFloat(miniJackpot.minimumTrigger)) {
          jackpotWin = parseFloat(miniJackpot.currentAmount);
          jackpotType = 'mini';
          await miniJackpot.update({
            currentAmount: miniJackpot.seedAmount,
            lastWonAt: new Date(),
            lastWonBy: user.id,
            lastWonAmount: jackpotWin
          });
          await user.increment(balanceField, { by: jackpotWin });
        }
      }
      console.log(`[TIGER] Step 8 OK - jackpotRoll was ${jackpotWin > 0 ? 'WIN' : 'no win'}`);
    } catch (e) {
      console.error('[TIGER] Step 8 FAIL (non-fatal):', e.message);
    }

    await user.reload();

    const finalBalance = parseFloat(user[balanceField]);
    console.log(`[TIGER] DONE - Final balance: ${finalBalance}`);

    res.json({
      code: 200,
      data: {
        reels,
        win: totalWin,
        winLines,
        isTigerLuck,
        balance: finalBalance,
        jackpotWin,
        jackpotType,
        provablyFairHash,
        vipPoints: user.vipPoints
      }
    });
  } catch (error) {
    console.error('[TIGER] FATAL ERROR:', error.message);
    console.error('[TIGER] Stack:', error.stack);
    logger.error('Tiger game error:', error);
    next(error);
  }
};

module.exports = { playTiger };
