const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const generateUID = () => crypto.randomBytes(16).toString('hex');
const generateRefCode = () => crypto.randomBytes(8).toString('hex').toUpperCase();

const generateAccessToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return jwt.sign(
    { uid: user.id, id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const verifyToken = (token) => {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

module.exports = {
  generateUID,
  generateRefCode,
  generateAccessToken,
  verifyToken,
};
