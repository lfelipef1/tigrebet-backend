const logger = require('../config/logger');
const AuditLog = require('../models/AuditLog');

const logAudit = async (uid, action, details = {}) => {
  try {
    await AuditLog.create({
      uid,
      action,
      details,
      ipAddress: details.ipAddress || 'unknown',
      userAgent: details.userAgent || 'unknown',
    });
    logger.info(`Audit: ${action} - User: ${uid}`);
  } catch (error) {
    logger.error('Audit log error:', error);
  }
};

module.exports = logAudit;
