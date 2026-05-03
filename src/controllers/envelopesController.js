const SecureRNG = require('../utils/rng');
const logger = require('../config/logger');

const getBalanceField = (coin) => {
  if (coin === 'ETC') return 'balanceETC';
  if (coin === 'ETH') return 'balanceETH';
  return 'balanceBTC';
};

const getInfo = async (req, res, next) => {
  try {
    const { coin } = req.query;
    const user = req.user;
    const balanceField = getBalanceField(coin);

    res.json({
      code: 200,
      data: {
        balance: parseFloat(user[balanceField]) || 0,
      },
    });
  } catch (error) {
    logger.error('Get envelope info error:', error);
    next(error);
  }
};

const getList = async (req, res, next) => {
  try {
    res.json({
      code: 200,
      data: {
        list: [
          { id: '1', amount: 10, count: 5 },
          { id: '2', amount: 50, count: 2 },
        ],
      },
    });
  } catch (error) {
    logger.error('Get envelope list error:', error);
    next(error);
  }
};

const orderEnvelope = async (req, res, next) => {
  try {
    const { amount, envelopeCount, coin, type } = req.body;
    const user = req.user;
    const balanceField = getBalanceField(coin);
    const currentBalance = parseFloat(user[balanceField]) || 0;

    if (type === 'send') {
      const totalCost = parseFloat(amount) * (parseInt(envelopeCount) || 1);

      if (currentBalance < totalCost) {
        return res.status(400).json({ code: 400, msg: 'Saldo insuficiente' });
      }

      await user.decrement(balanceField, { by: totalCost });
      await user.reload();

      logger.info(`Envelopes sent - User: ${user.id}, Count: ${envelopeCount}`);

      res.json({
        code: 200,
        data: {
          success: true,
          balance: parseFloat(user[balanceField]) || 0,
        },
      });
    } else if (type === 'open') {
      const win = SecureRNG.randomInt(0, Math.floor(parseFloat(amount) * 2));

      if (win > 0) {
        await user.increment(balanceField, { by: win });
        await user.reload();
      }

      logger.info(`Envelope opened - User: ${user.id}, Win: ${win}`);

      res.json({
        code: 200,
        data: {
          amount: win,
          balance: parseFloat(user[balanceField]) || 0,
        },
      });
    } else {
      res.status(400).json({ code: 400, msg: 'Tipo inválido' });
    }
  } catch (error) {
    logger.error('Envelope order error:', error);
    next(error);
  }
};

module.exports = {
  getInfo,
  getList,
  orderEnvelope,
};