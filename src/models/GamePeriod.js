const mongoose = require('mongoose');

const gamePeriodSchema = new mongoose.Schema({
  coin: { type: String, required: true, index: true },
  period: { type: String, required: true, unique: true },
  result: { type: Number, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'closed' },
  createdAt: { type: Date, default: Date.now, index: true },
});

gamePeriodSchema.index({ coin: 1, createdAt: -1 });

module.exports = mongoose.model('GamePeriod', gamePeriodSchema);
