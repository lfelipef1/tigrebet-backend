const vipService = require('../services/vipService');
const { User, VIPLevel } = require('../models');
const logger = require('../config/logger');

class VIPController {
  // Get VIP information
  async getVipInfo(req, res) {
    try {
      const userId = req.user.id;
      
      const vipStats = await vipService.getVIPStatistics(userId);
      const benefits = await vipService.getVIPBenefits(vipStats.currentLevel);

      res.json({
        success: true,
        data: {
          ...vipStats,
          benefits
        }
      });

    } catch (error) {
      logger.error('Get VIP Info Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get VIP benefits for specific level
  async getPrivilege(req, res) {
    try {
      const { level } = req.query;
      
      if (!level) {
        return res.status(400).json({
          success: false,
          error: 'VIP level is required'
        });
      }

      const benefits = await vipService.getVIPBenefits(parseInt(level));

      res.json({
        success: true,
        data: benefits
      });

    } catch (error) {
      logger.error('Get VIP Privilege Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get all VIP levels information
  async getLevelInfo(req, res) {
    try {
      const vipLevels = await VIPLevel.findAll({
        order: [['level', 'ASC']]
      });

      res.json({
        success: true,
        data: vipLevels
      });

    } catch (error) {
      logger.error('Get VIP Level Info Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Upgrade VIP level
  async upgradeLevel(req, res) {
    try {
      const userId = req.user.id;
      
      const result = await vipService.processVIPUpgrade(userId);

      res.json({
        success: true,
        data: result,
        message: 'VIP level processed successfully'
      });

    } catch (error) {
      logger.error('Upgrade VIP Level Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Claim weekly bonus
  async claimWeeklyBonus(req, res) {
    try {
      const userId = req.user.id;
      
      const result = await vipService.claimWeeklyBonus(userId);

      res.json({
        success: true,
        data: result,
        message: 'Weekly bonus claimed successfully'
      });

    } catch (error) {
      logger.error('Claim Weekly Bonus Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Claim monthly bonus
  async claimMonthlyBonus(req, res) {
    try {
      const userId = req.user.id;
      
      const result = await vipService.claimMonthlyBonus(userId);

      res.json({
        success: true,
        data: result,
        message: 'Monthly bonus claimed successfully'
      });

    } catch (error) {
      logger.error('Claim Monthly Bonus Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get VIP ranking
  async getVipRanking(req, res) {
    try {
      const { limit = 100 } = req.query;
      
      const ranking = await vipService.getVIPRanking(parseInt(limit));

      res.json({
        success: true,
        data: ranking
      });

    } catch (error) {
      logger.error('Get VIP Ranking Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // Get VIP progress
  async getVipProgress(req, res) {
    try {
      const userId = req.user.id;
      
      const user = await User.findByPk(userId, {
        attributes: ['vipLevel', 'vipPoints', 'totalWagered', 'totalDeposited']
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const currentLevel = await VIPLevel.findOne({
        where: { level: user.vipLevel }
      });

      const nextLevel = await VIPLevel.findOne({
        where: { level: user.vipLevel + 1 }
      });

      const progress = {
        currentLevel: user.vipLevel,
        currentPoints: user.vipPoints,
        currentWagered: user.totalWagered,
        currentDeposited: user.totalDeposited,
        currentLevelName: currentLevel?.name || 'Bronze',
        nextLevelName: nextLevel?.name || null,
        nextLevelPoints: nextLevel?.minPoints || null,
        pointsToNext: nextLevel ? Math.max(0, nextLevel.minPoints - user.vipPoints) : 0,
        progressPercentage: nextLevel ? 
          Math.min(100, ((user.vipPoints - currentLevel.minPoints) / (nextLevel.minPoints - currentLevel.minPoints)) * 100) : 100
      };

      res.json({
        success: true,
        data: progress
      });

    } catch (error) {
      logger.error('Get VIP Progress Error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new VIPController();
