const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database-postgres');

const Jackpot = sequelize.define('Jackpot', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  gameType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'game_type'
  },
  jackpotType: {
    type: DataTypes.ENUM('mini', 'minor', 'major', 'grand'),
    allowNull: false,
    field: 'jackpot_type'
  },
  currentAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false,
    defaultValue: 0,
    field: 'current_amount'
  },
  seedAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false,
    field: 'seed_amount'
  },
  contributionPercent: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.5,
    field: 'contribution_percent'
  },
  minimumTrigger: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false,
    field: 'minimum_trigger'
  },
  lastWonAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_won_at'
  },
  lastWonBy: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'last_won_by'
  },
  lastWonAmount: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: true,
    field: 'last_won_amount'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'jackpots',
  timestamps: true,
  indexes: [
    { fields: ['game_type'] },
    { fields: ['jackpot_type'] },
    { fields: ['is_active'] }
  ]
});

module.exports = Jackpot;
