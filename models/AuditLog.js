const mongoose = require('mongoose');

module.exports = mongoose.model('AuditLog', new mongoose.Schema({
  admin:        String,
  source:       { type: String, enum: ['admin', 'player', 'system'], default: 'admin', index: true },
  action:       String,
  target:       String,
  amount:       Number,
  reason:       String,
  balanceAfter: Number,
  createdAt:    { type: Date, default: Date.now, index: true }
}));