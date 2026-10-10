const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { HttpError } = require('../middleware/error');
const { getChatForMember } = require('./chatService');

function populateMessage(query) {
  return query
    .populate('sender', 'name avatar')
    .populate({ path: 'replyTo', select: 'content type sender media', populate: { path: 'sender', select: 'name' } });
}

// What a deleted-for-everyone message looks like to clients
function sanitize(message) {
  const obj = message.toObject ? message.toObject() : message;
  if (obj.deletedForEveryone) {
    obj.content = '';
    obj.media = undefined;
    obj.replyTo = undefined;
  }
  return obj;
}

async function sendMessage(userId, { chatId, type = 'text', content = '', media, replyTo }) {
  const chat = await getChatForMember(chatId, userId);

  if (type === 'system' || type === 'call') throw new HttpError(400, 'Invalid message type');
  if (type === 'text' && !content.trim()) throw new HttpError(400, 'Message content is required');
  if (type !== 'text' && !media?.url) throw new HttpError(400, 'Media url is required');

  if (chat.type === 'direct') {
    const otherId = chat.participants.find((p) => String(p) !== String(userId));
    const other = await User.findById(otherId).select('blocked');
    if (other?.blocked.some((b) => String(b) === String(userId))) {
      throw new HttpError(403, 'You cannot message this user');
    }
  }

  const message = await Message.create({
    chat: chat._id,
    sender: userId,
    type,
    content: content.trim(),
    media,
    replyTo: replyTo || undefined,
    readBy: [{ user: userId }],
    deliveredTo: [{ user: userId }],
  });

  chat.lastMessage = message._id;
  await chat.save(); // also bumps updatedAt so the chat moves to the top

  return sanitize(await populateMessage(Message.findById(message._id)));
}

async function createSystemMessage(chat, userId, content) {
  const message = await Message.create({ chat: chat._id, sender: userId, type: 'system', content });
  chat.lastMessage = message._id;
  await chat.save();
  return sanitize(await populateMessage(Message.findById(message._id)));
}

async function createCallMessage(chatId, callerId, call) {
  const chat = await Chat.findById(chatId);
  if (!chat) return null;
  const message = await Message.create({
    chat: chat._id,
    sender: callerId,
    type: 'call',
    call,
    readBy: [{ user: callerId }],
    deliveredTo: [{ user: callerId }],
  });
  chat.lastMessage = message._id;
  await chat.save();
  return sanitize(await populateMessage(Message.findById(message._id)));
}

// Marks messages from others as delivered to the user. Pass messageIds to limit it to
// specific messages; otherwise everything pending in the user's chats is marked.
async function markDelivered(userId, messageIds) {
  const chatIds = await Chat.find({ participants: userId }).distinct('_id');
  const filter = {
    chat: { $in: chatIds },
    sender: { $ne: userId },
    type: { $ne: 'system' },
    'deliveredTo.user': { $ne: userId },
  };
  if (messageIds) filter._id = { $in: messageIds };

  const messages = await Message.find(filter).select('chat sender');
  if (!messages.length) return [];
  await Message.updateMany(
    { _id: { $in: messages.map((m) => m._id) } },
    { $push: { deliveredTo: { user: userId, at: new Date() } } }
  );
  return messages;
}

// Marks every unread message in the chat as read by the user
async function markChatRead(userId, chatId) {
  await getChatForMember(chatId, userId);
  const filter = { chat: chatId, sender: { $ne: userId }, 'readBy.user': { $ne: userId } };
  const messages = await Message.find(filter).select('_id sender deliveredTo');
  if (!messages.length) return [];

  const now = new Date();
  await Message.updateMany(
    { _id: { $in: messages.map((m) => m._id) } },
    { $push: { readBy: { user: userId, at: now } } }
  );
  // Reading implies delivery
  await Message.updateMany(
    { _id: { $in: messages.map((m) => m._id) }, 'deliveredTo.user': { $ne: userId } },
    { $push: { deliveredTo: { user: userId, at: now } } }
  );
  return messages;
}

async function deleteMessage(userId, messageId, forEveryone) {
  const message = await Message.findById(messageId);
  if (!message) throw new HttpError(404, 'Message not found');
  const chat = await getChatForMember(message.chat, userId);

  if (forEveryone) {
    if (String(message.sender) !== String(userId)) {
      throw new HttpError(403, 'You can only delete your own messages for everyone');
    }
    message.deletedForEveryone = true;
  } else if (!message.deletedFor.some((u) => String(u) === String(userId))) {
    message.deletedFor.push(userId);
  }
  await message.save();
  return { message: sanitize(message), chat };
}

async function editMessage(userId, messageId, content) {
  const message = await Message.findById(messageId);
  if (!message) throw new HttpError(404, 'Message not found');
  if (String(message.sender) !== String(userId)) throw new HttpError(403, 'You can only edit your own messages');
  if (message.type !== 'text' || message.deletedForEveryone) throw new HttpError(400, 'This message cannot be edited');
  if (!content?.trim()) throw new HttpError(400, 'Message content is required');

  message.content = content.trim();
  message.editedAt = new Date();
  await message.save();
  return sanitize(await populateMessage(Message.findById(message._id)));
}

async function getMessages(userId, chatId, { before, limit = 30 }) {
  await getChatForMember(chatId, userId);
  const filter = { chat: chatId, deletedFor: { $ne: userId } };
  if (before) filter.createdAt = { $lt: new Date(before) };

  const messages = await populateMessage(
    Message.find(filter).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 100))
  );
  return messages.reverse().map(sanitize);
}

module.exports = {
  sendMessage,
  createSystemMessage,
  createCallMessage,
  markDelivered,
  markChatRead,
  deleteMessage,
  editMessage,
  getMessages,
};
