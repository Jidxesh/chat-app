const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { upload, storeUpload } = require('../middleware/upload');
const { USER_FIELDS } = require('../services/chatService');

const router = express.Router();
router.use(protect);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/users/search?q=  — search by name or phone
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ users: [] });
  const rx = new RegExp(escapeRegex(q), 'i');
  const users = await User.find({ _id: { $ne: req.user._id }, $or: [{ name: rx }, { phone: rx }] })
    .select(USER_FIELDS)
    .limit(20);
  res.json({ users });
});

// PATCH /api/users/me  { name?, about? }  (multipart: avatar file optional)
router.patch('/me', upload.single('avatar'), storeUpload, async (req, res) => {
  const { name, about } = req.body;
  if (name !== undefined) req.user.name = name;
  if (about !== undefined) req.user.about = about;
  if (req.file) req.user.avatar = req.file.url;
  await req.user.save();
  res.json({ user: req.user });
});

// GET /api/users/contacts
router.get('/contacts', async (req, res) => {
  const user = await User.findById(req.user._id).populate('contacts', USER_FIELDS);
  res.json({ contacts: user.contacts });
});

// POST /api/users/contacts  { phone }
router.post('/contacts', async (req, res) => {
  const contact = await User.findOne({ phone: req.body.phone }).select(USER_FIELDS);
  if (!contact) return res.status(404).json({ message: 'No user with that phone number' });
  if (contact._id.equals(req.user._id)) return res.status(400).json({ message: 'You cannot add yourself' });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { contacts: contact._id } });
  res.status(201).json({ contact });
});

// DELETE /api/users/contacts/:userId
router.delete('/contacts/:userId', async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { contacts: req.params.userId } });
  res.json({ ok: true });
});

// POST /api/users/:userId/block  and  DELETE /api/users/:userId/block
router.post('/:userId/block', async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $addToSet: { blocked: req.params.userId } });
  res.json({ ok: true });
});
router.delete('/:userId/block', async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { blocked: req.params.userId } });
  res.json({ ok: true });
});

// GET /api/users/:userId — public profile
router.get('/:userId', async (req, res) => {
  const user = await User.findById(req.params.userId).select(USER_FIELDS);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
});

module.exports = router;
