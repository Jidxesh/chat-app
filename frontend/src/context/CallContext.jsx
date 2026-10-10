import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { chatDisplay } from '../lib/format'
import { playTone } from '../lib/tones'
import { useChat } from './ChatContext'

const CallContext = createContext(null)

const CONNECT_TIMEOUT_MS = 30 * 1000
const FALLBACK_ICE = [{ urls: 'stun:stun.l.google.com:19302' }]

const END_REASONS = {
  declined: 'Call declined',
  no_answer: 'No answer',
  busy: 'On another call',
  unavailable: 'Unavailable right now',
  disconnected: 'Call disconnected',
  failed: 'Connection failed',
  ended: 'Call ended',
}

function mediaError(err, kind) {
  if (err.name === 'NotAllowedError') {
    return `Allow ${kind === 'video' ? 'camera and microphone' : 'microphone'} access in your browser to make calls.`
  }
  if (err.name === 'NotFoundError') return `No ${kind === 'video' ? 'camera or microphone' : 'microphone'} found.`
  if (!navigator.mediaDevices) return 'Calls need a secure connection (https or localhost).'
  return err.message
}

/*
 * call shape:
 * { callId, chatId, kind: 'audio'|'video', direction: 'outgoing'|'incoming',
 *   status: 'starting'|'ringing'|'incoming'|'connecting'|'connected'|'reconnecting'|'ended',
 *   peer: { _id, name, avatar }, connectedAt, endReason,
 *   localStream, remoteStream, muted, cameraOff, remoteMuted, remoteCameraOff }
 */
