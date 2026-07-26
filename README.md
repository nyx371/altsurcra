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

You start bare-handed: gather on foot, hop the low hills, and fabricate **Magnetic gloves** before any cliff will take you. After that, cliffs never block you — walk in front of them, hold up to grab the face, and climb anywhere on it. Climbing drains glove energy and at zero you fall. Recharge on flat ground, fastest near the camp or a base. Granite needs gloves; basalt needs **Grip spikes**; storm rock needs **Resonant magnets**.

Your first four falls are free. From the fifth on, each death costs a quarter of the raw materials you're carrying — gear and upgrades are never lost, and nothing is left behind in the world to go fetch.

The pack has a **Playtest cheats** row (materials, base kits, unlock gear, refill vitals), and **Restart** sits at the top of the changelog panel.

## The world

Every new game generates a fresh island chain from a random seed — resuming keeps your world, wiping the save remixes it. There are no guided goals: explore, harvest, craft, and push upward. Stingwings guard cliffs and Razorbeaks patrol the gaps (craft the **Glove pulse** and tap the hand button to drive them off); neutral lizards just live on the rock.

Progress autosaves to your device.

## Credits

All UI and world symbols are from [game-icons.net](https://game-icons.net) (Lorc, Delapouite and contributors), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), inlined as path data in `js/icons.js`. No other external assets.
