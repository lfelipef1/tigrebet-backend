const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database-postgres');

const Bet = sequelize.define('Bet', {
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
  gameType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'game_type'
  },
  select: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false
  },
  result: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  goal: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  fee: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  period: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'won', 'lost', 'cancelled'),
    defaultValue: 'pending'
  },
  coin: {
    type: DataTypes.ENUM('ETC', 'ETH', 'BTC'),
    allowNull: false
  },
  multiplier: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  isTigerLuck: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_tiger_luck'
  },
  provablyFairHash: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'provably_fair_hash'
  },
  provablyFairSeed: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'provably_fair_seed'
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    field: 'ip_address'
  },
  userAgent: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'user_agent'
  }
}, {
  tableName: 'bets',
  timestamps: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['uid'] },
    { fields: ['game_type'] },
    { fields: ['status'] },
    { fields: ['coin'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = Bet;
