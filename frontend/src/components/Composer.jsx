import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '../context/ChatContext'
import { formatBytes, idOf, messagePreview } from '../lib/format'
import { AttachIcon, CloseIcon, EmojiIcon, FileIcon, SendIcon } from './Icons'

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '😘', '😎', '🤩', '🥳', '😇', '🙂', '😉', '😅', '🤔', '😴', '😢',
  '😭', '😡', '😱', '🤯', '🥺', '🙄', '😬', '🤗', '👍', '👎', '👏', '🙏', '💪', '👋', '🤝', '✌️',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '💔', '🔥', '✨', '🎉', '💯', '✅', '❌', '⭐', '☕', '🍕',
]

export default function Composer({ chat, replyTo, editing, onCancel }) {
  const { meId, sendText, sendFile, editMessage, setTyping } = useChat()
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const typingRef = useRef({ active: false, timer: null })
  const filePreview = useMemo(() => (file?.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => filePreview && URL.revokeObjectURL(filePreview), [filePreview])

  // Load the message being edited into the input
  useEffect(() => {
    if (editing) setText(editing.content)
    inputRef.current?.focus()
  }, [editing, replyTo])

  // Grow the textarea with its content
  useEffect(() => {
    const el = inputRef.current
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const stopTyping = () => {
    clearTimeout(typingRef.current.timer)
    if (typingRef.current.active) setTyping(chat._id, false)
    typingRef.current.active = false
  }
  useEffect(() => stopTyping, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onChange(e) {
    setText(e.target.value)
    if (editing) return
    if (!typingRef.current.active) {
      typingRef.current.active = true
      setTyping(chat._id, true)
    }
    clearTimeout(typingRef.current.timer)
    typingRef.current.timer = setTimeout(stopTyping, 2000)
  }

  async function submit() {
    const content = text.trim()
    if (editing) {
      if (content && content !== editing.content) {
        try {
          await editMessage(editing._id, content)
        } catch (err) {
          alert(err.message)
          return
        }
      }
      setText('')
      onCancel()
      return
    }
    if (!content && !file) return
    stopTyping()
    if (file) sendFile(chat._id, file, content, replyTo)
    else sendText(chat._id, content, replyTo)
    setText('')
    setFile(null)
    setShowEmoji(false)
    onCancel()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape' && (editing || replyTo)) {
      setText('')
      onCancel()
    }
  }

  function pickFile(e) {
    const picked = e.target.files[0]
    e.target.value = ''
    if (!picked) return
    if (picked.size > 25 * 1024 * 1024) {
      alert('Files must be 25 MB or smaller')
      return
    }
    setFile(picked)
    inputRef.current?.focus()
  }

  const banner = editing || replyTo
  const canSend = text.trim() || file

  return (
    <footer className="composer">
      {banner && (
        <div className="composer-banner">
          <div className="msg-quote">
            <span>
              {editing ? 'Edit message' : idOf(replyTo.sender) === meId ? 'Replying to yourself' : `Replying to ${replyTo.sender?.name}`}
            </span>
            <p>{messagePreview(banner)}</p>
          </div>
          <button
            className="icon-btn"
            onClick={() => {
              if (editing) setText('')
              onCancel()
            }}
            aria-label="Cancel"
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {file && (
        <div className="composer-banner">
          <div className="file-preview">
            {filePreview ? <img src={filePreview} alt="" /> : <FileIcon size={32} />}
            <span>
              <strong>{file.name}</strong>
              <small>{formatBytes(file.size)} · add a caption below</small>
            </span>
          </div>
          <button className="icon-btn" onClick={() => setFile(null)} aria-label="Remove file">
            <CloseIcon />
          </button>
        </div>
      )}
      {showEmoji && (
        <div className="emoji-picker">
          {EMOJIS.map((em) => (
            <button
              key={em}
              onClick={() => {
                setText((t) => t + em)
                inputRef.current?.focus()
              }}
            >
              {em}
            </button>
          ))}
        </div>
      )}
      <div className="composer-row">
        <button className={`icon-btn ${showEmoji ? 'on' : ''}`} onClick={() => setShowEmoji((v) => !v)} title="Emoji">
          <EmojiIcon />
        </button>
        {!editing && (
          <button className="icon-btn" onClick={() => fileRef.current.click()} title="Attach">
            <AttachIcon />
          </button>
        )}
        <input type="file" ref={fileRef} hidden onChange={pickFile} />
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={file ? 'Add a caption' : 'Type a message'}
        />
        <button className="icon-btn send-btn" onClick={submit} disabled={!canSend} title="Send">
          <SendIcon />
        </button>
      </div>
    </footer>
  )
}
