import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ChatIcon } from './Icons'

export default function AuthPage() {
  const { authenticate } = useAuth()
  const [mode, setMode] = useState('login')
  const [fields, setFields] = useState({ name: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (e) => setFields({ ...fields, [e.target.name]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = mode === 'login' ? { phone: fields.phone, password: fields.password } : fields
      await authenticate(mode, body)
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot reach the server. Is the backend running?' : err.message)
    } finally {
      setBusy(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <div className="auth-page">
      <div className="auth-banner" />
      <div className="auth-card">
        <div className="auth-logo">
          <ChatIcon size={36} />
          <span>Chat</span>
        </div>
        <h1>{isLogin ? 'Log in to your account' : 'Create your account'}</h1>
        <form onSubmit={submit}>
          {!isLogin && (
            <label>
              Name
              <input name="name" value={fields.name} onChange={update} placeholder="Your name" required autoFocus />
            </label>
          )}
          <label>
            Phone number
            <input
              name="phone"
              type="tel"
              value={fields.phone}
              onChange={update}
              placeholder="e.g. 9876543210"
              required
              autoFocus={isLogin}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              value={fields.password}
              onChange={update}
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p className="auth-switch">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(isLogin ? 'register' : 'login')
              setError('')
            }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}
