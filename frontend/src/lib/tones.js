// Ringtones generated with the Web Audio API, so no sound files are needed.
// Each pattern is a list of [frequencies, durationMs] steps; an empty list is silence.
const PATTERNS = {
  // What the caller hears while it rings (classic ringback)
  ringback: [
    [[440, 480], 1500],
    [[], 3000],
  ],
  // What the person being called hears
  ringtone: [
    [[880, 660], 200],
    [[], 100],
    [[880, 660], 200],
    [[], 1500],
  ],
  // Short beeps when a call ends or fails
  ended: [
    [[480, 620], 250],
    [[], 150],
    [[480, 620], 250],
    [[], 150],
    [[480, 620], 250],
  ],
}

let ctx

function audioContext() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Plays a tone pattern; returns a function that stops it
export function playTone(name, { loop = true } = {}) {
  const ac = audioContext()
  if (!ac) return () => {}
  const steps = PATTERNS[name]
  let stopped = false
  let timer
  let nodes = []

  const silence = () => {
    nodes.forEach((n) => {
      try {
        n.stop()
      } catch {
        // already stopped
      }
    })
    nodes = []
  }

  const run = (i) => {
    if (stopped) return
    if (i >= steps.length) {
      if (loop) run(0)
      return
    }
    const [freqs, ms] = steps[i]
    silence()
    if (freqs.length) {
      const gain = ac.createGain()
      gain.gain.value = 0.08
      gain.connect(ac.destination)
      nodes = freqs.map((f) => {
        const osc = ac.createOscillator()
        osc.frequency.value = f
        osc.connect(gain)
        osc.start()
        return osc
      })
    }
    timer = setTimeout(() => run(i + 1), ms)
  }

  run(0)
  return () => {
    stopped = true
    clearTimeout(timer)
    silence()
  }
}
