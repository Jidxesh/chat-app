import { useEffect, useRef, useState } from 'react'
import { useCall } from '../context/CallContext'
import { formatDuration } from '../lib/format'
import Avatar from './Avatar'
import { EndCallIcon, MicIcon, MicOffIcon, PhoneIcon, VideoIcon, VideoOffIcon } from './Icons'

function StreamVideo({ stream, muted, className }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null
  }, [stream])
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />
}

function StreamAudio({ stream }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null
  }, [stream])
  return <audio ref={ref} autoPlay />
}

function useElapsed(since) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!since) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [since])
  return since ? formatDuration((now - since) / 1000) : null
}

function statusText(call, elapsed) {
  switch (call.status) {
    case 'starting':
      return 'Starting…'
    case 'ringing':
      return 'Ringing…'
    case 'connecting':
      return 'Connecting…'
    case 'reconnecting':
      return 'Reconnecting…'
    case 'connected':
      return elapsed
    case 'ended':
      return call.endReason
    default:
      return ''
  }
}

function IncomingCall({ call }) {
  const { acceptCall, declineCall } = useCall()
  return (
    <div className="incoming-call" role="dialog" aria-label="Incoming call">
      <Avatar name={call.peer.name} src={call.peer.avatar} size={56} />
      <div className="incoming-info">
        <strong>{call.peer.name}</strong>
        <span>Incoming {call.kind === 'video' ? 'video' : 'voice'} call…</span>
      </div>
      <button className="call-btn decline" onClick={declineCall} title="Decline">
        <EndCallIcon />
      </button>
      <button className="call-btn accept" onClick={acceptCall} title="Accept">
        {call.kind === 'video' ? <VideoIcon /> : <PhoneIcon />}
      </button>
    </div>
  )
}

export default function CallScreen() {
  const { call, endCall, toggleMute, toggleCamera } = useCall()
  const elapsed = useElapsed(call?.connectedAt)
  if (!call) return null
  if (call.status === 'incoming') return <IncomingCall call={call} />

  const isVideo = call.kind === 'video'
  const showRemoteVideo = isVideo && call.remoteStream && !call.remoteCameraOff && call.status !== 'ended'
  const showLocalVideo = isVideo && call.localStream && !call.cameraOff

  return (
    <div className={`call-screen ${isVideo ? 'video' : 'audio'}`}>
      {showRemoteVideo ? (
        <StreamVideo stream={call.remoteStream} className="remote-video" />
      ) : (
        // Audio-only (or camera off): play the remote audio and show the avatar
        <>
          {call.remoteStream && <StreamAudio stream={call.remoteStream} />}
          {isVideo && showLocalVideo && call.status !== 'connected' && (
            <StreamVideo stream={call.localStream} muted className="remote-video preview" />
          )}
        </>
      )}

      <div className={`call-top ${showRemoteVideo ? 'overlay' : ''}`}>
        {!showRemoteVideo && <Avatar name={call.peer.name} src={call.peer.avatar} size={120} />}
        <h2>{call.peer.name}</h2>
        <p>
          {statusText(call, elapsed)}
          {call.remoteMuted && call.status === 'connected' && ' · Muted'}
        </p>
        {!showRemoteVideo && call.status === 'connected' && isVideo && call.remoteCameraOff && (
          <p className="small">Camera is off</p>
        )}
        <span className="call-e2e">🔒 Peer-to-peer</span>
      </div>

      {showLocalVideo && (call.status === 'connected' || showRemoteVideo) && (
        <StreamVideo stream={call.localStream} muted className="local-video" />
      )}

      <div className="call-controls">
        {isVideo && (
          <button
            className={`call-btn ${call.cameraOff ? 'off' : ''}`}
            onClick={toggleCamera}
            disabled={call.status === 'ended'}
            title={call.cameraOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {call.cameraOff ? <VideoOffIcon /> : <VideoIcon />}
          </button>
        )}
        <button
          className={`call-btn ${call.muted ? 'off' : ''}`}
          onClick={toggleMute}
          disabled={call.status === 'ended'}
          title={call.muted ? 'Unmute' : 'Mute'}
        >
          {call.muted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button className="call-btn decline" onClick={endCall} disabled={call.status === 'ended'} title="End call">
          <EndCallIcon />
        </button>
      </div>
    </div>
  )
}
