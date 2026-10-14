const ARCADE_CLASS = 'arcade-background'

/** Selects the shared CSS backdrop without adding objects to the Phaser display list. */
export function arcadeBackground() {
  document.getElementById('app')?.classList.add(ARCADE_CLASS)
}

/** The Arena owns its full-screen Colosseum and must never show the arcade pattern. */
export function battleBackground() {
  document.getElementById('app')?.classList.remove(ARCADE_CLASS)
}
