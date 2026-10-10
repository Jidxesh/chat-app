const express = require('express');
const { protect } = require('../middleware/auth');
const { upload, storeUpload, mediaType } = require('../middleware/upload');
const messageService = require('../services/messageService');
const { getIO, chatRoom, userRoom } = require('../socket');

const router = express.Router();
router.use(protect);

// GET /api/messages/:chatId?before=<ISO date>&limit=30 — paginated history (oldest → newest)
router.get('/:chatId', async (req, res) => {
  const messages = await messageService.getMessages(req.user._id, req.params.chatId, req.query);
  res.json({ messages });
});

// POST /api/messages/:chatId  { content, replyTo? }  or multipart with "file" (+ optional caption in "content")
router.post('/:chatId', upload.single('file'), storeUpload, async (req, res) => {
  const payload = { chatId: req.params.chatId, content: req.body.content || '', replyTo: req.body.replyTo };
  if (req.file) {
    payload.type = mediaType(req.file.mimetype);
    payload.media = {
      url: req.file.url,
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    };
  }
  const message = await messageService.sendMessage(req.user._id, payload);
  getIO().to(chatRoom(req.params.chatId)).emit('message:new', { ...message, clientId: req.body.clientId });
  res.status(201).json({ message });
});

// PATCH /api/messages/item/:messageId  { content }
router.patch('/item/:messageId', async (req, res) => {
  const message = await messageService.editMessage(req.user._id, req.params.messageId, req.body.content);
  getIO().to(chatRoom(message.chat)).emit('message:edited', message);
  res.json({ message });
});

// DELETE /api/messages/item/:messageId?forEveryone=true
router.delete('/item/:messageId', async (req, res) => {
  const forEveryone = req.query.forEveryone === 'true';
  const { message } = await messageService.deleteMessage(req.user._id, req.params.messageId, forEveryone);
  const target = forEveryone ? chatRoom(message.chat) : userRoom(req.user._id);
  getIO().to(target).emit('message:deleted', { messageId: message._id, chatId: message.chat, forEveryone });
  res.json({ ok: true });
});

// POST /api/messages/:chatId/read — mark the whole chat as read
router.post('/:chatId/read', async (req, res) => {
  const messages = await messageService.markChatRead(req.user._id, req.params.chatId);
  if (messages.length) {
    getIO().to(chatRoom(req.params.chatId)).emit('chat:read', {
      chatId: req.params.chatId,
      userId: String(req.user._id),
      messageIds: messages.map((m) => m._id),
      at: new Date(),
    });
  }
  res.json({ updated: messages.length });
});

module.exports = router;
