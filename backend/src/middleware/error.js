class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Server error';

  if (err.name === 'ValidationError') status = 400;
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}`;
  }
  if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue).join(', ')} already in use`;
  }
  if (err.name === 'MulterError' || err instanceof SyntaxError) status = 400;

  if (status === 500) console.error(err);
  res.status(status).json({ message });
}

module.exports = { HttpError, notFound, errorHandler };
