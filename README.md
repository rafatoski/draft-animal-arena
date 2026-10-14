# Animal Arena

A mobile-first, portrait 3v3 auto-battler built with Vite, TypeScript, and Phaser 3. Fighters are drawn programmatically; the official logo and Roman Colosseum background use the supplied original PNG assets. No backend, authentication, external APIs, or paid services.

## Run locally

Use Node.js 22.12+ (tested on 22.19).

```sh
npm install
npm run dev
```

Open the local URL Vite prints, normally http://localhost:5173.

To play on a phone on the same Wi-Fi:

```sh
npm run dev -- --host 0.0.0.0
```

Open the Network URL Vite prints on your phone. Allow local network access if your firewall asks.

```sh
npm test          # Pure combat tests; no browser or extra test dependencies
npm run build    # TypeScript check and production build into dist/
npm run preview  # Serve the production build locally
```

## Play

1. After the animated splash, press **PLAY** in the main menu (or Enter).
2. Tap three distinct fighters within five seconds. Tap again to deselect; keys **1–6** also work. A full team remains editable until the timer expires. Empty spots are filled automatically.
3. After **3–2–1**, your green-ringed team advances from the bottom and the coral-ringed rivals from the top. Combat runs automatically.
4. The result screen provides three separate actions:
   - **REMATCH** skips drafting, keeps both ordered teams and the original combat seed, resets all combat state, and starts the countdown. Because combat is deterministic, this is an exact replay.
   - **PLAY AGAIN** starts a new five-second draft with a new seed and newly generated opponent, even when the page has a `?seed=` parameter. A random opponent can coincidentally have the same fighters.
   - **MAIN MENU** returns home.
5. **FIGHTERS** displays all six original fighters and their unchanged statistics. **PRACTICE** reuses the existing AI battle with a fresh setup, **RANKING** opens the localized Coming Soon leaderboard, and **PLAY** retains the established main battle flow. No networking is implemented.
6. **SETTINGS** lets you select English or Spanish and toggle music and sound effects independently. Preferences persist in localStorage, with safe defaults if storage is blocked or malformed. English is the default.

Audio is synthesized with Web Audio and begins only after a user gesture. Music and sound effects require no downloaded assets or external services. Audio suspends while the document is hidden.

The six fighters have distinct health, attack, defense, movement speed, critical chance, attack range, and attack cooldown. Fox and Frog attack at range; the others fight up close. Their personalities are visual flavor; there are no hidden abilities.

## Architecture

- `src/game/config.ts`: dimensions, draft duration, fixed tick interval, match limit.
- `src/game/fighters.ts`: typed fighter definitions and balancing values.
- `src/simulation/random.ts`: seeded PRNG and Fisher–Yates shuffle.
- `src/simulation/combat.ts`: Phaser-independent state, targeting, movement, damage, and victory events.
- `src/game/animalArt.ts`: procedural animal drawings.
- `src/scenes/ArenaScene.ts`: existing draft/countdown/battle flow, arena, and event-driven animation.
- `src/scenes/SplashScene.ts`, `MenuScene.ts`, `FightersScene.ts`, `SettingsScene.ts`, `ResultsScene.ts`: dedicated screens with animated navigation.
- `src/ui/components.ts`: shared cartoon panels, animated buttons, backgrounds, title, and fighter cards.
- `src/game/match.ts`: seeded roster generation and immutable rematch setup.
- `src/services/i18n.ts`: typed English/Spanish dictionary, interpolation, fighter names, and roles.
- `src/services/preferences.ts`: validated preference loading and safe persistence.
- `src/services/audio.ts`: lightweight synthesized music and effects.
- `src/rendering/colosseum.ts`: original Roman Colosseum texture rendered behind the combat world.
- `src/rendering/battlefield.ts`: source-image landmarks, uniform image placement, and the fixed playable bounds.
- `src/rendering/layout.ts`: pure portrait/landscape viewport and camera-zoom calculations.
- `src/rendering/responsive.ts`: preserves the original menu and results layouts on a resizing canvas.
- `src/main.ts` and `src/style.css`: RESIZE canvas initialization and a parent bounded by mobile safe-area insets.
- `tests/`: deterministic simulation and boundary-condition tests using Node's built-in runner.

## Combat contract

