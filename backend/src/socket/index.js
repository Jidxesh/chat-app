const { Server } = require('socket.io');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { userFromToken } = require('../middleware/auth');
const messageService = require('../services/messageService');
const { registerCallHandlers } = require('./calls');
const { corsOrigin } = require('../config/cors');

let io;
// userId -> number of open sockets (a user can be connected from several devices/tabs)
const onlineUsers = new Map();

const userRoom = (id) => `user:${id}`;
const chatRoom = (id) => `chat:${id}`;

function getIO() {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

// Make every socket of these users join (or leave) a chat room
function joinChat(userIds, chatId) {
  userIds.forEach((id) => io.in(userRoom(id)).socketsJoin(chatRoom(chatId)));
}
function leaveChat(userIds, chatId) {
  userIds.forEach((id) => io.in(userRoom(id)).socketsLeave(chatRoom(chatId)));
}

// Tell everyone who shares a chat with this user about their presence
async function broadcastPresence(userId, isOnlineNow, lastSeen) {
  const chats = await Chat.find({ participants: userId }).select('_id');
  const payload = { userId: String(userId), isOnline: isOnlineNow, lastSeen };
  chats.forEach((c) => io.to(chatRoom(c._id)).emit('presence:update', payload));
}

function notifyDelivered(message, userId) {
  io.to(userRoom(message.sender)).emit('message:delivered', {
    messageId: message._id,
    chatId: message.chat,
    userId: String(userId),
  });
}

// Wraps socket handlers so errors go back through the ack callback
function handler(fn) {
  return async (payload = {}, ack) => {
    try {
      const result = await fn(payload);
      if (typeof ack === 'function') ack({ ok: true, data: result });
    } catch (err) {
      if (err.status === undefined) console.error(err);
      if (typeof ack === 'function') ack({ ok: false, error: err.message, code: err.code });
    }
  };
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const user = await userFromToken(token);
    if (!user) return next(new Error('Unauthorized'));
    socket.user = user;
    // Load rooms here so the connection handler can stay synchronous
    // (handlers registered after an await would miss the client's first events)
    try {
      socket.data.chatIds = await Chat.find({ participants: user._id }).distinct('_id');
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const userId = String(socket.user._id);

    socket.join(userRoom(userId));
    socket.data.chatIds.forEach((id) => socket.join(chatRoom(id)));

    const count = (onlineUsers.get(userId) || 0) + 1;
    onlineUsers.set(userId, count);
    if (count === 1) {
      User.findByIdAndUpdate(userId, { isOnline: true })
        .then(() => broadcastPresence(userId, true))
        .catch(console.error);
    }

    // Coming online delivers everything that was sent while offline
    messageService
      .markDelivered(userId)
      .then((messages) => messages.forEach((m) => notifyDelivered(m, userId)))
      .catch(console.error);

    // ---- Messaging ----
    socket.on(
      'message:send',
      handler(async (payload) => {
        const message = await messageService.sendMessage(userId, payload);
        // clientId lets the sender match the server message to its optimistic copy
        io.to(chatRoom(payload.chatId)).emit('message:new', { ...message, clientId: payload.clientId });
        return message;
      })
    );

    socket.on(
      'message:edit',
      handler(async ({ messageId, content }) => {
        const message = await messageService.editMessage(userId, messageId, content);
        io.to(chatRoom(message.chat)).emit('message:edited', message);
        return message;
      })
    );

    socket.on(
      'message:delete',
      handler(async ({ messageId, forEveryone }) => {
        const { message } = await messageService.deleteMessage(userId, messageId, forEveryone);
        const target = forEveryone ? chatRoom(message.chat) : userRoom(userId);
        io.to(target).emit('message:deleted', { messageId, chatId: message.chat, forEveryone: !!forEveryone });
        return { messageId };
      })
    );

    // ---- Receipts (✓✓ grey = delivered, ✓✓ blue = read) ----
    socket.on(
      'message:delivered',
      handler(async ({ messageIds = [] }) => {
        const messages = await messageService.markDelivered(userId, messageIds);
        messages.forEach((m) => notifyDelivered(m, userId));
      })
    );

    socket.on(
      'chat:read',
      handler(async ({ chatId }) => {
        const messages = await messageService.markChatRead(userId, chatId);
        if (messages.length) {
          io.to(chatRoom(chatId)).emit('chat:read', {
            chatId,
            userId,
            messageIds: messages.map((m) => m._id),
            at: new Date(),
          });
        }
      })
    );

    // ---- Voice / video calls ----
    registerCallHandlers(io, socket, { handler, userRoom, chatRoom, isOnline });

    // ---- Typing indicators ----
    socket.on('typing:start', ({ chatId } = {}) => {
      if (socket.rooms.has(chatRoom(chatId))) {
        socket.to(chatRoom(chatId)).emit('typing:start', { chatId, userId, name: socket.user.name });
      }
    });
    socket.on('typing:stop', ({ chatId } = {}) => {
      if (socket.rooms.has(chatRoom(chatId))) {
        socket.to(chatRoom(chatId)).emit('typing:stop', { chatId, userId });
      }
    });

    socket.on('disconnect', async () => {
      const remaining = (onlineUsers.get(userId) || 1) - 1;
      if (remaining > 0) {
        onlineUsers.set(userId, remaining);
        return;
      }
      onlineUsers.delete(userId);
      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
      broadcastPresence(userId, false, lastSeen);
    });
  });

  return io;
}

module.exports = { initSocket, getIO, isOnline, joinChat, leaveChat, userRoom, chatRoom };
