const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

// ---- SIGNUP ----
router.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (username.length < 3) return res.status(400).json({ error: 'Username min 3 characters' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(400).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const isAdmin = username.toLowerCase() === (process.env.ADMIN_USERNAME || 'admin').toLowerCase();

    const user = await User.create({
      username: username.toLowerCase(),
      password: hash,
      isAdmin
    });

    // Save session data
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    // Force session to save to MongoDB before responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error during signup:', err);
        return res.status(500).json({ error: 'Server error during signup' });
      }
      res.json({ success: true, username: user.username, isAdmin: user.isAdmin });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- LOGIN ----
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    if (user.isBanned) return res.status(403).json({ error: 'Your account is banned' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid username or password' });

    // Save session data
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.isAdmin = user.isAdmin;

    // Force session to save to MongoDB before responding
    req.session.save((err) => {
      if (err) {
        console.error('Session save error during login:', err);
        return res.status(500).json({ error: 'Server error during login' });
      }
      res.json({ success: true, username: user.username, isAdmin: user.isAdmin });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- LOGOUT ----
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ---- WHO AM I ----
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  try {
    const user = await User.findById(req.session.userId).select('-password');
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;