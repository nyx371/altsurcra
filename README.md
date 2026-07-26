# Skyreach (working title)

A 2D mobile survival-climber: Subnautica's loop turned upside down. No diving — only up. Climb cliff faces on floating islands with energy-hungry magnetic gloves, harvest what grows on the rock, glide between islands, craft your way higher.

**Design:** see [GAME_DESIGN.md](GAME_DESIGN.md) · **Builds:** see [CHANGELOG.md](CHANGELOG.md) (also in-game via the version badge)

## Play

Vanilla JS, no dependencies, no build step — works on GitHub Pages as-is.

- **GitHub Pages:** enable Pages for this branch (Settings → Pages → Deploy from branch), then open `https://<user>.github.io/altsurcra/`
- **Locally:** any static server, e.g. `python3 -m http.server` in the repo root, then open `http://localhost:8000`

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Move / steer / climb | left-side virtual joystick | WASD / arrows |
| Jump · hold to glide (needs Glider) | right big button | Space |
| Harvest (hold) / open base | claw button | E |
| Pack + personal fabricator | knapsack button | C |
| Changelog | version badge (top right) | — |

Walk or glide into a cliff face and the magnetic gloves attach automatically. Climbing drains glove energy — at zero, you fall. Recharge on flat ground, fastest near the camp or a base you've placed.

## First-climb route (v0.1)

Harvest fiber + stone on the practice cliff → craft the Glider → glide east to Skyshard Spire → mine ore + crystal (mind the Stingwing and the Razorbeak) → battery Mk1 → place a base, build Fabricator Mk2 → battery Mk2 → climb The Needle.

## Credits

All UI and world symbols are from [game-icons.net](https://game-icons.net) (Lorc, Delapouite and contributors), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), inlined as path data in `js/icons.js`. No other external assets.
