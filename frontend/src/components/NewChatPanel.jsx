import { useState } from 'react'
import { useChat } from '../context/ChatContext'
import { GroupIcon } from './Icons'
import SlidePanel from './SlidePanel'
import UserSearch from './UserSearch'

export default function NewChatPanel({ onClose, onNewGroup }) {
  const { startDirectChat } = useChat()
  const [error, setError] = useState('')

  async function select(user) {
    try {
      await startDirectChat(user._id)
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <SlidePanel title="New chat" onClose={onClose}>
      <button className="list-row" onClick={onNewGroup}>
        <span className="round-icon">
          <GroupIcon />
        </span>
        <div className="list-row-body">
          <div className="list-row-title">New group</div>
        </div>
      </button>
      {error && <p className="form-error center">{error}</p>}
      <UserSearch onSelect={select} />
    </SlidePanel>
  )
}
