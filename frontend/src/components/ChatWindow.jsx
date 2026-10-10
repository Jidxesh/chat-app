import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { useCall } from '../context/CallContext'
import { api } from '../lib/api'
import { chatDisplay, formatLastSeen, idOf } from '../lib/format'
import Avatar from './Avatar'
import Composer from './Composer'
import { BackIcon, PhoneIcon, VideoIcon } from './Icons'
import InfoPanel from './InfoPanel'
import MessageList from './MessageList'

function subtitle(chat, meId, typers, other) {
  if (typers.length) {
    return chat.type === 'group' ? `${typers.map((n) => n.split(' ')[0]).join(', ')} typing…` : 'typing…'
  }
  if (chat.type === 'direct') {
    if (other?.isOnline) return 'online'
    return formatLastSeen(other?.lastSeen)
  }
  return chat.participants
    .map((p) => (idOf(p) === meId ? 'You' : p.name))
    .sort((a, b) => (a === 'You') - (b === 'You'))
    .join(', ')
}

export default function ChatWindow({ chat }) {
  const { user, setUser } = useAuth()
  const { meId, typing, openChat } = useChat()
  const [replyTo, setReplyTo] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showInfo, setShowInfo] = useState(false)
  const { startCall, inCall } = useCall()

  const { name, avatar, other } = chatDisplay(chat, meId)
  const typers = Object.values(typing[chat._id] || {})
  const sub = subtitle(chat, meId, typers, other)
  const blockedByMe = other && user.blocked?.some((id) => idOf(id) === idOf(other))

  async function unblock() {
    await api(`/users/${idOf(other)}/block`, { method: 'DELETE' })
    setUser({ ...user, blocked: user.blocked.filter((id) => idOf(id) !== idOf(other)) })
  }

  return (
    <div className="chat-window-wrap">
      <section className="chat-window">
        <header className="pane-header chat-header">
          <button className="icon-btn back-btn" onClick={() => openChat(null)} title="Back">
            <BackIcon />
          </button>
          <button className="chat-header-info" onClick={() => setShowInfo(true)}>
            <Avatar name={name} src={avatar} size={40} group={chat.type === 'group'} />
            <span>
              <strong>{name}</strong>
              <small className={typers.length ? 'typing-text' : ''}>{sub}</small>
            </span>
          </button>
          {chat.type === 'direct' && (
            <div className="header-actions">
              <button
                className="icon-btn"
                title="Video call"
                disabled={inCall || blockedByMe}
                onClick={() => startCall(chat._id, 'video')}
              >
                <VideoIcon />
              </button>
              <button
                className="icon-btn"
                title="Voice call"
                disabled={inCall || blockedByMe}
                onClick={() => startCall(chat._id, 'audio')}
              >
                <PhoneIcon />
              </button>
            </div>
          )}
        </header>

        <MessageList
          chat={chat}
          onReply={(m) => {
            setEditing(null)
            setReplyTo(m)
          }}
          onEdit={(m) => {
            setReplyTo(null)
            setEditing(m)
          }}
        />

        {blockedByMe ? (
          <div className="blocked-bar">
            You blocked this contact.{' '}
            <button className="link" onClick={() => unblock().catch((e) => alert(e.message))}>
              Tap to unblock
            </button>
          </div>
        ) : (
          <Composer
            chat={chat}
            replyTo={replyTo}
            editing={editing}
            onCancel={() => {
              setReplyTo(null)
              setEditing(null)
            }}
          />
        )}
      </section>
      {showInfo && <InfoPanel chat={chat} onClose={() => setShowInfo(false)} />}
    </div>
  )
}
