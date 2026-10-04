const express = require('express');
const User = require('../models/User');

const router = express.Router();
const BONUS = 1000;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

router.post('/', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Please log in first' });
    }

    const cutoff = new Date(Date.now() - COOLDOWN_MS);
    const user = await User.findOneAndUpdate(
      {
        _id: req.session.userId,
        isBanned: { $ne: true },
        $or: [{ lastBonusAt: null }, { lastBonusAt: { $lt: cutoff } }]
      },
      { $inc: { balance: BONUS }, $set: { lastBonusAt: new Date() } },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({ error: 'Bonus already claimed. Come back in 24 hours.' });
    }
    res.json({ success: true, newBalance: user.balance });
  } catch (err) {
    console.error('Bonus error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;