// Render passes the backend as a bare host name ("my-api.onrender.com"), so add https:// when missing
const rawApiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '')
export const API_URL = /^https?:\/\//.test(rawApiUrl) ? rawApiUrl : `https://${rawApiUrl}`

const TOKEN_KEY = 'chat_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable (private mode) — the session just won't persist
  }
}

// Turns "/uploads/x.png" into an absolute URL on the backend
export function mediaUrl(path) {
  if (!path) return ''
  return /^(https?:|blob:)/.test(path) ? path : `${API_URL}${path}`
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}
