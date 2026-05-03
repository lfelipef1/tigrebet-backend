const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database-postgres');

const VIPLevel = sequelize.define('VIPLevel', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  level: {
    type: DataTypes.INTEGER,
    unique: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  minPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'min_points'
  },
  maxPoints: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_points'
  },
  cashbackPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    field: 'cashback_percent'
  },
  depositBonusPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    field: 'deposit_bonus_percent'
  },
  weeklyBonus: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0,
    field: 'weekly_bonus'
  },
  monthlyBonus: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0,
    field: 'monthly_bonus'
  },
  prioritySupport: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'priority_support'
  },
  exclusivePromotions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'exclusive_promotions'
  },
  higherWithdrawalLimit: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 1000,
    field: 'higher_withdrawal_limit'
  },
  personalAccountManager: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'personal_account_manager'
  },
  benefits: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  color: {
    type: DataTypes.STRING(7),
    defaultValue: '#000000'
  },
  icon: {
    type: DataTypes.STRING(50),
    defaultValue: '⭐'
  }
}, {
  tableName: 'vip_levels',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['level'] },
    { fields: ['min_points'] }
  ]
});

module.exports = VIPLevel;
