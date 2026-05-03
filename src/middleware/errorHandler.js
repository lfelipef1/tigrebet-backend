const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack || err.message);

  if (err.name === 'ZodError') {
    return res.status(400).json({
      code: 400,
      msg: err.errors?.[0]?.message || 'Validation error',
      errors: err.errors,
    });
  }

  if (err.name === 'ValidationError' || err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      code: 400,
      msg: err.message,
      errors: err.errors,
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      code: 409,
      msg: 'Record already exists',
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      code: 400,
      msg: 'Invalid reference',
    });
  }

  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      code: 401,
      msg: 'Unauthorized',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      code: 401,
      msg: 'Token expired, please login again',
    });
  }

  // Don't leak internal errors in production
  const status = err.status || err.statusCode || 500;
  const msg = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(status).json({ code: status, msg });
};

module.exports = errorHandler;
