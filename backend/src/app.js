const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { notFound, errorHandler } = require('./middleware/error');
const { corsOrigin } = require('./config/cors');
const { serveFile } = require('./services/fileStore');

const app = express();
app.set('trust proxy', 1); // behind Render's / other hosts' HTTPS proxy

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // let the frontend load /uploads
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Files saved to disk by older versions, then files stored in MongoDB
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.get('/uploads/:filename', serveFile);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/calls', require('./routes/calls'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
