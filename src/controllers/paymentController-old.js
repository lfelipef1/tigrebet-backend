const paymentService = require('../services/paymentService');
const { Transaction, User } = require('../models');
const { z } = require('zod');
const logger = require('../config/logger');

// Validation schemas
const depositSchema = z.object({
  amount: z.number().min(10, 'Minimum deposit is R$ 10').max(50000, 'Maximum deposit is R$ 50,000'),
  method: z.enum(['pix', 'ethereum', 'bitcoin']),
  description: z.string().optional().default('Depósito Tiger Pro')
});

const withdrawalSchema = z.object({
  amount: z.number().min(20, 'Minimum withdrawal is R$ 20').max(100000, 'Maximum withdrawal is R$ 100,000'),
  method: z.enum(['pix', 'ethereum', 'bitcoin']),
  details: z.object({
    // PIX details
    pixKey: z.string().optional(),
    pixKeyType: z.enum(['cpf', 'email', 'phone', 'random']).optional(),
    
    // Crypto details
    address: z.string().optional(),
    network: z.string().optional()
  }).optional()
});

class PaymentController {
  // Create Deposit
  async createDeposit(req, res) {
    try {
      const userId = req.user.id;
      const { amount, method, description } = depositSchema.parse(req.body);

      let result;
      switch (method) {
        case 'pix':
          result = await paymentService.createPixPayment(userId, amount, description);
          break;
        case 'ethereum':
          result = await paymentService.createEthereumPayment(userId, amount, description);
          break;
        case 'bitcoin':
          result = await paymentService.createBitcoinPayment(userId, amount, description);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid payment method'
          });
      }

      logger.info(`Deposit created: ${result.transactionId} for user ${userId}, amount: R$ ${amount}`);

      res.json({
        success: true,
        data: result,
        message: 'Payment created successfully'
      });

    } catch (error) {
      logger.error('Create Deposit Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

    if (!['ETC', 'ETH', 'BTC'].includes(coin)) {
      return res.status(400).json({
        code: 400,
        msg: 'Moeda inválida'
      });
    }

    // Validar limites de depósito
    const minDeposit = coin === 'BTC' ? 0.0001 : coin === 'ETH' ? 0.01 : 10;
    const maxDeposit = coin === 'BTC' ? 10 : coin === 'ETH' ? 1000 : 100000;

    if (amount < minDeposit || amount > maxDeposit) {
      return res.status(400).json({
        code: 400,
        msg: `Valor deve estar entre ${minDeposit} e ${maxDeposit} ${coin}`
      });
    }

    let paymentData = null;

    if (paymentMethod === 'PIX') {
      // Gerar QR Code PIX
      const pixResponse = await mockPixAPI.generateQrCode(amount, `Depósito ${coin} - ${user.uid}`);
      paymentData = pixResponse.data;
    } else if (paymentMethod === 'CRYPTO') {
      // Gerar endereço de carteira crypto (mock)
      paymentData = {
        walletAddress: `${coin.toLowerCase()}_${Math.random().toString(36).substr(2, 34)}`,
        network: coin === 'BTC' ? 'bitcoin' : coin === 'ETH' ? 'ethereum' : 'ethereum-classic',
        memo: user.uid
      };
    }

    // Criar transação pendente
    const transaction = await Transaction.create({
      userId: user.id,
      uid: user.uid,
      type: 'deposit',
      amount,
      coin,
      status: 'pending',
      paymentMethod,
      transactionHash: paymentData?.qrCode || paymentData?.walletAddress,
      pixCode: paymentData?.pixCode,
      pixKey: paymentData?.pixKey,
      walletAddress: paymentData?.walletAddress,
      network: paymentData?.network,
      description: `Depósito via ${paymentMethod}`,
      metadata: paymentData,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info(`Deposit created: ${transaction.id} - ${amount} ${coin}`);

    res.json({
      code: 200,
      msg: 'Depósito criado com sucesso',
      data: {
        transactionId: transaction.id,
        paymentData,
        status: 'pending',
        expiresIn: paymentData?.expirationTime
      }
    });

  } catch (error) {
    logger.error('Create deposit error:', error);
    next(error);
  }
};

const checkDepositStatus = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const user = req.user;

    const transaction = await Transaction.findOne({
      where: { id: transactionId, userId: user.id, type: 'deposit' }
    });

    if (!transaction) {
      return res.status(404).json({
        code: 404,
        msg: 'Transação não encontrada'
      });
    }

    if (transaction.status === 'completed') {
      return res.json({
        code: 200,
        data: {
          status: transaction.status,
          amount: transaction.amount,
          coin: transaction.coin,
          completedAt: transaction.completedAt
        }
      });
    }

    // Verificar status do pagamento
    if (transaction.paymentMethod === 'PIX' && transaction.pixCode) {
      const pixResponse = await mockPixAPI.checkPayment(transaction.pixCode);
      
      if (pixResponse.data.status === 'paid') {
        // Atualizar saldo do usuário
        const balanceField = transaction.coin === 'ETC' ? 'balanceETC' : 
                           transaction.coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
        
        await User.increment(
          { [balanceField]: transaction.amount },
          { where: { id: user.id } }
        );

        // Atualizar transação
        await transaction.update({
          status: 'completed',
          completedAt: new Date()
        });

        // Dar bônus de primeiro depósito
        const userDeposits = await Transaction.count({
          where: { userId: user.id, type: 'deposit', status: 'completed' }
        });

        if (userDeposits === 1) {
          // Bônus de 50% no primeiro depósito
          const bonusAmount = transaction.amount * 0.5;
          await User.increment(
            { [balanceField]: bonusAmount },
            { where: { id: user.id } }
          );

          await Transaction.create({
            userId: user.id,
            uid: user.uid,
            type: 'bonus',
            amount: bonusAmount,
            coin: transaction.coin,
            status: 'completed',
            description: 'Bônus de primeiro depósito (50%)',
            completedAt: new Date()
          });
        }

        logger.info(`Deposit completed: ${transaction.id} - ${transaction.amount} ${transaction.coin}`);
      }
    }

    res.json({
      code: 200,
      data: {
        status: transaction.status,
        amount: transaction.amount,
        coin: transaction.coin,
        completedAt: transaction.completedAt
      }
    });

  } catch (error) {
    logger.error('Check deposit status error:', error);
    next(error);
  }
};

