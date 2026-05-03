const { User, DailyMission, Achievement, Transaction, Bet } = require('../models');
const logger = require('../config/logger');

// Template de missões diárias
const MISSION_TEMPLATES = [
  {
    type: 'bet_amount',
    name: 'Apostador Diário',
    description: 'Aposte um total de 100 ETC hoje',
    targetValue: 100,
    rewardType: 'balance',
    rewardAmount: 5,
    rewardCoin: 'ETC',
    icon: '🎯',
    rarity: 'common'
  },
  {
    type: 'bet_count',
    name: 'Jogador Frequente',
    description: 'Faça 20 apostas em qualquer jogo',
    targetValue: 20,
    rewardType: 'balance',
    rewardAmount: 10,
    rewardCoin: 'ETC',
    icon: '🎰',
    rarity: 'common'
  },
  {
    type: 'win_amount',
    name: 'Vencedor do Dia',
    description: 'Ganhe um total de 50 ETC hoje',
    targetValue: 50,
    rewardType: 'balance',
    rewardAmount: 15,
    rewardCoin: 'ETC',
    icon: '🏆',
    rarity: 'rare'
  },
  {
    type: 'tiger_wins',
    name: 'Mestre do Tigre',
    description: 'Ganhe 5 vezes no Fortune Tiger',
    targetValue: 5,
    rewardType: 'balance',
    rewardAmount: 20,
    rewardCoin: 'ETC',
    icon: '🐯',
    rarity: 'rare'
  },
  {
    type: 'crash_multiplier',
    name: 'Piloto Expert',
    description: 'Alcance multiplicador x5 ou mais no Crash',
    targetValue: 5,
    rewardType: 'balance',
    rewardAmount: 25,
    rewardCoin: 'ETC',
    icon: '🚀',
    rarity: 'epic'
  },
  {
    type: 'login_streak',
    name: 'Leal',
    description: 'Faça login por 3 dias seguidos',
    targetValue: 3,
    rewardType: 'balance',
    rewardAmount: 30,
    rewardCoin: 'ETC',
    icon: '🔥',
    rarity: 'epic'
  }
];

const generateDailyMissions = async (userId) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Verificar se já existem missões para hoje
    const existingMissions = await DailyMission.count({
      where: {
        userId,
        createdAt: { [require('sequelize').Op.gte]: today }
      }
    });

    if (existingMissions > 0) {
      return; // Já tem missões hoje
    }

    // Selecionar 3 missões aleatórias
    const shuffled = [...MISSION_TEMPLATES].sort(() => Math.random() - 0.5);
    const selectedMissions = shuffled.slice(0, 3);

    // Criar missões diárias
    for (const template of selectedMissions) {
      await DailyMission.create({
        userId,
        uid: (await User.findByPk(userId)).uid,
        type: template.type,
        name: template.name,
        description: template.description,
        targetValue: template.targetValue,
        currentValue: 0,
        rewardType: template.rewardType,
        rewardAmount: template.rewardAmount,
        rewardCoin: template.rewardCoin,
        icon: template.icon,
        rarity: template.rarity,
        isCompleted: false,
        progress: 0
      });
    }

    logger.info(`Daily missions generated for user: ${userId}`);

  } catch (error) {
    logger.error('Generate daily missions error:', error);
    throw error;
  }
};

const getDailyMissions = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Gerar missões se não existirem
    await generateDailyMissions(user.id);

    // Buscar missões do usuário
    const missions = await DailyMission.findAll({
      where: { userId: user.id },
      order: [['createdAt', 'DESC']]
    });

    // Calcular progresso das missões
    const updatedMissions = await Promise.all(
      missions.map(async (mission) => {
        let currentValue = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        switch (mission.type) {
          case 'bet_amount':
            currentValue = await Bet.sum('amount', {
              where: {
                userId: user.id,
                createdAt: { [require('sequelize').Op.gte]: today }
              }
            }) || 0;
            break;

          case 'bet_count':
            currentValue = await Bet.count({
              where: {
                userId: user.id,
                createdAt: { [require('sequelize').Op.gte]: today }
              }
            });
            break;

          case 'win_amount':
            currentValue = await Bet.sum('goal', {
              where: {
                userId: user.id,
                status: 'won',
                createdAt: { [require('sequelize').Op.gte]: today }
              }
            }) || 0;
            break;

          case 'tiger_wins':
            currentValue = await Bet.count({
              where: {
                userId: user.id,
                gameType: 'fortune_tiger',
                status: 'won',
                createdAt: { [require('sequelize').Op.gte]: today }
              }
            });
            break;

          case 'crash_multiplier':
            const crashBets = await Bet.findAll({
              where: {
                userId: user.id,
                gameType: 'crash',
                multiplier: { [require('sequelize').Op.gte]: mission.targetValue },
                createdAt: { [require('sequelize').Op.gte]: today }
              }
            });
            currentValue = crashBets.length;
            break;

          case 'login_streak':
            // Calcular streak de login (simplificado)
            const lastLogin = user.lastLogin;
            if (lastLogin) {
              const daysDiff = Math.floor((today - lastLogin) / (1000 * 60 * 60 * 24));
              currentValue = daysDiff >= 0 && daysDiff <= 1 ? 1 : 0;
            }
            break;
        }

        const progress = Math.min((currentValue / mission.targetValue) * 100, 100);
        const isCompleted = currentValue >= mission.targetValue;

        // Atualizar missão se necessário
        if (mission.currentValue !== currentValue || mission.isCompleted !== isCompleted) {
          await mission.update({
            currentValue,
            progress,
            isCompleted
          });
        }

        return {
          ...mission.toJSON(),
          currentValue,
          progress,
          isCompleted
        };
      })
    );

    res.json({
      code: 200,
      data: {
        missions: updatedMissions.filter(m => {
          const missionDate = new Date(m.createdAt);
          missionDate.setHours(0, 0, 0, 0);
          return missionDate.getTime() === today.getTime();
        }),
        completedToday: updatedMissions.filter(m => m.isCompleted).length
      }
    });

  } catch (error) {
    logger.error('Get daily missions error:', error);
    next(error);
  }
};

