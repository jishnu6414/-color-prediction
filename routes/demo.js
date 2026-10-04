const express = require('express');
const User = require('../models/User');
const Bet = require('../models/Bet');

const router = express.Router();

// Must be logged in
router.use(async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Please log in first' });
    const me = await User.findById(req.session.userId).select('username balance wins losses');
    if (!me) return res.status(401).json({ error: 'Please log in first' });
    req.me = me;
    next();
  } catch (err) {
    console.error('Demo auth error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error('Demo error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  });

// Balance, personal stats and demo totals
router.get('/status', wrap(async (req, res) => {
  const [players, coins, betCount] = await Promise.all([
    User.countDocuments(),
    User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
    Bet.countDocuments({ username: req.me.username })
  ]);
  const wins = req.me.wins || 0;
  const rounds = wins + (req.me.losses || 0);
  res.json({
    balance: req.me.balance,
    players,
    coins: coins[0] ? coins[0].total : 0,
    wins,
    rounds,
    winRate: rounds ? +((wins / rounds) * 100).toFixed(1) : 0,
    round: betCount + 1
  });
}));

// Last 12 results for this player
router.get('/recent', wrap(async (req, res) => {
  const bets = await Bet.find({ username: req.me.username })
    .sort({ createdAt: -1 }).limit(12)
    .select('prediction outcome isWin betAmount netChange createdAt');
  res.json(bets);
}));

module.exports = router;