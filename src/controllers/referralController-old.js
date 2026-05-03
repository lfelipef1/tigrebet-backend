const User = require('../models/User');
const logger = require('../config/logger');

const getReferralInfo = async (req, res, next) => {
  try {
    const user = req.user;
    
    const referredUsers = await User.find({ referredBy: user.refCode });
    
    res.json({
      code: 200,
      data: {
        refCode: user.refCode,
        referralCount: referredUsers.length,
        totalEarnings: 0,
        commissionRate: 0.01 + (user.vipLevel * 0.005),
      },
    });
  } catch (error) {
    logger.error('Get referral info error:', error);
    next(error);
  }
};

module.exports = {
  getReferralInfo,
};
