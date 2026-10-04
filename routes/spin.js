const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const Bet = require('../models/Bet');

const router = express.Router();

const COLORS = ['red', 'blue', 'green', 'yellow'];
const WIN_CHANCE = 0.40;   // 40% win, 60% lose
const MIN_BET = 10;
const MAX_BET = 10000;

router.post('/play', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Please log in first' });
    }

    const { color, amount } = req.body;
    const bet = Number(amount);

    if (!COLORS.includes(color)) return res.status(400).json({ error: 'Invalid color' });
    if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
      return res.status(400).json({ error: `Bet must be between ${MIN_BET} and ${MAX_BET} coins` });
    }

    // 40% chance the player wins
    const playerWins = crypto.randomInt(0, 100) < WIN_CHANCE * 100;

    let resultColor = color;
    if (!playerWins) {
      const others = COLORS.filter(c => c !== color);
      resultColor = others[crypto.randomInt(0, others.length)];
    }

    const change = playerWins ? bet : -bet;   // win pays 2x (net +bet)

    // Atomic update: ensures balance is sufficient and user is not banned
    const user = await User.findOneAndUpdate(
      { _id: req.session.userId, balance: { $gte: bet }, isBanned: {$ne: true } },
      { $inc: { balance: change, ...(playerWins ? { wins: 1 } : { losses: 1 }) } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'Insufficient balance or account restricted' });

    await Bet.create({
      user: user._id,
      username: user.username,
      betAmount: bet,
      prediction: color,
      outcome: resultColor,
      isWin: playerWins,
      netChange: change,
      fee: 0,
      balanceAfter: user.balance,
      stake: bet,
      payout: playerWins ? bet * 2 : 0,
      settled: true
    });

    res.json({ resultColor, won: playerWins, balance: user.balance, netChange: change });
  } catch (err) {
    console.error('Spin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;