const claimMissionReward = async (req, res, next) => {
  try {
    const { missionId } = req.params;
    const user = req.user;

    const mission = await DailyMission.findOne({
      where: { id: missionId, userId: user.id }
    });

    if (!mission) {
      return res.status(404).json({
        code: 404,
        msg: 'Missão não encontrada'
      });
    }

    if (!mission.isCompleted) {
      return res.status(400).json({
        code: 400,
        msg: 'Missão não completada'
      });
    }

    if (mission.rewardClaimed) {
      return res.status(400).json({
        code: 400,
        msg: 'Recompensa já resgatada'
      });
    }

    // Conceder recompensa
    if (mission.rewardType === 'balance') {
      const balanceField = mission.rewardCoin === 'ETC' ? 'balanceETC' : 
                         mission.rewardCoin === 'ETH' ? 'balanceETH' : 'balanceBTC';
      
      await User.increment(
        { [balanceField]: mission.rewardAmount },
        { where: { id: user.id } }
      );
    }

    // Marcar como resgatado
    await mission.update({
      rewardClaimed: true,
      claimedAt: new Date()
    });

    // Criar transação de bônus
    await Transaction.create({
      userId: user.id,
      uid: user.uid,
      type: 'bonus',
      amount: mission.rewardAmount,
      coin: mission.rewardCoin,
      status: 'completed',
      description: `Recompensa da missão: ${mission.name}`,
      completedAt: new Date()
    });

    // Criar achievement
    await Achievement.create({
      userId: user.id,
      uid: user.uid,
      type: 'daily_mission',
      name: mission.name,
      description: mission.description,
      targetValue: mission.targetValue,
      currentValue: mission.currentValue,
      rewardType: mission.rewardType,
      rewardAmount: mission.rewardAmount,
      rewardCoin: mission.rewardCoin,
      isCompleted: true,
      completedAt: new Date(),
      rewardClaimed: true,
      claimedAt: new Date(),
      progress: 100,
      icon: mission.icon,
      rarity: mission.rarity
    });

    logger.info(`Mission reward claimed: ${user.uid} - ${mission.name} - ${mission.rewardAmount} ${mission.rewardCoin}`);

    res.json({
      code: 200,
      msg: `Recompensa de ${mission.rewardAmount} ${mission.rewardCoin} resgatada com sucesso`,
      data: {
        missionId: mission.id,
        rewardAmount: mission.rewardAmount,
        rewardCoin: mission.rewardCoin
      }
    });

  } catch (error) {
    logger.error('Claim mission reward error:', error);
    next(error);
  }
};

const getMissionHistory = async (req, res, next) => {
  try {
    const { page = 1, status } = req.query;
    const user = req.user;
    const limit = 20;
    const offset = (page - 1) * limit;

    const whereClause = { userId: user.id };
    if (status === 'completed') {
      whereClause.isCompleted = true;
    } else if (status === 'pending') {
      whereClause.isCompleted = false;
    }

    const missions = await DailyMission.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const total = await DailyMission.count({ where: whereClause });

    res.json({
      code: 200,
      data: {
        missions: missions.map(m => ({
          id: m.id,
          type: m.type,
          name: m.name,
          description: m.description,
          targetValue: m.targetValue,
          currentValue: m.currentValue,
          progress: m.progress,
          isCompleted: m.isCompleted,
          rewardClaimed: m.rewardClaimed,
          rewardType: m.rewardType,
          rewardAmount: m.rewardAmount,
          rewardCoin: m.rewardCoin,
          icon: m.icon,
          rarity: m.rarity,
          createdAt: m.createdAt,
          completedAt: m.completedAt,
          claimedAt: m.claimedAt
        })),
        pagination: {
          page: parseInt(page),
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Get mission history error:', error);
    next(error);
  }
};

// Auto-generate missions for all users (cron job)
const generateAllUserMissions = async () => {
  try {
    const users = await User.findAll({
      where: { isActive: true }
    });

    for (const user of users) {
      await generateDailyMissions(user.id);
    }

    logger.info(`Daily missions generated for ${users.length} users`);

  } catch (error) {
    logger.error('Generate all user missions error:', error);
  }
};

module.exports = {
  getDailyMissions,
  claimMissionReward,
  getMissionHistory,
  generateDailyMissions,
  generateAllUserMissions
};
