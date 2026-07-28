# Skyreach changelog

Mirrored in-game: tap the version badge. Source of truth for the in-game view is `js/version.js`.

## v0.15.0 — Close In (2026-07-28)

- **Zoomed in.** The camera's reference viewport came in from 380×620 to 300×500 with the floor raised 0.75 → 0.95, so the world sits noticeably closer. The Range visor was retuned by the same factor to keep framing the same amount of sky
- **Everything that moves against you is about a third slower**, so a threat arriving at the new zoom is still something you can read and answer: ridgerunners (charge 275 → 195), stingwings (170 → 118), shardlings (250 → 165), nightwings (dive cap 330 → 250), the Skywyrm (330 → 205), and the neutral wildlife's skitter with them
- **A small joystick now sits permanently in the bottom-left corner.** It no longer springs up wherever you touch — deflection is measured from the fixed ring, and the region that drives it is still most of the lower-left quadrant
- **Messages moved to the top left, under the vital bars.** They are a child of the HUD column now, so they follow the bars automatically when those shrink behind a menu
- **The Skywyrm lives near the ceiling** (2100–2700px above the ground line, never near the home island), patrols a much tighter arc, and its aggro radius dropped 900 → 340 with the warning at 620
- **iOS long-press magnifier, properly fixed.** Every button except three was listening only for `click`, which iOS synthesises *after* it has already decided a long press was a text-selection gesture. All controls now take the `pointerdown` and prevent its default, plus explicit `-webkit-touch-callout` / `-webkit-user-select` / `touch-action` rules on form controls rather than relying on the universal selector
- Screen-edge markers (relic compass, survey lens, the wyrm) are pushed clear of the joystick and the button grid

## v0.14.1 — Debug Modes (2026-07-27)

- **Invincible** (cheats row, or `I`): hits, bleed damage and starvation all do nothing, and falling past the cloud sea puts you back at your last safe spot instead of killing you
- **Fly mode** (cheats row, or `G`): the stick moves you freely in eight directions at 520px/s — no gravity, no collision, no glove energy. Turning it off hands you cleanly back to gravity
- Both are **modes, not grants**: they flag themselves on the HUD for as long as they are on, their buttons read as switches, and neither is ever written to the save — waking up silently invincible would quietly corrupt the playtest feedback they exist to gather

## v0.14.0 — Skyrunner (2026-07-27)

- **Skyrunner** (Mk3: 10 skysteel, 6 hide, 6 silk, 12 ore, 10 crystal): a real airship. Board it from its own button, fly in any direction with no fuel, no glove energy and no gravity, and step off whenever you like. Take a hit too many and it goes down to the nearest deck and mends itself there — you are never stranded
- **The Skywyrm**: one to a world, patrolling the deep sky. It warns you at long range, warns you again when it commits, and then hunts — you or your ship, whichever you are flying. Put distance between you and it loses interest
- **Glider rework**: the Mk1 is a parachute (slow fall, some steering, not much reach). The new **Ridge wing** (4 silk, 6 fiber, 2 crystal) has far less drag and roughly triples the glide ratio
- **Wing shield** (3 hide, 4 ore, 2 crystal): turns a flying attack aside for a little glove energy. Not armour — it spends the same resource climbing does
- **Stingwings sting and peel off** instead of shoving you off the wall, then come round for another pass
- **Three new creatures**: ledge grazers (placid livestock on island tops, catchable for hide), lantern moths (drift the gaps, glow at night, caught by flying through them for silk), and shardlings (storm-rock swarmers, small bites, no let-up)
- **Tabs at the bottom of the pack and base panels**, pinned beside the close button. Built one-off gear collapses into a chip row so the list you scroll is only what you can still make
- **Info messages moved to the bottom left**, left-aligned
- Handholds and rest ledges blend further into the host rock

## v0.13.0 — The Drift (2026-07-27)

