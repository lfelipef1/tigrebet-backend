const { DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database-postgres');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('deposit', 'withdrawal', 'bet', 'win', 'bonus', 'refund', 'cashback', 'commission', 'penalty'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'),
    defaultValue: 'pending'
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'BRL'
  },
  paymentMethod: {
    type: DataTypes.ENUM('pix', 'credit_card', 'bitcoin', 'ethereum', 'bank_transfer', 'wallet'),
    allowNull: true
  },
  paymentDetails: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  externalId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  gateway: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  gatewayTransactionId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  failureReason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  riskScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  isFlagged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'transactions',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['paymentMethod']
    },
    {
      fields: ['createdAt']
    },
    {
      fields: ['externalId']
    },
    {
      fields: ['gatewayTransactionId']
    },
    {
      fields: ['isFlagged']
    }
  ]
});

// Instance methods
Transaction.prototype.markAsCompleted = async function() {
  this.status = 'completed';
  this.processedAt = new Date();
  return this.save();
};

Transaction.prototype.markAsFailed = async function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  this.processedAt = new Date();
  return this.save();
};

Transaction.prototype.flagForReview = async function(reason) {
  this.isFlagged = true;
  this.notes = reason;
  return this.save();
};

module.exports = Transaction;
