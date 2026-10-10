import { useEffect, useRef, useState } from 'react'
import { useChat } from '../context/ChatContext'
import { useCall } from '../context/CallContext'
import { mediaUrl } from '../lib/api'
import { callSummary, formatBytes, formatTime, idOf, messagePreview, messageStatus } from '../lib/format'
import { ChevronIcon, FileIcon, PhoneIcon, Ticks, VideoIcon } from './Icons'

const NAME_COLORS = ['#06cf9c', '#53bdeb', '#ff7eb6', '#ffbc38', '#a791f8', '#fc8f6a', '#25d366', '#e26ab6']
const nameColor = (id = '') => NAME_COLORS[parseInt(id.slice(-4), 16) % NAME_COLORS.length || 0]

function Media({ message, onOpenImage }) {
  const { type, media } = message
  const url = mediaUrl(media?.url)
  if (type === 'image') {
    return <img className="msg-image" src={url} alt={media.name} onClick={() => onOpenImage(url)} />
  }
  if (type === 'video') return <video className="msg-video" src={url} controls preload="metadata" />
  if (type === 'audio') return <audio className="msg-audio" src={url} controls preload="metadata" />
  return (
    <a className="msg-file" href={url} target="_blank" rel="noreferrer" download={media?.name}>
      <FileIcon size={30} />
      <span>
        <strong>{media?.name}</strong>
        <small>{formatBytes(media?.size)}</small>
      </span>
    </a>
  )
}

function Menu({ items, onClose, alignRight }) {
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && onClose()
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [onClose])

  return (
    <div className={`msg-menu ${alignRight ? 'right' : ''}`} ref={ref}>
      {items.map(([label, action]) => (
        <button
          key={label}
          onClick={() => {
            onClose()
            action()
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function MessageBubble({ message, chat, showSender, onReply, onEdit, onOpenImage }) {
  const { meId, deleteMessage, discardFailed, sendText } = useChat()
  const [menuOpen, setMenuOpen] = useState(false)
  const { startCall, inCall } = useCall()

  if (message.type === 'call') {
    const mine = idOf(message.sender) === meId
    const { title, detail, missed } = callSummary(message, meId)
    const Icon = message.call?.kind === 'video' ? VideoIcon : PhoneIcon
    return (
      <div className={`msg-row ${mine ? 'out' : 'in'}`}>
        <button
          className="bubble call-log"
          disabled={inCall}
          onClick={() => startCall(chat._id, message.call?.kind || 'audio')}
          title={`Call ${message.call?.kind === 'video' ? 'video' : 'voice'} again`}
        >
          <span className={`call-log-icon ${missed ? 'missed' : ''}`}>
            <Icon size={20} />
          </span>
          <span className="call-log-text">
            <strong>{title}</strong>
            <small>{detail}</small>
          </span>
          <span className="msg-meta">{formatTime(message.createdAt)}</span>
        </button>
      </div>
    )
  }

  if (message.type === 'system') {
    return (
      <div className="system-msg">
        <span>{message.content}</span>
      </div>
    )
  }

  const mine = idOf(message.sender) === meId
  const deleted = message.deletedForEveryone
  const status = mine ? messageStatus(message, chat, meId) : null
  const reply = message.replyTo

  const run = (fn) => () => fn().catch((err) => alert(err.message))
  let items
  if (message.failed) {
    items = [['Delete', () => discardFailed(chat._id, message._id)]]
    if (message.type === 'text') {
      items.unshift([
        'Retry',
        () => {
          discardFailed(chat._id, message._id)
          sendText(chat._id, message.content, message.replyTo)
        },
      ])
    }
  } else if (!message.pending) {
    items = []
    if (!deleted) items.push(['Reply', () => onReply(message)])
    if (!deleted && message.content) items.push(['Copy', () => navigator.clipboard?.writeText(message.content)])
    if (mine && !deleted && message.type === 'text') items.push(['Edit', () => onEdit(message)])
    items.push(['Delete for me', run(() => deleteMessage(message._id, false))])
    if (mine && !deleted) items.push(['Delete for everyone', run(() => deleteMessage(message._id, true))])
  }

  return (
    <div className={`msg-row ${mine ? 'out' : 'in'}`}>
      <div className={`bubble ${message.type !== 'text' && !deleted ? 'has-media' : ''}`}>
        {items?.length > 0 && (
          <button className="msg-chevron" onClick={() => setMenuOpen(true)} aria-label="Message options">
            <ChevronIcon />
          </button>
        )}
        {menuOpen && <Menu items={items} alignRight={mine} onClose={() => setMenuOpen(false)} />}

        {showSender && !mine && (
          <div className="msg-sender" style={{ color: nameColor(idOf(message.sender)) }}>
            {message.sender?.name}
          </div>
        )}

        {deleted ? (
          <p className="msg-text deleted">🚫 {mine ? 'You deleted this message' : 'This message was deleted'}</p>
        ) : (
          <>
            {reply && (
              <div className="msg-quote" style={{ borderColor: nameColor(idOf(reply.sender)) }}>
                <span style={{ color: nameColor(idOf(reply.sender)) }}>
                  {idOf(reply.sender) === meId ? 'You' : reply.sender?.name}
                </span>
                <p>{messagePreview(reply)}</p>
              </div>
            )}
            {message.type !== 'text' && <Media message={message} onOpenImage={onOpenImage} />}
            {message.content && <p className="msg-text">{message.content}</p>}
          </>
        )}

        <span className="msg-meta">
          {message.editedAt && !deleted && <em>Edited</em>}
          {formatTime(message.createdAt)}
          {status && !deleted && <Ticks status={status} />}
        </span>
      </div>
    </div>
  )
}
