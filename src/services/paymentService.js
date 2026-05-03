const { Transaction, User } = require('../models');
const crypto = require('crypto');
const logger = require('../config/logger');

const MP_BASE = 'https://api.mercadopago.com';

async function mpPost(path, body) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');

  const res = await fetch(`${MP_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`MercadoPago ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

class PaymentService {

  // ── PIX Deposit ───────────────────────────────────────────────────────────
  async createPixDeposit(userId, amount) {
    const user = await User.findByPk(userId);
    if (!user) throw new Error('Usuário não encontrado');

    const externalId = `TIGREBET_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const notifUrl   = process.env.MERCADOPAGO_NOTIFICATION_URL;

    // MercadoPago Payments API — PIX direto (retorna QR code sem redirecionar)
    const mpData = await mpPost('/v1/payments', {
      transaction_amount:  parseFloat(amount),
      payment_method_id:   'pix',
      description:         `Depósito TigreBet R$ ${amount}`,
      external_reference:  externalId,
      notification_url:    notifUrl,
      payer: {
        email: user.email || `user_${user.id}@tigrebet.com`,
      },
      date_of_expiration: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    });

    const qrCode       = mpData.point_of_interaction?.transaction_data?.qr_code        || '';
    const qrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 || '';

    const transaction = await Transaction.create({
      userId,
      type:                'deposit',
      status:              'pending',
      amount:              parseFloat(amount),
      currency:            'BRL',
      paymentMethod:       'pix',
      externalId,
      gateway:             'mercadopago',
      gatewayTransactionId: String(mpData.id),
      description:         `Depósito PIX R$ ${amount}`,
      metadata:            { mpPaymentId: mpData.id, qrCode, qrCodeBase64 },
    });

    logger.info(`PIX criado: tx=${transaction.id} | mpId=${mpData.id} | user=${userId} | R$${amount}`);

    return {
      transactionId:  transaction.id,
      externalId,
      qrCode,
      qrCodeBase64,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }

  // ── Webhook MercadoPago ────────────────────────────────────────────────────
  async processWebhook(payload, query) {
    // MP pode enviar via query string (?type=payment&data.id=xxx) ou body
    const type     = payload.type      || query.type;
    const mpId     = payload.data?.id  || query['data.id'];

    if (type !== 'payment' || !mpId) return { ok: true, reason: 'ignored' };

    // Busca idempotente — não processa duas vezes o mesmo pagamento
    const existing = await Transaction.findOne({ where: { gatewayTransactionId: String(mpId) } });
    if (existing?.status === 'completed') return { ok: true, reason: 'already done' };

    // Consulta status real no MP
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const res   = await fetch(`${MP_BASE}/v1/payments/${mpId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const mpPayment = await res.json();

    if (mpPayment.status !== 'approved') return { ok: true, reason: `status: ${mpPayment.status}` };

    const transaction = await Transaction.findOne({
      where: { gatewayTransactionId: String(mpId) },
    });
    if (!transaction) {
      logger.warn(`Webhook MP: transação não encontrada para mpId=${mpId}`);
      return { ok: false, reason: 'not found' };
    }

    transaction.status      = 'completed';
    transaction.processedAt = new Date();
    await transaction.save();

    const user = await User.findByPk(transaction.userId);
    if (user) {
      await user.increment('balanceETC', { by: transaction.amount });
      logger.info(`Depósito confirmado: user=${user.id} +R$${transaction.amount} | mpId=${mpId}`);
    }

    return { ok: true };
  }

  // ── Check deposit status (polling frontend) ───────────────────────────────
  async checkDepositStatus(transactionId, userId) {
    const transaction = await Transaction.findOne({ where: { id: transactionId, userId } });
    if (!transaction) throw new Error('Transação não encontrada');

    let balance = null;
    if (transaction.status === 'completed') {
      const user = await User.findByPk(userId);
      balance = parseFloat(user.balanceETC);
    }

    return { status: transaction.status, amount: transaction.amount, balance };
  }

  // ── Transaction history ───────────────────────────────────────────────────
  async getTransactionHistory(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const { count, rows } = await Transaction.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    return {
      transactions: rows,
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    };
  }
}

module.exports = new PaymentService();
