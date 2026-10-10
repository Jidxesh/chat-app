import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api, mediaUrl } from '../lib/api'
import Avatar from './Avatar'
import { CameraIcon, CheckIcon, EditIcon } from './Icons'
import SlidePanel from './SlidePanel'

// Inline-editable field (name, about)
export function EditableField({ label, value, onSave, maxLength = 140, canEdit = true }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')

  async function save() {
    try {
      if (draft.trim() !== value) await onSave(draft.trim())
      setEditing(false)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="editable-field">
      <span className="field-label">{label}</span>
      {editing ? (
        <div className="field-row">
          <input
            value={draft}
            maxLength={maxLength}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
          />
          <button className="icon-btn" onClick={save} title="Save">
            <CheckIcon />
          </button>
        </div>
      ) : (
        <div className="field-row">
          <span className="field-value">{value || <i className="muted">Not set</i>}</span>
          {canEdit && (
            <button
              className="icon-btn"
              onClick={() => {
                setDraft(value)
                setEditing(true)
              }}
              title="Edit"
            >
              <EditIcon />
            </button>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

export default function ProfilePanel({ onClose }) {
  const { user, setUser } = useAuth()
  const [error, setError] = useState('')

  async function update(fields) {
    const form = new FormData()
    Object.entries(fields).forEach(([k, v]) => form.append(k, v))
    const { user: updated } = await api('/users/me', { method: 'PATCH', form })
    setUser(updated)
  }

  async function changeAvatar(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      await update({ avatar: file })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <SlidePanel title="Profile" onClose={onClose}>
      <div className="profile-avatar">
        <label className="avatar-upload" title="Change photo">
          {user.avatar ? <img src={mediaUrl(user.avatar)} alt="" /> : <Avatar name={user.name} size={200} />}
          <span className="avatar-overlay">
            <CameraIcon />
            Change photo
          </span>
          <input type="file" accept="image/*" hidden onChange={changeAvatar} />
        </label>
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="info-section">
        <EditableField label="Your name" value={user.name} maxLength={40} onSave={(name) => update({ name })} />
      </div>
      <p className="muted info-hint">This name will be visible to the people you chat with.</p>
      <div className="info-section">
        <EditableField label="About" value={user.about} onSave={(about) => update({ about })} />
      </div>
      <div className="info-section">
        <span className="field-label">Phone</span>
        <span className="field-value">{user.phone}</span>
      </div>
    </SlidePanel>
  )
}