export function CallProvider({ children }) {
  const { socket, chats, meId } = useChat()
  const [call, setCall] = useState(null)
  const callRef = useRef(null)
  const pcRef = useRef(null)
  const pendingCandidates = useRef([])
  const stopToneRef = useRef(null)
  const timers = useRef({})
  const iceServers = useRef(null)

  // Keeps the ref in sync immediately, so async handlers always see the latest call
  const update = useCallback((patch) => {
    const prev = callRef.current
    if (!prev) return
    const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
    callRef.current = next
    setCall(next)
  }, [])

  // True once the user hung up (or the call ended) while we were waiting on something
  const isOver = () => !callRef.current || callRef.current.status === 'ended'

  const tone = useCallback((name, options) => {
    stopToneRef.current?.()
    stopToneRef.current = name ? playTone(name, options) : null
  }, [])

  // Tear down media + connection, show the end reason briefly, then close the call screen
  const cleanup = useCallback(
    (reason) => {
      const current = callRef.current
      if (!current) return
      clearTimeout(timers.current.connect)
      clearTimeout(timers.current.close)
      current.localStream?.getTracks().forEach((t) => t.stop())
      pcRef.current?.close()
      pcRef.current = null
      pendingCandidates.current = []

      // Silent close: answered on another device, or the caller gave up before we picked up
      if (!reason || reason === 'answered_elsewhere' || (reason === 'cancelled' && current.direction === 'incoming')) {
        tone(null)
        callRef.current = null
        setCall(null)
        return
      }
      tone('ended', { loop: false })
      update({ status: 'ended', endReason: END_REASONS[reason] || 'Call ended', localStream: null, remoteStream: null })
      timers.current.close = setTimeout(() => {
        callRef.current = null
        setCall(null)
      }, 1800)
    },
    [tone, update]
  )

  const getIceServers = async () => {
    if (!iceServers.current) {
      try {
        iceServers.current = (await api('/calls/ice-servers')).iceServers
      } catch {
        iceServers.current = FALLBACK_ICE
      }
    }
    return iceServers.current
  }

  const createPeer = useCallback(
    async (callId, localStream) => {
      const pc = new RTCPeerConnection({ iceServers: await getIceServers() })
      pcRef.current = pc
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('call:signal', { callId, candidate: e.candidate })
      }
      pc.ontrack = (e) => update({ remoteStream: e.streams[0] })
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return
        const state = pc.connectionState
        if (state === 'connected') {
          clearTimeout(timers.current.connect)
          update((prev) => ({ status: 'connected', connectedAt: prev.connectedAt || Date.now() }))
        } else if (state === 'disconnected') {
          update({ status: 'reconnecting' })
        } else if (state === 'failed') {
          socket.emit('call:end', { callId })
          cleanup('failed')
        }
      }

      timers.current.connect = setTimeout(() => {
        if (callRef.current?.status !== 'connected') {
          socket.emit('call:end', { callId })
          cleanup('failed')
        }
      }, CONNECT_TIMEOUT_MS)
      return pc
    },
    [socket, update, cleanup]
  )

  const flushCandidates = async (pc) => {
    for (const c of pendingCandidates.current) await pc.addIceCandidate(c).catch(console.error)
    pendingCandidates.current = []
  }

  // ---- Socket events ----
  useEffect(() => {
    if (!socket) return undefined

    const onIncoming = ({ callId, chatId, kind, from }) => {
      if (callRef.current && callRef.current.status !== 'ended') return // server prevents this, but be safe
      clearTimeout(timers.current.close)
      const next = {
        callId,
        chatId,
        kind,
        direction: 'incoming',
        status: 'incoming',
        peer: from,
        muted: false,
        cameraOff: false,
      }
      callRef.current = next
      setCall(next)
      tone('ringtone')
    }

    const onAccepted = async ({ callId }) => {
      const current = callRef.current
      if (current?.callId !== callId) return
      tone(null)
      update({ status: 'connecting' })
      try {
        const pc = await createPeer(callId, current.localStream)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('call:signal', { callId, sdp: pc.localDescription })
      } catch (err) {
        console.error(err)
        socket.emit('call:end', { callId })
        cleanup('failed')
      }
    }

    const onSignal = async ({ callId, sdp, candidate }) => {
      const pc = pcRef.current
      if (!pc || callRef.current?.callId !== callId) return
      try {
        if (sdp) {
          await pc.setRemoteDescription(sdp)
          await flushCandidates(pc)
          if (sdp.type === 'offer') {
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            socket.emit('call:signal', { callId, sdp: pc.localDescription })
          }
        } else if (candidate) {
          // Candidates can arrive before the remote description is set — queue them
          if (pc.remoteDescription) await pc.addIceCandidate(candidate)
          else pendingCandidates.current.push(candidate)
        }
      } catch (err) {
        console.error('Signaling error', err)
      }
    }

    const onMedia = ({ callId, audio, video }) => {
      if (callRef.current?.callId === callId) update({ remoteMuted: !audio, remoteCameraOff: !video })
    }

    const onEnded = ({ callId, reason }) => {
      if (callRef.current?.callId === callId) cleanup(reason)
    }

    socket.on('call:incoming', onIncoming)
    socket.on('call:accepted', onAccepted)
    socket.on('call:signal', onSignal)
    socket.on('call:media', onMedia)
    socket.on('call:ended', onEnded)
    return () => {
      socket.off('call:incoming', onIncoming)
      socket.off('call:accepted', onAccepted)
      socket.off('call:signal', onSignal)
      socket.off('call:media', onMedia)
      socket.off('call:ended', onEnded)
    }
  }, [socket, tone, update, cleanup, createPeer])

  // Hang up if the page is closed mid-call; stop everything on logout
  useEffect(() => {
    const onUnload = () => callRef.current?.callId && socket?.emit('call:end', { callId: callRef.current.callId })
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [socket])
  useEffect(
    () => () => {
      stopToneRef.current?.()
      callRef.current?.localStream?.getTracks().forEach((t) => t.stop())
      pcRef.current?.close()
    },
    []
  )

  // ---- Actions ----
  const startCall = useCallback(
    async (chatId, kind) => {
      if ((callRef.current && !isOver()) || !socket) return
      clearTimeout(timers.current.close)
      const chat = chats.find((c) => c._id === chatId)
      if (!chat || chat.type !== 'direct') return
      const { other } = chatDisplay(chat, meId)
      const next = {
        chatId,
        kind,
        direction: 'outgoing',
        status: 'starting',
        peer: { _id: other._id, name: other.name, avatar: other.avatar },
        muted: false,
        cameraOff: false,
      }
      callRef.current = next
      setCall(next)

      let localStream
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' })
      } catch (err) {
        callRef.current = null
        setCall(null)
        alert(mediaError(err, kind))
        return
      }
      if (isOver()) {
        localStream.getTracks().forEach((t) => t.stop()) // hung up while the permission prompt was open
        return
      }
      update({ localStream })

      socket.emit('call:start', { chatId, kind }, (res) => {
        if (isOver()) {
          if (res.ok) socket.emit('call:end', { callId: res.data.callId })
          return
        }
        if (!res.ok) {
          cleanup(['busy', 'unavailable'].includes(res.code) ? res.code : 'failed')
          if (!['busy', 'unavailable'].includes(res.code)) alert(res.error)
          return
        }
        update({ callId: res.data.callId, status: 'ringing' })
        tone('ringback')
      })
    },
    [socket, chats, meId, update, cleanup, tone]
  )

  const acceptCall = useCallback(async () => {
    const current = callRef.current
    if (!current || current.status !== 'incoming') return
    tone(null)
    update({ status: 'connecting' })
    let localStream
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: current.kind === 'video' })
    } catch (err) {
      alert(mediaError(err, current.kind))
      socket.emit('call:decline', { callId: current.callId })
      cleanup()
      return
    }
    if (isOver()) {
      localStream.getTracks().forEach((t) => t.stop())
      return
    }
    update({ localStream })
    await createPeer(current.callId, localStream)
    socket.emit('call:accept', { callId: current.callId }, (res) => {
      if (!res.ok) cleanup('failed')
    })
  }, [socket, tone, update, cleanup, createPeer])

  const declineCall = useCallback(() => {
    const current = callRef.current
    if (!current) return
    socket.emit('call:decline', { callId: current.callId })
    cleanup()
  }, [socket, cleanup])

  const endCall = useCallback(() => {
    const current = callRef.current
    if (!current || current.status === 'ended') return
    if (current.callId) socket.emit('call:end', { callId: current.callId })
    cleanup('ended')
  }, [socket, cleanup])

  const toggleTrack = useCallback(
    (kind) => {
      const current = callRef.current
      const track = current?.localStream?.getTracks().find((t) => t.kind === kind)
      if (!track) return
      track.enabled = !track.enabled
      const audio = current.localStream.getAudioTracks().every((t) => t.enabled)
      const video = current.localStream.getVideoTracks().some((t) => t.enabled)
      update({ muted: !audio, cameraOff: !video })
      if (current.callId) socket.emit('call:media', { callId: current.callId, audio, video })
    },
    [socket, update]
  )

  const value = {
    call,
    inCall: !!call,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute: () => toggleTrack('audio'),
    toggleCamera: () => toggleTrack('video'),
  }
  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}

export const useCall = () => useContext(CallContext)
