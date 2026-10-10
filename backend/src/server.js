require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');

const PORT = process.env.PORT || 4000;

async function start() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set (see .env.example)');
  await connectDB();

  const server = http.createServer(app);
  initSocket(server);
  server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
