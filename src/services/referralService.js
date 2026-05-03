const { User, Transaction } = require('../models');
const { redis } = require('../config/database-postgres');
const crypto = require('crypto');
const logger = require('../config/logger');
const cron = require('node-cron');

class ReferralService {
  constructor() {
    this.initializeCronJobs();
  }

  // Initialize referral system cron jobs
  initializeCronJobs() {
    // Daily referral rewards calculation
    cron.schedule('0 1 * * *', async () => {
      await this.calculateDailyReferralRewards();
    });

    // Weekly referral bonus distribution
    cron.schedule('0 2 * * 1', async () => {
      await this.distributeWeeklyReferralBonuses();
    });
  }

  // Generate unique referral code for user
  async generateReferralCode(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Check if user already has referral code
      if (user.referralCode) {
        return user.referralCode;
      }

      // Generate unique code
      let referralCode;
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 10) {
        referralCode = this.generateReferralCodeString();
        
        const existingUser = await User.findOne({
          where: { referralCode }
        });

        if (!existingUser) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new Error('Failed to generate unique referral code');
      }

      // Update user with referral code
      await user.update({ referralCode });

      // Cache referral data
      await redis.setex(`referral:${referralCode}`, 86400, JSON.stringify({
        userId: user.id,
        username: user.username,
        createdAt: new Date()
      }));

      logger.info(`Referral code generated for user ${userId}: ${referralCode}`);

