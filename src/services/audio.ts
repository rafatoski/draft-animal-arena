import { preferences } from './preferences'
/** Tiny synthesized soundtrack and effects: no downloads, audio files, or dependencies. */
class GameAudio {
  private context?: AudioContext
  private musicGain?: GainNode
  private sfxGain?: GainNode
  private timer?: ReturnType<typeof setInterval>
  private beat = 0
  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.context?.suspend()
      else if (this.context) void this.context.resume().catch(() => {})
    })
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.musicGain = this.context.createGain(); this.musicGain.connect(this.context.destination)
        this.sfxGain = this.context.createGain(); this.sfxGain.connect(this.context.destination)
        this.timer = setInterval(() => this.musicBeat(), 240)
      }
      void this.context.resume().catch(() => {})
      this.sync()
    } catch { /* Silent play on browsers without Web Audio. */ }
  }
  sync() {
    if (this.musicGain) this.musicGain.gain.value = preferences.music ? .045 : 0
    if (this.sfxGain) this.sfxGain.gain.value = preferences.sfx ? .09 : 0
  }
  private tone(frequency: number, duration: number, bus: GainNode | undefined, type: OscillatorType = 'sine') {
    if (!this.context || !bus || this.context.state !== 'running') return
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain()
    oscillator.type = type; oscillator.frequency.value = frequency
    const now = this.context.currentTime
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(1, now + .012)
    envelope.gain.exponentialRampToValueAtTime(.001, now + duration)
    oscillator.connect(envelope); envelope.connect(bus)
    oscillator.start(); oscillator.stop(now + duration + .02)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
  }
  private musicBeat() {
    if (!preferences.music) return
    const melody = [523, 0, 659, 784, 0, 659, 587, 0, 440, 0, 523, 659, 587, 0, 392, 0]
    const note = melody[this.beat % melody.length]!
    if (note) this.tone(note, .18, this.musicGain, 'triangle')
    if (this.beat % 4 === 0) this.tone(this.beat % 16 < 8 ? 131 : 110, .35, this.musicGain)
    this.beat++
  }
  effect(kind: 'tap' | 'hit' | 'crit' | 'count' | 'win' | 'lose') {
    if (!preferences.sfx) return
    const notes = { tap: 660, hit: 150, crit: 880, count: 440, win: 1047, lose: 196 }
    this.tone(notes[kind], kind === 'win' || kind === 'lose' ? .6 : .12, this.sfxGain, kind === 'hit' ? 'triangle' : 'sine')
  }
  destroy() {
    if (this.timer) clearInterval(this.timer)
    void this.context?.close()
    this.context = undefined; this.musicGain = undefined; this.sfxGain = undefined; this.timer = undefined
  }
}
export const audio = new GameAudio()
