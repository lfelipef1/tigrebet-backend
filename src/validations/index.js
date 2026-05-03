const { z } = require('zod');

// Auth validation schemas
const registerSchema = z.object({
  mobile: z.string().min(10, 'Mobile number must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Confirm password must be at least 6 characters'),
  refCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const loginSchema = z.object({
  mobile: z.string().min(10, 'Mobile number must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Game validation schemas
const wingoBetSchema = z.object({
  period: z.string().min(1, 'Period is required'),
  select: z.union([z.string(), z.number()]),
  amount: z.number().min(1, 'Amount must be greater than 0'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
});

const slotsBetSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
});

const minesweeperOrderSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  mineCount: z.number().min(1).max(25, 'Mine count must be between 1 and 25'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
});

const envelopeOrderSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  envelopeCount: z.number().min(1).max(100, 'Envelope count must be between 1 and 100'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
});

// Payment validation schemas
const rechargeSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
  method: z.string().min(1, 'Payment method is required'),
});

const withdrawSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
  address: z.string().min(1, 'Wallet address is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// VIP validation schemas
const upgradeLevelSchema = z.object({});

// New game validation schemas
const tigerBetSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
});

const crashBetSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
  autoCashout: z.number().min(1).optional(),
});

const plinkoBetSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
  risk: z.enum(['low', 'medium', 'high']).optional(),
});

const caixaBetSchema = z.object({
  amount: z.number().refine(v => [5, 10, 25, 50, 100, 250].includes(v), {
    message: 'Valor de aposta inválido. Use: 5, 10, 25, 50, 100 ou 250',
  }),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
});

const scratchBetSchema = z.object({
  amount: z.number().min(1, 'Valor mínimo R$ 1').max(500, 'Valor máximo R$ 500'),
  coin: z.enum(['ETC', 'ETH', 'BTC'], 'Invalid coin type'),
});

// Middleware factory for validation
const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          code: 400,
          msg: error.errors[0].message,
          errors: error.errors,
        });
      }
      return res.status(400).json({
        code: 400,
        msg: 'Validation error',
      });
    }
  };
};

module.exports = {
  registerSchema,
  loginSchema,
  wingoBetSchema,
  slotsBetSchema,
  minesweeperOrderSchema,
  envelopeOrderSchema,
  rechargeSchema,
  withdrawSchema,
  upgradeLevelSchema,
  tigerBetSchema,
  crashBetSchema,
  plinkoBetSchema,
  caixaBetSchema,
  scratchBetSchema,
  validate,
};
