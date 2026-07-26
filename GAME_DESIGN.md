# SKYREACH (working title)

*A 2D survival-crafting climb through a sky of floating islands. Subnautica's loop, inverted: instead of diving deeper, you climb higher.*

This is a living document. Sections marked **[v0.1]** are in the current playable build; everything else is direction for upcoming versions. Open questions for design discussion are collected at the bottom.

---

## 1. Pitch

You wake on a small island floating in an endless sky. Above you, chains of larger islands climb toward a storm-wrapped summit. Your only tools: a personal mobile fabricator and a pair of magnetic climbing gloves that eat energy with every meter you climb.

Climb cliff faces to harvest what grows and glitters on them. Leap off and glide between islands. Craft better gear, build bases on ledges and cliff walls, and push the frontier of how *high* you can survive. The sky is not empty — things live on the rock, and worse things ride the wind.

**Core fantasy:** the vertical frontier. Every meter of altitude is earned, provisioned for, and defended.

## 2. Design pillars

1. **Only up.** Progress, mystery, and danger all scale with altitude. There is no "down" to retreat into — descending means gliding, falling, or going home.
2. **Energy is oxygen.** Glove energy is the inverted oxygen-tank mechanic from Subnautica. A climb is a budget: enough charge to go up, harvest, and get somewhere safe. Overreach and you peel off the wall.
3. **The wall is the biome.** Cliff faces are not obstacles between places — they *are* the places. Resources, creatures, hazards, and base spots live on the vertical surface.
4. **Craft to climb, climb to craft.** Every tier of gear unlocks higher altitude, which unlocks rarer materials, which unlock the next tier.
5. **Mobile first.** One-thumb-plus-one-tap controls, short sessions, readable at phone size. No twitch reflexes required — planning and positioning over dexterity.

## 3. Core loop **[v0.1]**

```
Plan climb → Spend energy climbing → Harvest cliff resources → Avoid/absorb threats
   → Glide or descend to safety → Eat, recharge, craft → Unlock reach → Plan higher climb
```

Session shape (target 3–10 min): leave a safe ledge with full energy, execute one climb or one island hop, return with materials, convert them into a permanent upgrade or base piece.

## 4. Player systems

### 4.1 Movement **[v0.1]**

- **Walk/jump** on island tops and ledges. No energy cost.
- **Cliffs never block movement [v0.3]**: they sit behind the play layer. You walk in front of them, and small cliff shelves give you platforms to stand on. This makes the world read as *terrain to choose from*, not corridors.
- **Hills and steps [v0.4]**: low rock (under the ~105px standing jump) is scattered everywhere, often stacked into two tiers. Before you have gloves this is your whole vertical vocabulary — hop up a hill, hop to its step, take the berries off the top. It teaches height-as-reward using only the jump button, and it means the first ten minutes have real terrain instead of a flat waiting room.
- **Climbing must be earned [v0.4]**: you start bare-handed and *no* face will take you. **Magnetic gloves** are the first thing you fabricate (5 fiber, 4 stone — both gatherable on foot), and the glove-energy bar doesn't even appear until you own them. Starting with the signature verb spends it for free; making the player look up at an unclimbable wall for ten minutes first makes the gloves land.
- **Climb [v0.3 model]**: hold up while in front of a face to grab it (if energy > 0 and your gloves match the rock — see 4.4). On the face you move freely in 2D — up, down, sideways — mantle over the top edge, or hold down from a top to start a down-climb.
  - Moving on the wall drains energy per meter; hanging still drains only a slow trickle **[v0.2: cut to ~1/s]** — enough to keep the "energy is oxygen" pressure honest, cheap enough that stopping to read a route is a real option. Route-reading is the skill we want to reward, not thumb speed.
  - **Energy hits 0 → gloves release → you fall.** This is the core tension.
- **Detach**: jump off the wall for a shove, or use the **dedicated let-go button [v0.6]** — it appears only while you're gripping and drops you straight down with no sideways push. Jumping off and *choosing to fall* are different intentions and now have different buttons; on a wall over a long drop the difference matters.
- **Glide** (requires crafted Glider): hold the glide button while airborne to deploy. Slow descent, good horizontal speed, steerable. Gliding costs nothing — altitude is the currency you spend.
- **Double jump [v0.5]**: Spring boots give one extra mid-air jump (~+80px). Cheap, always available, no resource — it makes ordinary terrain traversal feel good and softens missed hops.
- **Jetpack [v0.5]**: a short burst of powered lift on **its own button and its own small fuel bar** — deliberately *not* the glide button and *not* glove energy. Jet fuel only refills on solid ground, so it is an escape hatch and a reach-extender, not flight: about 1.3s of thrust at first (Ripwing jets roughly doubles it). Keeping it on a separate tank means using it never eats the energy you need to finish a climb — the two resources answer different questions ("can I get up this wall?" vs "can I save this fall?").
- **Falling** onto rock from height causes damage. Falling off the bottom of the world into the cloud sea is death (later: recoverable with a late-game item).

