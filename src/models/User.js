const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { sequelize } = require('../config/database-postgres');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: () => uuidv4(),
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [3, 50]
    }
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  mobile: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  firstName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  lastName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  dateOfBirth: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  avatar: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { min: 0 }
  },
  bonusBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { min: 0 }
  },
  balanceETC: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0,
    validate: { min: 0 }
  },
  balanceETH: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0,
    validate: { min: 0 }
  },
  balanceBTC: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0,
    validate: { min: 0 }
  },
  totalDeposited: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { min: 0 }
  },
  totalWithdrawn: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { min: 0 }
  },
  totalWagered: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { min: 0 }
  },
  totalWon: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { min: 0 }
  },
  vipPoints: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: { min: 0 }
  },
  vipLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: { min: 1, max: 5 }
  },
  referralCode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    defaultValue: () => crypto.randomBytes(8).toString('hex').toUpperCase()
  },
  referredBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  referralCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'suspended', 'banned'),
    defaultValue: 'active'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isEmailVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isPhoneVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  kycStatus: {
    type: DataTypes.ENUM('pending', 'submitted', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  kycDocuments: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastLoginIp: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  loginCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  selfExclusionUntil: {
    type: DataTypes.DATE,
    allowNull: true
  },
  depositLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 10000.00,
    validate: { min: 0 }
  },
  lossLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 5000.00,
    validate: { min: 0 }
  },
  wagerLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 50000.00,
    validate: { min: 0 }
  },
  sessionLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 480,
    validate: { min: 0 }
  },
  token: {
    type: DataTypes.STRING(512),
    allowNull: true
  },
  preferences: {
    type: DataTypes.JSON,
    defaultValue: {
      language: 'pt-BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      notifications: {
        email: true,
        sms: false,
        push: true,
        promotions: true
      },
      gameSettings: {
        soundEnabled: true,
        animationsEnabled: true,
        autoPlay: false,
        realityCheck: true
      }
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['email'] },
    { unique: true, fields: ['username'] },
    { unique: true, fields: ['referralCode'] },
    { unique: true, fields: ['mobile'] },
    { fields: ['status'] },
    { fields: ['vipLevel'] },
    { fields: ['kycStatus'] },
    { fields: ['referredBy'] },
    { fields: ['createdAt'] }
  ]
});

// Hooks - only hash if password is plain text (not already hashed)
User.beforeCreate(async (user) => {
  if (user.password && !user.password.startsWith('$2')) {
    user.password = await bcrypt.hash(user.password, 12);
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed('password') && !user.password.startsWith('$2')) {
    user.password = await bcrypt.hash(user.password, 12);
  }
});

// Virtual getters for backward compatibility
User.prototype.getUid = function() { return this.id; };
User.prototype.getRefCode = function() { return this.referralCode; };
User.prototype.getIsActive = function() {
  return this.status === 'active' || this.status === 'inactive';
};
User.prototype.getIsBanned = function() { return this.status === 'banned'; };

// Convenience getters via JS getter syntax
Object.defineProperties(User.prototype, {
  uid: { get() { return this.id; } },
  refCode: { get() { return this.referralCode; } },
  isActive: { get() { return this.status !== 'banned' && this.status !== 'suspended'; } },
  isBanned: { get() { return this.status === 'banned'; } },
  lastLogin: { get() { return this.lastLoginAt; } }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password;
  delete values.token;
  return values;
};

User.prototype.updateBalance = async function(amount, type = 'balance') {
  if (type === 'balance') {
    this.balance = parseFloat(this.balance) + parseFloat(amount);
  } else if (type === 'bonus') {
    this.bonusBalance = parseFloat(this.bonusBalance) + parseFloat(amount);
  }
  return this.save();
};

User.prototype.getFullName = function() {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim() || this.username;
};

User.prototype.isSelfExcluded = function() {
  return this.selfExclusionUntil && new Date() < new Date(this.selfExclusionUntil);
};

User.prototype.canWithdraw = function(amount) {
  const available = parseFloat(this.balance) + parseFloat(this.bonusBalance);
  return available >= parseFloat(amount) && !this.isSelfExcluded();
};

User.prototype.canDeposit = function(amount) {
  const newTotal = parseFloat(this.totalDeposited) + parseFloat(amount);
  return newTotal <= parseFloat(this.depositLimit) && !this.isSelfExcluded();
};

module.exports = User;
