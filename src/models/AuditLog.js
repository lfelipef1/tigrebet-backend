const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database-postgres');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  uid: { type: DataTypes.STRING(50), allowNull: false },
  action: { type: DataTypes.STRING(100), allowNull: false },
  details: { type: DataTypes.JSONB },
  ipAddress: { type: DataTypes.STRING(50) },
  userAgent: { type: DataTypes.TEXT },
}, {
  tableName: 'audit_logs',
  indexes: [{ fields: ['uid'] }, { fields: ['createdAt'] }],
});

module.exports = AuditLog;