- **The sky no longer ends.** Past either edge of the authored island chain, procedural islands generate as you fly — endlessly, east and west, deterministic from the world seed
- The drift escalates with distance: granite gives way to basalt and storm rock, resources get richer, and the company gets meaner. Every island carries a thermal so it is never a one-way trip
- Drift chunks, and everything you strip or tame on them, persist in the save
- **Dedicated feed button** — holding out food no longer competes with the hand button for a target
- **The Field scanner is passive.** Anything you take, touch, grip or fly through logs itself; hold-to-scan is gone
- **The visor is a survey view.** Standing or hanging, the stick pans the camera instead of moving you, and every button but the visor clears out of the way
- **Jetpack rework:** the thruster button arms it and jump fires it, so flying uses the button your thumb is already on. It stays armed through landings and grabs, and still cuts out on an empty tank
- Stripped nodes disappear from the world instead of sitting there greyed out
- Off-screen rock, creatures and effects are culled and frozen, so an endless world still holds 60fps

## v0.12.0 — Stocktake (2026-07-27)

- **Survey lens** (2 crystal, 2 ore): a Survey section in the pack counting how much of each material is still standing out in the world
- Tap **Track** on a material and a screen-edge arrow points to the nearest deposit **you have already charted**, with its distance
- The sky chart marks every unstripped deposit in charted ground, coloured by material
- The default camera sits noticeably closer in (reference viewport 380x620, floor 0.75) — the visor was retuned to keep framing the same amount of world

## v0.11.0 — Cable and Seed (2026-07-27)

- Islands are much larger — the start island is nearly double its old width, and every island in the chain has room to explore
- Resources no longer respawn: what you strip off the rock is gone for good, and every node pays out more for it
- World generation now guarantees enough of every material to finish a run, since nothing grows back
- Planter boxes: build up to 4 beds at a base and grow skyberries or fiber — the only renewable materials up here
- Zipline kit (Mk2): place two anchors, string a powered cable, and ride it in either direction
- Feed a ridgerunner (hold the hand while carrying food) and it stops charging you for good — it follows you around instead
- Much less thorn on the start island, and the first cliff you meet is always clear
- Lizard ration: lizards come back, so food can never dead-end
- Second spires on wide islands, more hills per deck, and denser outposts

## v0.10.0 — Thorn and Shale (2026-07-26)

- Cliff patches are now tinted from the rock they sit on — subtle, but the patterns still read at a glance
- Razor shale: holds your weight and cuts you while you hang on it
- Slick rock is properly slippery — you slide down it instead of just paying more
- Thorn grows across cliff lips and blocks you from topping out until it is cut
- Thorn hook (3 stone, 2 fiber): the first tool, and the first real goal before the glider
- A wrecked expedition sits beside camp — search it once for supplies, scan it for the log
- Cut thorn pays fiber and grows back in time

## v0.9.0 — Reading the Rock (2026-07-26)

- Cliff faces now have routes: handholds are cheap, slick rock is brutal, rest ledges stop the drain, and crumbling rock gives way if you hang on it
- Your gloves glow the colour of whatever you are gripping
- Sky chart (map button, top right): fog-of-war of everywhere you have been, with camp, bases, relics and the summit
- Recipes are discovered, not listed — plans appear when you find the reason for them
- Sound: procedural wind that follows altitude and storms, glove hum, thunder and more. Toggle top right
- The camera looks ahead when you move fast, so you can see what you are gliding into
- The visor pulls back three times further and marks bases, relics, threats and thermals
- No ridgerunner on the starting island

## v0.8.0 — Long Night (2026-07-26)

- Day and night: the sky turns, stars come out, nightwings hunt harder and thermals go weak after dark
- Storms roll in with driving wind that shoves you mid-glide, and lightning that hunts anything high and exposed
- Sleep at a base to skip to dawn — costs food, restores energy, fuel and some health
- Field scanner and field log: scan 11 rocks, creatures and landmarks to fill it in
- Rob stingwing nests for eggs — the resident wakes up angry
- Skysteel appears on the highest faces and unlocks Fabricator Mk3
- Mk3 gear: Storm suit (lightning-proof), Ascender rig (fast, cheap climbing), Signal beacon
- Raise the beacon on the highest rock in the world to finish the run

## v0.7.0 — Wayfarer (2026-07-26)

