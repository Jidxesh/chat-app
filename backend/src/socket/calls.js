// 1:1 voice/video calls. Media flows peer-to-peer over WebRTC; the server only
// rings, relays signaling (SDP offers/answers + ICE candidates) and logs the call.
const crypto = require('crypto');
const User = require('../models/User');
const messageService = require('../services/messageService');
const { getChatForMember } = require('../services/chatService');

const RING_TIMEOUT_MS = 45 * 1000;

const calls = new Map(); // callId -> call
const userCall = new Map(); // userId -> callId (one call at a time per user)

class CallError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = 400; // marks it as expected, so it isn't logged as a crash
  }
}

function registerCallHandlers(io, socket, { handler, userRoom, chatRoom, isOnline }) {
  const userId = String(socket.user._id);

  async function logCall(call, status, duration) {
    const message = await messageService.createCallMessage(call.chatId, call.callerId, {
      kind: call.kind,
      status,
      duration,
    });
    if (message) io.to(chatRoom(call.chatId)).emit('message:new', message);
  }

  function finish(call, reason) {
    if (!calls.has(call.id)) return;
    clearTimeout(call.ringTimer);
    calls.delete(call.id);
    if (userCall.get(call.callerId) === call.id) userCall.delete(call.callerId);
    if (userCall.get(call.calleeId) === call.id) userCall.delete(call.calleeId);

    // Caller's socket + every device of the callee (some may still be ringing)
    io.to(call.callerSocket).to(userRoom(call.calleeId)).emit('call:ended', { callId: call.id, reason });

    let status = 'missed';
    if (call.answeredAt) status = 'completed';
    else if (reason === 'declined') status = 'declined';
    const duration = call.answeredAt ? Math.round((Date.now() - call.answeredAt) / 1000) : 0;
    logCall(call, status, duration).catch(console.error);
  }

  function getOwnCall(callId) {
    const call = calls.get(callId);
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
      throw new CallError('not_found', 'Call not found');
    }
    return call;
  }

  socket.on(
    'call:start',
    handler(async ({ chatId, kind = 'audio' }) => {
      if (!['audio', 'video'].includes(kind)) throw new CallError('invalid', 'Invalid call type');
      const chat = await getChatForMember(chatId, userId);
      if (chat.type !== 'direct') throw new CallError('invalid', 'Group calls are not supported yet');
      if (userCall.has(userId)) throw new CallError('busy_self', 'You are already in a call');

      const calleeId = String(chat.participants.find((p) => String(p) !== userId));
      const callee = await User.findById(calleeId).select('blocked');
      if (callee?.blocked.some((b) => String(b) === userId)) {
        throw new CallError('blocked', 'You cannot call this user');
      }

      const call = {
        id: crypto.randomUUID(),
        chatId: String(chat._id),
        kind,
        callerId: userId,
        calleeId,
        callerSocket: socket.id,
        calleeSocket: null,
        answeredAt: null,
      };

      // Busy or offline: tell the caller, and leave a missed call for the callee like WhatsApp does
      if (userCall.has(calleeId) || !isOnline(calleeId)) {
        logCall(call, 'missed', 0).catch(console.error);
        throw userCall.has(calleeId)
          ? new CallError('busy', 'On another call')
          : new CallError('unavailable', 'Unavailable right now');
      }

      calls.set(call.id, call);
      userCall.set(userId, call.id);
      userCall.set(calleeId, call.id);
      call.ringTimer = setTimeout(() => finish(call, 'no_answer'), RING_TIMEOUT_MS);

      const { name, avatar } = socket.user;
      io.to(userRoom(calleeId)).emit('call:incoming', {
        callId: call.id,
        chatId: call.chatId,
        kind,
        from: { _id: userId, name, avatar },
      });
      return { callId: call.id };
    })
  );

  socket.on(
    'call:accept',
    handler(async ({ callId }) => {
      const call = getOwnCall(callId);
      if (call.calleeId !== userId) throw new CallError('invalid', 'Only the person being called can answer');
      if (call.answeredAt) throw new CallError('answered', 'Call was already answered');

      clearTimeout(call.ringTimer);
      call.answeredAt = Date.now();
      call.calleeSocket = socket.id;
      io.to(call.callerSocket).emit('call:accepted', { callId });
      // Stop ringing on the callee's other devices
      io.to(userRoom(userId)).except(socket.id).emit('call:ended', { callId, reason: 'answered_elsewhere' });
    })
  );

  socket.on(
    'call:decline',
    handler(async ({ callId }) => {
      const call = getOwnCall(callId);
      if (call.calleeId === userId && !call.answeredAt) finish(call, 'declined');
    })
  );

  socket.on(
    'call:end',
    handler(async ({ callId }) => {
      const call = calls.get(callId);
      if (!call) return; // already over
      getOwnCall(callId);
      finish(call, call.answeredAt ? 'ended' : 'cancelled');
    })
  );

  // Relay WebRTC signaling ({ sdp } or { candidate }) and mute/camera state to the other party
  const relay = (event) => (payload = {}) => {
    const call = calls.get(payload.callId);
    if (!call || !call.calleeSocket) return;
    const target =
      socket.id === call.callerSocket ? call.calleeSocket : socket.id === call.calleeSocket ? call.callerSocket : null;
    if (target) io.to(target).emit(event, payload);
  };
  socket.on('call:signal', relay('call:signal'));
  socket.on('call:media', relay('call:media'));

  socket.on('disconnect', () => {
    for (const call of calls.values()) {
      if (call.callerSocket === socket.id || call.calleeSocket === socket.id) finish(call, 'disconnected');
    }
  });
}

module.exports = { registerCallHandlers };