### 4.2 Vitals **[v0.1]**

| Stat | Drains | Restored by | At zero |
|---|---|---|---|
| **Health** | Threats, falls | Slow regen while food > 60%, later: medkits | Death → wake at the last base you stood in **[v0.2]** |
| **Food** | Slowly over time | Eating skyberries, crafted rations | Health starts draining |
| **Glove energy** | Climbing (per meter), hanging (trickle), harvesting from the wall | Slow regen on safe ground; fast near a fabricator/base | Detach from wall |

Water/thirst is deliberately **not** in scope for now (one survival clock — food — plus the energy clock is enough pressure on mobile). Revisit later.

**Death and loss [v0.4].** Nothing is left lying in the world. Your first **four** falls cost you nothing at all; from the fifth onward each death takes **a quarter of every raw material** you're carrying (rounded down, so small stacks survive). Crafted gear and permanent upgrades are never lost, and you wake at the last base you actually stood in — deaths are usually long falls, and respawning at the *nearest* base would drag you back down past everything you built.

*Why this replaced the v0.2 corpse-run:* retrieval climbs sounded great on paper, but they punish the player twice — once for dying, again with a mandatory backtrack up terrain they'd already solved. A percentage toll keeps death meaningful without ever making you re-climb for a bag. The grace period matters too: the first hour is when you're still learning that energy runs out, and taxing that is just noise. Bases and storage stay valuable because 25% of a big haul hurts, so stashing before a hard push is still the smart play.

### 4.3¼ Thermals **[v0.6]**

Columns of rising air stand in the gaps between islands and beside the summit spike. Glide into one and you **gain** altitude instead of spending it (~115px/s; the **Thermal wing** more than doubles that). They're drawn as faint updraft motes that go gold when you're inside one.

This is the first way up that costs no energy at all, and it deliberately rewards the opposite instinct from climbing: instead of grinding up a face, you read the sky, launch into a column, and let it carry you. Thermals sit near the gaps you have to cross anyway, so a route that used to be "glide down and climb back up" can become "glide across, ride up, arrive higher than you left."

### 4.3½ Cliff rock tiers **[v0.3]**

Different rock demands different gear — the vertical version of Subnautica's depth-rated vehicles:

| Rock | Look | Needs |
|---|---|---|
| Granite | warm grey, mossy lip | bare magnetic gloves |
| Basalt | blue-black, columnar striations | **Grip spikes** |
| Storm rock | violet, crystal-flecked | **Resonant magnets** (stacked on spikes) |

The gate is at *grab time*: unclimbable rock simply refuses your hands (one short throttled notice says which upgrade it wants). Because the gate is material, not altitude, a remixed world can place a basalt shortcut low or a granite route high and the progression still holds.

### 4.4 Harvesting **[v0.1]**

Resource nodes grow on cliff faces and ledges. Harvesting takes ~1 second holding the interact button. Harvesting **while hanging on a wall costs a chunk of glove energy** — reaching out one-handed is expensive. Ledge nodes are free to harvest. Nodes respawn after a few minutes.

This makes "which nodes do I take on this energy budget" the moment-to-moment decision on a climb.

## 5. World

### 5.1 Structure

A vertical archipelago of floating islands in loose **altitude bands**. Higher bands = richer materials, harsher threats, and (later) environmental hazards. Islands within a band are reachable by gliding; moving *up* a band always requires climbing something.

**Remixed worlds [v0.3].** The world is generated from a seed on every new game: island sizes, cliff heights, shelf and node placement, nests, patrol routes and lizards all reroll, while the generator guarantees the spine — a safe granite start island with several practice cliffs, glide-reachable gaps, enough early ore/crystal to reach each gear tier, and a storm-rock summit spike at the end of the chain. Open-world posture: no goal ticker, no tutorial popups; names and labels live in the pack and base menus. The seed is stored in the save, so resuming keeps your world and wiping remixes it.

