import Phaser from 'phaser'
import { text } from './components'
import { t } from '../services/i18n'
import { audio } from '../services/audio'
/** Transparent 44px touch target; no persistent footer or panel. */
export function exitControl(scene: Phaser.Scene, exit: () => void) {
  const arrow = text(scene, 0, -5, '‹', 38, '#fff4d9').setStroke('#173f46', 4)
  const label = text(scene, 0, 16, t('exit'), 8, '#fff4d9').setStroke('#173f46', 3)
  const root = scene.add.container(0, 0, [arrow, label]).setSize(44, 44).setInteractive({ useHandCursor: true }).setName('battle-exit')
  let pressed = false
  root.on('pointerdown', () => { pressed = true; audio.unlock(); root.setAlpha(.7) })
  root.on('pointerout', () => { pressed = false; root.setAlpha(1) })
  root.on('pointerup', () => { if (pressed) { pressed = false; root.setAlpha(1); audio.effect('tap'); exit() } })
  return root
}
