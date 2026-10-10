# Chat App

A chat app with real-time messaging, group chats, media sharing and 1:1 voice/video calls.

**Live demo: https://jidxesh-chat.onrender.com**

> Hosted on Render's free plan: after 15 minutes without visitors the server sleeps, so the first load can take about a minute.

## Features

- **Messaging:** real-time text messages, replies, edit, delete for me or for everyone, emoji picker
- **Ticks like WhatsApp:** ✓ sent, grey ✓✓ delivered, blue ✓✓ read
- **Presence:** online / last seen, "typing…" indicators
- **Groups:** create groups, add/remove members, admins, group name, description and icon
- **Media:** photos, videos, audio and files with captions; full-screen image viewer
- **Calls:** 1:1 voice and video calls over WebRTC with ringing, mute, camera on/off and call history in the chat
- **Chats list:** unread badges, search, "Unread" filter, unread count in the browser tab title
- **Profile:** name, about, profile photo; block / unblock contacts
- **Design:** WhatsApp Web look, light and dark mode, works on phones

## Tech stack

| Part | Built with |
|---|---|
| [`frontend/`](frontend/README.md) | React 19, Vite, Socket.IO client, WebRTC, plain CSS |
| [`backend/`](backend/README.md) | Node.js, Express 5, Socket.IO, MongoDB (Mongoose), JWT auth, GridFS for uploads |
| Hosting | Render (API + static site), MongoDB Atlas |

## Run locally

Install once:

```bash
cd backend && npm install && cd ../frontend && npm install
```

Then, in separate terminals:

```bash
cd backend && npm run db     # MongoDB, data kept in backend/.mongo-data
cd backend && npm run seed   # optional: demo users and chats
cd backend && npm run dev    # API on http://localhost:4000
cd frontend && npm run dev   # app on http://localhost:5173
```

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env` first.
`cd backend && npm run test:smoke` runs an end-to-end test against the running API.

## Deploy

`render.yaml` deploys both parts on Render's free plan:

1. Create a free MongoDB Atlas cluster and allow access from anywhere (`0.0.0.0/0`).
2. In Render, choose **New → Blueprint** and pick this repo.
3. Paste the Atlas connection string as `MONGO_URI`.

Every push to `main` redeploys automatically.

- App: https://jidxesh-chat.onrender.com
- API: https://jidxesh-chat-api.onrender.com
