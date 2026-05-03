const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database-postgres');

const Achievement = sequelize.define('Achievement', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  uid: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'uid'
  },
  type: {
    type: DataTypes.ENUM('first_bet', 'total_wagered', 'total_wins', 'consecutive_wins', 'big_win', 'daily_login', 'referral_milestone', 'vip_level'),
    allowNull: false,
    field: 'type'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  targetValue: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false,
    field: 'target_value'
  },
  currentValue: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0,
    field: 'current_value'
  },
  rewardType: {
    type: DataTypes.ENUM('balance', 'vip_points', 'bonus', 'free_spins'),
    allowNull: false,
    field: 'reward_type'
  },
  rewardAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false,
    field: 'reward_amount'
  },
  rewardCoin: {
    type: DataTypes.ENUM('ETC', 'ETH', 'BTC'),
    allowNull: true,
    field: 'reward_coin'
  },
  isCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_completed'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  rewardClaimed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'reward_claimed'
  },
  claimedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'claimed_at'
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  icon: {
    type: DataTypes.STRING(50),
    defaultValue: '🏆'
  },
  rarity: {
    type: DataTypes.ENUM('common', 'rare', 'epic', 'legendary'),
    defaultValue: 'common'
  }
}, {
  tableName: 'achievements',
  timestamps: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['uid'] },
    { fields: ['type'] },
    { fields: ['is_completed'] }
  ]
});

module.exports = Achievement;
