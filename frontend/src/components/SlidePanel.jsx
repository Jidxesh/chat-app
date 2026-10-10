import { BackIcon } from './Icons'

// Full-height panel that slides over the sidebar (profile, new chat, new group)
export default function SlidePanel({ title, onClose, children }) {
  return (
    <div className="slide-panel">
      <header className="slide-header">
        <button className="icon-btn" onClick={onClose} title="Back">
          <BackIcon />
        </button>
        <h2>{title}</h2>
      </header>
      <div className="slide-body">{children}</div>
    </div>
  )
}
