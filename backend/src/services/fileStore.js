// Uploaded files are stored in MongoDB (GridFS) rather than on disk, because hosts
// like Render wipe the local disk on every restart/deploy.
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

let bucket;
function getBucket() {
  if (!bucket) bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
  return bucket;
}

// Saves a multer memory-storage file and returns its public URL path
function saveFile(file) {
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  return new Promise((resolve, reject) => {
    const stream = getBucket().openUploadStream(filename, {
      metadata: { contentType: file.mimetype, originalName: file.originalname },
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve(`/uploads/${filename}`));
    stream.end(file.buffer);
  });
}

// Express handler for GET /uploads/:filename (supports Range so videos can seek)
async function serveFile(req, res, next) {
  const [file] = await getBucket().find({ filename: req.params.filename }).limit(1).toArray();
  if (!file) return next();

  const type = file.metadata?.contentType || 'application/octet-stream';
  res.set({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Never let an uploaded file run as a page on our origin
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    'X-Content-Type-Options': 'nosniff',
  });
  if (!/^(image|video|audio)\//.test(type)) {
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.metadata?.originalName || file.filename)}"`);
  }

  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  let start = 0;
  let end = file.length - 1;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else {
      start = Math.max(file.length - Number(range[2]), 0); // suffix range: last N bytes
    }
    if (start > end || start >= file.length) {
      return res.status(416).set('Content-Range', `bytes */${file.length}`).end();
    }
    res.status(206).set('Content-Range', `bytes ${start}-${end}/${file.length}`);
  }
  res.set('Content-Length', end - start + 1);
  if (req.method === 'HEAD') return res.end();

  getBucket()
    .openDownloadStream(file._id, { start, end: end + 1 })
    .on('error', next)
    .pipe(res);
}

module.exports = { saveFile, serveFile };
