const express = require('express');
const User = require('../models/User');
const { protect, signToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register  { name, phone, password }
router.post('/register', async (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ message: 'name, phone and password are required' });
  }
  const user = await User.create({ name, phone, password });
  res.status(201).json({ token: signToken(user._id), user });
});

// POST /api/auth/login  { phone, password }
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ message: 'phone and password are required' });

  const user = await User.findOne({ phone }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid phone or password' });
  }
  res.json({ token: signToken(user._id), user });
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
