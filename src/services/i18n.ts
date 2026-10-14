import { preferences } from './preferences'
const en = {
  guest: 'Guest', leaderboard: 'LEADERBOARD', navFighters: 'FIGHTERS', exit: 'EXIT', leaderboardSoon: 'The podium is getting ready.\nRankings are coming soon!',
  club: 'THE WILD LITTLE FIGHT CLUB', tagline: 'Small paws. Big problems.',
  play: 'PLAY', practice: 'PRACTICE', ranking: 'RANKING', fighters: 'MY FIGHTERS', settings: 'SETTINGS', multiplayer: 'MULTIPLAYER', soon: 'COMING SOON',
  back: 'BACK', home: 'MAIN MENU', rematch: 'REMATCH', again: 'PLAY AGAIN',
  menuHint: '3 fighters. 5 seconds. Total chaos.', footer: 'PICK A PACK. WATCH THE CHAOS.',
  language: 'LANGUAGE', music: 'MUSIC', sfx: 'SOUND EFFECTS', on: 'ON', off: 'OFF',
  saved: 'Preferences saved automatically', settingsHint: 'Set the mood for your next rumble.',
  galleryHint: 'Meet your beautifully weird team.', galleryNote: 'All six fighters are ready to play.',
  attackLabel: 'ATTACK', defenseLabel: 'DEFENSE', speedLabel: 'SPEED', detailsClose: 'CLOSE',
  hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', crit: 'CRIT', range: 'RANGE',
  draft: 'DRAFT YOUR PACK', choose: 'Choose 3 • tap again to undo', picked: 'PICKED',
  auto: 'Empty spots auto-fill. Keys 1–6 also work.', ready: 'THE PACKS ARE READY',
  bottom: 'Your team starts below • mint rings', fight: 'LET THE FUR FLY!',
  cheer: 'Combat is automatic. Cheer irresponsibly.', rivals: 'RIVALS', yours: 'YOUR PACK',
  other: 'THE OTHER GUYS', weirdos: 'YOUR BEAUTIFUL WEIRDOS', rule: 'FIRST RULE: NO GOOD HAIRCUTS.',
  critical: 'CRIT!', nap: 'nap time', oof: 'oof.', meant: 'I meant that.',
  draw: 'IT’S A DRAW', victory: 'VICTORY!', defeat: 'DEFEATED!',
  winSub: 'Your pack brought the wild.', loseSub: 'Bruised egos. Excellent effort.', drawSub: 'Nobody gets bragging rights.',
  duration: '{seconds}s of absolute nonsense', standing: 'Still standing: {count}', seed: 'MATCH SEED',
  rematchHint: 'Same packs. Another rumble.', againHint: 'New draft. New rivals.',
  chicken: 'Boxing Chicken', capybara: 'Capybara Tank', raccoon: 'Ninja Raccoon', frog: 'Wizard Frog', fox: 'Archer Fox', pig: 'Berserker Pig',
  chickenRole: 'QUICK JABS', capybaraRole: 'UNBOTHERED', raccoonRole: 'TRASH ASSASSIN', frogRole: 'CROAK & DESTROY', foxRole: 'VERY POINTY', pigRole: 'FULL HAM',
  comingText: 'The herd is gathering.\nOnline battles are coming soon!', close: 'GOT IT',
  robot1: 'Training Bot 1', robot2: 'Training Bot 2', robot3: 'Training Bot 3', botTeam: 'Training Bots',
  fightNow: 'FIGHT!',
  practiceNote: 'PRACTICE • NO RANKING OR COINS',
  roundN: 'ROUND {n}', finalRound: 'FINAL ROUND', roundYou: 'YOUR PACK TAKES THE ROUND', roundRival: 'RIVALS TAKE THE ROUND', roundDraw: 'DRAW • ROUND REPLAYED',
  finalScore: 'FINAL SCORE  {score}', winnerIs: 'MATCH WINNER: {team}',
  appLabel: 'Animal Arena. Enter to play. Keys 1 to 6 select fighters during drafting.',
}
export type TextKey = keyof typeof en
const es: Record<TextKey, string> = {
  guest: 'Invitado', leaderboard: 'RANKING', navFighters: 'LUCHADORES', exit: 'SALIR', leaderboardSoon: 'El podio se está preparando.\n¡La clasificación llegará pronto!',
  club: 'EL CLUB DE PELEA MÁS SALVAJE', tagline: 'Patas pequeñas. Grandes líos.',
  play: 'JUGAR', practice: 'PRÁCTICA', ranking: 'RANKING', fighters: 'MIS LUCHADORES', settings: 'AJUSTES', multiplayer: 'MULTIJUGADOR', soon: 'PRÓXIMAMENTE',
  back: 'VOLVER', home: 'MENÚ PRINCIPAL', rematch: 'REVANCHA', again: 'JUGAR DE NUEVO',
  menuHint: '3 luchadores. 5 segundos. Puro caos.', footer: 'ELIGE TU EQUIPO. QUE EMPIECE EL CAOS.',
  language: 'IDIOMA', music: 'MÚSICA', sfx: 'EFECTOS DE SONIDO', on: 'SÍ', off: 'NO',
  saved: 'Las preferencias se guardan solas', settingsHint: 'Prepara el ambiente para la pelea.',
  galleryHint: 'Conoce a tu equipo de bichos raros.', galleryNote: 'Los seis luchadores están disponibles.',
  attackLabel: 'ATAQUE', defenseLabel: 'DEFENSA', speedLabel: 'VELOCIDAD', detailsClose: 'CERRAR',
  hp: 'VIDA', atk: 'ATQ', def: 'DEF', spd: 'VEL', crit: 'CRÍT', range: 'ALCANCE',
  draft: 'ELIGE TU EQUIPO', choose: 'Elige 3 • toca de nuevo para quitar', picked: 'ELEGIDOS',
  auto: 'Los huecos se llenan solos. Usa también 1–6.', ready: 'LOS EQUIPOS ESTÁN LISTOS',
  bottom: 'Tu equipo empieza abajo • aros verdes', fight: '¡QUE VUELEN LOS PELOS!',
  cheer: 'La pelea es automática. ¡Anima sin parar!', rivals: 'RIVALES', yours: 'TU EQUIPO',
  other: 'LOS OTROS', weirdos: 'TUS ADORABLES BICHOS RAROS', rule: 'PRIMERA REGLA: NADA DE BUENOS PEINADOS.',
  critical: '¡CRÍT!', nap: 'la siesta', oof: '¡uf!', meant: 'era a propósito',
  draw: '¡EMPATE!', victory: '¡VICTORIA!', defeat: '¡DERROTA!',
  winSub: 'Tu equipo sacó su lado salvaje.', loseSub: 'Egos heridos. Un gran esfuerzo.', drawSub: 'Hoy nadie puede presumir.',
  duration: '{seconds}s de auténtica locura', standing: 'Siguen en pie: {count}', seed: 'SEMILLA',
  rematchHint: 'Mismos equipos. Otra pelea.', againHint: 'Nueva selección. Nuevos rivales.',
  chicken: 'Pollo Boxeador', capybara: 'Capibara Tanque', raccoon: 'Mapache Ninja', frog: 'Rana Maga', fox: 'Zorro Arquero', pig: 'Cerdo Furioso',
  chickenRole: 'GOLPES VELOCES', capybaraRole: 'SIN PREOCUPACIONES', raccoonRole: 'ASESINO DE BASURA', frogRole: 'CROA Y DESTRUYE', foxRole: 'PUNTERÍA AFILADA', pigRole: 'A TODO JAMÓN',
  comingText: 'La manada se está reuniendo.\n¡Pronto llegarán las batallas en línea!', close: 'ENTENDIDO',
  robot1: 'Robot de práctica 1', robot2: 'Robot de práctica 2', robot3: 'Robot de práctica 3', botTeam: 'Robots de práctica',
  fightNow: '¡PELEA!',
  practiceNote: 'PRÁCTICA • SIN RANKING NI MONEDAS',
  roundN: 'RONDA {n}', finalRound: 'RONDA FINAL', roundYou: 'TU EQUIPO GANA LA RONDA', roundRival: 'LOS RIVALES GANAN LA RONDA', roundDraw: 'EMPATE • SE REPITE LA RONDA',
  finalScore: 'MARCADOR FINAL  {score}', winnerIs: 'GANADOR: {team}',
  appLabel: 'Animal Arena. Pulsa Intro para jugar. Las teclas 1 a 6 eligen luchadores.',
}
export const dictionaries = { en, es }
export function t(key: TextKey, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), dictionaries[preferences.language][key])
}
export function fighterName(id: string) { return t(id as TextKey) }
export function fighterRole(id: string) { return t(`${id}Role` as TextKey) }
export function syncDocumentLanguage() {
  document.documentElement.lang = preferences.language
  document.querySelector('#app')?.setAttribute('aria-label', t('appLabel'))
}
