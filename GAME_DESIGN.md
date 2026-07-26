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
- **Climb**: touching a cliff wall while airborne or walking into it attaches the magnetic gloves automatically (if energy > 0). While attached you can move up/down the face and mantle over the top edge.
  - Moving on the wall drains energy per meter; hanging still drains only a slow trickle **[v0.2: cut to ~1/s]** — enough to keep the "energy is oxygen" pressure honest, cheap enough that stopping to read a route is a real option. Route-reading is the skill we want to reward, not thumb speed.
  - **Energy hits 0 → gloves release → you fall.** This is the core tension.
- **Detach** deliberately (jump off the wall) to fall or start a glide.
- **Glide** (requires crafted Glider): hold the glide button while airborne to deploy. Slow descent, good horizontal speed, steerable. Gliding costs nothing — altitude is the currency you spend.
- **Falling** onto rock from height causes damage. Falling off the bottom of the world into the cloud sea is death (later: recoverable with a late-game item).

### 4.2 Vitals **[v0.1]**

| Stat | Drains | Restored by | At zero |
|---|---|---|---|
| **Health** | Threats, falls | Slow regen while food > 60%, later: medkits | Death → wake at the last base you stood in **[v0.2]** |
| **Food** | Slowly over time | Eating skyberries, crafted rations | Health starts draining |
| **Glove energy** | Climbing (per meter), hanging (trickle), harvesting from the wall | Slow regen on safe ground; fast near a fabricator/base | Detach from wall |

Water/thirst is deliberately **not** in scope for now (one survival clock — food — plus the energy clock is enough pressure on mobile). Revisit later.

**Death and loss [v0.2].** Dying scatters your **raw materials** into a cache at the spot you fell; crafted gear and permanent upgrades are never lost. You wake at the last base you actually stood in — not the nearest one to your body, because deaths are usually long falls and "nearest" would drag you back down past everything you built. The cache is marked on screen (with an edge pointer when off screen) and recovered by touching it. This is the Subnautica retrieval-dive inverted: the run back to your stuff is a *climb*, made with an empty pack, and it's some of the best tension in the game. Bases exist partly to make it optional — stash before you push higher.

### 4.3 Harvesting **[v0.1]**

Resource nodes grow on cliff faces and ledges. Harvesting takes ~1 second holding the interact button. Harvesting **while hanging on a wall costs a chunk of glove energy** — reaching out one-handed is expensive. Ledge nodes are free to harvest. Nodes respawn after a few minutes.

This makes "which nodes do I take on this energy budget" the moment-to-moment decision on a climb.

## 5. World

### 5.1 Structure

A vertical archipelago of floating islands in loose **altitude bands**. Higher bands = richer materials, harsher threats, and (later) environmental hazards. Islands within a band are reachable by gliding; moving *up* a band always requires climbing something.

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

Reach is gated by energy ceiling and glide tech, not by artificial walls:
`bare gloves → Glider → Battery Mk1 → first base + Mk2 → Battery Mk2 → Band 2 tech (wind gear) → …`

## 7. Bases **[v0.2]**

- A **base kit** places a small platform on flat ground **or bolts straight onto a cliff face** while you're hanging there. Cliff-side bases are the signature move: a wall base extends a **deck you can stand on**, converting any blank rock face into a rest stop, recharge point and supply dump.
- A base provides: **fast energy recharge** in its radius, **storage**, a **respawn point**, and a socket to build a **Fabricator Mk2**.
- Bases in range get their own on-screen button rather than sharing the harvest button — standing on a resource node must never hide your own front door.
- Later: beds (time skip?), farming planters on the wall, beacons visible from far islands, modular expansion like Subnautica corridors — but hanging.

**Why this is the heart of the game.** A cliff base turns a one-shot energy budget into a staged expedition: climb, bolt in, stash, recharge, climb again. It's the sky equivalent of dropping a Seabase halfway down a trench, and it's what makes the higher bands survivable without simply inflating the battery.

## 8. Threats

Threat design rule: threats attack your *position and energy*, not just your health bar. Getting knocked off a wall at low energy is scarier than the damage itself.

### 8.1 v0.1 threats

- **Stingwing** (wasp-sting icon): territorial hoverer nesting on Band 1 cliffs. Chases when you climb into its radius; hits do damage **and knock you off the wall**. Counterplay: route around, bait it out, or tank it with food/health buffer.
- **Razorbeak** (vulture icon): patrols open sky between islands; dives at gliding players. Counterplay: watch its patrol, time your launch, or drop altitude to break the dive.

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
- **0.2 — Homestead** *(current build)*: cliff-wall base placement with standable decks, base storage, material-drop death with recoverable caches, respawn at last base, autosave to localStorage, cheaper idle hang.
- **0.3 — The Shear**: Band 2, wind during glides, new materials + wind-tech recipes.
- **0.4 — Alive Sky**: creature AI pass, nests, day/night, ambient life.
- **0.5 — The Signal**: mystery spine beat 1, scanner tool, discovery log.

## 12. Design questions

### Settled

1. **Energy while hanging still** — kept as a drain, but cut to roughly 1/s in v0.2. Zero drain would have made the wall a couch; this keeps the oxygen analogy while letting you stop and plan. *Revisit if playtests show people still rushing routes.*
2. **Death penalty** — on as of v0.2: raw materials drop into a recoverable cache, gear and upgrades never do. Retrieval climbs are too good to leave on the table, and capping the loss at materials keeps it from feeling punitive.

### Still open (for Kalle)

3. **Personal fabricator scope** — should it work *while hanging on a wall* (craft a ration mid-climb)? Currently yes. Too forgiving?
4. **Thirst** — permanently out, or a high-band pressure (thin air = water need)?
5. **Glide energy** — gliding is free (altitude is the cost). Should powered maneuvers (a flap/boost) exist and draw glove energy?
6. **World structure** — hand-authored islands (current) vs. procedural bands with authored landmarks?
7. **Cliff base density** — nothing currently stops you bolting a base every 200m up a face and trivialising the climb. Options: base kits stay expensive, a minimum spacing rule, or higher bands physically reject anchors (storm-brittle rock) so the top of the game is earned in one push.

---

*Icons: [game-icons.net](https://game-icons.net) contributors (Lorc, Delapouite, et al.), CC BY 3.0.*
