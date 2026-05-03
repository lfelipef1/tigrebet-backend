const { User, VIPLevel, Transaction, Achievement } = require('../models');
const logger = require('../config/logger');

const getPrivilege = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Buscar informações do nível VIP atual
    const currentVipLevel = await VIPLevel.findOne({
      where: { level: user.vipLevel }
    });

    // Buscar próximo nível VIP
    const nextVipLevel = await VIPLevel.findOne({
      where: { level: user.vipLevel + 1 }
    });

    const privileges = currentVipLevel?.benefits || [];
    const commissionRate = 0.01 + (user.vipLevel * 0.005);

    res.json({
      code: 200,
      data: {
        level: user.vipLevel,
        levelName: currentVipLevel?.name || 'Bronze',
        points: user.vipPoints,
        nextLevelPoints: nextVipLevel?.minPoints || 0,
        privileges,
        commissionRate,
        cashbackPercent: currentVipLevel?.cashbackPercent || 1,
        depositBonusPercent: currentVipLevel?.depositBonusPercent || 0,
        weeklyBonus: currentVipLevel?.weeklyBonus || 0,
        monthlyBonus: currentVipLevel?.monthlyBonus || 0,
        prioritySupport: currentVipLevel?.prioritySupport || false,
        exclusivePromotions: currentVipLevel?.exclusivePromotions || false,
        higherWithdrawalLimit: currentVipLevel?.higherWithdrawalLimit || 1000,
        personalAccountManager: currentVipLevel?.personalAccountManager || false,
        color: currentVipLevel?.color || '#CD7F32',
        icon: currentVipLevel?.icon || '🥉'
      },
    });
  } catch (error) {
    logger.error('Get VIP privilege error:', error);
    next(error);
  }
};

const getLevelInfo = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Buscar todos os níveis VIP
    const vipLevels = await VIPLevel.findAll({
      order: [['level', 'ASC']]
    });

    // Calcular progresso para o próximo nível
    const currentLevelData = vipLevels.find(level => level.level === user.vipLevel);
    const nextLevelData = vipLevels.find(level => level.level === user.vipLevel + 1);
    
    const progress = nextLevelData 
      ? (user.vipPoints / nextLevelData.minPoints) * 100 
      : 100;

    res.json({
      code: 200,
      data: {
        currentLevel: user.vipLevel,
        currentPoints: user.vipPoints,
        nextLevelPoints: nextLevelData?.minPoints || 0,
        progress: Math.min(progress, 100),
        levels: vipLevels.map(level => ({
          level: level.level,
          name: level.name,
          minPoints: level.minPoints,
          maxPoints: level.maxPoints,
          cashbackPercent: level.cashbackPercent,
          depositBonusPercent: level.depositBonusPercent,
          weeklyBonus: level.weeklyBonus,
          monthlyBonus: level.monthlyBonus,
          prioritySupport: level.prioritySupport,
          exclusivePromotions: level.exclusivePromotions,
          higherWithdrawalLimit: level.higherWithdrawalLimit,
          personalAccountManager: level.personalAccountManager,
          benefits: level.benefits,
          color: level.color,
          icon: level.icon
        }))
      },
    });
  } catch (error) {
    logger.error('Get VIP level info error:', error);
    next(error);
  }
};

const getVipInfo = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Buscar informações detalhadas do VIP
    const currentVipLevel = await VIPLevel.findOne({
      where: { level: user.vipLevel }
    });

    // Calcular estatísticas VIP
    const totalDeposits = await Transaction.sum('amount', {
      where: { 
        userId: user.id, 
        type: 'deposit', 
        status: 'completed' 
      }
    }) || 0;

    const totalWagered = user.totalWagered || 0;
    const totalWon = user.totalWon || 0;
    const referralCount = user.referralCount || 0;

    // Calcular cashback acumulado
    const totalCashback = await Transaction.sum('amount', {
      where: { 
        userId: user.id, 
        type: 'bonus',
        description: { [require('sequelize').Op.like]: '%cashback%' }
      }
    }) || 0;

    res.json({
      code: 200,
      data: {
        level: user.vipLevel,
        levelName: currentVipLevel?.name || 'Bronze',
        points: user.vipPoints,
        totalDeposits,
        totalWagered,
        totalWon,
        referralCount,
        totalCashback,
        achievements: await Achievement.count({
          where: { userId: user.id, isCompleted: true }
        }),
        benefits: currentVipLevel?.benefits || [],
        color: currentVipLevel?.color || '#CD7F32',
        icon: currentVipLevel?.icon || '🥉'
      },
    });
  } catch (error) {
    logger.error('Get VIP info error:', error);
    next(error);
  }
};

