const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

// Writes to the activity log safely without breaking actions
async function writeLog(entry) {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.error('Log error:', err.message);
  }
}

// Router-level strict guard: Every route below requires an active admin session
router.use(async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const user = await User.findById(req.session.userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Admins only' });
    req.adminUser = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const utcDay = (offset = 0) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const dayKey = (d) => d.toISOString().slice(0, 10);

// Admin Dashboard Global Statistics
router.get('/stats', async (req, res) => {
  try {
    const today = utcDay();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [all] = await Bet.aggregate([{ $group: {
      _id: null, bets: { $sum: 1 }, wagered: { $sum: '$betAmount' },
      paidOut: { $sum: '$payout' }, wins: { $sum: { $cond: ['$isWin', 1, 0] } }
    } }]);
    const [td] = await Bet.aggregate([
      { $match: { createdAt: { $gte: today } } },
      { $group: { _id: null, bets: { $sum: 1 }, wagered: { $sum: '$betAmount' }, paidOut: { $sum: '$payout' } } }
    ]);
    const [bal] = await User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
    const [users, newToday, activeList] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      Bet.distinct('username', { createdAt: { $gte: dayAgo } })
    ]);

    const totalBets = all ? all.bets : 0;
    const wagered = all ? all.wagered : 0;
    const paidOut = all ? all.paidOut : 0;
    res.json({
      users,
      newToday,
      active: activeList.length,
      totalBets,
      betsToday: td ? td.bets : 0,
      wagered,
      paidOut,
      houseProfit: +(wagered - paidOut).toFixed(2),
      todayProfit: td ? +(td.wagered - td.paidOut).toFixed(2) : 0,
      winRate: totalBets ? +((all.wins / totalBets) * 100).toFixed(1) : 0,
      balances: bal ? bal.total : 0
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Admin Chart Metrics (Last 7 Days)
router.get('/series', async (req, res) => {
  try {
    const from = utcDay(-6);
    const fmt = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };

    const [betRows, userRows] = await Promise.all([
      Bet.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: fmt, bets: { $sum: 1 }, wagered: { $sum: '$betAmount' }, paidOut: { $sum: '$payout' } } }
      ]),
      User.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: fmt, n: { $sum: 1 } } }
      ])
    ]);

    const bm = Object.fromEntries(betRows.map(r => [r._id, r]));
    const um = Object.fromEntries(userRows.map(r => [r._id, r.n]));

    const labels = [], newPlayers = [], bets = [], profit = [];
    for (let i = 0; i < 7; i++) {
      const key = dayKey(utcDay(-6 + i));
      const b = bm[key];
      labels.push(key.slice(5));
      newPlayers.push(um[key] || 0);
      bets.push(b ? b.bets : 0);
      profit.push(b ? +(b.wagered - b.paidOut).toFixed(2) : 0);
    }
    res.json({ labels, newPlayers, bets, profit });
  } catch (err) {
    console.error('Series error:', err);
    res.status(500).json({ error: 'Failed to load charts' });
  }
});

// Players list with search
router.get('/users', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = q ? { username: { $regex: q, $options: 'i' } } : {};
    const users = await User.find(filter, '-password').sort({ balance: -1 }).limit(200);
    res.json(users);
  } catch (err) {
    console.error('Users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Top-up or deduct user balance with audit tracking
router.post('/adjust-balance', async (req, res) => {
  try {
    const { userId, amount, action, reason } = req.body;
    const n = Number(amount);
    const note = String(reason || '').trim().slice(0, 100);

    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user' });
    if (!Number.isFinite(n) || n <= 0 || n > 1000000) return res.status(400).json({ error: 'Invalid amount' });
    if (action !== 'add' && action !== 'sub') return res.status(400).json({ error: 'Invalid action' });
    if (!note) return res.status(400).json({ error: 'Please add a reason' });

    const filter = action === 'sub' ? { _id: userId, balance: { $gte: n } } : { _id: userId };
    const user = await User.findOneAndUpdate(
      filter,
      { $inc: { balance: action === 'add' ? n : -n } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'User not found or balance too low' });

    await writeLog({
      admin: req.adminUser.username,
      source: 'admin',
      action: action === 'add' ? 'topup' : 'deduct',
      target: user.username,
      amount: n,
      reason: note,
      balanceAfter: user.balance
    });

    res.json({ success: true, newBalance: user.balance });
  } catch (err) {
    console.error('Adjust error:', err);
    res.status(500).json({ error: 'Failed to adjust balance: ' + err.message });
  }
});

// Ban or unban user control
router.post('/ban', async (req, res) => {
  try {
    const { userId, banned } = req.body;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user' });
    if (String(userId) === String(req.adminUser._id)) {
      return res.status(400).json({ error: "You can't ban yourself" });
    }
    const user = await User.findOneAndUpdate(
      { _id: userId, isAdmin: { $ne: true } },
      { isBanned: !!banned },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: 'User not found or is an admin' });

    await writeLog({
      admin: req.adminUser.username,
      source: 'admin',
      action: banned ? 'ban' : 'unban',
      target: user.username,
      reason: '',
      balanceAfter: user.balance
    });

    res.json({ success: true, isBanned: user.isBanned });
  } catch (err) {
    console.error('Ban error:', err);
    res.status(500).json({ error: 'Failed to update user: ' + err.message });
  }
});

// View all recent bets globally
router.get('/bets', async (req, res) => {
  try {
    const bets = await Bet.find({}).sort({ createdAt: -1 }).limit(50);
    res.json(bets);
  } catch (err) {
    console.error('Bets error:', err);
    res.status(500).json({ error: 'Failed to fetch bets' });
  }
});

// View system audit logs
router.get('/logs', async (req, res) => {
  try {
    const s = req.query.source;
    const filter = ['admin', 'player', 'system'].includes(s) ? { source: s } : {};
    const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    console.error('Logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;