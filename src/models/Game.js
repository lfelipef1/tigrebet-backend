const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  betAmount: {
    type: Number,
    required: true,
  },
  prize: {
    type: Number,
    default: 0,
  },
  result: {
    type: String,
    enum: ['win', 'lose'],
    required: true,
  },
  playedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Game', gameSchema);