Each step advances exactly 50ms. Units target the nearest living enemy using start-of-tick positions, breaking equal-distance ties by unit ID. Movement uses speed in arena pixels per second. Fighters stop within their attack range and attack when their cooldown (in ticks) expires.

Damage is `max(1, round((attack - defense) * criticalMultiplier))`, with a critical multiplier of 1.75 and a normal multiplier of 1. Critical rolls use only the seeded PRNG. All attacks for a tick are gathered before any damage is applied, allowing simultaneous knockouts. Defeated units stop acting. Eliminating the opposing team wins; simultaneous elimination is a draw. At 90 seconds, the team with the greater sum of remaining health fractions wins; equal sums draw.

Animations never change simulation state. Rendering uses a fixed-step accumulator and caps catch-up after a suspended tab; backgrounding can pause game time rather than skipping the match. This is a local prototype, not a network-synchronized clock.

Use `http://localhost:5173/?seed=12345` for repeatable drafting randomness. The same seed **and ordered player picks** reproduce the same opponent and combat. The match seed appears on the result panel; rematches always retain the prior seed; Play Again always generates a new one. Future multiplayer can exchange the seed and ordered rosters and run the simulation separately from rendering.

## Verification and limitations

Production build and 44 tests pass, including 100 seeded random matchups, clean rematch resets, new draft generation, validated/persistent preferences, complete English/Spanish dictionary coverage, and portrait/landscape camera projection checks at ten resolutions (320×568 through 2560×1080). The layout tests also rotate the view throughout 20 simulated battles and check fighter, health-bar, and floating-effect bounds. These are automated geometry checks, not rendered browser tests. Browser visual/touch verification was unavailable in the implementation session because no browser was connected. Recommended manual checks: visit every menu screen, switch languages and reload, listen to each audio toggle, select/deselect during drafting, let an empty draft auto-fill, watch a full battle, try all three result actions repeatedly, and rotate/resize the viewport.

Phaser's bundled engine triggers Vite's advisory large-chunk warning; the production build succeeds. This version does not include accounts, match-history persistence, matchmaking, multiplayer networking, advertisements, or advanced pathfinding.

## Responsive colosseum

`src/assets/roman-colosseum.png` is the original 1672×941 image, copied without editing or re-encoding. Source and production file SHA-256: `690fdbe8bc30e20258bbd722a7d9fc3b0cf52ab3ed47106a48038fd9908bd14c`. Phaser loads it on arena entry and caches it for rematches.

The fixed battlefield is `x=48..432, y=205..665` (384×460 world units) on every device. The image uses one uniform 0.9 world scale. Source point `(836,485)` maps to world `(240,435)`, placing the battlefield wholly within a conservative inset of the sandy floor. The background does not define new movement space.

- **Portrait:** zoom is based on the immediate stone rim (source image x=578..1094), not the full artwork height. The sand and rim fill the phone viewport width, while side scenery is cropped. A fixed y=140..690 world safety envelope protects the complete playable rectangle, fighters, health bars, and rising damage text. Non-playable top/bottom scenery may be cropped on shorter screens. The camera fills the safe viewport, with zoom capped to keep the combat envelope below the floating HUD.
- **Landscape:** the camera fits the complete original image. Additional scenery is decorative. The fixed world image keeps its original proportions. A uniformly scaled decorative copy of the same original texture fills the screen behind it where the aspect ratios differ; it never defines additional playable space.
- **HUD:** the full-screen world camera shows scenery beneath transparent floating combat text. There are no battle header/footer fills or bottom Main Menu button. A 44px top-left Exit control (or Escape) returns home. Health bars stay attached above fighters. Drafting retains its necessary selection panel and camera-correct input; results still provide Rematch, Play Again, and Main Menu.
- **Rotation:** only camera viewport/zoom changes. Combat, timers, teams, and world positions remain intact. Resize listeners are removed on scene shutdown.
- **Safe areas:** CSS removes notch/home-indicator insets from the canvas parent before Phaser measures it; `100dvh` tracks mobile browser chrome.

Combat code is unchanged. Initial fighter centers lie in `[120,360] × [265,605]`. Every movement step travels toward another living fighter without overshooting, so centers remain within that starting rectangle by construction. Tests cover all 400 distinct unordered three-fighter roster pairings with seeded combat, including body/health-bar extents inside the fixed battlefield. The rectangle is independent of camera size; no decorative region becomes playable.

