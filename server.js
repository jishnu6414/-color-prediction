const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
require('dotenv').config();

const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/color-prediction';

// ===============================
// DATABASE CONNECTION
// ===============================
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ===============================
// CORE MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGO_URI }),
    cookie: { maxAge: 1000 * 60 * 60 * 24, httpOnly: true, secure: false }
  })
);

// ===============================
// ROLE-BASED ACCESS CONTROL (RBAC)
// ===============================

// Standard User Authentication Check
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login.html');
  }
  next();
}

// Strict Admin-Only Security Check (Note the 'async' keyword here)
async function requireAdminPage(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      console.log("❌ No session or userId found!");
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/login.html');
    }
    
    const user = await User.findById(req.session.userId);
    console.log("🔍 Checking user:", user ? user.username : "Not found", "| isAdmin:", user ? user.isAdmin : "N/A");

    if (!user || !user.isAdmin) {
      console.log("⚠️ Access denied: User is not an admin.");
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(403).json({ error: 'Admins only' });
      }
      return res.status(403).send('<h1>403 Forbidden</h1><p>Access denied. Administrators only.</p>');
    }
    
    req.adminUser = user;
    next();
  } catch (err) {
    console.error('Admin page check error:', err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Server error' });
    }
    return res.redirect('/login.html');
  }
}

// ===============================
// PROTECTED STATIC/HTML ROUTES
// ===============================
app.get('/admin.html', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(['/history.html', '/profile.html', '/deposit.html'], requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', req.path));
});

// ===============================
// STATIC FILES
// ===============================
app.use(express.static(path.join(__dirname, 'public')));

// ===============================
// API ROUTE SEPARATION
// ===============================
app.use('/api/admin', require('./routes/admin'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/history', require('./routes/history'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/spin', require('./routes/spin'));
app.use('/api/bonus', require('./routes/bonus'));
app.use('/api/support', require('./routes/support'));
app.use('/api/demo', require('./routes/demo'));

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});