| Band | Name | Character | Key materials |
|---|---|---|---|
| 0 | **The Shallows** [v0.1] | Calm, green, tutorial-safe | Stone, fiber, skyberries |
| 1 | **The Drift** [v0.1, partial] | First real gaps, first threats | Iron ore, sky crystal |
| 2 | The Shear | Winds that push you mid-glide, brittle rock | (TBD: alloys, storm glass) |
| 3 | The Roost | Dense predator territory, nesting colonies | (TBD: rare biologics) |
| 4 | The Ceiling | Thin air (new pressure on vitals?), the summit mystery | (TBD) |

**[v0.1] contains:** Haven Rock (starter island, Band 0) with a practice cliff, and Skyshard Spire (Band 1) across a glide gap, with ore and crystal on its face and both threat types guarding it.

### 5.2 Why go up? (mystery spine)

Subnautica works because the depths *ask questions*. Ours: intermittent signal pulses from above the Ceiling; ruins bolted to undersides of high islands; the question of why the islands float at all. Concrete story beats TBD with design input — the systems don't depend on it yet.

## 6. Resources & crafting

### 6.1 Materials **[v0.1]**

| Material | Icon | Found | Used for |
|---|---|---|---|
| Skyberries | berry-bush | Ledge bushes, Band 0 | Food (eat raw or craft rations) |
| Fiber | plant-roots | Wall-clinging plants | Glider, base kit, ropes |
| Stone | stone-block | Ledges & faces | Base kit, weights, tools |
| Iron ore | ore | Band 1 cliff veins | Batteries, tools, Mk2 fabricator |
| Sky crystal | crystal-growth | Band 1 high faces | Energy tech |

### 6.2 Fabricator tiers

