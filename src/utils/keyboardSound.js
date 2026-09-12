let audioCtx = null
let noiseBuffer = null

function getNoiseBuffer(ctx) {
  if (noiseBuffer) return noiseBuffer
  const len = Math.floor(ctx.sampleRate * 0.05)
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return noiseBuffer
}

export function playClick() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = audioCtx
    const now = ctx.currentTime

    const noise = ctx.createBufferSource()
    noise.buffer = getNoiseBuffer(ctx)
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 2600 + Math.random() * 900
    bandpass.Q.value = 1.2
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.4, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032)
    noise.connect(bandpass).connect(noiseGain).connect(ctx.destination)
    noise.start(now); noise.stop(now + 0.04)

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(150 + Math.random() * 25, now)
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.05)
    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(0.2, now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    osc.connect(oscGain).connect(ctx.destination)
    osc.start(now); osc.stop(now + 0.08)
  } catch { /* audio not critical — fail silently */ }
}


export function playTypingClick() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const ctx = audioCtx
    const now = ctx.currentTime

    const noise = ctx.createBufferSource()
    noise.buffer = getNoiseBuffer(ctx)
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 2600 + Math.random() * 900
    bandpass.Q.value = 1.2
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.32, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
    noise.connect(bandpass).connect(noiseGain).connect(ctx.destination)
    noise.start(now); noise.stop(now + 0.035)

    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(150 + Math.random() * 25, now)
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.05)
    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(0.16, now)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
    osc.connect(oscGain).connect(ctx.destination)
    osc.start(now); osc.stop(now + 0.07)
  } catch { /* audio not critical */ }
}