const { User, Transaction, VIPLevel, Achievement, DailyMission } = require('../models');
const { redis } = require('../config/database-postgres');
const logger = require('../config/logger');
const cron = require('node-cron');

class VIPService {
  constructor() {
    this.initializeCronJobs();
  }

  // Initialize VIP system cron jobs
  initializeCronJobs() {
    // Daily VIP points calculation
    cron.schedule('0 2 * * *', async () => {
      await this.calculateDailyVIPPoints();
    });

    // Weekly VIP bonus distribution
    cron.schedule('0 3 * * 1', async () => {
      await this.distributeWeeklyBonuses();
    });

    // Monthly VIP bonus distribution
    cron.schedule('0 4 1 * *', async () => {
      await this.distributeMonthlyBonuses();
    });

    // Daily missions reset
    cron.schedule('0 0 * * *', async () => {
      await this.resetDailyMissions();
    });
  }

  // Calculate VIP points for user
  async calculateVIPPoints(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Calculate points from total wagered
      const wagerPoints = Math.floor(user.totalWagered / 10); // 1 point per R$10 wagered

      // Calculate points from total deposits
      const depositPoints = Math.floor(user.totalDeposited / 50); // 1 point per R$50 deposited

      // Calculate points from achievements
      const achievementPoints = await Achievement.sum('points', {
        where: { userId, status: 'completed' }
      });

      // Calculate points from missions
      const missionPoints = await DailyMission.sum('points', {
        where: { userId, status: 'completed' }
      });

      const totalPoints = wagerPoints + depositPoints + achievementPoints + missionPoints;

      // Determine VIP level based on points
      const newVipLevel = this.determineVIPLevel(totalPoints);

      // Update user VIP level if changed
      if (newVipLevel !== user.vipLevel) {
        await user.update({ vipLevel: newVipLevel, vipPoints: totalPoints });
        
        // Send level up notification
        await this.sendVIPLevelUpNotification(user, newVipLevel);
        
        logger.info(`User ${userId} leveled up to VIP ${newVipLevel}`);
      } else {
        await user.update({ vipPoints: totalPoints });
      }

      // Cache VIP data
      await redis.setex(`vip:${userId}`, 3600, JSON.stringify({
        level: newVipLevel,
        points: totalPoints,
        nextLevel: this.getNextVIPLevel(newVipLevel),
        pointsToNext: this.getPointsToNextLevel(totalPoints, newVipLevel)
      }));

      return {
        currentLevel: newVipLevel,
        points: totalPoints,
        nextLevel: this.getNextVIPLevel(newVipLevel),
        pointsToNext: this.getPointsToNextLevel(totalPoints, newVipLevel)
      };

    } catch (error) {
      logger.error('Calculate VIP Points Error:', error);
      throw error;
    }
  }

  // Determine VIP level based on points
  determineVIPLevel(points) {
    if (points >= 50000) return 5; // Diamond
    if (points >= 15000) return 4; // Platinum
    if (points >= 5000) return 3; // Gold
    if (points >= 1000) return 2; // Silver
    return 1; // Bronze
  }

  // Get next VIP level
  getNextVIPLevel(currentLevel) {
    const levels = {
      1: 'Silver',
      2: 'Gold',
      3: 'Platinum',
      4: 'Diamond',
      5: 'MAX'
    };
    return levels[currentLevel] || 'MAX';
  }

  // Get points needed for next level
  getPointsToNextLevel(currentPoints, currentLevel) {
    const thresholds = [0, 1000, 5000, 15000, 50000]; // Points needed for levels 1-5
    const nextThreshold = thresholds[currentLevel] || Infinity;
    return Math.max(0, nextThreshold - currentPoints);
  }

  // Get VIP benefits for level
  async getVIPBenefits(level) {
    try {
      const vipLevel = await VIPLevel.findOne({ where: { level } });
      if (!vipLevel) {
        throw new Error('VIP level not found');
      }

      return {
        level: vipLevel.level,
        name: vipLevel.name,
        cashbackPercent: vipLevel.cashbackPercent,
        depositBonusPercent: vipLevel.depositBonusPercent,
        weeklyBonus: vipLevel.weeklyBonus,
        monthlyBonus: vipLevel.monthlyBonus,
        prioritySupport: vipLevel.prioritySupport,
        exclusivePromotions: vipLevel.exclusivePromotions,
        higherWithdrawalLimit: vipLevel.higherWithdrawalLimit,
        personalAccountManager: vipLevel.personalAccountManager,
        benefits: vipLevel.benefits,
        color: vipLevel.color,
        icon: vipLevel.icon
      };

    } catch (error) {
      logger.error('Get VIP Benefits Error:', error);
      throw error;
    }
  }

  // Process VIP upgrade
  async processVIPUpgrade(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const vipData = await this.calculateVIPPoints(userId);
      const benefits = await this.getVIPBenefits(vipData.currentLevel);

      // Send upgrade notification
      await this.sendVIPUpgradeNotification(user, vipData, benefits);

      return {
        success: true,
        vipData,
        benefits
      };

    } catch (error) {
      logger.error('Process VIP Upgrade Error:', error);
      throw error;
    }
  }

  // Claim weekly VIP bonus
  async claimWeeklyBonus(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if already claimed this week
      const lastWeekClaim = user.lastWeeklyBonusClaim;
      if (lastWeekClaim && this.isSameWeek(lastWeekClaim, new Date())) {
        throw new Error('Weekly bonus already claimed this week');
      }

      const benefits = await this.getVIPBenefits(user.vipLevel);
      const bonusAmount = benefits.weeklyBonus;

      // Create bonus transaction
      await Transaction.create({
        userId,
        type: 'bonus',
        status: 'completed',
        amount: bonusAmount,
        currency: 'BRL',
        paymentMethod: 'wallet',
        description: `Bônus Semanal VIP ${benefits.name}`,
        metadata: {
          bonusType: 'weekly_vip',
          vipLevel: user.vipLevel,
          vipName: benefits.name
        }
      });

      // Update user balance and last claim date
      await user.update({
        balance: parseFloat(user.balance) + bonusAmount,
        lastWeeklyBonusClaim: new Date()
      });

      logger.info(`Weekly bonus claimed: ${userId} - R$ ${bonusAmount}`);

      return {
        success: true,
        amount: bonusAmount,
        description: `Bônus Semanal VIP ${benefits.name}`
      };

    } catch (error) {
      logger.error('Claim Weekly Bonus Error:', error);
      throw error;
    }
  }

  // Claim monthly VIP bonus
  async claimMonthlyBonus(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if already claimed this month
      const lastMonthClaim = user.lastMonthlyBonusClaim;
      if (lastMonthClaim && this.isSameMonth(lastMonthClaim, new Date())) {
        throw new Error('Monthly bonus already claimed this month');
      }

      const benefits = await this.getVIPBenefits(user.vipLevel);
      const bonusAmount = benefits.monthlyBonus;

      // Create bonus transaction
      await Transaction.create({
        userId,
        type: 'bonus',
        status: 'completed',
        amount: bonusAmount,
        currency: 'BRL',
        paymentMethod: 'wallet',
        description: `Bônus Mensal VIP ${benefits.name}`,
        metadata: {
          bonusType: 'monthly_vip',
          vipLevel: user.vipLevel,
          vipName: benefits.name
        }
      });

      // Update user balance and last claim date
      await user.update({
        balance: parseFloat(user.balance) + bonusAmount,
        lastMonthlyBonusClaim: new Date()
      });

      logger.info(`Monthly bonus claimed: ${userId} - R$ ${bonusAmount}`);

      return {
        success: true,
        amount: bonusAmount,
        description: `Bônus Mensal VIP ${benefits.name}`
      };

    } catch (error) {
      logger.error('Claim Monthly Bonus Error:', error);
      throw error;
    }
  }

  // Get VIP ranking
  async getVIPRanking(limit = 100) {
    try {
      const ranking = await User.findAll({
        attributes: [
          'username',
          'vipLevel',
          'vipPoints',
          'totalWagered',
          'totalDeposited'
        ],
        where: {
          status: 'active',
          vipLevel: { [require('sequelize').Op.gte]: 2 } // Silver and above
        },
        order: [
          ['vipPoints', 'DESC'],
          ['totalWagered', 'DESC']
        ],
        limit: parseInt(limit)
      });

      // Add rank and benefits to each user
      const rankedUsers = await Promise.all(ranking.map(async (user, index) => {
        const benefits = await this.getVIPBenefits(user.vipLevel);
        return {
          rank: index + 1,
          username: user.username,
          vipLevel: user.vipLevel,
          vipName: benefits.name,
          vipPoints: user.vipPoints,
          totalWagered: user.totalWagered,
          totalDeposited: user.totalDeposited,
          color: benefits.color,
          icon: benefits.icon
        };
      }));

      return rankedUsers;

    } catch (error) {
      logger.error('Get VIP Ranking Error:', error);
      throw error;
    }
  }

  // Calculate daily VIP points for all users
  async calculateDailyVIPPoints() {
    try {
      logger.info('Starting daily VIP points calculation...');

      const users = await User.findAll({
        where: { status: 'active' }
      });

      for (const user of users) {
        try {
          await this.calculateVIPPoints(user.id);
        } catch (error) {
          logger.error(`Error calculating VIP points for user ${user.id}:`, error);
        }
      }

      logger.info('Daily VIP points calculation completed');

    } catch (error) {
      logger.error('Calculate Daily VIP Points Error:', error);
    }
  }

  // Distribute weekly bonuses
  async distributeWeeklyBonuses() {
    try {
      logger.info('Starting weekly VIP bonus distribution...');

      const users = await User.findAll({
        where: { 
          status: 'active',
          vipLevel: { [require('sequelize').Op.gte]: 2 } // Silver and above
        }
      });

      for (const user of users) {
        try {
          await this.claimWeeklyBonus(user.id);
        } catch (error) {
          logger.error(`Error distributing weekly bonus for user ${user.id}:`, error);
        }
      }

      logger.info('Weekly VIP bonus distribution completed');

    } catch (error) {
      logger.error('Distribute Weekly Bonuses Error:', error);
    }
  }

  // Distribute monthly bonuses
  async distributeMonthlyBonuses() {
    try {
      logger.info('Starting monthly VIP bonus distribution...');

      const users = await User.findAll({
        where: { 
          status: 'active',
          vipLevel: { [require('sequelize').Op.gte]: 2 } // Silver and above
        }
      });

      for (const user of users) {
        try {
          await this.claimMonthlyBonus(user.id);
        } catch (error) {
          logger.error(`Error distributing monthly bonus for user ${user.id}:`, error);
        }
      }

      logger.info('Monthly VIP bonus distribution completed');

    } catch (error) {
      logger.error('Distribute Monthly Bonuses Error:', error);
    }
  }

  // Send VIP level up notification
  async sendVIPLevelUpNotification(user, newLevel) {
    try {
      const benefits = await this.getVIPBenefits(newLevel);
      
      // Create notification
      await this.createNotification(user.id, {
        type: 'vip_level_up',
        title: `🎉 Parabéns! Você alcançou o nível ${benefits.name}!`,
        message: `Você foi promovido para VIP ${benefits.name}! Agora você tem acesso a benefícios exclusivos como ${benefits.cashbackPercent}% de cashback e bônus especiais.`,
        data: {
          newLevel,
          benefits
        }
      });

    } catch (error) {
      logger.error('Send VIP Level Up Notification Error:', error);
    }
  }

  // Send VIP upgrade notification
  async sendVIPUpgradeNotification(user, vipData, benefits) {
    try {
      await this.createNotification(user.id, {
        type: 'vip_upgrade',
        title: `👑 Bem-vindo ao VIP ${benefits.name}!`,
        message: `Você agora é um membro VIP ${benefits.name} com acesso a benefícios exclusivos.`,
        data: {
          vipData,
          benefits
        }
      });

    } catch (error) {
      logger.error('Send VIP Upgrade Notification Error:', error);
    }
  }

  // Create notification (placeholder for notification system)
  async createNotification(userId, notificationData) {
    // This would integrate with your notification system
    logger.info(`Notification created for user ${userId}:`, notificationData);
  }

  // Helper methods
  isSameWeek(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() && 
           Math.floor(d1.getTime() / (7 * 24 * 60 * 60 * 1000)) === 
           Math.floor(d2.getTime() / (7 * 24 * 60 * 60 * 1000));
  }

  isSameMonth(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() && 
           d1.getMonth() === d2.getMonth();
  }

  // Get VIP statistics
  async getVIPStatistics(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const vipData = await this.calculateVIPPoints(userId);
      const benefits = await this.getVIPBenefits(vipData.currentLevel);

      // Get user's position in ranking
      const ranking = await this.getVIPRanking(1000);
      const userRank = ranking.find(u => u.username === user.username);
      const rankPosition = userRank ? userRank.rank : null;

      return {
        currentLevel: vipData.currentLevel,
        points: vipData.points,
        nextLevel: vipData.nextLevel,
        pointsToNext: vipData.pointsToNext,
        benefits,
        ranking: {
          position: rankPosition,
          totalUsers: ranking.length
        },
        progress: {
          currentPoints: vipData.points,
          nextLevelPoints: this.getThresholdForLevel(vipData.currentLevel + 1),
          percentage: this.calculateProgressPercentage(vipData.points, vipData.currentLevel)
        }
      };

    } catch (error) {
      logger.error('Get VIP Statistics Error:', error);
      throw error;
    }
  }

  getThresholdForLevel(level) {
    const thresholds = [0, 1000, 5000, 15000, 50000];
    return thresholds[level - 1] || Infinity;
  }

  calculateProgressPercentage(currentPoints, currentLevel) {
    const thresholds = [0, 1000, 5000, 15000, 50000];
    const currentThreshold = thresholds[currentLevel - 1] || 0;
    const nextThreshold = thresholds[currentLevel] || Infinity;
    
    if (currentLevel >= 5) return 100; // Diamond is max level
    
    const progress = (currentPoints - currentThreshold) / (nextThreshold - currentThreshold);
    return Math.min(100, Math.max(0, progress * 100));
  }
}

module.exports = new VIPService();
