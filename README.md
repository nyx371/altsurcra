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
| Harvest / catch a lizard / feed a ridgerunner (hold) · Glove pulse (tap, once crafted) | hand button | E |
| Jetpack thrust (tap to toggle, once crafted) | thruster button | Shift |
| Let go of the wall | release button (appears while climbing) | Q |
| Range visor: zoom way out (once crafted) | binocular button | V |
| Ride a zipline / drop off it | cable button (appears beside one) | Z |
| Sky chart | map button (top right) | M |
| Mute / unmute | speaker button (top right) | — |
| Enter base | house button (appears in range) | E |
| Pack + personal fabricator | knapsack button | C |
| Changelog + wipe save / remix world | version badge (top right) | — |

Cliff faces have **routes**, drawn in the rock's own colour with distinct patterns: dotted **handholds** are cheap, **rest ledges** (rungs) cost nothing at all, streaked **slick rock** slides you downward, toothed **razor shale** cuts you while you hang on it, and cracked **crumbling rock** only takes your weight for a moment before it breaks. Your gloves glow the colour of whatever you're gripping. Read the line before you commit to it.

**Thorn** grows across cliff lips and stops you topping out. Craft the **Thorn hook** (3 stone, 2 fiber) to cut through — it pays fiber back, and the thorn regrows in time. Search the **wrecked expedition** beside camp for starting supplies.

Recipes are **discovered, not listed** — plans appear when you find the reason for them, so the fabricator only ever shows things you could actually build.

You start bare-handed: gather on foot, hop the low hills, and fabricate **Magnetic gloves** before any cliff will take you. After that, cliffs never block you — walk in front of them, hold up to grab the face, and climb anywhere on it. Climbing drains glove energy and at zero you fall. Recharge on flat ground, fastest near the camp or a base. Granite needs gloves; basalt needs **Grip spikes**; storm rock needs **Resonant magnets**.

**Nothing on the rock grows back.** A harvested node is gone for good, so a stripped island is a used-up island and the way forward is outward. Every world is generated with more of each material than the whole tech tree costs, and the things that *do* renew live at home: build **Planter boxes** at a base (5 stone, 4 fiber, up to four beds) and sow a skyberry or a fiber to get three back. Cliff lizards and sky trout still respawn, and **Lizard ration** turns one into food, so you can never starve out a world you have picked clean.

A **Zipline kit** (4 ore, 2 crystal, 4 fiber, at a Mk2) strings a **motorised cable** between two points you pick: place one anchor, walk or fly to the far end, place the second. It carries you *both ways* — push the stick along the line to reverse mid-span — and you can catch it anywhere along its length, not just at the ends.

**Ridgerunners can be talked down.** Hold the hand button near one while carrying a skyberry or a ration and it takes the food, stops charging for good, and follows you around its island instead.

Your first four falls are free. From the fifth on, each death costs a quarter of the raw materials you're carrying — gear and upgrades are never lost, and nothing is left behind in the world to go fetch.

The pack has a **Playtest cheats** row (materials, base kits, zipline kits, restore stripped resources, unlock gear, refill vitals), and **Restart** sits at the top of the changelog panel.

## The world

Every new game generates a fresh island chain from a random seed — resuming keeps your world, wiping the save remixes it. There are no guided goals: explore, harvest, craft, and push upward. Stingwings guard cliffs and nightwings patrol the gaps; craft the **Glove pulse** and tap the hand button to drive them off.

Neutral wildlife is livestock: hold the hand button beside a **cliff lizard** to catch one, and **sky trout** are caught by gliding straight through them. Both respawn — the only wild things that do — and both are crafting inputs: lizards for Spring boots, Scale armor and rations, trout for the Jetpack and Resonant magnets.

Fabricators pool materials from your pack **and** the storage of any base you're standing in, so you never have to shuttle rocks out of a chest you're next to.

**Thermals** — faint columns of rising air between islands — lift you *upward* while gliding, and the Thermal wing rides them hard. **Ridgerunners** patrol island tops and charge: barely any damage, but the shove will put you over an edge.

Going sideways pays too: **outposts** sit far east and west of the main chain, each with dense resources, wildlife and a sealed **relic**. Relics are permanent — never lost on death — and buy the **Relic compass** (arrows to relics you haven't found) and the **Relic core**, the top energy tier.

**Day and night** turn every five minutes: after dark the nightwings hunt harder and thermals go weak, so sleep it off at a base or gear up for it. **Storms** bring wind that shoves you mid-glide and lightning that hunts anything high and exposed — climb, shelter, or build the Storm suit.

Build a **Field scanner** and hold the hand on anything new to fill an 11-entry field log. Rob stingwing nests for eggs (the resident wakes up angry). **Skysteel** on the highest faces unlocks **Fabricator Mk3**, and with it the Storm suit, the Ascender rig, and the **Signal beacon** — carry that to the highest rock in the world to finish the run.

Progress autosaves to your device.

## Credits

All UI and world symbols are from [game-icons.net](https://game-icons.net) (Lorc, Delapouite and contributors), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), inlined as path data in `js/icons.js`. No other external assets.
