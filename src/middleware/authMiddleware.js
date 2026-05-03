const User = require('../models/User');
const logger = require('../config/logger');

const authenticate = async (req, res, next) => {
  try {
    const { uid, token } = req.body;

    if (!uid || !token) {
      return res.status(401).json({
        code: 401,
        msg: 'Missing credentials',
      });
    }

    const user = await User.findOne({ uid, token });

    if (!user) {
      logger.warn(`Authentication failed for uid: ${uid}`);
      return res.status(401).json({
        code: 401,
        msg: 'Invalid credentials',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        code: 403,
        msg: 'Account is deactivated',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(500).json({
      code: 500,
      msg: 'Authentication error',
    });
  }
};

module.exports = authenticate;
