const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// Shared by REST middleware and Socket.IO handshake
async function userFromToken(token) {
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(id);
  } catch {
    return null;
  }
}

async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = await userFromToken(token);
  if (!user) return res.status(401).json({ message: 'Not authorized' });
  req.user = user;
  next();
}

module.exports = { protect, signToken, userFromToken };
