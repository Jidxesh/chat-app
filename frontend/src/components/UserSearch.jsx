import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import Avatar from './Avatar'
import { CheckIcon, SearchIcon } from './Icons'

// Search users by name or phone. Used for new chats, new groups and adding group members.
export default function UserSearch({ onSelect, selectedIds = [], excludeIds = [], autoFocus = true }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return undefined
    }
    setLoading(true)
    const timer = setTimeout(() => {
      api(`/users/search?q=${encodeURIComponent(q)}`)
        .then(({ users }) => {
          setResults(users.filter((u) => !excludeIds.includes(u._id)))
          setError('')
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
    // excludeIds is intentionally left out: it's a new array every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <div className="user-search">
      <div className="search-box">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone number"
          autoFocus={autoFocus}
        />
      </div>
      <div className="user-results">
        {!query.trim() && <p className="muted center">Search for people by their name or phone number.</p>}
        {query.trim() && !loading && !results.length && !error && <p className="muted center">No users found</p>}
        {error && <p className="form-error center">{error}</p>}
        {results.map((u) => {
          const selected = selectedIds.includes(u._id)
          return (
            <button key={u._id} className={`list-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(u)}>
              <Avatar name={u.name} src={u.avatar} size={44} />
              <div className="list-row-body">
                <div className="list-row-title">{u.name}</div>
                <div className="list-row-sub">{u.about || u.phone}</div>
              </div>
              {selected && (
                <span className="select-check">
                  <CheckIcon />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
