const Chat = require('../models/Chat');
const Message = require('../models/Message');
const { HttpError } = require('../middleware/error');

const USER_FIELDS = 'name phone avatar about isOnline lastSeen';

function populateChat(query) {
  return query
    .populate('participants', USER_FIELDS)
    .populate('admins', 'name')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name' },
    });
}

// Loads a chat and makes sure the user belongs to it
async function getChatForMember(chatId, userId) {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.hasMember(userId)) throw new HttpError(404, 'Chat not found');
  return chat;
}

function unreadCount(chatId, userId) {
  return Message.countDocuments({
    chat: chatId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
    deletedFor: { $ne: userId },
    // System notices and answered/declined calls don't count as unread; missed calls do
    $nor: [{ type: 'system' }, { type: 'call', 'call.status': { $ne: 'missed' } }],
  });
}

module.exports = { USER_FIELDS, populateChat, getChatForMember, unreadCount };