- **Personal fabricator** **[v0.1]**: always with you (it's the backpack). Small, field-tier recipes only. This is the Subnautica fabricator made mobile — because on a cliff, walking back down to craft would kill the loop.
- **Fabricator Mk2** **[v0.1: buildable, recipes teased]**: must be built inside a base. Unlocks gear-tier recipes (better batteries, wings, tools). Powerful crafting is anchored to *place*, giving bases a reason to exist.
- **Fabricator Mk3** [later]: endgame tier, requires high-band materials and possibly power infrastructure.

**Shared stock [v0.5].** Any fabricator draws on your pack **plus the storage of every base within range**, and spends what you carry first. The fabricator does not care which pocket a rock is in, and making the player shuttle items out of a chest they're standing next to was pure friction. Costs in the recipe list show the pooled total, so a base you're standing in visibly makes more things buildable. Out of range it stops counting, which quietly rewards building bases where you actually work.

### 6.3 Recipes **[v0.1]**

Personal fabricator:

| Recipe | Cost | Effect |
|---|---|---|
| Trail ration | 2 skyberries | Food +35 (vs +15 raw) |
| Glider | 4 fiber, 2 stone | Unlocks gliding |
| Glove battery Mk1 | 2 ore, 2 crystal | Max energy 100 → 150 |
| Base kit | 6 stone, 4 fiber | Placeable base platform |

Base (at a placed base, with Mk2 built):

| Recipe | Cost | Effect |
|---|---|---|
| Fabricator Mk2 | 3 ore, 2 crystal | Unlocks base crafting at that base |
| Glove battery Mk2 | 4 ore, 4 crystal | Max energy → 220 *(teased, craftable in v0.1)* |
| Thermal wing [later] | TBD | Glider gains rising-air lift |
| Grapple bolt [later] | TBD | One instant wall-attach from mid-air |

### 6.4 Progression skeleton

Reach is gated by grip, energy ceiling and air tech, not by artificial walls:
`bare hands (hills only) → Magnetic gloves → Glider → Spring boots → Range visor → Battery Mk1 → first base + Mk2 → Grip spikes (basalt) → Jetpack → Thermal wing → Scale armor → Battery Mk2 → Ripwing jets → Resonant magnets (storm rock) → …`

Three separate ways to gain height now exist and they cost different things: **climbing** spends glove energy, the **jetpack** spends its own fuel, and **thermals** cost nothing but require you to be in the right place. That spread is deliberate — it keeps "how do I get up there?" an interesting question at every tier.

Note that livestock gates the *survivability* branch (boots, armor) and trout gate the *air* branch (jets, magnets), so both catching mechanics sit on the critical path rather than being optional flavour.

### 6.4½ The Range visor **[v0.6]**

A cheap craftable that toggles the camera **half-scale**, showing the island chain, thermal columns, nests and threats far beyond normal view, framed in a green tint. It answers the question the open world created when the goal ticker was removed: *where do I even go?* Reading a route before committing energy to it is now a real, deliberate action rather than a guess — and it costs nothing to use, because the interesting decision is what you do with the information.

### 6.5 Playtest cheats **[v0.4]**

The pack carries a **Playtest** row: +20 materials, +3 base kits, unlock all gear, refill vitals. Restart-and-remix sits at the top of the changelog panel. These are deliberately in the shipped build — this is a design tool as much as a game right now, and being able to jump straight to "what does storm rock feel like with Mk2" beats replaying the opening every time. They come out (or go behind a tap-the-version-five-times gesture) when we start showing it to fresh players.

## 7. Bases **[v0.2]**

- A **base kit** places a small platform on flat ground **or bolts straight onto a cliff face** while you're hanging there. Cliff-side bases are the signature move: a wall base extends a **deck you can stand on**, converting any blank rock face into a rest stop, recharge point and supply dump.
- A base provides: **fast energy recharge** in its radius, **storage**, a **respawn point**, and a socket to build a **Fabricator Mk2**.
- Bases in range get their own on-screen button rather than sharing the harvest button — standing on a resource node must never hide your own front door.
- Later: beds (time skip?), farming planters on the wall, beacons visible from far islands, modular expansion like Subnautica corridors — but hanging.

**Why this is the heart of the game.** A cliff base turns a one-shot energy budget into a staged expedition: climb, bolt in, stash, recharge, climb again. It's the sky equivalent of dropping a Seabase halfway down a trench, and it's what makes the higher bands survivable without simply inflating the battery.

## 8. Threats

Threat design rule: threats attack your *position and energy*, not just your health bar. Getting knocked off a wall at low energy is scarier than the damage itself.

### 8.1 Current threats

- **Stingwing** (wasp-sting icon): territorial hoverer nesting on cliffs. Chases when you climb into its radius; hits do damage **and knock you off the wall**. Counterplay: route around, bait it out — or **Glove pulse** it.
- **Nightwing** (bat icon): patrols open sky between islands; dives at gliding players. Counterplay: watch its patrol, time your launch, drop altitude to break the dive — or pulse it mid-dive.
- **Glove pulse [v0.3]**: a cheap craftable magnetic burst on the hand button. Costs glove energy (the same resource climbing needs), so self-defense on a wall spends your safety margin — defense is a budgeting decision, not a free action.

### 8.1¼ Ground threat **[v0.6]**

- **Ridgerunner** (boar icon): patrols an island top on foot. When it spots you standing on its island it lowers its head and charges. The hit does almost nothing (6 damage) — **the shove is the weapon**: a hard horizontal launch that puts you in the air, and the danger is entirely what's behind you. On a wide island it's a nuisance; two steps from a 2000px drop it's lethal.

It never leaves its own island, so a charge is survivable if you read the ground and give yourself room, and it's the first threat that makes *where you stand* matter on flat terrain rather than on a wall. Counterplay: jump it, out-walk the cooldown, hop onto a hill it can't reach you on, or pulse it.

### 8.1½ Neutral life — and livestock **[v0.5]**

The wall is a biome, so most of what lives there shouldn't want to kill you. Both neutral species are **catchable, respawning livestock** and both are crafting inputs, which turns wildlife from scenery into a renewable resource layer:

- **Cliff lizards** (gecko icon): live on the faces and skitter away when you get close. Caught by **holding the hand button** while you grip the wall next to one. They flee from *inside* your reach radius, so a committed grab lands but a lazy one doesn't — and once your hand is on one it stops struggling. Scales go into **Spring boots** and **Scale armor**.
- **Sky trout** (flying-trout icon): drift in the open air between islands. You cannot hover next to one, so hold-to-catch would be impossible — instead you **catch them by flying through them**, which makes a glide across a gap into a fishing run. A faint halo shows the catch radius. They go into **Jetpack**, **Ripwing jets** and **Resonant magnets**.

Both respawn on a timer (90s) at their home spot, so a patch of wall or sky is a farm you come back to rather than a resource you strip.

**Design note:** capture is the first mechanic that rewards *stopping* on a wall rather than racing up it, which is exactly the behaviour the cheap idle-hang cost (4.1) was meant to enable.

### 8.2 Later

Nest colonies (area denial), rock-mimics on climbable faces, storm cells in Band 2 (environmental threat), an apex "leviathan of the sky" whose shadow crossing the sun is the fear beat — the Reaper equivalent. TBD with design input.

## 9. Controls (mobile) **[v0.1]**

- **Left thumb:** virtual joystick — walk, steer climbs, steer glides.
- **Right thumb:** three buttons — **Jump/Glide** (hold to glide), **Interact/Harvest** (hold), **Pack** (crafting + inventory overlay).
- Keyboard supported for desktop playtesting: WASD/arrows, Space (jump/hold to glide), E (interact), C (pack).
- Portrait and landscape both work; canvas scales to viewport.

## 10. Presentation **[v0.1]**

- Vanilla JS + single `<canvas>`, zero dependencies, static files → GitHub Pages.
- Flat stylized silhouette look: gradient sky by altitude, drifting clouds, dark rock, glowing resource nodes.
- All UI symbols and in-world markers are **game-icons.net** glyphs (CC BY 3.0), rendered from inlined path data — no emojis, no external asset loads.
- Version badge always on screen; tapping it shows the changelog ("what's in this build") — the playtest contract.

## 11. Versioning & playtest cadence

Semver-ish: `0.MINOR.PATCH` — minor = new system, patch = tuning/fixes. Each version ships with in-game changelog notes. Rough roadmap:

- **0.1 — First Climb** *(this build)*: core movement (walk/climb/glide), energy, vitals, harvest, personal fabricator, 4 recipes, base kit + Mk2 teaser, 2 threats, 2 islands, version/changelog UI.
- **0.2 — Homestead**: cliff-wall base placement with standable decks, base storage, material-drop death with recoverable caches, respawn at last base, autosave to localStorage, cheaper idle hang.
- **0.3 — Open Sky**: non-blocking climbable cliff *faces* (walk past, grab anywhere, free 2D wall movement, climb down from tops), seeded world remix per run, rock tiers gated by gear (granite/basalt/storm rock), Glove pulse defense, neutral cliff lizards, tutorial layer removed.
- **0.4 — Ground Up**: climbing must be crafted, jumpable hills and stepped shelves, percentage death toll after a grace period (no world caches), playtest cheats, compact inventory.
- **0.5 — Livestock**: pooled crafting across pack and nearby base storage, catchable respawning lizards and sky trout as recipe inputs, jetpack + Ripwing jets on a separate fuel bar, Spring boots (double jump), Scale armor, health kits, bats replace vultures.
- **0.6 — The Shear** *(current build)*: thermals and the Thermal wing, ridgerunners, dedicated let-go button, Range visor, bottom-anchored menu close, iOS long-press hardening.
- **0.7 — Alive Sky**: predator/prey ecology (bats hunting trout?), nests, day/night, scannable life, horizontal wind shear during glides.
- **0.8 — The Signal**: mystery spine beat 1, scanner tool, discovery log.

## 12. Design questions

### Settled

1. **Energy while hanging still** — kept as a drain, but cut to roughly 1/s in v0.2. Zero drain would have made the wall a couch; this keeps the oxygen analogy while letting you stop and plan. *Revisit if playtests show people still rushing routes.*
2. **Death penalty** — settled twice. v0.2 dropped a recoverable cache; v0.4 replaced it with a flat 25% material toll after four free falls, because forced retrieval climbs punish the player twice and make them re-solve terrain they'd already beaten. See 4.2.

### Still open (for Kalle)

3. **Personal fabricator scope** — should it work *while hanging on a wall* (craft a ration mid-climb)? Currently yes. Too forgiving?
4. **Thirst** — permanently out, or a high-band pressure (thin air = water need)?
5. **Glide energy** — gliding is free (altitude is the cost). Should powered maneuvers (a flap/boost) exist and draw glove energy?
6. **World structure** — hand-authored islands (current) vs. procedural bands with authored landmarks?
7. **Cliff base density** — nothing currently stops you bolting a base every 200m up a face and trivialising the climb. Options: base kits stay expensive, a minimum spacing rule, or higher bands physically reject anchors (storm-brittle rock) so the top of the game is earned in one push.

---

*Icons: [game-icons.net](https://game-icons.net) contributors (Lorc, Delapouite, et al.), CC BY 3.0.*
