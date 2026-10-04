const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  username:     { type: String, required: true, index: true },
  betAmount:    { type: Number, required: true },
  prediction:   { type: String, required: true },
  outcome:      { type: String, default: 'pending' },
  isWin:        { type: Boolean, default: false },
  netChange:    { type: Number, default: 0 },
  fee:          { type: Number, default: 0 },
  balanceAfter: { type: Number, default: 0 },
  createdAt:    { type: Date, default: Date.now, index: true },

  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  round:   { type: mongoose.Schema.Types.ObjectId, ref: 'Round', index: true },
  stake:   { type: Number, default: 0 },
  payout:  { type: Number, default: 0 },
  settled: { type: Boolean, default: false }
});

module.exports = mongoose.model('Bet', betSchema);