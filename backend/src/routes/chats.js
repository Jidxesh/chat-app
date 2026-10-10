const express = require('express');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { upload, storeUpload } = require('../middleware/upload');
const { HttpError } = require('../middleware/error');
const { populateChat, getChatForMember, unreadCount } = require('../services/chatService');
const { createSystemMessage } = require('../services/messageService');
const { getIO, joinChat, leaveChat, userRoom, chatRoom } = require('../socket');

const router = express.Router();
router.use(protect);

async function loadChat(chatId) {
  return populateChat(Chat.findById(chatId));
}

function requireGroupAdmin(chat, userId) {
  if (chat.type !== 'group') throw new HttpError(400, 'Not a group chat');
  if (!chat.isAdmin(userId)) throw new HttpError(403, 'Only group admins can do this');
}

// Post a system message ("X added Y") and push updates to everyone in the chat
async function announce(chat, userId, text) {
  const message = await createSystemMessage(chat, userId, text);
  const io = getIO();
  io.to(chatRoom(chat._id)).emit('message:new', message);
  io.to(chatRoom(chat._id)).emit('chat:updated', await loadChat(chat._id));
}

// GET /api/chats — all chats of the current user, newest first, with unread counts
router.get('/', async (req, res) => {
  const chats = await populateChat(Chat.find({ participants: req.user._id }).sort({ updatedAt: -1 }));
  const withUnread = await Promise.all(
    chats.map(async (c) => ({ ...c.toObject(), unreadCount: await unreadCount(c._id, req.user._id) }))
  );
  res.json({ chats: withUnread });
});

// POST /api/chats/direct  { userId } — open (or create) a 1:1 chat
router.post('/direct', async (req, res) => {
  const { userId } = req.body;
  if (!userId || String(userId) === String(req.user._id)) throw new HttpError(400, 'Valid userId is required');
  const other = await User.findById(userId);
  if (!other) throw new HttpError(404, 'User not found');

  let chat = await Chat.findOne({
    type: 'direct',
    participants: { $all: [req.user._id, other._id], $size: 2 },
  });
  let created = false;
  if (!chat) {
    chat = await Chat.create({ type: 'direct', participants: [req.user._id, other._id] });
    joinChat([req.user._id, other._id], chat._id);
    created = true;
  }
  res.status(created ? 201 : 200).json({ chat: await loadChat(chat._id) });
});

// POST /api/chats/group  { name, participants: [userId], description? }  (multipart: avatar optional)
router.post('/group', upload.single('avatar'), storeUpload, async (req, res) => {
  let { name, participants = [], description } = req.body;
  if (typeof participants === 'string') participants = JSON.parse(participants); // multipart sends a string
  if (!name?.trim()) throw new HttpError(400, 'Group name is required');
  if (!Array.isArray(participants) || participants.length < 1) {
    throw new HttpError(400, 'Add at least one participant');
  }

  const ids = [...new Set([String(req.user._id), ...participants.map(String)])];
  const found = await User.countDocuments({ _id: { $in: ids } });
  if (found !== ids.length) throw new HttpError(400, 'One or more participants do not exist');

  const chat = await Chat.create({
    type: 'group',
    name: name.trim(),
    description,
    avatar: req.file ? req.file.url : '',
    participants: ids,
    admins: [req.user._id],
    createdBy: req.user._id,
  });
  joinChat(ids, chat._id);
  await announce(chat, req.user._id, `${req.user.name} created group "${chat.name}"`);
  res.status(201).json({ chat: await loadChat(chat._id) });
});

// GET /api/chats/:chatId
router.get('/:chatId', async (req, res) => {
  await getChatForMember(req.params.chatId, req.user._id);
  res.json({ chat: await loadChat(req.params.chatId) });
});

// PATCH /api/chats/:chatId  { name?, description? }  (multipart: avatar optional) — group admins only
router.patch('/:chatId', upload.single('avatar'), storeUpload, async (req, res) => {
  const chat = await getChatForMember(req.params.chatId, req.user._id);
  requireGroupAdmin(chat, req.user._id);
  const { name, description } = req.body;
  if (name?.trim()) chat.name = name.trim();
  if (description !== undefined) chat.description = description;
  if (req.file) chat.avatar = req.file.url;
  await chat.save();
  await announce(chat, req.user._id, `${req.user.name} updated the group info`);
  res.json({ chat: await loadChat(chat._id) });
});

// POST /api/chats/:chatId/members  { userIds: [] } — group admins only
router.post('/:chatId/members', async (req, res) => {
  const chat = await getChatForMember(req.params.chatId, req.user._id);
  requireGroupAdmin(chat, req.user._id);
  const newIds = (req.body.userIds || []).map(String).filter((id) => !chat.hasMember(id));
  const users = await User.find({ _id: { $in: newIds } }).select('name');
  if (!users.length) throw new HttpError(400, 'No new valid users to add');

  chat.participants.push(...users.map((u) => u._id));
  await chat.save();
  joinChat(users.map((u) => u._id), chat._id);
  await announce(chat, req.user._id, `${req.user.name} added ${users.map((u) => u.name).join(', ')}`);
  res.json({ chat: await loadChat(chat._id) });
});

// DELETE /api/chats/:chatId/members/:userId — admin removes someone, or anyone removes themselves (leave group)
router.delete('/:chatId/members/:userId', async (req, res) => {
  const chat = await getChatForMember(req.params.chatId, req.user._id);
  if (chat.type !== 'group') throw new HttpError(400, 'Not a group chat');
  const targetId = req.params.userId;
  const leaving = String(targetId) === String(req.user._id);
  if (!leaving) requireGroupAdmin(chat, req.user._id);
  if (!chat.hasMember(targetId)) throw new HttpError(404, 'User is not in this group');

  const target = await User.findById(targetId).select('name');
  chat.participants.pull(targetId);
  chat.admins.pull(targetId);
  // Keep at least one admin around
  if (!chat.admins.length && chat.participants.length) chat.admins.push(chat.participants[0]);
  await chat.save();

  if (!chat.participants.length) {
    await chat.deleteOne();
  } else {
    await announce(
      chat,
      req.user._id,
      leaving ? `${req.user.name} left` : `${req.user.name} removed ${target?.name || 'a member'}`
    );
  }
  leaveChat([targetId], chat._id);
  getIO().to(userRoom(targetId)).emit('chat:removed', { chatId: chat._id });
  res.json({ ok: true });
});

// POST /api/chats/:chatId/admins/:userId  and  DELETE ... — promote / demote admins
router.post('/:chatId/admins/:userId', async (req, res) => {
  const chat = await getChatForMember(req.params.chatId, req.user._id);
  requireGroupAdmin(chat, req.user._id);
  if (!chat.hasMember(req.params.userId)) throw new HttpError(404, 'User is not in this group');
  chat.admins.addToSet(req.params.userId);
  await chat.save();
  getIO().to(chatRoom(chat._id)).emit('chat:updated', await loadChat(chat._id));
  res.json({ chat: await loadChat(chat._id) });
});
router.delete('/:chatId/admins/:userId', async (req, res) => {
  const chat = await getChatForMember(req.params.chatId, req.user._id);
  requireGroupAdmin(chat, req.user._id);
  if (chat.admins.length === 1 && chat.isAdmin(req.params.userId)) {
    throw new HttpError(400, 'A group needs at least one admin');
  }
  chat.admins.pull(req.params.userId);
  await chat.save();
  getIO().to(chatRoom(chat._id)).emit('chat:updated', await loadChat(chat._id));
  res.json({ chat: await loadChat(chat._id) });
});

module.exports = router;
