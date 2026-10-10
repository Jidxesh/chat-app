import { mediaUrl } from '../lib/api'
import { GroupIcon } from './Icons'

const COLORS = ['#00a884', '#5e88f2', '#e5734e', '#a35dd6', '#d6577b', '#3a9fbf', '#c49a1e', '#6b8e23']

function colorFor(name = '') {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

export default function Avatar({ name, src, size = 40, group = false, online = false }) {
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? (
        <img src={mediaUrl(src)} alt="" />
      ) : (
        <span style={{ background: group ? '#6a7175' : colorFor(name) }}>{group ? <GroupIcon size={size * 0.55} /> : initials(name)}</span>
      )}
      {online && <i className="avatar-online" />}
    </div>
  )
}
