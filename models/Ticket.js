const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: String, enum: ['player', 'admin'] },
  name: String,
  text: String,
  at:   { type: Date, default: Date.now }
}, { _id: false });

module.exports = mongoose.model('Ticket', new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  username:     String,
  subject:      String,
  status:       { type: String, enum: ['open', 'closed'], default: 'open', index: true },
  messages:     [messageSchema],
  unreadAdmin:  { type: Boolean, default: true },
  unreadPlayer: { type: Boolean, default: false },
  updatedAt:    { type: Date, default: Date.now, index: true }
}));