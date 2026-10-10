// End-to-end smoke test: run the server first (npm run dev), then `node scripts/smoke-test.js`
const { io } = require('socket.io-client');

const BASE = process.env.API_URL || 'http://localhost:4000';
const stamp = Date.now();

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.message}`);
  return data;
}

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token } });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
const once = (socket, event, match = () => true) =>
  new Promise((resolve) => {
    const fn = (data) => {
      if (!match(data)) return;
      socket.off(event, fn);
      resolve(data);
    };
    socket.on(event, fn);
  });
const inChat = (chatId) => (m) => String(m.chat) === String(chatId);
const emit = (socket, event, payload) =>
  new Promise((resolve, reject) =>
    socket.emit(event, payload, (r) => (r.ok ? resolve(r.data) : reject(new Error(r.error))))
  );
const check = (cond, label) => {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`  ✓ ${label}`);
};

(async () => {
  const alice = await api('POST', '/api/auth/register', null, { name: 'Alice', phone: `9${stamp}1`, password: 'secret123' });
  const bob = await api('POST', '/api/auth/register', null, { name: 'Bob', phone: `9${stamp}2`, password: 'secret123' });
  const login = await api('POST', '/api/auth/login', null, { phone: `9${stamp}1`, password: 'secret123' });
  check(login.token && !login.user.password, 'register + login (password not leaked)');

  const { chat } = await api('POST', '/api/chats/direct', alice.token, { userId: bob.user._id });
  const again = await api('POST', '/api/chats/direct', bob.token, { userId: alice.user._id });
  check(chat._id === again.chat._id, 'direct chat is reused, not duplicated');

  const sa = await connect(alice.token);
  const sb = await connect(bob.token);
  check(true, 'both users connected over Socket.IO');

  const typing = once(sb, 'typing:start');
  sa.emit('typing:start', { chatId: chat._id });
  check((await typing).name === 'Alice', 'typing indicator reaches Bob');

  const incoming = once(sb, 'message:new');
  const sent = await emit(sa, 'message:send', { chatId: chat._id, content: 'Hi Bob!', clientId: 'tmp-1' });
  const got = await incoming;
  check(got._id === sent._id && got.clientId === 'tmp-1', 'message delivered in real time');

  const unread = (await api('GET', '/api/chats', bob.token)).chats.find((c) => c._id === chat._id);
  check(unread.unreadCount === 1 && unread.lastMessage.content === 'Hi Bob!', 'chat list shows unread count + last message');

  const delivered = once(sa, 'message:delivered');
  await emit(sb, 'message:delivered', { messageIds: [sent._id] });
  check((await delivered).messageId === sent._id, 'delivered receipt (✓✓) sent to Alice');

  const read = once(sa, 'chat:read');
  await emit(sb, 'chat:read', { chatId: chat._id });
  check((await read).messageIds.includes(sent._id), 'read receipt (blue ✓✓) sent to Alice');

  const reply = once(sa, 'message:new');
  await api('POST', `/api/messages/${chat._id}`, bob.token, { content: 'Hey!', replyTo: sent._id });
  check((await reply).replyTo.content === 'Hi Bob!', 'REST send + reply-to works and is pushed via socket');

  const deleted = once(sb, 'message:deleted');
  await emit(sa, 'message:delete', { messageId: sent._id, forEveryone: true });
  await deleted;
  const history = (await api('GET', `/api/messages/${chat._id}`, bob.token)).messages;
  check(history.length === 2 && history[0].deletedForEveryone && history[0].content === '', 'delete for everyone');

  const charlie = await api('POST', '/api/auth/register', null, { name: 'Charlie', phone: `9${stamp}3`, password: 'secret123' });
  const sc = await connect(charlie.token);
  const groupMsg = once(sc, 'message:new');
  const { chat: group } = await api('POST', '/api/chats/group', alice.token, {
    name: 'Friends',
    participants: [bob.user._id, charlie.user._id],
  });
  check((await groupMsg).type === 'system' && group.participants.length === 3, 'group created, members joined live');

  const forbidden = await api('POST', `/api/chats/${group._id}/members`, bob.token, { userIds: [] }).catch((e) => e);
  check(String(forbidden.message).includes('403'), 'non-admin cannot manage group');

  const removed = once(sc, 'chat:removed');
  await api('DELETE', `/api/chats/${group._id}/members/${charlie.user._id}`, charlie.token);
  await removed;
  check(true, 'member can leave group');

  // ---- Calls ----
  const ringing = once(sb, 'call:incoming');
  const { callId } = await emit(sa, 'call:start', { chatId: chat._id, kind: 'video' });
  const incomingCall = await ringing;
  check(incomingCall.callId === callId && incomingCall.from.name === 'Alice', 'call rings on the other side');

  const busy = await emit(sc, 'call:start', { chatId: (await api('POST', '/api/chats/direct', charlie.token, { userId: bob.user._id })).chat._id, kind: 'audio' }).catch((e) => e);
  check(/another call/i.test(busy.message), 'third person gets "busy" while a call is ringing');

  const accepted = once(sa, 'call:accepted');
  await emit(sb, 'call:accept', { callId });
  await accepted;
  const relayed = once(sb, 'call:signal');
  sa.emit('call:signal', { callId, sdp: { type: 'offer', sdp: 'fake' } });
  check((await relayed).sdp.type === 'offer', 'call accepted and WebRTC signaling relayed');

  const ended = once(sb, 'call:ended');
  const callLog = once(sb, 'message:new', inChat(chat._id));
  await new Promise((r) => setTimeout(r, 1100));
  await emit(sa, 'call:end', { callId });
  const [endInfo, log] = await Promise.all([ended, callLog]);
  check(endInfo.reason === 'ended' && log.type === 'call' && log.call.status === 'completed' && log.call.duration >= 1, 'hang up logs a completed call with duration');

  const ring2 = once(sb, 'call:incoming');
  const second = await emit(sa, 'call:start', { chatId: chat._id, kind: 'audio' });
  await ring2;
  const declined = once(sa, 'call:ended');
  const declineLog = once(sa, 'message:new', inChat(chat._id));
  await emit(sb, 'call:decline', { callId: second.callId });
  check((await declined).reason === 'declined' && (await declineLog).call.status === 'declined', 'declined call');

  const presence = once(sa, 'presence:update');
  sb.disconnect();
  const p = await presence;
  check(p.userId === bob.user._id && p.isOnline === false && p.lastSeen, 'presence: Bob offline with last seen');

  const offline = await emit(sa, 'call:start', { chatId: chat._id, kind: 'audio' }).catch((e) => e);
  const bobChats = (await api('GET', '/api/chats', bob.token)).chats.find((c) => c._id === chat._id);
  check(/unavailable/i.test(offline.message) && bobChats.lastMessage.call.status === 'missed' && bobChats.unreadCount === 1, 'calling an offline user leaves a missed call (counted as unread)');

  sa.disconnect();
  sc.disconnect();
  console.log('\nAll checks passed ✅');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
