const express = require('express');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET /api/calls/ice-servers — STUN/TURN servers for WebRTC.
// STUN is enough on the same network; calls across strict NATs/mobile data need a TURN server.
router.get('/ice-servers', protect, (_req, res) => {
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(','),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  res.json({ iceServers });
});

module.exports = router;
