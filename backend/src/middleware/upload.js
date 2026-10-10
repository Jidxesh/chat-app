const multer = require('multer');
const { saveFile } = require('../services/fileStore');

// Files are kept in memory briefly, then saved to MongoDB by storeUpload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// Runs after upload.single(): saves req.file and sets req.file.url
async function storeUpload(req, _res, next) {
  if (req.file) req.file.url = await saveFile(req.file);
  next();
}

// Map a MIME type to a message type
function mediaType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}

module.exports = { upload, storeUpload, mediaType };
