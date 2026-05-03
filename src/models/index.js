const { sequelize, redis } = require('../config/database-postgres');
const User = require('./User');
const Transaction = require('./Transaction');
const Bet = require('./Bet');
const VIPLevel = require('./VIPLevel');
const Achievement = require('./Achievement');
const DailyMission = require('./DailyMission');
const Jackpot = require('./Jackpot');
const AuditLog = require('./AuditLog');

// Associations
User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' });
Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Bet, { foreignKey: 'userId', as: 'bets' });
Bet.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Achievement, { foreignKey: 'userId', as: 'achievements' });
Achievement.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(DailyMission, { foreignKey: 'userId', as: 'dailyMissions' });
DailyMission.belongsTo(User, { foreignKey: 'userId', as: 'user' });

const initializeVIPLevels = async () => {
  const count = await VIPLevel.count();
  if (count === 0) {
    await VIPLevel.bulkCreate([
      {
        level: 1, name: 'Bronze', minPoints: 0, maxPoints: 999,
        cashbackPercent: 1, depositBonusPercent: 0, weeklyBonus: 50, monthlyBonus: 200,
        prioritySupport: false, exclusivePromotions: false, higherWithdrawalLimit: 1000,
        personalAccountManager: false,
        benefits: ['Acesso básico', 'Suporte padrão'], color: '#CD7F32', icon: '🥉'
      },
      {
        level: 2, name: 'Silver', minPoints: 1000, maxPoints: 4999,
        cashbackPercent: 2, depositBonusPercent: 5, weeklyBonus: 100, monthlyBonus: 500,
        prioritySupport: false, exclusivePromotions: true, higherWithdrawalLimit: 2500,
        personalAccountManager: false,
        benefits: ['Cashback 2%', 'Bônus de depósito 5%', 'Promoções exclusivas'], color: '#C0C0C0', icon: '🥈'
      },
      {
        level: 3, name: 'Gold', minPoints: 5000, maxPoints: 14999,
        cashbackPercent: 3, depositBonusPercent: 10, weeklyBonus: 250, monthlyBonus: 1000,
        prioritySupport: true, exclusivePromotions: true, higherWithdrawalLimit: 5000,
        personalAccountManager: false,
        benefits: ['Cashback 3%', 'Bônus de depósito 10%', 'Suporte prioritário'], color: '#FFD700', icon: '🥇'
      },
      {
        level: 4, name: 'Platinum', minPoints: 15000, maxPoints: 49999,
        cashbackPercent: 5, depositBonusPercent: 15, weeklyBonus: 500, monthlyBonus: 2500,
        prioritySupport: true, exclusivePromotions: true, higherWithdrawalLimit: 10000,
        personalAccountManager: true,
        benefits: ['Cashback 5%', 'Bônus de depósito 15%', 'Gerente de conta pessoal'], color: '#E5E4E2', icon: '💎'
      },
      {
        level: 5, name: 'Diamond', minPoints: 50000, maxPoints: null,
        cashbackPercent: 7, depositBonusPercent: 20, weeklyBonus: 1000, monthlyBonus: 5000,
        prioritySupport: true, exclusivePromotions: true, higherWithdrawalLimit: 25000,
        personalAccountManager: true,
        benefits: ['Cashback 7%', 'Bônus de depósito 20%', 'Limites de saque ilimitados'], color: '#B9F2FF', icon: '👑'
      }
    ]);
    console.log('✅ VIP levels initialized');
  }
};

const initializeJackpots = async () => {
  const count = await Jackpot.count();
  if (count === 0) {
    await Jackpot.bulkCreate([
      { gameType: 'fortune_tiger', jackpotType: 'mini', currentAmount: 500, seedAmount: 500, contributionPercent: 0.1, minimumTrigger: 500 },
      { gameType: 'fortune_tiger', jackpotType: 'minor', currentAmount: 2000, seedAmount: 2000, contributionPercent: 0.2, minimumTrigger: 2000 },
      { gameType: 'fortune_tiger', jackpotType: 'major', currentAmount: 10000, seedAmount: 10000, contributionPercent: 0.3, minimumTrigger: 10000 },
      { gameType: 'fortune_tiger', jackpotType: 'grand', currentAmount: 50000, seedAmount: 50000, contributionPercent: 0.5, minimumTrigger: 50000 }
    ]);
    console.log('✅ Jackpots initialized');
  }
};

const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force, alter: true });
    console.log('✅ Database synchronized');
    await initializeVIPLevels();
    await initializeJackpots();
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
    throw error;
  }
};

module.exports = {
  sequelize,
  redis,
  User,
  Transaction,
  Bet,
  VIPLevel,
  Achievement,
  DailyMission,
  Jackpot,
  AuditLog,
  syncDatabase
};