- Outposts far out to the left and right: dense resources, wildlife and a sealed relic on each
- Relics are permanent trophies (never lost on death) and buy the Relic compass and Relic core (320 energy)
- The world no longer stops at an invisible wall — the walkable area now spans everything generated
- Jetpack is a toggle, not a hold; it cuts out on landing, on grabbing rock, and when the tank runs dry
- Buttons sit in a fixed grid: hand and jump never move, let-go and thruster stack above jump
- Vital bars stay visible and legible while a menu is open

## v0.6.0 — The Shear (2026-07-26)

- Thermals: glide into a rising column to gain altitude for free — the Thermal wing rides them hard
- Ridgerunners patrol island tops and charge: little damage, but they shove you off the edge
- Dedicated let-go button while climbing, so you can drop off a wall on purpose
- Range visor: craftable, toggles a far-out view of the sky for reading a route
- Close button now sits fixed at the bottom of every menu
- Hardened against the iOS long-press magnifier and text selection

## v0.5.0 — Livestock (2026-07-26)

- Fabricators draw materials from your pack AND the storage of any base in range
- Catch cliff lizards and sky trout — both respawn after a while
- Lizards and trout are recipe ingredients: boots, armor, jets and magnets need them
- Jetpack (needs Glider) adds a short fuel bar and a thruster button; Ripwing jets double the tank
- Spring boots: double jump. Scale armor: take 45% less damage. Health kit: +45 health
- Flying predators are now nightwings (bat)

## v0.4.0 — Ground Up (2026-07-26)

- You start with bare hands — gather on foot and fabricate Magnetic gloves before any cliff will take you
- Small hills and stepped shelves everywhere, jumpable without gloves
- Death no longer drops anything in the world: your first 4 falls are free, then each one costs a quarter of your materials
- Playtest cheat buttons in the pack: materials, base kits, unlock all gear, refill vitals
- Restart moved to the top of the changelog panel
- Compact inventory tiles — tap one to eat or place it

## v0.3.0 — Open Sky (2026-07-26)

- Cliffs no longer block you — walk in front of them, hold up to grab the face, climb anywhere on it
- Climb down from any cliff top by holding down; small cliff shelves you can stand on
- The world is remixed from a random seed on every new game (resume keeps your world)
- Cliff rock tiers: granite bare-handed, basalt needs Grip spikes, storm rock needs Resonant magnets
- Glove pulse (craftable): tap the hand near a creature to blast Stingwings and Razorbeaks away
- Neutral lizards live on the cliff faces and skitter away from you
- Guided goals and tutorial popups removed — explore; labels live in your pack
- Harvest button is now a hand

## v0.2.0 — Homestead (2026-07-26)

- Bolt bases straight onto cliff faces — open your Pack while gripping the wall and place a Base kit
- Cliff bases extend a deck you can stand on, turning any wall into a rest stop
- Storage at every base: deposit all, take back what you need
- Death now scatters your raw materials into a recoverable cache — climb back for them
- Upgrades and gear are never lost on death; you respawn at the nearest base
- Progress saves to your device automatically; wipe it from the changelog panel
- Hanging still on a wall costs far less energy — stop and plan your route

## v0.1.1 — Steady Hands (2026-07-26)

- Blocked double-tap zoom, pinch zoom, text selection and the iOS long-press magnifier
- Buttons respond instantly to taps; crafting panels still scroll normally

## v0.1.0 — First Climb (2026-07-26)

- Walk, jump, magnetic-glove climbing with energy drain, mantling over ledges
- Health, food and glove-energy vitals; fall damage; cloud-sea death and respawn
- Harvestable cliff resources: skyberries, fiber, stone, iron ore, sky crystal
- Personal fabricator: trail ration, glider, glove battery Mk1, base kit
- Gliding between islands (craft the glider first)
- Placeable base: recharge zone, respawn point, buildable Fabricator Mk2 (battery Mk2)
- Two threats: Stingwing on the spire cliffs, Razorbeak patrolling the gap
- Two islands + a summit spike to test a maxed climb; goal hints; touch + keyboard controls
