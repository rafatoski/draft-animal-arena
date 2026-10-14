import Phaser from 'phaser'
import fightersIconUrl from '../assets/home-fighters.png'
import practiceIconUrl from '../assets/home-practice.png'
import rankingIconUrl from '../assets/home-ranking.png'
import coinIconUrl from '../assets/home-coin.png'
import settingsIconUrl from '../assets/home-settings.png'
import gemsIconUrl from '../assets/home-gems.png'
export type HomeAction = 'fighters' | 'practice' | 'ranking' | 'play'
export type HomeIcon = Exclude<HomeAction, 'play'> | 'settings' | 'coin' | 'gems'
export interface ImageReference { key: string; url?: string }
/** Set a Vite-imported PNG URL here to replace a vector icon or fill the artwork slot. */
export const HOME_ASSETS = {
  illustration: { key: 'home-illustration' } as ImageReference,
  icons: {
    fighters: { key: 'home-fighters', url: fightersIconUrl },
    practice: { key: 'home-practice', url: practiceIconUrl },
    ranking: { key: 'home-ranking', url: rankingIconUrl },
    settings: { key: 'home-settings', url: settingsIconUrl },
    coin: { key: 'home-coin', url: coinIconUrl },
    gems: { key: 'home-gems', url: gemsIconUrl },
  } as Record<HomeIcon, ImageReference>,
}
/** Decorative home illustrations in public/assets/home. Only files that exist at build time are used. */
const HOME_ART = ['home-heroes', 'home-villains', 'chicken-vs-robot', 'k9-platypus-duo']
const present = new Set(Object.keys(import.meta.glob('/public/assets/home/*.png', { query: '?url', import: 'default' }))
  .map(path => path.split('/').pop()!.replace('.png', '')))
const homeArt = HOME_ART.filter(name => present.has(name))
const artKey = (name: string) => `home-art-${name}`
const failed = new Set<string>()
/** One uniformly random illustration key, or undefined when none exist. Call once per Home visit. */
export function pickHomeArt() {
  const loaded = homeArt.filter(name => !failed.has(name))
  return loaded.length ? artKey(loaded[Math.floor(Math.random() * loaded.length)]!) : undefined
}
export function preloadHomeAssets(scene: Phaser.Scene) {
  for (const name of homeArt) {
    if (scene.textures.exists(artKey(name))) continue
    scene.load.image(artKey(name), `${import.meta.env.BASE_URL}assets/home/${name}.png`)
  }
  // A file that fails to load is dropped from the pool instead of breaking Home.
  const onError = (file: Phaser.Loader.File) => {
    const name = homeArt.find(n => artKey(n) === file.key); if (name) { failed.add(name); console.warn(`Home art missing: ${name}`) }
  }
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError)
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError))
  for (const asset of Object.values(HOME_ASSETS.icons)) {
    if (asset.url && !scene.textures.exists(asset.key)) scene.load.image(asset.key, asset.url)
  }
}
