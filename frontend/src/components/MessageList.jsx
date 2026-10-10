import { useLayoutEffect, useRef, useState } from 'react'
import { useChat } from '../context/ChatContext'
import { formatDayLabel, idOf, isSameDay } from '../lib/format'
import { ChevronIcon, CloseIcon } from './Icons'
import MessageBubble from './MessageBubble'

const NEAR_BOTTOM = 150

export default function MessageList({ chat, onReply, onEdit }) {
  const { messages, loadMessages, meId } = useChat()
  const entry = messages[chat._id]
  const items = entry?.items || []
  const listRef = useRef(null)
  const snapshot = useRef({ first: null, last: null, height: 0 })
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [lightbox, setLightbox] = useState(null)

  // Keep the scroll position sensible as messages are added at either end
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || !items.length) return
    const first = items[0]._id
    const last = items[items.length - 1]
    const prev = snapshot.current

    if (!prev.last) {
      el.scrollTop = el.scrollHeight // first render of this chat
    } else if (first !== prev.first && last._id === prev.last) {
      el.scrollTop += el.scrollHeight - prev.height // older page prepended: stay in place
    } else if (last._id !== prev.last) {
      const nearBottom = prev.height - el.scrollTop - el.clientHeight < NEAR_BOTTOM
      if (nearBottom || idOf(last.sender) === meId) el.scrollTop = el.scrollHeight
    }
    snapshot.current = { first, last: last._id, height: el.scrollHeight }
  }, [items, meId])

  async function onScroll() {
    const el = listRef.current
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM)
    snapshot.current.height = el.scrollHeight
    if (el.scrollTop < 80 && entry?.hasMore && !loadingOlder) {
      setLoadingOlder(true)
      try {
        await loadMessages(chat._id, { older: true })
      } finally {
        setLoadingOlder(false)
      }
    }
  }

  const scrollToBottom = () => listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })

  return (
    <div className="message-area">
      <div className="message-list" ref={listRef} onScroll={onScroll}>
        {!entry?.loaded && <p className="loading-msgs">Loading messages…</p>}
        {loadingOlder && <p className="loading-msgs">Loading older messages…</p>}
        {entry?.loaded && !entry.hasMore && (
          <div className="system-msg encryption-note">
            <span>🔒 Messages are stored on your own server. Say hi!</span>
          </div>
        )}
        {items.map((message, i) => {
          const prev = items[i - 1]
          const newDay = !prev || !isSameDay(prev.createdAt, message.createdAt)
          const sameSender =
            prev && !newDay && prev.type !== 'system' && idOf(prev.sender) === idOf(message.sender)
          return (
            <div key={message.clientId || message._id} className={sameSender ? 'grouped' : 'first-in-group'}>
              {newDay && (
                <div className="day-separator">
                  <span>{formatDayLabel(message.createdAt)}</span>
                </div>
              )}
              <MessageBubble
                message={message}
                chat={chat}
                showSender={chat.type === 'group' && !sameSender}
                onReply={onReply}
                onEdit={onEdit}
                onOpenImage={setLightbox}
              />
            </div>
          )
        })}
      </div>
      {!atBottom && (
        <button className="scroll-bottom" onClick={scrollToBottom} aria-label="Scroll to latest">
          <ChevronIcon size={24} />
        </button>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="icon-btn lightbox-close" aria-label="Close">
            <CloseIcon />
          </button>
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
