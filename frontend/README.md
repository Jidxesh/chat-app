# Chat Frontend

A WhatsApp Web-style client for the Chat Backend, built with **React 19 + Vite** and **Socket.IO**.

**Features:** 1:1 voice and video calls (ringing, accept/decline, mute, camera on/off, call history in the chat), login / sign up, chat list with unread badges and "typing…", 1:1 and group chats,
real-time messages, ✓ / grey ✓✓ / blue ✓✓ ticks, online and last seen, replies, edit, delete for me or for everyone,
photo / video / audio / file messages with captions, emoji picker, image viewer, group info and admin controls,
profile editing, blocking, light and dark mode (follows your system), and a phone layout.

## Run it

Start the backend first (see `../backend/README.md`), then:

```bash
npm install
cp .env.example .env   # VITE_API_URL points at the backend, default http://localhost:4000
npm run dev            # http://localhost:5173
```

Run `npm run seed` in the backend to get demo users and chats. To watch messages arrive live, log in as two different users in two browser windows, one of them private/incognito.

## Structure

```
src/
  main.jsx, App.jsx        app shell: auth gate → chat layout
  index.css                all styles (WhatsApp look, light + dark, mobile)
  lib/api.js               fetch wrapper, token storage, media URLs
  lib/format.js            time formatting, previews, tick status
  context/AuthContext.jsx  logged-in user
  context/ChatContext.jsx  socket connection + actions (send, edit, delete, open chat…)
  context/chatReducer.js   all chat / message state updates
  context/CallContext.jsx  WebRTC calls: ringing, peer connection, mute/camera
  lib/tones.js             ringtones generated with Web Audio (no sound files)
  components/              Sidebar, ChatWindow, MessageList, MessageBubble, Composer,
                           InfoPanel, ProfilePanel, NewChatPanel, NewGroupPanel, …
```

Messages appear right away with a clock icon. When the server confirms them, they're matched up by a `clientId`.

Calls need camera and microphone permission, which browsers only allow on `https://` or `localhost`. To test a call on one computer, use two browser windows, one of them private/incognito.
