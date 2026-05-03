const User = require('../models/User');
const logger = require('../config/logger');

const getCommission = async (req, res, next) => {
  try {
    const user = req.user;
    
    const referredUsers = await User.find({ referredBy: user.refCode });
    const level1Count = referredUsers.length;
    
    let totalEarnings = 0;
    let todayEarnings = 0;

    res.json({
      code: 200,
      data: {
        totalEarnings,
        todayEarnings,
        teamCount: level1Count,
        level1Count,
        level2Count: 0,
        level3Count: 0,
      },
    });
  } catch (error) {
    logger.error('Get commission error:', error);
    next(error);
  }
};

module.exports = {
  getCommission,
};