Automated tests cover ten portrait/landscape sizes and simulated mid-battle rotations. Browser rendering and touch checks remain outstanding when no browser is connected.

## Official logo

`src/assets/draft-animal-arena-logo.png` is the original supplied 1536×1024 PNG, copied without editing or re-encoding. Its SHA-256 is `12d59dd51684bd9de39fb3249296dcf5f68ecf708aa1d1b64df554ab40fdcc8f`. The production asset is byte-for-byte identical.

`src/game/assets.ts` loads it with Phaser's image loader during splash preload and reuses the texture in the menu. The shared logo component uses uniform scaling and a 650ms fade-in from 96% to 100% scale. The existing responsive scene cameras preserve proportions on mobile and desktop. Menu spacing reserves separate regions for the logo, animated fighters, and buttons. No cropping, tinting, background removal, or image compression is applied.

## Arcade home and future artwork

The home screen uses native responsive coordinates with a centered maximum-width content region: a compact Settings control, separate coin and display-only gem counters, the official logo, an intentionally empty illustration slot, and four independent bottom buttons. Fighters, Practice, and Ranking use the exact supplied transparent PNG icons without text labels. Play is 55% wider than those buttons and contains only the localized white `PLAY`/`JUGAR` label with a solid black outline. Fighters opens the collection, Ranking opens the localized Coming Soon leaderboard, and both Practice and Play reuse the existing AI Arena flow. Practice requests a fresh setup; Play preserves the established route behavior.

The coin counter reads `animal-arena.player.v1` from localStorage and preserves its validated balance. Gems show zero as an isolated display placeholder; no gem storage, purchases, rewards, or currency economy were added.

To integrate future PNGs, import their Vite URLs in `src/game/homeAssets.ts` and set `HOME_ASSETS.illustration.url` or an entry in `HOME_ASSETS.icons`. Phaser preloads configured images and automatically contains them without distortion. Unconfigured icons use simple vector symbols; the unconfigured illustration container stays empty. No scene changes are required to swap assets.

`src/ui/homeLayout.ts` defines the non-overlapping layout regions, `src/ui/homeNavigation.ts` owns the four button blocks and replaceable icon slots, and `src/ui/exitControl.ts` owns the transparent battle exit target. Safe-area insets continue to be handled by the canvas parent. Automated checks cover seven home screen sizes, full-screen battle viewports, minimum navigation touch widths, button gaps, the wider Play action, exact icon hashes, route mappings, overlay clearance, and local-player validation. Rendered visual/touch checks remain unverified without a connected browser.

## Shared purple arcade background

All non-combat screens use a shared CSS backdrop selected by `src/ui/arcadeBackground.ts`. A subtle gradient runs from `#60409C` to `#452B78`, while `public/assets/images/paw-star-pattern.png` repeats on a separate 128px grid at 10% opacity on mobile and desktop. The source symbol is uniformly downscaled and centered in a transparent tile, keeping its proportions while giving each visible symbol regular breathing room.

The Phaser canvas is transparent so the lightweight CSS layers remain behind every interface object. Arena explicitly disables the arcade class and retains its opaque camera color and original Roman Colosseum rendering. No pattern GameObjects, resize loops, animation, or full-background image tiles are created.

The shared portrait-scene camera now spans the full safe viewport while retaining the same centered UI position and scale, so desktop margins also show the purple texture. Large settings/results panels were removed; their text is light and outlined. Home chips and navigation use translucent backing while existing button/card styles remain intact. The disabled Multiplayer item remains disabled; the Leaderboard Coming Soon screen uses the shared backdrop.

Automated checks verify the gradient, repeat settings, public pattern asset, scene coverage, removal of the previous screenshot strip, and explicit Arena exclusion. Browser visual inspection remains unverified in the current environment.

## Typography

Lilita One is the global game typeface. The official Google Fonts TrueType file is bundled locally at `src/assets/lilita-one-regular.ttf`, so gameplay does not depend on a live font request. `src/ui/typography.ts` registers and loads it before Phaser starts, then every Phaser Text object uses the shared family constant. CSS declares the same local font for the HTML shell. Both paths fall back to Trebuchet MS, Arial, and sans-serif if font loading fails.

The bundled font includes the Latin characters, accented Spanish glyphs, `ñ`, and inverted Spanish punctuation used by the English/Spanish dictionaries. Existing font sizes and responsive scale limits remain unchanged.
