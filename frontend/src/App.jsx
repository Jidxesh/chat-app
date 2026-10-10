import { useAuth } from './context/AuthContext'
import { ChatProvider, useChat } from './context/ChatContext'
import { CallProvider } from './context/CallContext'
import CallScreen from './components/CallScreen'
import AuthPage from './components/AuthPage'
import ChatWindow from './components/ChatWindow'
import Sidebar from './components/Sidebar'
import { ChatIcon } from './components/Icons'

function ChatLayout() {
  const { activeChat } = useChat()
  return (
    <div className={`app-shell ${activeChat ? 'chat-open' : ''}`}>
      <Sidebar />
      <main className="main-pane">
        {activeChat ? (
          <ChatWindow key={activeChat._id} chat={activeChat} />
        ) : (
          <div className="empty-state">
            <ChatIcon size={72} />
            <h2>Chat</h2>
            <p>Send and receive messages in real time. Pick a chat on the left, or start a new one.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash">Loading…</div>
  if (!user) return <AuthPage />
  return (
    <ChatProvider>
      <CallProvider>
        <ChatLayout />
        <CallScreen />
      </CallProvider>
    </ChatProvider>
  )
}
