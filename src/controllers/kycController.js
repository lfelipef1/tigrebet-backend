const { User, Transaction } = require('../models');
const logger = require('../config/logger');

const submitKYC = async (req, res, next) => {
  try {
    const { 
      fullName, 
      documentType, 
      documentNumber, 
      birthDate, 
      address, 
      city, 
      state, 
      zipCode,
      idDocumentFront,
      idDocumentBack,
      proofOfAddress
    } = req.body;
    
    const user = req.user;

    if (user.kycStatus === 'approved') {
      return res.status(400).json({
        code: 400,
        msg: 'KYC já aprovado'
      });
    }

    if (user.kycStatus === 'pending') {
      return res.status(400).json({
        code: 400,
        msg: 'KYC já em análise'
      });
    }

    // Validar dados obrigatórios
    const requiredFields = [fullName, documentType, documentNumber, birthDate, address, city, state, zipCode];
    if (requiredFields.some(field => !field || field.trim() === '')) {
      return res.status(400).json({
        code: 400,
        msg: 'Todos os campos são obrigatórios'
      });
    }

    // Validar formato do documento
    const documentFormats = {
      'CPF': /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
      'RG': /^\d{2}\.\d{3}\.\d{4}-\d{1}$/,
      'CNH': /^\d{11}$/,
      'PASSPORT': /^[A-Z0-9]{6,9}$/
    };

    if (!documentFormats[documentType] || !documentFormats[documentType].test(documentNumber)) {
      return res.status(400).json({
        code: 400,
        msg: 'Formato do documento inválido'
      });
    }

    // Validar data de nascimento (mínimo 18 anos)
    const birthDateObj = new Date(birthDate);
    const today = new Date();
    const age = Math.floor((today - birthDateObj) / (365.25 * 24 * 60 * 60 * 1000));
    
    if (age < 18) {
      return res.status(400).json({
        code: 400,
        msg: 'Usuário deve ter pelo menos 18 anos'
      });
    }

    // Salvar documentos e dados KYC
    const kycDocuments = {
      fullName: fullName.trim(),
      documentType,
      documentNumber: documentNumber.trim(),
      birthDate,
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      zipCode: zipCode.trim(),
      idDocumentFront,
      idDocumentBack,
      proofOfAddress,
      submittedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    };

    // Atualizar status KYC do usuário
    await user.update({
      kycStatus: 'pending',
      kycDocuments
    });

    logger.info(`KYC submitted: ${user.uid} - ${fullName}`);

    res.json({
      code: 200,
      msg: 'KYC enviado para análise',
      data: {
        status: 'pending',
        estimatedReviewTime: '24-48 horas'
      }
    });

  } catch (error) {
    logger.error('Submit KYC error:', error);
    next(error);
  }
};

const getKYCStatus = async (req, res, next) => {
  try {
    const user = req.user;

    const responseData = {
      status: user.kycStatus,
      submittedAt: user.kycDocuments?.submittedAt,
      reviewedAt: user.kycDocuments?.reviewedAt,
      rejectionReason: user.kycDocuments?.rejectionReason
    };

    if (user.kycStatus === 'approved') {
      responseData.approvedAt = user.kycDocuments?.approvedAt;
    }

    res.json({
      code: 200,
      data: responseData
    });

  } catch (error) {
    logger.error('Get KYC status error:', error);
    next(error);
  }
};

// Mock admin endpoint para aprovar/rejeitar KYC
const reviewKYC = async (req, res, next) => {
  try {
    const { userId, status, reason } = req.body;
    
    // Em produção, verificar se é admin
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        code: 400,
        msg: 'Status inválido'
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        code: 404,
        msg: 'Usuário não encontrado'
      });
    }

    const kycDocuments = user.kycDocuments || {};
    kycDocuments.reviewedAt = new Date();
    kycDocuments.reviewedBy = 'admin'; // Em produção, usar ID do admin
    kycDocuments.reviewedIpAddress = req.ip;

    if (status === 'approved') {
      kycDocuments.approvedAt = new Date();
      
      // Bônus por aprovação KYC
      await User.increment(
        { balanceETC: 100, balanceETH: 100, balanceBTC: 0.001 },
        { where: { id: userId } }
      );

      await Transaction.create({
        userId: user.id,
        uid: user.uid,
        type: 'bonus',
        amount: 100,
        coin: 'ETC',
        status: 'completed',
        description: 'Bônus por aprovação KYC',
        completedAt: new Date()
      });

      logger.info(`KYC approved: ${user.uid}`);
    } else {
      kycDocuments.rejectionReason = reason || 'Documentação inválida';
      logger.info(`KYC rejected: ${user.uid} - ${reason}`);
    }

    await user.update({
      kycStatus: status,
      kycDocuments
    });

    res.json({
      code: 200,
      msg: `KYC ${status === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso`
    });

  } catch (error) {
    logger.error('Review KYC error:', error);
    next(error);
  }
};

module.exports = {
  submitKYC,
  getKYCStatus,
  reviewKYC
};
