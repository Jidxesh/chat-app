const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const chatSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    participants: [{ type: ObjectId, ref: 'User', required: true }],
    // group-only fields
    name: { type: String, trim: true },
    description: { type: String, default: '' },
    avatar: { type: String, default: '' },
    admins: [{ type: ObjectId, ref: 'User' }],
    createdBy: { type: ObjectId, ref: 'User' },
    lastMessage: { type: ObjectId, ref: 'Message' },
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1, updatedAt: -1 });

chatSchema.methods.hasMember = function (userId) {
  return this.participants.some((p) => String(p._id || p) === String(userId));
};

chatSchema.methods.isAdmin = function (userId) {
  return this.admins.some((a) => String(a._id || a) === String(userId));
};

module.exports = mongoose.model('Chat', chatSchema);
