import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useChat } from '../context/ChatContext'
import { api, mediaUrl } from '../lib/api'
import { chatDisplay, formatLastSeen, idOf } from '../lib/format'
import Avatar from './Avatar'
import { CameraIcon, CloseIcon, GroupIcon } from './Icons'
import { EditableField } from './ProfilePanel'
import UserSearch from './UserSearch'

function DirectInfo({ chat }) {
  const { user, setUser } = useAuth()
  const { meId } = useChat()
  const { other } = chatDisplay(chat, meId)
  const otherId = idOf(other)
  const blocked = user.blocked?.some((id) => idOf(id) === otherId)

  async function toggleBlock() {
    if (!blocked && !confirm(`Block ${other.name}? They won't be able to message you.`)) return
    try {
      await api(`/users/${otherId}/block`, { method: blocked ? 'DELETE' : 'POST' })
      const list = (user.blocked || []).filter((id) => idOf(id) !== otherId)
      setUser({ ...user, blocked: blocked ? list : [...list, otherId] })
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <>
      <div className="info-hero">
        <Avatar name={other.name} src={other.avatar} size={200} />
        <h3>{other.name}</h3>
        <p className="muted">{other.phone}</p>
        <p className="muted small">{other.isOnline ? 'online' : formatLastSeen(other.lastSeen)}</p>
      </div>
      <div className="info-section">
        <span className="field-label">About</span>
        <span className="field-value">{other.about}</span>
      </div>
      <button className="danger-row" onClick={toggleBlock}>
        {blocked ? `Unblock ${other.name}` : `Block ${other.name}`}
      </button>
    </>
  )
}

function MemberRow({ member, chat, iAmAdmin, onAction }) {
  const { meId } = useChat()
  const [open, setOpen] = useState(false)
  const isMe = idOf(member) === meId
  const isAdmin = chat.admins.some((a) => idOf(a) === idOf(member))

  return (
    <div className="list-row member-row">
      <Avatar name={member.name} src={member.avatar} size={40} online={member.isOnline} />
      <div className="list-row-body">
        <div className="list-row-title">{isMe ? 'You' : member.name}</div>
        <div className="list-row-sub">{member.about}</div>
      </div>
      {isAdmin && <span className="admin-tag">Group admin</span>}
      {iAmAdmin && !isMe && (
        <div className="member-actions">
          <button className="icon-btn small" onClick={() => setOpen((v) => !v)} aria-label="Member options">
            ⋮
          </button>
          {open && (
            <div className="msg-menu right" onMouseLeave={() => setOpen(false)}>
              <button onClick={() => onAction(isAdmin ? 'demote' : 'promote', member)}>
                {isAdmin ? 'Dismiss as admin' : 'Make group admin'}
              </button>
              <button onClick={() => onAction('remove', member)}>Remove {member.name}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GroupInfo({ chat, onClose }) {
  const { meId, upsertChat, removeChat } = useChat()
  const [adding, setAdding] = useState(false)
  const iAmAdmin = chat.admins.some((a) => idOf(a) === meId)

  async function call(path, options) {
    try {
      const data = await api(path, options)
      if (data.chat) upsertChat(data.chat)
      return data
    } catch (err) {
      alert(err.message)
      return null
    }
  }

  const updateInfo = async (fields) => {
    const form = new FormData()
    Object.entries(fields).forEach(([k, v]) => form.append(k, v))
    const { chat: updated } = await api(`/chats/${chat._id}`, { method: 'PATCH', form })
    upsertChat(updated)
  }

  function onMemberAction(action, member) {
    const id = idOf(member)
    if (action === 'remove') {
      if (confirm(`Remove ${member.name} from the group?`)) call(`/chats/${chat._id}/members/${id}`, { method: 'DELETE' })
    } else {
      call(`/chats/${chat._id}/admins/${id}`, { method: action === 'promote' ? 'POST' : 'DELETE' })
    }
  }

  async function leave() {
    if (!confirm(`Exit "${chat.name}"?`)) return
    const res = await call(`/chats/${chat._id}/members/${meId}`, { method: 'DELETE' })
    if (res) {
      removeChat(chat._id)
      onClose()
    }
  }

  return (
    <>
      <div className="info-hero">
        <label className={`avatar-upload ${iAmAdmin ? '' : 'readonly'}`}>
          {chat.avatar ? <img src={mediaUrl(chat.avatar)} alt="" /> : <Avatar name={chat.name} size={200} group />}
          {iAmAdmin && (
            <>
              <span className="avatar-overlay">
                <CameraIcon />
                Change group icon
              </span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => e.target.files[0] && updateInfo({ avatar: e.target.files[0] }).catch((err) => alert(err.message))}
              />
            </>
          )}
        </label>
        <p className="muted">Group · {chat.participants.length} members</p>
      </div>
      <div className="info-section">
        <EditableField label="Group name" value={chat.name} canEdit={iAmAdmin} maxLength={60} onSave={(name) => updateInfo({ name })} />
      </div>
      <div className="info-section">
        <EditableField
          label="Description"
          value={chat.description}
          canEdit={iAmAdmin}
          maxLength={200}
          onSave={(description) => updateInfo({ description })}
        />
      </div>
      <div className="info-section no-pad">
        <span className="field-label pad">{chat.participants.length} members</span>
        {iAmAdmin && !adding && (
          <button className="list-row" onClick={() => setAdding(true)}>
            <span className="round-icon">
              <GroupIcon />
            </span>
            <div className="list-row-body">
              <div className="list-row-title">Add members</div>
            </div>
          </button>
        )}
        {adding && (
          <div className="add-members">
            <button className="link pad" onClick={() => setAdding(false)}>
              Done adding
            </button>
            <UserSearch
              excludeIds={chat.participants.map(idOf)}
              onSelect={(u) => call(`/chats/${chat._id}/members`, { method: 'POST', body: { userIds: [u._id] } })}
            />
          </div>
        )}
        {chat.participants.map((m) => (
          <MemberRow key={idOf(m)} member={m} chat={chat} iAmAdmin={iAmAdmin} onAction={onMemberAction} />
        ))}
      </div>
      <button className="danger-row" onClick={leave}>
        Exit group
      </button>
    </>
  )
}

export default function InfoPanel({ chat, onClose }) {
  return (
    <aside className="info-panel">
      <header className="pane-header">
        <button className="icon-btn" onClick={onClose} title="Close">
          <CloseIcon />
        </button>
        <h2>{chat.type === 'group' ? 'Group info' : 'Contact info'}</h2>
      </header>
      <div className="info-body">
        {chat.type === 'group' ? <GroupInfo chat={chat} onClose={onClose} /> : <DirectInfo chat={chat} />}
      </div>
    </aside>
  )
}
