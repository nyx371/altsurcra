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
| Grab a cliff face / climb | hold up while in front of one | W / up |
| Climb down from a top | hold down | S / down |
| Jump · hold to glide (needs Glider) | right big button | Space |
| Harvest (hold) · Glove pulse (tap, once crafted) | hand button | E |
| Enter base | house button (appears in range) | E |
| Pack + personal fabricator | knapsack button | C |
| Changelog + wipe save / remix world | version badge (top right) | — |

Cliffs never block you — walk in front of them. Hold up to grab the face and climb anywhere on it; climbing drains glove energy and at zero you fall. Recharge on flat ground, fastest near the camp or a base. Granite climbs bare-handed; basalt needs **Grip spikes**; storm rock needs **Resonant magnets**.

## The world

Every new game generates a fresh island chain from a random seed — resuming keeps your world, wiping the save remixes it. There are no guided goals: explore, harvest, craft, and push upward. Stingwings guard cliffs and Razorbeaks patrol the gaps (craft the **Glove pulse** and tap the hand button to drive them off); neutral lizards just live on the rock.

Dying scatters your raw materials into a cache where you fell — gear and upgrades are safe, and the cache is marked so you can climb back for the rest. Progress autosaves to your device.

## Credits

All UI and world symbols are from [game-icons.net](https://game-icons.net) (Lorc, Delapouite and contributors), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), inlined as path data in `js/icons.js`. No other external assets.
