const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const receiptSchema = new mongoose.Schema(
  { user: { type: ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    chat: { type: ObjectId, ref: 'Chat', required: true },
    sender: { type: ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file', 'system', 'call'],
      default: 'text',
    },
    content: { type: String, default: '' },
    media: {
      url: String,
      name: String,
      size: Number,
      mimeType: String,
    },
    // Call log entries (type 'call'); sender is the caller
    call: {
      kind: { type: String, enum: ['audio', 'video'] },
      status: { type: String, enum: ['completed', 'missed', 'declined'] },
      duration: Number, // seconds, for completed calls
    },
    replyTo: { type: ObjectId, ref: 'Message' },
    deliveredTo: [receiptSchema],
    readBy: [receiptSchema],
    deletedFor: [{ type: ObjectId, ref: 'User' }],
    deletedForEveryone: { type: Boolean, default: false },
    editedAt: Date,
  },
  { timestamps: true }
);

messageSchema.index({ chat: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