const createWithdrawal = async (req, res, next) => {
  try {
    const { amount, coin, paymentMethod, pixKey, walletAddress } = req.body;
    const user = req.user;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        code: 400,
        msg: 'Valor de saque inválido'
      });
    }

    // Verificar KYC
    if (user.kycStatus !== 'approved') {
      return res.status(403).json({
        code: 403,
        msg: 'Verificação KYC necessária para saques'
      });
    }

    // Verificar saldo
    const balanceField = coin === 'ETC' ? 'balanceETC' : 
                       coin === 'ETH' ? 'balanceETH' : 'balanceBTC';
    const currentBalance = user[balanceField];

    if (currentBalance < amount) {
      return res.status(400).json({
        code: 400,
        msg: 'Saldo insuficiente'
      });
    }

    // Validar limites de saque baseado no VIP
    const vipLimits = {
      1: { min: 50, max: 1000, fee: 0.05 },    // Bronze
      2: { min: 30, max: 2500, fee: 0.04 },    // Silver
      3: { min: 20, max: 5000, fee: 0.03 },    // Gold
      4: { min: 10, max: 10000, fee: 0.02 },   // Platinum
      5: { min: 5, max: 25000, fee: 0.01 }     // Diamond
    };

    const limits = vipLimits[user.vipLevel] || vipLimits[1];
    const minWithdraw = limits.min * (coin === 'BTC' ? 0.0001 : coin === 'ETH' ? 0.01 : 1);
    const maxWithdraw = limits.max * (coin === 'BTC' ? 0.0001 : coin === 'ETH' ? 0.01 : 1);
    const fee = amount * limits.fee;
    const netAmount = amount - fee;

    if (amount < minWithdraw || amount > maxWithdraw) {
      return res.status(400).json({
        code: 400,
        msg: `Valor deve estar entre ${minWithdraw} e ${maxWithdraw} ${coin}`
      });
    }

    // Verificar informações de pagamento
    if (paymentMethod === 'PIX' && !pixKey) {
      return res.status(400).json({
        code: 400,
        msg: 'Chave PIX obrigatória'
      });
    }

    if (paymentMethod === 'CRYPTO' && !walletAddress) {
      return res.status(400).json({
        code: 400,
        msg: 'Endereço da carteira obrigatório'
      });
    }

    // Verificar saques pendentes
    const pendingWithdrawals = await Transaction.count({
      where: { 
        userId: user.id, 
        type: 'withdraw', 
        status: 'pending' 
      }
    });

    if (pendingWithdrawals >= 3) {
      return res.status(400).json({
        code: 400,
        msg: 'Limite de saques pendentes atingido'
      });
    }

    // Deduzir saldo
    await User.decrement(
      { [balanceField]: amount },
      { where: { id: user.id } }
    );

    // Criar transação de saque
    const transaction = await Transaction.create({
      userId: user.id,
      uid: user.uid,
      type: 'withdraw',
      amount: netAmount,
      coin,
      status: 'pending',
      paymentMethod,
      fee,
      pixKey,
      walletAddress,
      description: `Saque via ${paymentMethod}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    logger.info(`Withdrawal created: ${transaction.id} - ${netAmount} ${coin}`);

    res.json({
      code: 200,
      msg: 'Saque solicitado com sucesso',
      data: {
        transactionId: transaction.id,
        amount: netAmount,
        fee,
        status: 'pending',
        estimatedTime: '24-48 horas'
      }
    });

  } catch (error) {
    logger.error('Create withdrawal error:', error);
    next(error);
  }
};

const getTransactionHistory = async (req, res, next) => {
  try {
    const { page = 1, type, coin, status } = req.query;
    const user = req.user;
    const limit = 20;
    const offset = (page - 1) * limit;

    const whereClause = { userId: user.id };
    if (type) whereClause.type = type;
    if (coin) whereClause.coin = coin;
    if (status) whereClause.status = status;

    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const total = await Transaction.count({ where: whereClause });

    res.json({
      code: 200,
      data: {
        transactions: transactions.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          coin: t.coin,
          status: t.status,
          paymentMethod: t.paymentMethod,
          description: t.description,
          fee: t.fee,
          createdAt: t.createdAt,
          completedAt: t.completedAt
        })),
        pagination: {
          page: parseInt(page),
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get transaction history error:', error);
    next(error);
  }
};

module.exports = {
  createDeposit,
  checkDepositStatus,
  createWithdrawal,
  getTransactionHistory
};
