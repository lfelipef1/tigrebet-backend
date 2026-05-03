const { User, Transaction } = require('../models');
const { generateRefCode, generateAccessToken } = require('../utils/crypto');
const { comparePassword } = require('../utils/hash');
const logger = require('../config/logger');

const register = async (req, res, next) => {
  try {
    const { mobile, password, refCode } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ code: 400, msg: 'Mobile e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ code: 400, msg: 'Senha deve ter pelo menos 6 caracteres' });
    }

    const existingUser = await User.findOne({ where: { mobile } });
    if (existingUser) {
      logger.warn(`Registration attempt with existing mobile: ${mobile}`);
      return res.status(400).json({ code: 400, msg: 'Usuário já existe' });
    }

    let referredByUser = null;
    if (refCode) {
      referredByUser = await User.findOne({ where: { referralCode: refCode } });
      if (!referredByUser) {
        return res.status(400).json({ code: 400, msg: 'Código de indicação inválido' });
      }
    }

    const userRefCode = generateRefCode();
    const username = `user_${mobile.slice(-8)}`;

    const user = await User.create({
      username,
      mobile,
      password,
      referralCode: userRefCode,
      referredBy: referredByUser ? referredByUser.id : null,
      vipLevel: 1,
      vipPoints: 0,
      kycStatus: 'pending',
      status: 'active',
      balanceETC: 10000,
      balanceETH: 10000,
      balanceBTC: 10000
    });

    if (referredByUser) {
      await referredByUser.increment('referralCount');
    }

    await Transaction.create({
      userId: user.id,
      type: 'bonus',
      amount: 10000,
      currency: 'ETC',
      status: 'completed',
      description: 'Bônus de boas-vindas ETC',
      processedAt: new Date()
    });

    await Transaction.create({
      userId: user.id,
      type: 'bonus',
      amount: 10000,
      currency: 'ETH',
      status: 'completed',
      description: 'Bônus de boas-vindas ETH',
      processedAt: new Date()
    });

    await Transaction.create({
      userId: user.id,
      type: 'bonus',
      amount: 10000,
      currency: 'BTC',
      status: 'completed',
      description: 'Bônus de boas-vindas BTC',
      processedAt: new Date()
    });

    const token = generateAccessToken(user);
    await user.update({ token });

    logger.info(`New user registered: ${user.id}`);

    res.json({
      code: 200,
      msg: 'Cadastro realizado com sucesso',
      data: {
        uid: user.id,
        token,
        refCode: user.referralCode,
        userInfo: {
          mobile: user.mobile,
          username: user.username,
          balance: {
            ETC: parseFloat(user.balanceETC),
            ETH: parseFloat(user.balanceETH),
            BTC: parseFloat(user.balanceBTC)
          },
          vipLevel: user.vipLevel,
          refCode: user.referralCode
        }
      }
    });
  } catch (error) {
    logger.error('Register error:', error);
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ code: 400, msg: 'Mobile e senha são obrigatórios' });
    }

    const user = await User.findOne({ where: { mobile } });
    if (!user) {
      logger.warn(`Login attempt with non-existent mobile: ${mobile}`);
      return res.status(400).json({ code: 400, msg: 'Credenciais inválidas' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({ code: 403, msg: 'Conta banida' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ code: 403, msg: 'Conta suspensa' });
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      logger.warn(`Invalid password attempt for mobile: ${mobile}`);
      return res.status(400).json({ code: 400, msg: 'Credenciais inválidas' });
    }

    const token = generateAccessToken(user);
    await user.update({
      token,
      lastLoginAt: new Date(),
      loginCount: (user.loginCount || 0) + 1
    });

    res.json({
      code: 200,
      msg: 'Login realizado com sucesso',
      data: {
        uid: user.id,
        token,
        refCode: user.referralCode,
        userInfo: {
          mobile: user.mobile,
          username: user.username,
          balance: {
            ETC: parseFloat(user.balanceETC),
            ETH: parseFloat(user.balanceETH),
            BTC: parseFloat(user.balanceBTC)
          },
          vipLevel: user.vipLevel,
          refCode: user.referralCode
        }
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

const registerCheck = async (req, res, next) => {
  try {
    const { mobile } = req.body;
    if (!mobile) {
      return res.status(400).json({ code: 400, msg: 'Mobile é obrigatório' });
    }
    const user = await User.findOne({ where: { mobile } });
    res.json({ code: 200, data: { exists: !!user } });
  } catch (error) {
    logger.error('Register check error:', error);
    next(error);
  }
};

module.exports = { register, login, registerCheck };
