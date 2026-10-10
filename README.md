# Chat App

A WhatsApp-style chat app: real-time messaging, groups, photos/videos/files, read receipts,
online/last seen, and 1:1 voice and video calls.

| Folder | What it is |
|---|---|
| [`backend/`](backend/README.md) | Express 5 + Socket.IO + MongoDB API (auth, chats, messages, call signaling) |
| [`frontend/`](frontend/README.md) | React 19 + Vite client with a WhatsApp Web look |

## Run locally

Install once:

```bash
cd backend && npm install && cd ../frontend && npm install
```

Then, in three terminals:

```bash
cd backend && npm run db     # MongoDB, data kept in backend/.mongo-data
cd backend && npm run seed   # optional: demo users and chats
cd backend && npm run dev    # API on http://localhost:4000
cd frontend && npm run dev   # app on http://localhost:5173
```

## Deploy

`render.yaml` deploys both halves on Render's free plan. Create a free MongoDB Atlas cluster, then in Render
choose **New → Blueprint**, pick this repo, and paste the Atlas connection string as `MONGO_URI`.

- App: https://jidxesh-chat.onrender.com
- API: https://jidxesh-chat-api.onrender.com
