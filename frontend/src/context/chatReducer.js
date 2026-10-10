import { idOf } from '../lib/format'

export const initialState = {
  chats: [],
  chatsLoaded: false,
  activeChatId: null,
  messages: {}, // chatId -> { items, hasMore, loaded }
  typing: {}, // chatId -> { userId: name }
  connected: false,
}

const activity = (chat) => new Date(chat.lastMessage?.createdAt || chat.updatedAt).getTime()
const sortChats = (chats) => [...chats].sort((a, b) => activity(b) - activity(a))

function mapChat(state, chatId, fn) {
  return { ...state, chats: state.chats.map((c) => (c._id === chatId ? fn(c) : c)) }
}

function mapMessages(state, chatId, fn) {
  const entry = state.messages[chatId]
  if (!entry) return state
  return { ...state, messages: { ...state.messages, [chatId]: { ...entry, items: fn(entry.items) } } }
}

const addReceipt = (list = [], userId, at) =>
  list.some((r) => idOf(r.user) === userId) ? list : [...list, { user: userId, at }]

export function chatReducer(state, action) {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, connected: action.value }

    case 'CHATS_LOADED':
      return { ...state, chats: sortChats(action.chats), chatsLoaded: true }

    case 'UPSERT_CHAT': {
      const existing = state.chats.find((c) => c._id === action.chat._id)
      const chat = {
        ...action.chat,
        unreadCount: existing?.unreadCount ?? action.chat.unreadCount ?? 0,
      }
      const others = state.chats.filter((c) => c._id !== chat._id)
      return { ...state, chats: sortChats([chat, ...others]) }
    }

    case 'REMOVE_CHAT': {
      const { [action.chatId]: _removed, ...messages } = state.messages
      return {
        ...state,
        chats: state.chats.filter((c) => c._id !== action.chatId),
        messages,
        activeChatId: state.activeChatId === action.chatId ? null : state.activeChatId,
      }
    }

    case 'SET_ACTIVE': {
      const next = { ...state, activeChatId: action.chatId }
      return action.chatId ? mapChat(next, action.chatId, (c) => ({ ...c, unreadCount: 0 })) : next
    }

    case 'MESSAGES_LOADED': {
      const prev = state.messages[action.chatId]
      const items = action.older && prev ? [...action.messages, ...prev.items] : action.messages
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatId]: { items, hasMore: action.hasMore, loaded: true },
        },
      }
    }

    case 'MESSAGE_ADD': {
      const { message } = action
      const chatId = idOf(message.chat)
      let next = state
      const entry = state.messages[chatId]
      if (entry) {
        const idx = entry.items.findIndex(
          (m) => m._id === message._id || (message.clientId && m.clientId === message.clientId)
        )
        const items = [...entry.items]
        if (idx >= 0) items[idx] = { ...message, clientId: items[idx].clientId }
        else items.push(message)
        next = { ...state, messages: { ...state.messages, [chatId]: { ...entry, items } } }
      }
      const chat = next.chats.find((c) => c._id === chatId)
      if (!chat) return next
      const isNewer = !chat.lastMessage || new Date(message.createdAt) >= new Date(chat.lastMessage.createdAt)
      const updated = {
        ...chat,
        lastMessage: isNewer ? message : chat.lastMessage,
        unreadCount: chat.unreadCount + (action.incrementUnread ? 1 : 0),
      }
      return { ...next, chats: sortChats(next.chats.map((c) => (c._id === chatId ? updated : c))) }
    }

    case 'MESSAGE_UPDATE': {
      const { message } = action
      const chatId = idOf(message.chat)
      const next = mapMessages(state, chatId, (items) =>
        items.map((m) => (m._id === message._id ? { ...m, ...message } : m))
      )
      return mapChat(next, chatId, (c) =>
        c.lastMessage?._id === message._id ? { ...c, lastMessage: { ...c.lastMessage, ...message } } : c
      )
    }

    case 'MESSAGE_FAILED':
      return mapMessages(state, action.chatId, (items) =>
        items.map((m) => (m.clientId === action.clientId && m.pending ? { ...m, pending: false, failed: true } : m))
      )

    case 'MESSAGE_DELETED': {
      const { chatId, messageId, forEveryone } = action
      if (!forEveryone) {
        return mapMessages(state, chatId, (items) => items.filter((m) => m._id !== messageId))
      }
      const wipe = (m) => ({ ...m, deletedForEveryone: true, content: '', media: undefined, replyTo: undefined })
      const next = mapMessages(state, chatId, (items) => items.map((m) => (m._id === messageId ? wipe(m) : m)))
      return mapChat(next, chatId, (c) =>
        c.lastMessage?._id === messageId ? { ...c, lastMessage: wipe(c.lastMessage) } : c
      )
    }

    case 'DELIVERED':
      return mapMessages(state, action.chatId, (items) =>
        items.map((m) =>
          m._id === action.messageId
            ? { ...m, deliveredTo: addReceipt(m.deliveredTo, action.userId, action.at) }
            : m
        )
      )

    case 'READ': {
      const ids = new Set(action.messageIds.map(String))
      let next = mapMessages(state, action.chatId, (items) =>
        items.map((m) =>
          ids.has(m._id)
            ? {
                ...m,
                readBy: addReceipt(m.readBy, action.userId, action.at),
                deliveredTo: addReceipt(m.deliveredTo, action.userId, action.at),
              }
            : m
        )
      )
      if (action.isMe) next = mapChat(next, action.chatId, (c) => ({ ...c, unreadCount: 0 }))
      return next
    }

    case 'TYPING': {
      const current = { ...(state.typing[action.chatId] || {}) }
      if (action.name) current[action.userId] = action.name
      else delete current[action.userId]
      return { ...state, typing: { ...state.typing, [action.chatId]: current } }
    }

    case 'PRESENCE': {
      const patch = (p) =>
        idOf(p) === action.userId
          ? { ...p, isOnline: action.isOnline, ...(action.lastSeen && { lastSeen: action.lastSeen }) }
          : p
      return { ...state, chats: state.chats.map((c) => ({ ...c, participants: c.participants.map(patch) })) }
    }

    case 'RESET':
      return initialState

    default:
      return state
  }
}
