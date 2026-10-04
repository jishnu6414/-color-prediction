const express = require('express');
const Bet = require('../models/Bet');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in' });
  next();
}

// Handles GET /api/history
router.get('/', requireLogin, async (req, res) => {
  try {
    const bets = await Bet.find({ user: req.session.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(bets);
  } catch (err) {
    console.error('History fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;