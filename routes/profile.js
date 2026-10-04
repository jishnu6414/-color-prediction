const express = require('express');
const User = require('../models/User');
const Bet = require('../models/Bet');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in' });
  next();
}

// GET: User Profile & Statistics
router.get('/me', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bets = await Bet.find({ username: user.username });

    const totalBets = bets.length;
    const wins = bets.filter(b => b.isWin).length;
    const losses = totalBets - wins;
    const winRate = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(1) : '0.0';

    let totalWon = 0, totalLost = 0;
    let biggestWin = 0, biggestLoss = 0;

    bets.forEach(b => {
      if (b.netChange > 0) {
        totalWon += b.netChange;
        if (b.netChange > biggestWin) biggestWin = b.netChange;
      } else {
        totalLost += Math.abs(b.netChange);
        if (Math.abs(b.netChange) > biggestLoss) biggestLoss = Math.abs(b.netChange);
      }
    });

    res.json({
      username: user.username,
      balance: user.balance,
      memberSince: user.createdAt,
      totalBets,
      wins,
      losses,
      winRate: parseFloat(winRate),
      totalWon,
      totalLost,
      biggestWin,
      biggestLoss,
      netProfit: totalWon - totalLost
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST: Claim Daily Bonus
router.post('/claim-bonus', requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Add $1000 daily bonus to balance
    user.balance += 1000;
    await user.save();

    res.json({ success: true, newBalance: user.balance, message: 'Successfully claimed $1000 daily bonus!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST: Deposit Money via UPI
router.post('/deposit-upi', requireLogin, async (req, res) => {
  try {
    const { amount, upiId } = req.body;
    const depositAmount = parseFloat(amount);

    if (!depositAmount || depositAmount <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount' });
    }
    if (!upiId || typeof upiId !== 'string' || upiId.trim() === '') {
      return res.status(400).json({ error: 'Valid UPI ID or Reference is required' });
    }

    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Credit the user account balance
    user.balance += depositAmount;
    await user.save();

    res.json({
      success: true,
      newBalance: user.balance,
      message: `Successfully deposited $${depositAmount.toFixed(2)} via UPI (${upiId.trim()})`
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;