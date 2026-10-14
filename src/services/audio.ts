import { preferences } from './preferences'
/** Background music is an mp3 loop; effects are tiny synthesized tones. */
class GameAudio {
  private context?: AudioContext
  private music?: HTMLAudioElement
  private sfxGain?: GainNode
  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (document.hidden) { void this.context?.suspend(); this.music?.pause() }
      else { if (this.context) void this.context.resume().catch(() => {}); this.sync() }
    })
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.music = new Audio(`${import.meta.env.BASE_URL}assets/audio/music.mp3`); this.music.loop = true; this.music.volume = .35
        this.sfxGain = this.context.createGain(); this.sfxGain.connect(this.context.destination)
      }
      void this.context.resume().catch(() => {})
      this.sync()
    } catch { /* Silent play on browsers without Web Audio. */ }
  }
  sync() {
    if (this.music) { if (preferences.music && !document.hidden) void this.music.play().catch(() => {}); else this.music.pause() }
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
  effect(kind: 'tap' | 'hit' | 'crit' | 'count' | 'win' | 'lose') {
    if (!preferences.sfx) return
    const notes = { tap: 660, hit: 150, crit: 880, count: 440, win: 1047, lose: 196 }
    this.tone(notes[kind], kind === 'win' || kind === 'lose' ? .6 : .12, this.sfxGain, kind === 'hit' ? 'triangle' : 'sine')
  }
  destroy() {
    this.music?.pause()
    void this.context?.close()
    this.context = undefined; this.music = undefined; this.sfxGain = undefined
  }
}
export const audio = new GameAudio()
