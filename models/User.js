const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true },
  balance:     { type: Number, default: 1000 },
  wins:        { type: Number, default: 0 },
  losses:      { type: Number, default: 0 },
  isAdmin:     { type: Boolean, default: false },
  isBanned:    { type: Boolean, default: false },
  lastBonusAt: { type: Date, default: null },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);