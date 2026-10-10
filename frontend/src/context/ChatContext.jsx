import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { api, API_URL, getToken } from '../lib/api'
import { idOf } from '../lib/format'
import { useAuth } from './AuthContext'
import { chatReducer, initialState } from './chatReducer'

const ChatContext = createContext(null)
const PAGE_SIZE = 30

const typeFromMime = (mime = '') =>
  ['image', 'video', 'audio'].find((t) => mime.startsWith(`${t}/`)) || 'file'

const newClientId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function ChatProvider({ children }) {
  const { user, logout } = useAuth()
  const [state, dispatch] = useReducer(chatReducer, initialState)
  const socketRef = useRef(null)
  const [socket, setSocket] = useState(null) // exposed so the call layer can listen too
  const stateRef = useRef(state)
  const typingTimers = useRef({})
  stateRef.current = state
  const meId = user?._id

  const isViewing = (chatId) => stateRef.current.activeChatId === chatId && document.visibilityState === 'visible'

  const loadChats = useCallback(async () => {
    const { chats } = await api('/chats')
    dispatch({ type: 'CHATS_LOADED', chats })
  }, [])

  const loadMessages = useCallback(async (chatId, { older = false } = {}) => {
    const entry = stateRef.current.messages[chatId]
    const oldest = entry?.items.find((m) => !m.pending && !m.failed)
    const params = new URLSearchParams({ limit: PAGE_SIZE })
    if (older && oldest) params.set('before', oldest.createdAt)
    const { messages } = await api(`/messages/${chatId}?${params}`)
    dispatch({ type: 'MESSAGES_LOADED', chatId, messages, older, hasMore: messages.length === PAGE_SIZE })
  }, [])

  // ---- Socket lifecycle ----
  useEffect(() => {
    if (!meId) return undefined
    const socket = io(API_URL, { auth: { token: getToken() } })
    socketRef.current = socket
    setSocket(socket)

    socket.on('connect', () => {
      dispatch({ type: 'CONNECTED', value: true })
      // Catch up on anything missed while disconnected
      loadChats().catch(console.error)
      Object.keys(stateRef.current.messages).forEach((chatId) => loadMessages(chatId).catch(console.error))
    })
    socket.on('disconnect', () => dispatch({ type: 'CONNECTED', value: false }))
    socket.on('connect_error', (err) => {
      if (err.message === 'Unauthorized') logout()
    })

    socket.on('message:new', (message) => {
      const chatId = idOf(message.chat)
      const fromOther = idOf(message.sender) !== meId && message.type !== 'system'
      const viewing = isViewing(chatId)
      // Like WhatsApp, only missed calls count as unread — not answered or declined ones
      const countsAsUnread = message.type !== 'call' || message.call?.status === 'missed'
      dispatch({ type: 'MESSAGE_ADD', message, incrementUnread: fromOther && !viewing && countsAsUnread })

      if (!stateRef.current.chats.some((c) => c._id === chatId)) loadChats().catch(console.error)
      if (fromOther) {
        if (viewing) socket.emit('chat:read', { chatId })
        else socket.emit('message:delivered', { messageIds: [message._id] })
      }
    })
    socket.on('message:edited', (message) => dispatch({ type: 'MESSAGE_UPDATE', message }))
    socket.on('message:deleted', ({ chatId, messageId, forEveryone }) =>
      dispatch({ type: 'MESSAGE_DELETED', chatId: idOf(chatId), messageId: idOf(messageId), forEveryone })
    )
    socket.on('message:delivered', ({ chatId, messageId, userId }) =>
      dispatch({ type: 'DELIVERED', chatId: idOf(chatId), messageId: idOf(messageId), userId, at: new Date() })
    )
    socket.on('chat:read', ({ chatId, userId, messageIds, at }) =>
      dispatch({ type: 'READ', chatId: idOf(chatId), userId, messageIds, at, isMe: userId === meId })
    )

    socket.on('typing:start', ({ chatId, userId, name }) => {
      dispatch({ type: 'TYPING', chatId, userId, name })
      // Clear automatically in case the stop event never arrives
      const key = `${chatId}:${userId}`
      clearTimeout(typingTimers.current[key])
      typingTimers.current[key] = setTimeout(() => dispatch({ type: 'TYPING', chatId, userId }), 5000)
    })
    socket.on('typing:stop', ({ chatId, userId }) => {
      clearTimeout(typingTimers.current[`${chatId}:${userId}`])
      dispatch({ type: 'TYPING', chatId, userId })
    })

    socket.on('presence:update', ({ userId, isOnline, lastSeen }) =>
      dispatch({ type: 'PRESENCE', userId, isOnline, lastSeen })
    )
    socket.on('chat:updated', (chat) => dispatch({ type: 'UPSERT_CHAT', chat }))
    socket.on('chat:removed', ({ chatId }) => dispatch({ type: 'REMOVE_CHAT', chatId: idOf(chatId) }))

    const timers = typingTimers.current
    return () => {
      socket.disconnect()
      socketRef.current = null
      setSocket(null)
      Object.values(timers).forEach(clearTimeout)
      dispatch({ type: 'RESET' })
    }
  }, [meId, loadChats, loadMessages, logout])

  // Mark the open chat as read when the tab comes back into focus
  useEffect(() => {
    const onVisible = () => {
      const { activeChatId, chats } = stateRef.current
      const chat = chats.find((c) => c._id === activeChatId)
      if (document.visibilityState === 'visible' && chat?.unreadCount) {
        socketRef.current?.emit('chat:read', { chatId: activeChatId })
        dispatch({ type: 'SET_ACTIVE', chatId: activeChatId })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Unread total in the tab title, like WhatsApp Web
  useEffect(() => {
    const total = state.chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
    document.title = total ? `(${total}) Chat` : 'Chat'
  }, [state.chats])

  // ---- Actions ----
  const openChat = useCallback(
    (chatId) => {
      dispatch({ type: 'SET_ACTIVE', chatId })
      if (!chatId) return
      if (!stateRef.current.messages[chatId]?.loaded) loadMessages(chatId).catch(console.error)
      socketRef.current?.emit('chat:read', { chatId })
    },
    [loadMessages]
  )

  const me = useMemo(() => user && { _id: user._id, name: user.name, avatar: user.avatar }, [user])

  const optimistic = useCallback(
    (chatId, fields) => {
      const clientId = newClientId()
      const message = {
        _id: clientId,
        clientId,
        chat: chatId,
        sender: me,
        type: 'text',
        content: '',
        createdAt: new Date().toISOString(),
        readBy: [],
        deliveredTo: [],
        pending: true,
        ...fields,
      }
      dispatch({ type: 'MESSAGE_ADD', message })
      return clientId
    },
    [me]
  )

  const sendText = useCallback(
    (chatId, content, replyTo) => {
      const clientId = optimistic(chatId, { content, replyTo })
      socketRef.current?.emit(
        'message:send',
        { chatId, content, replyTo: replyTo?._id, clientId },
        (res) => {
          if (res.ok) dispatch({ type: 'MESSAGE_ADD', message: { ...res.data, clientId } })
          else dispatch({ type: 'MESSAGE_FAILED', chatId, clientId })
        }
      )
    },
    [optimistic]
  )

  const sendFile = useCallback(
    async (chatId, file, caption, replyTo) => {
      const clientId = optimistic(chatId, {
        type: typeFromMime(file.type),
        content: caption,
        replyTo,
        media: { url: URL.createObjectURL(file), name: file.name, size: file.size, mimeType: file.type },
      })
      const form = new FormData()
      form.append('file', file)
      form.append('content', caption)
      form.append('clientId', clientId)
      if (replyTo) form.append('replyTo', replyTo._id)
      try {
        const { message } = await api(`/messages/${chatId}`, { method: 'POST', form })
        dispatch({ type: 'MESSAGE_ADD', message: { ...message, clientId } })
      } catch (err) {
        console.error(err)
        dispatch({ type: 'MESSAGE_FAILED', chatId, clientId })
      }
    },
    [optimistic]
  )

  const emitAck = (event, payload) =>
    new Promise((resolve, reject) => {
      socketRef.current?.emit(event, payload, (res) => (res.ok ? resolve(res.data) : reject(new Error(res.error))))
    })

  const editMessage = useCallback((messageId, content) => emitAck('message:edit', { messageId, content }), [])
  const deleteMessage = useCallback(
    (messageId, forEveryone) => emitAck('message:delete', { messageId, forEveryone }),
    []
  )
  const discardFailed = useCallback(
    (chatId, messageId) => dispatch({ type: 'MESSAGE_DELETED', chatId, messageId, forEveryone: false }),
    []
  )

  const setTyping = useCallback((chatId, typing) => {
    socketRef.current?.emit(typing ? 'typing:start' : 'typing:stop', { chatId })
  }, [])

  const upsertChat = useCallback((chat) => dispatch({ type: 'UPSERT_CHAT', chat }), [])
  const removeChat = useCallback((chatId) => dispatch({ type: 'REMOVE_CHAT', chatId }), [])

  const startDirectChat = useCallback(
    async (userId) => {
      const { chat } = await api('/chats/direct', { method: 'POST', body: { userId } })
      upsertChat(chat)
      openChat(chat._id)
    },
    [upsertChat, openChat]
  )

  const createGroup = useCallback(
    async ({ name, description, participants, avatar }) => {
      const form = new FormData()
      form.append('name', name)
      form.append('description', description || '')
      form.append('participants', JSON.stringify(participants))
      if (avatar) form.append('avatar', avatar)
      const { chat } = await api('/chats/group', { method: 'POST', form })
      upsertChat(chat)
      openChat(chat._id)
    },
    [upsertChat, openChat]
  )

  const value = {
    ...state,
    socket,
    meId,
    activeChat: state.chats.find((c) => c._id === state.activeChatId) || null,
    openChat,
    loadMessages,
    sendText,
    sendFile,
    editMessage,
    deleteMessage,
    discardFailed,
    setTyping,
    upsertChat,
    removeChat,
    startDirectChat,
    createGroup,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export const useChat = () => useContext(ChatContext)