const upgradeLevel = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Verificar se pode subir de nível
    const nextVipLevel = await VIPLevel.findOne({
      where: { level: user.vipLevel + 1 }
    });

    if (!nextVipLevel) {
      return res.status(400).json({
        code: 400,
        msg: 'Você já está no nível máximo'
      });
    }

    if (user.vipPoints < nextVipLevel.minPoints) {
      return res.status(400).json({
        code: 400,
        msg: `Pontos insuficientes. Você precisa de ${nextVipLevel.minPoints} pontos para o nível ${nextVipLevel.name}`
      });
    }

    // Atualizar nível do usuário
    await user.update({ vipLevel: user.vipLevel + 1 });

    // Conceder bônus de upgrade
    const upgradeBonus = nextVipLevel.weeklyBonus;
    if (upgradeBonus > 0) {
      await User.increment(
        { balanceETC: upgradeBonus },
        { where: { id: user.id } }
      );

      await Transaction.create({
        userId: user.id,
        uid: user.uid,
        type: 'bonus',
        amount: upgradeBonus,
        coin: 'ETC',
        status: 'completed',
        description: `Bônus de upgrade VIP - Nível ${nextVipLevel.name}`,
        completedAt: new Date()
      });
    }

    // Criar achievement de upgrade
    await Achievement.create({
      userId: user.id,
      uid: user.uid,
      type: 'vip_level',
      name: `VIP ${nextVipLevel.name}`,
      description: `Alcançou o nível VIP ${nextVipLevel.name}`,
      targetValue: nextVipLevel.level,
      currentValue: nextVipLevel.level,
      rewardType: 'balance',
      rewardAmount: upgradeBonus,
      rewardCoin: 'ETC',
      isCompleted: true,
      completedAt: new Date(),
      rewardClaimed: true,
      claimedAt: new Date(),
      progress: 100,
      icon: nextVipLevel.icon,
      rarity: user.vipLevel >= 3 ? 'epic' : 'rare'
    });

    logger.info(`VIP upgrade: ${user.uid} - Level ${user.vipLevel} -> ${user.vipLevel + 1}`);

    res.json({
      code: 200,
      msg: `Parabéns! Você alcançou o nível ${nextVipLevel.name}`,
      data: {
        newLevel: user.vipLevel + 1,
        levelName: nextVipLevel.name,
        bonusAwarded: upgradeBonus,
        benefits: nextVipLevel.benefits
      }
    });

  } catch (error) {
    logger.error('VIP upgrade error:', error);
    next(error);
  }
};

const claimWeeklyBonus = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Verificar se já recebeu bônus semanal
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const recentWeeklyBonus = await Transaction.findOne({
      where: {
        userId: user.id,
        type: 'bonus',
        description: { [require('sequelize').Op.like]: '%Bônus semanal%' },
        completedAt: { [require('sequelize').Op.gte]: oneWeekAgo }
      }
    });

    if (recentWeeklyBonus) {
      return res.status(400).json({
        code: 400,
        msg: 'Bônus semanal já foi resgatado esta semana'
      });
    }

    // Buscar informações do nível VIP
    const vipLevel = await VIPLevel.findOne({
      where: { level: user.vipLevel }
    });

    const weeklyBonus = vipLevel?.weeklyBonus || 0;
    
    if (weeklyBonus === 0) {
      return res.status(400).json({
        code: 400,
        msg: 'Seu nível VIP não possui bônus semanal'
      });
    }

    // Conceder bônus semanal
    await User.increment(
      { balanceETC: weeklyBonus },
      { where: { id: user.id } }
    );

    await Transaction.create({
      userId: user.id,
      uid: user.uid,
      type: 'bonus',
      amount: weeklyBonus,
      coin: 'ETC',
      status: 'completed',
      description: `Bônus semanal VIP - Nível ${vipLevel.name}`,
      completedAt: new Date()
    });

    logger.info(`Weekly bonus claimed: ${user.uid} - ${weeklyBonus} ETC`);

    res.json({
      code: 200,
      msg: `Bônus semanal de ${weeklyBonus} ETC resgatado com sucesso`,
      data: {
        amount: weeklyBonus,
        coin: 'ETC',
        nextClaimDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    logger.error('Claim weekly bonus error:', error);
    next(error);
  }
};

const claimMonthlyBonus = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Verificar se já recebeu bônus mensal
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const recentMonthlyBonus = await Transaction.findOne({
      where: {
        userId: user.id,
        type: 'bonus',
        description: { [require('sequelize').Op.like]: '%Bônus mensal%' },
        completedAt: { [require('sequelize').Op.gte]: oneMonthAgo }
      }
    });

    if (recentMonthlyBonus) {
      return res.status(400).json({
        code: 400,
        msg: 'Bônus mensal já foi resgatado este mês'
      });
    }

    // Buscar informações do nível VIP
    const vipLevel = await VIPLevel.findOne({
      where: { level: user.vipLevel }
    });

    const monthlyBonus = vipLevel?.monthlyBonus || 0;
    
    if (monthlyBonus === 0) {
      return res.status(400).json({
        code: 400,
        msg: 'Seu nível VIP não possui bônus mensal'
      });
    }

    // Conceder bônus mensal
    await User.increment(
      { balanceETC: monthlyBonus },
      { where: { id: user.id } }
    );

    await Transaction.create({
      userId: user.id,
      uid: user.uid,
      type: 'bonus',
      amount: monthlyBonus,
      coin: 'ETC',
      status: 'completed',
      description: `Bônus mensal VIP - Nível ${vipLevel.name}`,
      completedAt: new Date()
    });

    logger.info(`Monthly bonus claimed: ${user.uid} - ${monthlyBonus} ETC`);

    res.json({
      code: 200,
      msg: `Bônus mensal de ${monthlyBonus} ETC resgatado com sucesso`,
      data: {
        amount: monthlyBonus,
        coin: 'ETC',
        nextClaimDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    logger.error('Claim monthly bonus error:', error);
    next(error);
  }
};

module.exports = {
  getPrivilege,
  getLevelInfo,
  getVipInfo,
  upgradeLevel,
  claimWeeklyBonus,
  claimMonthlyBonus
};