const paymentService = require('../services/paymentService');
const { Transaction, User } = require('../models');
const logger = require('../config/logger');

class PaymentController {

  // POST /api/v1/payment/deposit  (autenticado)
  async createDeposit(req, res) {
    try {
      const { amount } = req.body;
      const amountNum = parseFloat(amount);

      if (!amountNum || amountNum < 10) {
        return res.status(400).json({ code: 400, msg: 'Valor mínimo de depósito: R$ 10' });
      }
      if (amountNum > 50000) {
        return res.status(400).json({ code: 400, msg: 'Valor máximo de depósito: R$ 50.000' });
      }

      const result = await paymentService.createPixDeposit(req.user.id, amountNum);

      res.json({
        code: 200,
        data: {
          transactionId: result.transactionId,
          externalId:    result.externalId,
          qrCode:        result.qrCode,
          qrCodeBase64:  result.qrCodeBase64,
          expiresAt:     result.expiresAt,
        },
      });
    } catch (err) {
      logger.error('createDeposit error:', err);
      res.status(500).json({ code: 500, msg: err.message || 'Erro ao criar depósito' });
    }
  }

  // GET /api/v1/payment/deposit/:transactionId/status  (autenticado)
  async checkDepositStatus(req, res) {
    try {
      const { transactionId } = req.params;
      const result = await paymentService.checkDepositStatus(transactionId, req.user.id);

      // If just completed, also return current balance so frontend can update
      let balance = null;
      if (result.status === 'completed') {
        const user = await User.findByPk(req.user.id);
        balance = parseFloat(user.balanceETC);
      }

      res.json({ code: 200, data: { status: result.status, amount: result.amount, balance } });
    } catch (err) {
      logger.error('checkDepositStatus error:', err);
      res.status(500).json({ code: 500, msg: err.message });
    }
  }

  // POST /api/v1/payment/webhook/pushinpay  (público — chamado pela Pushinpay)
  async receiveWebhook(req, res) {
    try {
      const result = await paymentService.processWebhook(req.body);
      res.status(200).json({ received: true, ...result });
    } catch (err) {
      logger.error('Webhook error:', err);
      res.status(500).json({ received: false, error: err.message });
    }
  }

  // POST /api/v1/payment/withdraw  (autenticado — bloqueado)
  async createWithdrawal(req, res) {
    return res.status(503).json({
      code: 503,
      success: false,
      msg: 'Saques temporariamente suspensos. Em breve disponível.',
    });
  }

  // GET /api/v1/payment/history  (autenticado)
  async getTransactionHistory(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await paymentService.getTransactionHistory(req.user.id, {
        page: parseInt(page),
        limit: parseInt(limit),
      });
      res.json({ code: 200, data: result });
    } catch (err) {
      logger.error('getTransactionHistory error:', err);
      res.status(500).json({ code: 500, msg: err.message });
    }
  }
}

module.exports = new PaymentController();
