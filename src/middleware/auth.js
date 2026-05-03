const { verifyToken } = require('../utils/crypto');
const { User } = require('../models');
const logger = require('../config/logger');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        code: 401,
        msg: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        code: 401,
        msg: 'Invalid or expired token',
      });
    }

    const user = await User.findByPk(decoded.id);

    if (!user) {
      logger.warn(`Authentication failed for id: ${decoded.id}`);
      return res.status(401).json({
        code: 401,
        msg: 'Unauthorized access',
      });
    }

    if (user.token && user.token !== token) {
      return res.status(401).json({
        code: 401,
        msg: 'Session expired, please login again',
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        code: 403,
        msg: 'Account is banned',
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        code: 403,
        msg: 'Account is suspended',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      code: 500,
      msg: 'Internal server error during authentication',
    });
  }
};

module.exports = authenticate;