      return referralCode;

    } catch (error) {
      logger.error('Generate Referral Code Error:', error);
      throw error;
    }
  }

  // Generate referral code string
  generateReferralCodeString() {
    const prefix = 'TIGER';
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}${random}`;
  }

  // Process referral registration
  async processReferral(referralCode, newUserId) {
    try {
      // Get referral data from cache or database
      let referralData = await redis.get(`referral:${referralCode}`);
      
      if (!referralData) {
        const referrerUser = await User.findOne({
          where: { referralCode }
        });

        if (!referrerUser) {
          throw new Error('Invalid referral code');
        }

        referralData = {
          userId: referrerUser.id,
          username: referrerUser.username,
          createdAt: referrerUser.createdAt
        };

        // Cache for future use
        await redis.setex(`referral:${referralCode}`, 86400, JSON.stringify(referralData));
      } else {
        referralData = JSON.parse(referralData);
      }

      // Check if new user is trying to refer themselves
      if (referralData.userId === newUserId) {
        throw new Error('Cannot refer yourself');
      }

      const newUser = await User.findByPk(newUserId);
      if (!newUser) {
        throw new Error('New user not found');
      }

      // Update new user with referrer information
      await newUser.update({
        referredBy: referralData.userId,
        referralCode: referralCode,
        referralBonusGiven: false
      });

      // Update referrer stats
      await User.increment(
        { totalReferrals: 1 },
        { where: { id: referralData.userId } }
      );

      // Create referral transaction for referrer
      await Transaction.create({
        userId: referralData.userId,
        type: 'referral',
        status: 'completed',
        amount: 50.00, // R$50 bonus for successful referral
        currency: 'BRL',
        paymentMethod: 'wallet',
        description: `Bônus de indicação - ${newUser.username}`,
        metadata: {
          referralCode,
          referredUserId: newUserId,
          referredUsername: newUser.username,
          bonusType: 'signup_referral'
        }
      });

      // Update referrer balance
      const referrerUser = await User.findByPk(referralData.userId);
      await referrerUser.update({
        balance: parseFloat(referrerUser.balance) + 50.00
      });

      // Send notifications
      await this.sendReferralNotifications(referralData.userId, newUserId, 50.00);

      logger.info(`Referral processed: ${referralData.userId} referred ${newUserId} with code ${referralCode}`);

      return {
        success: true,
        referrerId: referralData.userId,
        referrerUsername: referralData.username,
        bonusAmount: 50.00
      };

    } catch (error) {
      logger.error('Process Referral Error:', error);
      throw error;
    }
  }

  // Calculate referral commission from user's wager
  async calculateReferralCommission(userId, wagerAmount) {
    try {
      const user = await User.findByPk(userId);
      if (!user || !user.referredBy) {
        return null;
      }

      // Get commission rates based on referrer VIP level
      const referrerUser = await User.findByPk(user.referredBy);
      const commissionRates = {
        1: 0.05,  // Bronze: 5%
        2: 0.07,  // Silver: 7%
        3: 0.10,  // Gold: 10%
        4: 0.12,  // Platinum: 12%
        5: 0.15   // Diamond: 15%
      };

      const commissionRate = commissionRates[referrerUser.vipLevel] || 0.05;
      const commissionAmount = wagerAmount * commissionRate;

      // Create commission transaction
      await Transaction.create({
        userId: user.referredBy,
        type: 'commission',
        status: 'completed',
        amount: commissionAmount,
        currency: 'BRL',
        paymentMethod: 'wallet',
        description: `Comissão de aposta - ${user.username}`,
        metadata: {
          referredUserId: userId,
          referredUsername: user.username,
          wagerAmount,
          commissionRate,
          commissionType: 'wager_commission'
        }
      });

      // Update referrer balance
      await referrerUser.update({
        balance: parseFloat(referrerUser.balance) + commissionAmount,
        totalCommissionEarned: parseFloat(referrerUser.totalCommissionEarned || 0) + commissionAmount
      });

      // Cache commission data
      await redis.setex(`commission:${user.referredBy}:${userId}`, 3600, JSON.stringify({
        amount: commissionAmount,
        rate: commissionRate,
        timestamp: new Date()
      }));

      return commissionAmount;

    } catch (error) {
      logger.error('Calculate Referral Commission Error:', error);
      throw error;
    }
  }

  // Get referral statistics
  async getReferralStatistics(userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: [
          'referralCode',
          'totalReferrals',
          'totalCommissionEarned'
        ]
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get referred users
      const referredUsers = await User.findAll({
        where: { referredBy: userId },
        attributes: ['id', 'username', 'createdAt', 'totalDeposited', 'totalWagered'],
        order: [['createdAt', 'DESC']]
      });

      // Get referral transactions
      const referralTransactions = await Transaction.findAll({
        where: { 
          userId,
          type: ['referral', 'commission']
        },
        order: [['createdAt', 'DESC']],
        limit: 50
      });

      // Calculate monthly stats
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      const monthlyReferrals = referredUsers.filter(u => {
        const date = new Date(u.createdAt);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      }).length;

      const monthlyCommission = referralTransactions
        .filter(t => {
          const date = new Date(t.createdAt);
          return date.getMonth() === currentMonth && 
                 date.getFullYear() === currentYear && 
                 t.type === 'commission';
        })
        .reduce((sum, t) => sum + parseFloat(t.amount), 0);

      return {
        referralCode: user.referralCode,
        totalReferrals: user.totalReferrals,
        monthlyReferrals,
        totalCommissionEarned: parseFloat(user.totalCommissionEarned || 0),
        monthlyCommission,
        referredUsers: referredUsers.map(u => ({
          id: u.id,
          username: u.username,
          joinedAt: u.createdAt,
          totalDeposited: parseFloat(u.totalDeposited || 0),
          totalWagered: parseFloat(u.totalWagered || 0)
        })),
        recentTransactions: referralTransactions.map(t => ({
          id: t.id,
          type: t.type,
          amount: parseFloat(t.amount),
          description: t.description,
          createdAt: t.createdAt,
          metadata: t.metadata
        }))
      };

    } catch (error) {
      logger.error('Get Referral Statistics Error:', error);
      throw error;
    }
  }

  // Get referral leaderboard
  async getReferralLeaderboard(limit = 100) {
    try {
      const leaderboard = await User.findAll({
        attributes: [
          'username',
          'vipLevel',
          'totalReferrals',
          'totalCommissionEarned'
        ],
        where: {
          totalReferrals: { [require('sequelize').Op.gt]: 0 }
        },
        order: [
          ['totalReferrals', 'DESC'],
          ['totalCommissionEarned', 'DESC']
        ],
        limit: parseInt(limit)
      });

      return leaderboard.map((user, index) => ({
        rank: index + 1,
        username: user.username,
        vipLevel: user.vipLevel,
        totalReferrals: user.totalReferrals,
        totalCommissionEarned: parseFloat(user.totalCommissionEarned || 0)
      }));

    } catch (error) {
      logger.error('Get Referral Leaderboard Error:', error);
      throw error;
    }
  }

  // Generate referral link
  async generateReferralLink(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate referral code if not exists
      const referralCode = user.referralCode || await this.generateReferralCode(userId);

      const referralLink = `${process.env.FRONTEND_URL}/register?ref=${referralCode}`;

      return {
        referralCode,
        referralLink,
        shareText: `Junte-se ao Tiger Pro e ganhe R$50 de bônus! Use meu código: ${referralCode}`,
        shareTitle: 'Tiger Pro - Jogue e Ganhe!'
      };

    } catch (error) {
      logger.error('Generate Referral Link Error:', error);
      throw error;
    }
  }

  // Calculate daily referral rewards
  async calculateDailyReferralRewards() {
    try {
      logger.info('Starting daily referral rewards calculation...');

      const usersWithReferrals = await User.findAll({
        where: {
          totalReferrals: { [require('sequelize').Op.gt]: 0 }
        }
      });

      for (const user of usersWithReferrals) {
        try {
          // Calculate active referrals (users who wagered in last 24h)
          const activeReferrals = await User.count({
            where: {
              referredBy: user.id,
              lastWagerAt: {
                [require('sequelize').Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
              }
            }
          });

          if (activeReferrals > 0) {
            const bonusAmount = activeReferrals * 5.00; // R$5 per active referral

            await Transaction.create({
              userId: user.id,
              type: 'bonus',
              status: 'completed',
              amount: bonusAmount,
              currency: 'BRL',
              paymentMethod: 'wallet',
              description: `Bônus diário de indicações ativas (${activeReferrals})`,
              metadata: {
                bonusType: 'daily_referral_bonus',
                activeReferrals
              }
            });

            await user.update({
              balance: parseFloat(user.balance) + bonusAmount
            });
          }
        } catch (error) {
          logger.error(`Error calculating daily reward for user ${user.id}:`, error);
        }
      }

      logger.info('Daily referral rewards calculation completed');

    } catch (error) {
      logger.error('Calculate Daily Referral Rewards Error:', error);
    }
  }

  // Distribute weekly referral bonuses
  async distributeWeeklyReferralBonuses() {
    try {
      logger.info('Starting weekly referral bonus distribution...');

      const topReferrers = await this.getReferralLeaderboard(10);

      for (let i = 0; i < topReferrers.length; i++) {
        const referrer = topReferrers[i];
        const bonusAmounts = [500, 300, 200, 150, 100, 80, 60, 40, 30, 20]; // Top 10 bonuses
        const bonusAmount = bonusAmounts[i];

        if (bonusAmount > 0) {
          const user = await User.findOne({
            where: { username: referrer.username }
          });

          await Transaction.create({
            userId: user.id,
            type: 'bonus',
            status: 'completed',
            amount: bonusAmount,
            currency: 'BRL',
            paymentMethod: 'wallet',
            description: `Bônus semanal de indicações - Top ${i + 1}`,
            metadata: {
              bonusType: 'weekly_referral_bonus',
              rank: i + 1,
              totalReferrals: referrer.totalReferrals
            }
          });

          await user.update({
            balance: parseFloat(user.balance) + bonusAmount
          });
        }
      }

      logger.info('Weekly referral bonus distribution completed');

    } catch (error) {
      logger.error('Distribute Weekly Referral Bonuses Error:', error);
    }
  }

  // Send referral notifications
  async sendReferralNotifications(referrerId, referredUserId, bonusAmount) {
    try {
      const referrer = await User.findByPk(referrerId);
      const referredUser = await User.findByPk(referredUserId);

      // Notify referrer
      await this.createNotification(referrerId, {
        type: 'referral_success',
        title: '🎉 Nova indicação bem-sucedida!',
        message: `${referredUser.username} se registrou usando seu código. Você ganhou R$${bonusAmount.toFixed(2)} de bônus!`,
        data: {
          referredUserId,
          referredUsername: referredUser.username,
          bonusAmount
        }
      });

    } catch (error) {
      logger.error('Send Referral Notifications Error:', error);
    }
  }

  // Create notification (placeholder)
  async createNotification(userId, notificationData) {
    // This would integrate with your notification system
    logger.info(`Notification created for user ${userId}:`, notificationData);
  }

  // Validate referral code
  async validateReferralCode(referralCode) {
    try {
      const referralData = await redis.get(`referral:${referralCode}`);
      
      if (referralData) {
        return JSON.parse(referralData);
      }

      const user = await User.findOne({
        where: { referralCode },
        attributes: ['id', 'username', 'createdAt']
      });

      if (!user) {
        return null;
      }

      const data = {
        userId: user.id,
        username: user.username,
        createdAt: user.createdAt
      };

      // Cache for future use
      await redis.setex(`referral:${referralCode}`, 86400, JSON.stringify(data));

      return data;

    } catch (error) {
      logger.error('Validate Referral Code Error:', error);
      throw error;
    }
  }
}

module.exports = new ReferralService();
