import type { HomeAction } from '../game/homeAssets'

export const HOME_ACTIONS: readonly HomeAction[] = ['fighters', 'practice', 'ranking', 'play']
const PLAY_WIDTH_SCALE = 1.55
const PLAY_HEIGHT_SCALE = 1.3

export function homeButtonLayout(width: number, height: number) {
  const gap = Math.min(12, Math.max(6, width * .02))
  const standardWidth = (width - gap * 3) / (3 + PLAY_WIDTH_SCALE)
  let left = -width / 2
  return HOME_ACTIONS.map(id => {
    const buttonWidth = id === 'play' ? standardWidth * PLAY_WIDTH_SCALE : standardWidth
    const buttonHeight = id === 'play' ? height : height / PLAY_HEIGHT_SCALE
    const button = { id, x: left + buttonWidth / 2, y: (height - buttonHeight) / 2,
      width: buttonWidth, height: buttonHeight }
    left += buttonWidth + gap
    return button
  })
}

export function homeLayout(width: number, height: number) {
  const contentWidth = Math.min(width - 16, 620)
  const left = (width - contentWidth) / 2, right = left + contentWidth
  const hudHeight = height < 500 ? 42 : 48
  const resourceWidth = Math.min(112, Math.max(88, contentWidth * .29))
  const resourceGap = 8
  const topHud = {
    settings: { x: left + hudHeight / 2, y: 12 + hudHeight / 2, width: hudHeight, height: hudHeight },
    gems: { x: right - resourceWidth / 2, y: 12 + hudHeight / 2, width: resourceWidth, height: hudHeight },
    coins: { x: right - resourceWidth * 1.5 - resourceGap, y: 12 + hudHeight / 2, width: resourceWidth, height: hudHeight },
  }
  const navHeight = height < 620 ? 108 : 128
  const nav = { x: width / 2, y: height - navHeight / 2 - 8, width: contentWidth, height: navHeight }
  const logoHeight = Math.min(210, height * .27)
  const logoTop = 72
  const logo = { x: width / 2, y: logoTop + logoHeight / 2, width: logoHeight * 1.5, height: logoHeight }
  const top = logoTop + logoHeight + 10
  const bottom = nav.y - nav.height / 2 - 10
  return { contentWidth, topHud, nav, logo,
    illustration: { x: width / 2, y: (top + bottom) / 2, width: contentWidth, height: Math.max(1, bottom - top) } }
}
