const { Op } = require('sequelize');
const { User, Transaction, Bet, GameSettings } = require('../models');
const gsCache = require('../utils/gameSettings');
const logger = require('../config/logger');

const ADMIN_KEY = process.env.ADMIN_KEY || 'tigrebet-admin-2026';

function checkKey(req, res) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    res.status(403).json({ msg: 'Forbidden' });
    return false;
  }
  return true;
}

const getSettings = async (req, res) => {
  if (!checkKey(req, res)) return;
  try {
    const rows = await GameSettings.findAll({ order: [['game', 'ASC']] });
    res.json({ code: 200, data: rows });
  } catch (e) {
    logger.error('admin getSettings:', e);
    res.status(500).json({ msg: e.message });
  }
};

const updateSetting = async (req, res) => {
  if (!checkKey(req, res)) return;
  try {
    const { game } = req.params;
    const { rtp, isOpen } = req.body;
    const [row, created] = await GameSettings.findOrCreate({
      where: { game },
      defaults: { rtp: 95, isOpen: true },
    });
    if (rtp !== undefined) row.rtp = Math.min(100, Math.max(0, parseInt(rtp)));
    if (isOpen !== undefined) row.isOpen = Boolean(isOpen);
    await row.save();
    gsCache.invalidate();
    res.json({ code: 200, data: row });
  } catch (e) {
    logger.error('admin updateSetting:', e);
    res.status(500).json({ msg: e.message });
  }
};

const getTransactions = async (req, res) => {
  if (!checkKey(req, res)) return;
  try {
    const limit = parseInt(req.query.limit) || 50;
    const type = req.query.type; // 'deposit' | 'withdrawal' | undefined
    const where = type ? { type } : { type: { [Op.in]: ['deposit', 'withdrawal'] } };
    const rows = await Transaction.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['mobile'] }],
      order: [['createdAt', 'DESC']],
      limit,
    });
    res.json({ code: 200, data: rows });
  } catch (e) {
    logger.error('admin getTransactions:', e);
    res.status(500).json({ msg: e.message });
  }
};

const getStats = async (req, res) => {
  if (!checkKey(req, res)) return;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      depositedToday,
      withdrawnToday,
      totalUsers,
      activeToday,
      pendingWithdrawals,
    ] = await Promise.all([
      Transaction.sum('amount', {
        where: { type: 'deposit', status: 'completed', createdAt: { [Op.gte]: todayStart } }
      }),
      Transaction.sum('amount', {
        where: { type: 'withdrawal', status: 'completed', createdAt: { [Op.gte]: todayStart } }
      }),
      User.count(),
      User.count({ where: { updatedAt: { [Op.gte]: todayStart } } }),
      Transaction.count({ where: { type: 'withdrawal', status: 'pending' } }),
    ]);

    res.json({
      code: 200,
      data: {
        depositedToday: depositedToday || 0,
        withdrawnToday: withdrawnToday || 0,
        netToday: (depositedToday || 0) - (withdrawnToday || 0),
        totalUsers,
        activeToday,
        pendingWithdrawals,
      },
    });
  } catch (e) {
    logger.error('admin getStats:', e);
    res.status(500).json({ msg: e.message });
  }
};

const getUsers = async (req, res) => {
  if (!checkKey(req, res)) return;
  try {
    const limit = parseInt(req.query.limit) || 50;
    const users = await User.findAll({
      attributes: ['id', 'mobile', 'balanceETC', 'balanceETH', 'balanceBTC', 'vipLevel', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit,
    });
    res.json({ code: 200, data: users });
  } catch (e) {
    logger.error('admin getUsers:', e);
    res.status(500).json({ msg: e.message });
  }
};

const resetPassword = async (req, res) => {
  if (!checkKey(req, res)) return;
  try {
    const bcrypt = require('bcryptjs');
    const { mobile, newPassword } = req.body;
    const user = await User.findOne({ where: { mobile } });
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ code: 200, msg: `Senha de ${mobile} alterada` });
  } catch (e) {
    logger.error('admin resetPassword:', e);
    res.status(500).json({ msg: e.message });
  }
};

module.exports = { getSettings, updateSetting, getTransactions, getStats, getUsers, resetPassword };
