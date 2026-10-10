import { useEffect, useMemo, useState } from 'react'
import { useChat } from '../context/ChatContext'
import Avatar from './Avatar'
import { CameraIcon, CheckIcon, CloseIcon } from './Icons'
import SlidePanel from './SlidePanel'
import UserSearch from './UserSearch'

export default function NewGroupPanel({ onClose }) {
  const { createGroup } = useChat()
  const [step, setStep] = useState('members')
  const [members, setMembers] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const avatarPreview = useMemo(() => avatar && URL.createObjectURL(avatar), [avatar])
  useEffect(() => () => avatarPreview && URL.revokeObjectURL(avatarPreview), [avatarPreview])

  const toggle = (user) =>
    setMembers((list) => (list.some((u) => u._id === user._id) ? list.filter((u) => u._id !== user._id) : [...list, user]))

  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createGroup({ name, description, participants: members.map((m) => m._id), avatar })
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (step === 'members') {
    return (
      <SlidePanel title="Add group members" onClose={onClose}>
        {members.length > 0 && (
          <div className="member-chips">
            {members.map((m) => (
              <span key={m._id} className="member-chip">
                <Avatar name={m.name} src={m.avatar} size={24} />
                {m.name}
                <button onClick={() => toggle(m)} title="Remove">
                  <CloseIcon size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        <UserSearch onSelect={toggle} selectedIds={members.map((m) => m._id)} />
        {members.length > 0 && (
          <button className="fab" title="Next" onClick={() => setStep('details')}>
            <CheckIcon size={26} />
          </button>
        )}
      </SlidePanel>
    )
  }

  return (
    <SlidePanel title="New group" onClose={() => setStep('members')}>
      <form className="group-form" onSubmit={create}>
        <label className="avatar-picker">
          {avatar ? (
            <img src={avatarPreview} alt="" />
          ) : (
            <span>
              <CameraIcon size={28} />
              Add group icon
            </span>
          )}
          <input type="file" accept="image/*" hidden onChange={(e) => setAvatar(e.target.files[0] || null)} />
        </label>
        <label>
          Group name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
        </label>
        <label>
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </label>
        <p className="muted">{members.length + 1} members including you</p>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </SlidePanel>
  )
}
