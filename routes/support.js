const express = require('express');
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

const router = express.Router();
const clean = (s, n) => String(s || '').trim().slice(0, n);
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error('Support error:', err);
    res.status(500).json({ error: 'Server error' });
  });

// Everyone here must be logged in
router.use(async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Please log in first' });
    const user = await User.findById(req.session.userId).select('username isAdmin');
    if (!user) return res.status(401).json({ error: 'Please log in first' });
    req.me = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.param('id', (req, res, next, id) =>
  mongoose.isValidObjectId(id) ? next() : res.status(400).json({ error: 'Invalid ticket' })
);

// ---------- PLAYER ----------
router.get('/mine', wrap(async (req, res) => {
  res.json(await Ticket.find({ user: req.me._id }).sort({ updatedAt: -1 }).limit(20));
}));

router.post('/new', wrap(async (req, res) => {
  const subject = clean(req.body.subject, 60);
  const text = clean(req.body.text, 500);
  if (!subject || !text) return res.status(400).json({ error: 'Add a subject and a message' });

  const open = await Ticket.countDocuments({ user: req.me._id, status: 'open' });
  if (open >= 3) return res.status(400).json({ error: 'You already have 3 open requests. Add to one of them.' });

  const t = await Ticket.create({
    user: req.me._id,
    username: req.me.username,
    subject,
    messages: [{ from: 'player', name: req.me.username, text }]
  });
  res.json(t);
}));

router.post('/:id/reply', wrap(async (req, res) => {
  const text = clean(req.body.text, 500);
  if (!text) return res.status(400).json({ error: 'Write a message first' });
  const t = await Ticket.findOneAndUpdate(
    { _id: req.params.id, user: req.me._id, status: 'open', 'messages.99': { $exists: false } },
    {
      $push: { messages: { from: 'player', name: req.me.username, text, at: new Date() } },
      $set: { unreadAdmin: true, updatedAt: new Date() }
    },
    { new: true }
  );
  if (!t) return res.status(400).json({ error: 'This request is closed or full' });
  res.json(t);
}));

router.post('/:id/read', wrap(async (req, res) => {
  await Ticket.updateOne({ _id: req.params.id, user: req.me._id }, { unreadPlayer: false });
  res.json({ success: true });
}));

// ---------- ADMIN ----------
router.use('/admin', (req, res, next) =>
  req.me.isAdmin ? next() : res.status(403).json({ error: 'Admins only' })
);

router.get('/admin/unread', wrap(async (req, res) => {
  res.json({ count: await Ticket.countDocuments({ status: 'open', unreadAdmin: true }) });
}));

router.get('/admin/tickets', wrap(async (req, res) => {
  const s = req.query.status;
  const filter = s === 'open' || s === 'closed' ? { status: s } : {};
  res.json(await Ticket.find(filter).sort({ updatedAt: -1 }).limit(100));
}));

router.post('/admin/tickets/:id/reply', wrap(async (req, res) => {
  const text = clean(req.body.text, 500);
  if (!text) return res.status(400).json({ error: 'Write a reply first' });
  const t = await Ticket.findOneAndUpdate(
    { _id: req.params.id, status: 'open', 'messages.99': { $exists: false } },
    {
      $push: { messages: { from: 'admin', name: req.me.username, text, at: new Date() } },
      $set: { unreadPlayer: true, unreadAdmin: false, updatedAt: new Date() }
    },
    { new: true }
  );
  if (!t) return res.status(400).json({ error: 'Ticket is closed or full' });
  res.json(t);
}));

router.post('/admin/tickets/:id/read', wrap(async (req, res) => {
  await Ticket.updateOne({ _id: req.params.id }, { unreadAdmin: false });
  res.json({ success: true });
}));

router.post('/admin/tickets/:id/close', wrap(async (req, res) => {
  const t = await Ticket.findByIdAndUpdate(
    req.params.id,
    { status: 'closed', unreadAdmin: false, updatedAt: new Date() },
    { new: true }
  );
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  res.json(t);
}));

router.post('/admin/tickets/:id/reopen', wrap(async (req, res) => {
  const t = await Ticket.findByIdAndUpdate(
    req.params.id,
    { status: 'open', updatedAt: new Date() },
    { new: true }
  );
  if (!t) return res.status(404).json({ error: 'Ticket not found' });
  res.json(t);
}));

module.exports = router;