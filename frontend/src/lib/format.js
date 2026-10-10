const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

function isYesterday(date) {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return sameDay(date, y)
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// Timestamp shown in the chat list
export function formatListTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const now = new Date()
  if (sameDay(date, now)) return formatTime(date)
  if (isYesterday(date)) return 'Yesterday'
  if (now - date < 6 * 24 * 3600 * 1000) return date.toLocaleDateString([], { weekday: 'long' })
  return date.toLocaleDateString()
}

// Separator label between messages from different days
export function formatDayLabel(value) {
  const date = new Date(value)
  if (sameDay(date, new Date())) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatLastSeen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (sameDay(date, new Date())) return `last seen today at ${formatTime(date)}`
  if (isYesterday(date)) return `last seen yesterday at ${formatTime(date)}`
  return `last seen ${date.toLocaleDateString()} at ${formatTime(date)}`
}

export function isSameDay(a, b) {
  return sameDay(new Date(a), new Date(b))
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const idOf = (x) => String(x?._id ?? x)

// Display info for a chat from the current user's point of view
export function chatDisplay(chat, meId) {
  if (chat.type === 'group') return { name: chat.name, avatar: chat.avatar, other: null }
  const other = chat.participants.find((p) => idOf(p) !== meId) || chat.participants[0]
  return { name: other?.name || 'Unknown', avatar: other?.avatar, other }
}

export function formatDuration(seconds = 0) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(Math.floor(seconds % 60)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// Title + detail for a call log entry, from the viewer's point of view
export function callSummary(message, meId) {
  const { kind, status, duration } = message.call || {}
  const label = kind === 'video' ? 'Video call' : 'Voice call'
  const mine = idOf(message.sender) === meId
  if (status === 'completed') return { title: label, detail: formatDuration(duration), missed: false }
  if (mine) return { title: label, detail: status === 'declined' ? 'Declined' : 'No answer', missed: false }
  if (status === 'declined') return { title: label, detail: 'You declined', missed: false }
  return { title: `Missed ${label.toLowerCase()}`, detail: 'Tap to call back', missed: true }
}

// Short preview of a message for the chat list / reply quotes
export function messagePreview(message, meId) {
  if (!message) return ''
  if (message.deletedForEveryone) return '🚫 This message was deleted'
  if (message.type === 'call') {
    const { title, detail } = callSummary(message, meId)
    return `${message.call?.kind === 'video' ? '🎥' : '📞'} ${title}${message.call?.status === 'completed' ? ` · ${detail}` : ''}`
  }
  const labels = { image: '📷 Photo', video: '🎥 Video', audio: '🎵 Audio', file: '📄 File' }
  if (labels[message.type]) return message.content ? `${labels[message.type]} · ${message.content}` : labels[message.type]
  return message.content
}

// sent | delivered | read | pending | failed — for the sender's ticks
export function messageStatus(message, chat, meId) {
  if (message.failed) return 'failed'
  if (message.pending) return 'pending'
  const others = chat.participants.map(idOf).filter((id) => id !== meId)
  if (!others.length) return 'read'
  const has = (list = []) => others.every((id) => list.some((r) => idOf(r.user) === id))
  if (has(message.readBy)) return 'read'
  if (has(message.deliveredTo)) return 'delivered'
  return 'sent'
}
