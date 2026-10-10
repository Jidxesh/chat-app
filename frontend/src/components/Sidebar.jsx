import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { chatDisplay, formatListTime, idOf, messagePreview, messageStatus } from '../lib/format'
import Avatar from './Avatar'
import { ChatIcon, GroupIcon, LogoutIcon, SearchIcon, Ticks } from './Icons'
import NewChatPanel from './NewChatPanel'
import NewGroupPanel from './NewGroupPanel'
import ProfilePanel from './ProfilePanel'

function ChatListItem({ chat, active, onClick }) {
  const { meId, typing } = useChat()
  const { name, avatar, other } = chatDisplay(chat, meId)
  const last = chat.lastMessage
  const typers = Object.values(typing[chat._id] || {})
  const mine = last && idOf(last.sender) === meId && last.type !== 'system' && last.type !== 'call'

  let preview = messagePreview(last, meId)
  if (last && chat.type === 'group' && !mine && !['system', 'call'].includes(last.type) && last.sender?.name) {
    preview = `${last.sender.name.split(' ')[0]}: ${preview}`
  }

  return (
    <button className={`chat-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Avatar name={name} src={avatar} size={49} group={chat.type === 'group'} online={other?.isOnline} />
      <div className="chat-item-body">
        <div className="chat-item-top">
          <span className="chat-item-name">{name}</span>
          <span className={`chat-item-time ${chat.unreadCount ? 'unread' : ''}`}>
            {formatListTime(last?.createdAt || chat.updatedAt)}
          </span>
        </div>
        <div className="chat-item-bottom">
          {typers.length ? (
            <span className="typing-text">
              {chat.type === 'group' ? `${typers[0].split(' ')[0]} is typing…` : 'typing…'}
            </span>
          ) : (
            <span className="chat-item-preview">
              {mine && !last.deletedForEveryone && <Ticks status={messageStatus(last, chat, meId)} />}
              {preview || <i>No messages yet</i>}
            </span>
          )}
          {chat.unreadCount > 0 && <span className="badge">{chat.unreadCount}</span>}
        </div>
      </div>
    </button>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { chats, chatsLoaded, activeChatId, openChat, meId, connected } = useChat()
  const [panel, setPanel] = useState(null)
  const [filter, setFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const q = filter.trim().toLowerCase()
  const visible = chats.filter((c) => {
    if (unreadOnly && !c.unreadCount) return false
    return !q || chatDisplay(c, meId).name.toLowerCase().includes(q)
  })

  return (
    <aside className="sidebar">
      <header className="pane-header">
        <button className="avatar-btn" onClick={() => setPanel('profile')} title="Profile">
          <Avatar name={user.name} src={user.avatar} size={40} />
        </button>
        <div className="header-actions">
          <button className="icon-btn" title="New group" onClick={() => setPanel('newGroup')}>
            <GroupIcon />
          </button>
          <button className="icon-btn" title="New chat" onClick={() => setPanel('newChat')}>
            <ChatIcon />
          </button>
          <button className="icon-btn" title="Log out" onClick={logout}>
            <LogoutIcon />
          </button>
        </div>
      </header>

      {!connected && <div className="conn-banner">Connecting…</div>}

      <div className="sidebar-search">
        <div className="search-box">
          <SearchIcon />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search chats" />
        </div>
        <div className="filter-chips">
          <button className={!unreadOnly ? 'chip active' : 'chip'} onClick={() => setUnreadOnly(false)}>
            All
          </button>
          <button className={unreadOnly ? 'chip active' : 'chip'} onClick={() => setUnreadOnly(true)}>
            Unread
          </button>
        </div>
      </div>

      <div className="chat-list">
        {!chatsLoaded && <p className="muted center">Loading chats…</p>}
        {chatsLoaded && !chats.length && (
          <div className="empty-list">
            <p>No chats yet</p>
            <button className="btn-primary" onClick={() => setPanel('newChat')}>
              Start a chat
            </button>
          </div>
        )}
        {chatsLoaded && chats.length > 0 && !visible.length && <p className="muted center">No chats found</p>}
        {visible.map((chat) => (
          <ChatListItem
            key={chat._id}
            chat={chat}
            active={chat._id === activeChatId}
            onClick={() => openChat(chat._id)}
          />
        ))}
      </div>

      {panel === 'profile' && <ProfilePanel onClose={() => setPanel(null)} />}
      {panel === 'newChat' && <NewChatPanel onClose={() => setPanel(null)} onNewGroup={() => setPanel('newGroup')} />}
      {panel === 'newGroup' && <NewGroupPanel onClose={() => setPanel(null)} />}
    </aside>
  )
}
