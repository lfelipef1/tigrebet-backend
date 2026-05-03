const referralService = require('../services/referralService');
const { User } = require('../models');
const logger = require('../config/logger');

class ReferralController {
  // Generate referral code
  async generateReferralCode(req, res) {
    try {
      const userId = req.user.id;
      
      const referralCode = await referralService.generateReferralCode(userId);

      res.json({
        success: true,
        data: {
          referralCode
        },
        message: 'Referral code generated successfully'
      });

    } catch (error) {
      logger.error('Generate Referral Code Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get referral link
  async getReferralLink(req, res) {
    try {
      const userId = req.user.id;
      
      const referralData = await referralService.generateReferralLink(userId);

      res.json({
        success: true,
        data: referralData
      });

    } catch (error) {
      logger.error('Get Referral Link Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Process registration with referral
  async processReferral(req, res) {
    try {
      const { referralCode } = req.body;
      const userId = req.user.id;

      if (!referralCode) {
        return res.status(400).json({
          success: false,
          error: 'Referral code is required'
        });
      }

      // Check if user already used a referral
      const user = await User.findByPk(userId);
      if (user.referredBy) {
        return res.status(400).json({
          success: false,
          error: 'You have already used a referral code'
        });
      }

      const result = await referralService.processReferral(referralCode, userId);

      res.json({
        success: true,
        data: result,
        message: 'Referral processed successfully'
      });

    } catch (error) {
      logger.error('Process Referral Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get referral statistics
  async getReferralStatistics(req, res) {
    try {
      const userId = req.user.id;
      
      const stats = await referralService.getReferralStatistics(userId);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Get Referral Statistics Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get referral leaderboard
  async getReferralLeaderboard(req, res) {
    try {
      const { limit = 100 } = req.query;
      
      const leaderboard = await referralService.getReferralLeaderboard(parseInt(limit));

      res.json({
        success: true,
        data: leaderboard
      });

    } catch (error) {
      logger.error('Get Referral Leaderboard Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Validate referral code
  async validateReferralCode(req, res) {
    try {
      const { referralCode } = req.query;

      if (!referralCode) {
        return res.status(400).json({
          success: false,
          error: 'Referral code is required'
        });
      }

      const referralData = await referralService.validateReferralCode(referralCode);

      if (!referralData) {
        return res.status(404).json({
          success: false,
          error: 'Invalid referral code'
        });
      }

      res.json({
        success: true,
        data: {
          valid: true,
          referrer: {
            username: referralData.username,
            memberSince: referralData.createdAt
          }
        }
      });

    } catch (error) {
      logger.error('Validate Referral Code Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get referral commission from wager
  async calculateReferralCommission(req, res) {
    try {
      const userId = req.user.id;
      const { wagerAmount } = req.body;

      if (!wagerAmount || wagerAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Valid wager amount is required'
        });
      }

      const commission = await referralService.calculateReferralCommission(userId, parseFloat(wagerAmount));

      if (commission) {
        res.json({
          success: true,
          data: {
            commissionAmount: commission,
            message: 'Referral commission calculated and credited'
          }
        });
      } else {
        res.json({
          success: true,
          data: {
            commissionAmount: 0,
            message: 'No referral commission applicable'
          }
        });
      }

    } catch (error) {
      logger.error('Calculate Referral Commission Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get referral analytics
  async getReferralAnalytics(req, res) {
    try {
      const userId = req.user.id;
      const { period = '30' } = req.query; // Default to last 30 days
      
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Get referred users with date filtering
      const daysAgo = new Date(Date.now() - (parseInt(period) * 24 * 60 * 60 * 1000));
      
      const referredUsers = await User.findAll({
        where: {
          referredBy: userId,
          createdAt: {
            [require('sequelize').Op.gte]: daysAgo
          }
        },
        attributes: ['id', 'username', 'createdAt', 'totalDeposited', 'totalWagered'],
        order: [['createdAt', 'DESC']]
      });

      // Calculate analytics
      const totalReferrals = referredUsers.length;
      const activeReferrals = referredUsers.filter(u => u.totalWagered > 0).length;
      const depositingReferrals = referredUsers.filter(u => u.totalDeposited > 0).length;
      const totalDeposits = referredUsers.reduce((sum, u) => sum + parseFloat(u.totalDeposited || 0), 0);
      const totalWagered = referredUsers.reduce((sum, u) => sum + parseFloat(u.totalWagered || 0), 0);

      // Group by day for chart data
      const dailyData = {};
      referredUsers.forEach(u => {
        const date = u.createdAt.toISOString().split('T')[0];
        if (!dailyData[date]) {
          dailyData[date] = 0;
        }
        dailyData[date]++;
      });

      const chartData = Object.entries(dailyData).map(([date, count]) => ({
        date,
        referrals: count
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      res.json({
        success: true,
        data: {
          summary: {
            totalReferrals,
            activeReferrals,
            depositingReferrals,
            totalDeposits,
            totalWagered,
            avgDepositPerReferral: totalReferrals > 0 ? totalDeposits / totalReferrals : 0,
            avgWagerPerReferral: totalReferrals > 0 ? totalWagered / totalReferrals : 0
          },
          chartData,
          recentReferrals: referredUsers.slice(0, 10).map(u => ({
            id: u.id,
            username: u.username,
            joinedAt: u.createdAt,
            totalDeposited: parseFloat(u.totalDeposited || 0),
            totalWagered: parseFloat(u.totalWagered || 0)
          }))
        }
      });

    } catch (error) {
      logger.error('Get Referral Analytics Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Share referral link
  async shareReferralLink(req, res) {
    try {
      const userId = req.user.id;
      const { platform } = req.query; // whatsapp, telegram, twitter, etc
      
      const referralData = await referralService.generateReferralLink(userId);
      
      const shareMessages = {
        whatsapp: {
          text: `🎮 Jogue no Tiger Pro e ganhe R$50 de bônus! Use meu código: ${referralData.referralCode}\n\n${referralData.referralLink}`,
          url: `https://wa.me/?text=${encodeURIComponent(`🎮 Jogue no Tiger Pro e ganhe R$50 de bônus! Use meu código: ${referralData.referralCode}\n\n${referralData.referralLink}`)}`
        },
        telegram: {
          text: `🎮 Jogue no Tiger Pro e ganhe R$50 de bônus! Use meu código: ${referralData.referralCode}\n\n${referralData.referralLink}`,
          url: `https://t.me/share/url?url=${encodeURIComponent(referralData.referralLink)}&text=${encodeURIComponent(`🎮 Jogue no Tiger Pro e ganhe R$50 de bônus! Use meu código: ${referralData.referralCode}`)}`
        },
        twitter: {
          text: `🎮 Estou jogando no Tiger Pro e ganhando de verdade! Use meu código ${referralData.referralCode} e ganhe R$50 de bônus 🎯\n\n${referralData.referralLink}\n\n#TigerPro #JogosOnline #GanharDinheiro`,
          url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`🎮 Estou jogando no Tiger Pro e ganhando de verdade! Use meu código ${referralData.referralCode} e ganhe R$50 de bônus 🎯\n\n${referralData.referralLink}\n\n#TigerPro #JogosOnline #GanharDinheiro`)}`
        }
      };

      const shareData = shareMessages[platform] || shareMessages.whatsapp;

      res.json({
        success: true,
        data: {
          ...referralData,
          shareData
        }
      });

    } catch (error) {
      logger.error('Share Referral Link Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new ReferralController();
