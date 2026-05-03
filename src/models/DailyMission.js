const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database-postgres');

const DailyMission = sequelize.define('DailyMission', {
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
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  missionType: {
    type: DataTypes.ENUM('place_bets', 'wager_amount', 'win_amount', 'play_specific_game', 'consecutive_wins'),
    allowNull: false,
    field: 'mission_type'
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: false
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
    type: DataTypes.ENUM('balance', 'vip_points', 'free_spins'),
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
  gameType: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'game_type'
  }
}, {
  tableName: 'daily_missions',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['user_id', 'date', 'mission_type'] },
    { fields: ['uid'] },
    { fields: ['date'] },
    { fields: ['is_completed'] }
  ]
});

module.exports = DailyMission;
