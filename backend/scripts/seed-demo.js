// Creates demo users and chats so you can try the app right away: `npm run seed`
// Log in with any phone below and the shared password.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Chat = require('../src/models/Chat');
const Message = require('../src/models/Message');

const PASSWORD = 'demo1234';
const USERS = [
  { name: 'Alice Sharma', phone: '1111111111', about: 'Available' },
  { name: 'Bob Mehta', phone: '2222222222', about: 'At the gym 🏋️' },
  { name: 'Charlie Patil', phone: '3333333333', about: 'Busy' },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const users = [];
  for (const data of USERS) {
    let user = await User.findOne({ phone: data.phone });
    if (!user) user = await User.create({ ...data, password: PASSWORD });
    users.push(user);
  }
  const [alice, bob, charlie] = users;

  const ago = (min) => new Date(Date.now() - min * 60 * 1000);
  const addMessages = async (chat, lines) => {
    if (await Message.exists({ chat: chat._id })) return;
    let last;
    for (const [sender, content, minutesAgo] of lines) {
      const others = chat.participants.map((p) => ({ user: p, at: ago(minutesAgo) }));
      last = await Message.create({
        chat: chat._id,
        sender: sender._id,
        content,
        deliveredTo: others,
        readBy: others,
        createdAt: ago(minutesAgo),
      });
    }
    chat.lastMessage = last._id;
    await chat.save();
  };

  let direct = await Chat.findOne({ type: 'direct', participants: { $all: [alice._id, bob._id], $size: 2 } });
  if (!direct) direct = await Chat.create({ type: 'direct', participants: [alice._id, bob._id] });
  await addMessages(direct, [
    [bob, 'Hey Alice! Are we still on for tomorrow?', 30],
    [alice, 'Yes! 10am at the café 👍', 28],
    [bob, 'Perfect, see you there', 27],
  ]);

  let group = await Chat.findOne({ type: 'group', name: 'Weekend Trip' });
  if (!group) {
    group = await Chat.create({
      type: 'group',
      name: 'Weekend Trip',
      description: 'Planning the trip to Lonavala',
      participants: [alice._id, bob._id, charlie._id],
      admins: [alice._id],
      createdBy: alice._id,
    });
  }
  await addMessages(group, [
    [alice, 'Who is in for Saturday?', 20],
    [charlie, 'Me! 🙋', 18],
    [bob, 'Count me in too', 15],
  ]);

  console.log(`Demo data ready. Log in with phone ${USERS.map((u) => u.phone).join(' / ')} and password "${PASSWORD}"`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
