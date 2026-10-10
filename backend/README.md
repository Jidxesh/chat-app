# Chat Backend

A WhatsApp-style chat backend built with **Express 5**, **Socket.IO** and **MongoDB (Mongoose)**.

**Features:** phone + password auth (JWT), 1:1 and group chats, 1:1 voice and video calls (WebRTC), real-time messages, typing indicators,
online / last seen, delivered and read receipts (✓✓), replies, edit, delete for me or for everyone,
image/video/audio/file messages, unread counts, contacts, blocking, and group admin controls.

## Getting started

```bash
npm install
cp .env.example .env      # then set JWT_SECRET
npm run dev               # http://localhost:4000
```

MongoDB has to be running at `MONGO_URI` (by default `mongodb://127.0.0.1:27017/chat_app`).

> Port 5000 is used by AirPlay Receiver on macOS, so this project uses **4000**.

- `npm run seed` creates demo users (phones `1111111111`, `2222222222`, `3333333333`) plus a 1:1 chat and a group. The password is in `scripts/seed-demo.js`.
- While the server is running, `npm run test:smoke` runs an end-to-end test. It creates test users in your database.

The React client is in `../frontend`.

## Project structure

```
src/
  server.js              starts HTTP + Socket.IO
  app.js                 Express app and routes
  config/db.js
  middleware/            auth (JWT), upload (multer), error handling
  models/                User, Chat, Message
  services/              chat + message logic shared by REST and sockets
  routes/                auth, users, chats, messages
  socket/index.js        real-time events and presence
uploads/                 uploaded files, served at /uploads/<file>
```

## REST API

Every route except register and login needs the header `Authorization: Bearer <token>`.

| Method | Route | Body / notes |
|---|---|---|
| POST | `/api/auth/register` | `{ name, phone, password }` → `{ token, user }` |
| POST | `/api/auth/login` | `{ phone, password }` → `{ token, user }` |
| GET | `/api/auth/me` | current user |
| GET | `/api/users/search?q=` | search users by name or phone |
| PATCH | `/api/users/me` | `{ name?, about? }`, multipart `avatar` optional |
| GET / POST | `/api/users/contacts` | list contacts / add by `{ phone }` |
| DELETE | `/api/users/contacts/:userId` | remove contact |
| POST / DELETE | `/api/users/:userId/block` | block / unblock |
| GET | `/api/users/:userId` | public profile |
| GET | `/api/chats` | my chats, newest first, with `lastMessage` and `unreadCount` |
| POST | `/api/chats/direct` | `{ userId }` opens the 1:1 chat, creating it if needed |
| POST | `/api/chats/group` | `{ name, participants: [userId], description? }`, multipart `avatar` optional |
| GET | `/api/chats/:chatId` | chat details |
| PATCH | `/api/chats/:chatId` | edit group name, description or avatar (admin) |
| POST | `/api/chats/:chatId/members` | `{ userIds: [] }` add members (admin) |
| DELETE | `/api/chats/:chatId/members/:userId` | remove a member (admin), or your own id to leave |
| POST / DELETE | `/api/chats/:chatId/admins/:userId` | promote / demote an admin |
| GET | `/api/messages/:chatId?before=<ISO date>&limit=30` | history, oldest → newest. For older pages, pass the first message's `createdAt` as `before` |
| POST | `/api/messages/:chatId` | `{ content, replyTo? }`, or multipart `file` with an optional `content` caption |
| PATCH | `/api/messages/item/:messageId` | `{ content }` edit your own text message |
| DELETE | `/api/messages/item/:messageId?forEveryone=true` | delete for me or for everyone |
| POST | `/api/messages/:chatId/read` | mark the chat as read |
| GET | `/api/calls/ice-servers` | STUN/TURN servers for WebRTC calls |

Errors look like `{ "message": "..." }` and use a matching HTTP status.

## Socket.IO

Connect with the JWT:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:4000', { auth: { token } });
```

On connect, the socket joins the rooms for all of the user's chats, and messages sent while the user was offline are marked delivered. New chats are joined automatically.

### Client → server

Events take an optional ack callback that receives `{ ok: true, data }` or `{ ok: false, error }`.

| Event | Payload |
|---|---|
| `message:send` | `{ chatId, content, type?, media?, replyTo?, clientId? }` |
| `message:edit` | `{ messageId, content }` |
| `message:delete` | `{ messageId, forEveryone }` |
| `message:delivered` | `{ messageIds: [] }`, sent when messages arrive on the device |
| `chat:read` | `{ chatId }`, sent when the user opens the chat |
| `typing:start` / `typing:stop` | `{ chatId }` |

For media, upload the file with `POST /api/messages/:chatId`. That route saves the message and broadcasts it.

### Server → client

| Event | Payload |
|---|---|
| `message:new` | the message, plus your `clientId` so you can replace the optimistic copy |
| `message:edited` | the updated message |
| `message:deleted` | `{ messageId, chatId, forEveryone }` |
| `message:delivered` | `{ messageId, chatId, userId }`: show grey ✓✓ |
| `chat:read` | `{ chatId, userId, messageIds, at }`: show blue ✓✓ |
| `typing:start` / `typing:stop` | `{ chatId, userId, name? }` |
| `presence:update` | `{ userId, isOnline, lastSeen? }` |
| `chat:updated` | the full chat after group changes |
| `chat:removed` | `{ chatId }`: you were removed or you left |

### Message ticks

- ✓ sent: the server returned the message
- ✓✓ grey: every other participant appears in `deliveredTo`
- ✓✓ blue: every other participant appears in `readBy`

## Voice and video calls

Calls are 1:1 and use WebRTC, so audio and video travel directly between the two browsers. The server only rings the other person, relays the WebRTC setup messages, and writes a `type: 'call'` message to the chat when the call ends. That message has `call: { kind, status: completed | missed | declined, duration }`. Missed calls count as unread; answered and declined calls don't.

| Client → server | Payload | Notes |
|---|---|---|
| `call:start` | `{ chatId, kind: 'audio' \| 'video' }` | ack `{ callId }`. Fails with code `busy` or `unavailable` (callee offline), and the callee gets a missed call |
| `call:accept` / `call:decline` | `{ callId }` | sent by the callee |
| `call:end` | `{ callId }` | either side. Before the call is answered this counts as a cancel and becomes a missed call |
| `call:signal` | `{ callId, sdp }` or `{ callId, candidate }` | relayed to the other side |
| `call:media` | `{ callId, audio, video }` | relayed so the other side can show "Muted" or "Camera is off" |

| Server → client | Payload |
|---|---|
| `call:incoming` | `{ callId, chatId, kind, from }`, sent to all of the callee's devices |
| `call:accepted` | `{ callId }`, sent to the caller |
| `call:signal` / `call:media` | same as above |
| `call:ended` | `{ callId, reason }`: `ended`, `cancelled`, `declined`, `no_answer` (rings for 45 s), `disconnected`, `answered_elsewhere` |

**Calls across different networks:** STUN is enough on the same network. Calls between different networks (mobile data, office firewalls) need a TURN server, such as self-hosted coturn or a hosted one like Twilio or Metered. Set `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` in `.env`.

**HTTPS:** browsers only allow the camera and microphone on `https://` pages or `localhost`. Once the app is deployed, it needs HTTPS.

`CLIENT_URL` accepts a comma-separated list of allowed frontend origins.
