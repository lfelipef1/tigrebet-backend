const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database-postgres');

const GameSettings = sequelize.define('GameSettings', {
  game: {
    type: DataTypes.STRING(32),
    primaryKey: true,
  },
  rtp: {
    type: DataTypes.INTEGER,
    defaultValue: 95,
    validate: { min: 0, max: 100 },
  },
  isOpen: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'game_settings',
  timestamps: true,
});

module.exports = GameSettings;
