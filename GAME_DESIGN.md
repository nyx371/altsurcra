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
- **Jetpack [v0.5, toggle since v0.7]**: powered lift on **its own button and its own small fuel bar**. It **latches**: one tap on, one tap off — holding a thruster while also steering and gliding was a three-thumb problem on a phone. It cuts out by itself when the tank empties, when you land, and when you grab rock, so it can never quietly drain while you are doing something else. Otherwise it is a short burst — deliberately *not* the glide button and *not* glove energy. Jet fuel only refills on solid ground, so it is an escape hatch and a reach-extender, not flight: about 1.3s of thrust at first (Ripwing jets roughly doubles it). Keeping it on a separate tank means using it never eats the energy you need to finish a climb — the two resources answer different questions ("can I get up this wall?" vs "can I save this fall?").
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

### 4.2½ Routes on the rock **[v0.9]**

Faces are no longer uniform. Every climbable face generates non-overlapping bands of:

| Feature | What it does | Reads as |
|---|---|---|
| **Handholds** | 0.45× energy | notched dots |
| **Rest ledge** | **zero** drain, even hanging still | a rung with uprights |
| **Slick rock** | 1.35× energy **and you slide down it** (~62px/s) — it will not hold you still | fine horizontal streaks |
| **Razor shale** | 1.15× energy **and it cuts you** (~7hp/s while gripped; armour blunts it) | upward teeth |
| **Crumbling** | takes your weight for only ~1.6s, then breaks and drops you | vertical cracks (heals after ~26s) |

**Colour [v0.10].** Each patch is drawn as the *host rock's own colour* nudged ~30% toward a feature tint, not painted on top of it. Patches read as part of the cliff rather than stickers, and the **pattern** does the identifying — teeth for shale, streaks for slick, cracks for crumbling — so they stay legible at visor range and for colour-blind players.

**Why five and not three.** Slick and razor shale used to be one red band that only cost more energy, which meant it communicated nothing: it looked dangerous and merely felt expensive. Splitting it gives two failure modes that read differently in play — slick *takes position away from you* (you can cross it, you cannot linger or rest), and shale *takes health*, which is the first climbing hazard that a full energy bar cannot solve.

This is the change the whole game was waiting for. Before it, a cliff was a rectangle you held *up* against while a bar drained — there was no route to read, which meant the visor, the cheap idle hang and the ascender were all serving a decision the player never actually made. Now a face has a *good line and a bad line*: string handholds and ledges together and a climb is cheap; cut straight up through slick rock and you arrive with nothing left. Crumbling rock adds a timing beat — you can cross it, you just can't rest on it. Harder rock types get meaner mixes, so tier also changes *texture*, not just permission.

Your gloves glow the colour of whatever you're gripping, and the glove hum shifts pitch with it, so the state is readable without looking at a bar.

### 4.3⅛ The world clock and weather **[v0.8]**

**Day and night** turn on a 5-minute cycle. The sky shifts through dusk to indigo, stars come out, and two systems change with it: **nightwings hunt harder** (wider detection, faster dives) and **thermals go weak** — they are sun-warmed air, so after dark the free ride mostly stops. Night is not a fail state, it is a *cost change*: the cheap way up closes and the sky gets teeth, so you either provision for it or sleep through it.

**Sleeping** at a base skips to dawn for 22 food, and restores energy, jet fuel and some health. That makes a base a place you *use*, not just a locker, and gives food a second job beyond the starvation clock.

**Storms** roll in every few minutes for about 50 seconds. They bring:
- **Wind** that shoves anything airborne sideways (up to 260px/s, swinging through the storm). Mid-glide this is genuinely dangerous — a gap you measured in calm air is a different gap now.
- **Lightning** that strikes anything high and exposed (above the storm line, not gripping rock). It hurts a lot; the **Storm suit** makes you immune.
- **Stronger thermals** (+35%). The storm is the best and worst time to be in the air, which is exactly the tension we want: the fastest ascent in the game is also the one that can kill you.

The counterplay is layered: hug the rock (climbing is safe from bolts), wait it out at a base, or gear past it with the Storm suit.

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

Resource nodes grow on cliff faces and ledges. Harvesting takes ~1 second holding the interact button. Harvesting **while hanging on a wall costs a chunk of glove energy** — reaching out one-handed is expensive. Ledge nodes are free to harvest.

This makes "which nodes do I take on this energy budget" the moment-to-moment decision on a climb.

**Nodes are finite [v0.11].** What you strip off the rock is gone for good. Respawning nodes made every island interchangeable — one patch of wall was as good as any other, and the correct play was always to farm the nearest one. With a fixed stock, a stripped island is *used up*, which is what pushes you outward and upward, and a node you walk past is a decision instead of a delay. Yields went up (2 → 3, skysteel 1 → 2) to match: a node is now a find, not a tick.

Two things stop this becoming a dead end. Generation guarantees a floor of every material — comfortably more than the whole tech tree costs — and the renewable half of the economy moves to **base planters** (7⅔) and to livestock, which still respawn. Cut thorn also pays fiber and regrows, and **Lizard ration** turns respawning livestock into food, so the survival loop can never run out even on a world you have picked clean.

## 5. World

### 5.1 Structure

A vertical archipelago of floating islands in loose **altitude bands**. Higher bands = richer materials, harsher threats, and (later) environmental hazards. Islands within a band are reachable by gliding; moving *up* a band always requires climbing something.

**Island scale [v0.11].** Islands roughly doubled in width. The old ones read as platforms — you could see both edges at once, so an island was a waypoint rather than a place. At the new size the start island alone carries five to seven hills, three or four practice cliffs and a wreck, and wide islands in the chain grow a **second spire** at the far end so there is more than one thing on them worth climbing. Gaps between islands were left alone: glide range is a tuned quantity and the point was to make the rock bigger, not the sky wider.

**Going sideways [v0.7].** The chain climbs, but **outposts** generate far out to the left and right of it at easy altitudes — three or four per world, hundreds of metres past the last island of the main chain. Each carries a dense node cluster, wildlife, a ridgerunner, a return thermal so it is never a one-way trip, and a **sealed relic**.

This exists because the pillars pull hard toward "only up", and a world where the only correct direction is up stops being a world and becomes a ladder. Outposts make *what's over there?* pay as reliably as *what's up there?*, and because they sit at gentle altitudes they're reachable early — a horizontal expedition is the natural thing to do when a vertical one is still out of your gear range.

**Relics.** One per outpost, opened by hand in ~1.6s. Opening one pays a supply cache (ore, crystal, fiber, stone) plus the relic itself, which is a **permanent trophy: never lost on death, never spent by accident**. Relics buy two things at a Mk2 base — the **Relic compass** (screen-edge arrows with distances to relics you haven't opened, which turns the visor into a genuine exploration tool) and the **Relic core** (max energy 320, the highest tier in the game). Gating the top energy tier behind horizontal travel means the deepest vertical push is *paid for* by exploring sideways.

**World bounds [v0.7].** The walkable area is computed from the generated islands plus a margin, and may extend west of x=0. Previously it stopped at a fixed line that generation had already outgrown — you could see islands you were not allowed to reach.

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
| Lizard ration **[v0.11]** | 1 cliff lizard | Food +35, from a source that respawns |
| Survey lens **[v0.12]** | 2 crystal, 2 ore | Counts and tracks deposits you have charted |

Base (at a placed base, with Mk2 built):

| Recipe | Cost | Effect |
|---|---|---|
| Fabricator Mk2 | 3 ore, 2 crystal | Unlocks base crafting at that base |
| Planter box **[v0.11]** | 5 stone, 4 fiber | A growing bed at this base (max 4) |
| Zipline kit **[v0.11]** | 4 ore, 2 crystal, 4 fiber | A motorised two-way cable between two anchors (Mk2) |
| Glove battery Mk2 | 4 ore, 4 crystal | Max energy → 220 *(teased, craftable in v0.1)* |
| Thermal wing [later] | TBD | Glider gains rising-air lift |
| Grapple bolt [later] | TBD | One instant wall-attach from mid-air |

### 6.4 Progression skeleton

Reach is gated by grip, energy ceiling and air tech, not by artificial walls:
`bare hands (hills only) → search the wreck → Thorn hook → Magnetic gloves → Glider → Spring boots → Field scanner → Survey lens → Range visor → Battery Mk1 → first base + planters → Mk2 → Grip spikes (basalt) → Zipline kit → Jetpack → Thermal wing → Scale armor → Battery Mk2 → Ripwing jets → Resonant magnets (storm rock) → skysteel → Fabricator Mk3 → Storm suit / Ascender rig → Signal beacon`

Three separate ways to gain height now exist and they cost different things: **climbing** spends glove energy, the **jetpack** spends its own fuel, and **thermals** cost nothing but require you to be in the right place. That spread is deliberate — it keeps "how do I get up there?" an interesting question at every tier.

Note that livestock gates the *survivability* branch (boots, armor) and trout gate the *air* branch (jets, magnets), so both catching mechanics sit on the critical path rather than being optional flavour.

### 6.4½ The Range visor **[v0.6]**

A cheap craftable that toggles the camera **half-scale**, showing the island chain, thermal columns, nests and threats far beyond normal view, framed in a green tint. It answers the question the open world created when the goal ticker was removed: *where do I even go?* Reading a route before committing energy to it is now a real, deliberate action rather than a guess — and it costs nothing to use, because the interesting decision is what you do with the information.

### 6.5 Playtest cheats **[v0.4]**

The pack carries a **Playtest** row: +20 materials, +3 base kits, +3 zipline kits, restore all stripped resources, unlock all gear, refill vitals. Restart-and-remix sits at the top of the changelog panel. These are deliberately in the shipped build — this is a design tool as much as a game right now, and being able to jump straight to "what does storm rock feel like with Mk2" beats replaying the opening every time. They come out (or go behind a tap-the-version-five-times gesture) when we start showing it to fresh players.

## 7. Bases **[v0.2]**

- A **base kit** places a small platform on flat ground **or bolts straight onto a cliff face** while you're hanging there. Cliff-side bases are the signature move: a wall base extends a **deck you can stand on**, converting any blank rock face into a rest stop, recharge point and supply dump.
- A base provides: **fast energy recharge** in its radius, **storage**, a **respawn point**, and a socket to build a **Fabricator Mk2**.
- Bases in range get their own on-screen button rather than sharing the harvest button — standing on a resource node must never hide your own front door.
- Later: beacons visible from far islands, modular expansion like Subnautica corridors — but hanging.

**Why this is the heart of the game.** A cliff base turns a one-shot energy budget into a staged expedition: climb, bolt in, stash, recharge, climb again. It's the sky equivalent of dropping a Seabase halfway down a trench, and it's what makes the higher bands survivable without simply inflating the battery.

## 7⅛. The first hour **[v0.10]**

Before the glider there is now a real arc rather than a gathering chore:

1. **The wreck.** You wake beside a crashed expedition. Searching it once pays fiber, stone and berries — enough to want the gloves — and it is scannable for the log. It is the game's only piece of authored backstory placed where you cannot miss it.
2. **Hop the hills.** Low rock teaches height-as-reward with just the jump button.
3. **Thorn.** Some practice cliffs are crowned with it — but never the first one you meet [v0.11], so you learn to top out before you meet the thing that stops you topping out. You can climb the face, but you *cannot mantle the top* — you hang under the lip and the game tells you what is in the way. This is the first real obstacle, and it appears before you own anything that can solve it.
4. **The Thorn hook** (3 stone, 2 fiber) is revealed by bumping into thorn. It is the first *tool* — not a movement upgrade, not a survival item — and cutting through pays fiber back, so the solution to the obstacle is also a resource loop. Thorn regrows in ~4 minutes, which keeps a cleared route clear long enough to use and makes it renewable.
5. **The gloves, then the cliffs proper.**

The point is that "climb to the top of that" stops being automatic. It becomes a goal with a prerequisite you can see from the ground, which is exactly the shape of a Subnautica gate — the wall is not higher, you are just not equipped yet.

## 7⅔. Planters — the only thing that grows back **[v0.11]**

A **Planter box** (5 stone, 4 fiber) is built at a base, up to four per base. Each bed takes one seed — a skyberry or a fiber — and returns three of the same after ~105 seconds. Net +2 per cycle, which is deliberately unspectacular: a planter is not a way to get rich, it is a way to *not run out*.

This exists because making nodes finite (4.4) removed the game's only renewable material source, and a survival game with a strictly decreasing supply of food is a countdown, not a loop. Putting the regrowth at a base — and only at a base — means the answer to "I am running low" is *go home*, which is the sentence a base-building game wants you to say. It also gives the first base a job on day one, well before you can afford a Mk2, and it turns a berry you were about to eat into a decision.

Seeds come from your pack **or** that base's own chest, matching the pooled-stock rule (6.2), so a base you have been depositing into can be replanted without unpacking anything.

## 7⅚. The Survey lens **[v0.12]**

A cheap personal craftable (2 crystal, 2 ore) revealed once you have stripped half a dozen nodes — you work out the need for it by watching a face run dry. It does three things:

- A **Survey** section in the pack lists every material with what you are holding, how many deposits are still standing **in charted ground**, and how many are still out in the dark.
- Tapping **Track** puts a screen-edge arrow on the nearest unstripped deposit of that material, with its distance, in the same style as the Relic compass.
- The **sky chart** marks every unstripped deposit you have charted, coloured by material.

It deliberately only ever points at rock you have **already been to**. Making nodes finite (4.4) created a new standing question — *where is the ore I have not taken yet?* — and there are two very different halves to that: remembering ground you covered, and finding ground you haven't. The lens answers the first and refuses the second, so it removes bookkeeping without removing exploration. It is also the first tool whose value *grows as the world empties*, which is the right shape for a resource economy that only goes one way.

## 7¾bis. Ziplines **[v0.11]**

A **Zipline kit** (4 ore, 2 crystal, 4 fiber, Mk2 tier) strings a **motorised cable between two points you choose**. Placement is two acts: drop an anchor, travel to the far end, drop the second. The kit is only spent when the cable actually connects, and an unfinished anchor is drawn as a dashed line to your hands — green while the far end would still be in reach, red past it. Runs are capped at ~1050px.

The trolley is **powered, not gravity-fed**, and that is the whole design. A gravity zipline is a one-way slide you can only build downhill, which is a glider with extra steps; a motor makes the cable a *route* — it carries you uphill, and pushing the stick along the line reverses direction mid-span. You can catch a cable anywhere along its length, not only at the ends, so it doubles as a rescue line under a face you keep falling off.

It is Mk2-gated on purpose. Traversal you built yourself is the reward for having established a base, and by the time you own one the world is large enough (5.1) that commuting is a real cost worth engineering away.

## 7¼. Plans, not a checklist **[v0.9]**

Recipes are **discovered, not listed**. Nothing appears in the fabricator until you have met its reason: pick up fiber and stone and the gloves appear; bounce off basalt and Grip spikes appear; catch a lizard and boots and armor appear; find skysteel and Mk3 appears. The pack shows what you have worked out plus a count of what you haven't.

Two problems this fixes at once. The old pack was a scroll of ~10 mostly-uncraftable rows — the single worst piece of mobile UX in the build — and the world had no teaching layer at all after the goal ticker was cut. Now the game explains itself through play: every discovery is a small reward tied to something you just did, and the list only ever contains things you could plausibly build.

## 7⅓. The sky chart **[v0.9]**

A map button in the HUD opens a chart of the whole world with **fog of war**: islands appear only in 300px cells you have laid eyes on, and the **visor charts twice as far** while it is up, which finally gives the visor a lasting purpose beyond the moment you're looking. It marks camp, every base, unopened relics (all of them, once you have the Relic compass), and the summit. It reports what percentage of the islands you've charted.

The world is ~8000px wide with outposts on both flanks; without this, "where am I and where was that thing" was a real and growing problem.

## 7½. The field log **[v0.8]**

The **Field scanner** is a cheap early craftable. Hold the hand on anything you have not logged — a rock type, a creature, a thermal, a relic vault — and it goes into an 11-entry **field log** with a line of flavour that is also a hint (*"Schools thicken before a storm"*, *"Lightning finds it, and so do magnets"*).

This is the Subnautica databank, and it does three jobs: it gives the open world something to *complete* now that the goal ticker is gone, it teaches systems through observation rather than tutorial text, and it makes stopping to look at things a rewarded action in a game otherwise about spending energy efficiently. Progress shows in the pack; the log is its own panel.

## 7¾. Ending a run **[v0.8]**

**Skysteel** only forms on the highest faces. It unlocks **Fabricator Mk3** at a base, which builds the three summit items: **Storm suit** (lightning immunity, heavy damage soak), **Ascender rig** (60% faster climbing at 25% less energy per metre), and the **Signal beacon**.

Carry the beacon to the highest rock in the world and raise it: the sky answers, and the run gets a closing screen with your relics, log completion and falls survived. The world stays open afterwards — this is a summit, not a credits roll. It gives a seeded run a shape (arrive, survive, equip, climb, answer) without ever forcing a critical path.

## 8. Threats

Threat design rule: threats attack your *position and energy*, not just your health bar. Getting knocked off a wall at low energy is scarier than the damage itself.

### 8.1 Current threats

- **Stingwing** (wasp-sting icon): territorial hoverer nesting on cliffs. Chases when you climb into its radius; hits do damage **and knock you off the wall**. Counterplay: route around, bait it out — or **Glove pulse** it.
- **Nightwing** (bat icon): patrols open sky between islands; dives at gliding players. Counterplay: watch its patrol, time your launch, drop altitude to break the dive — or pulse it mid-dive.
- **Glove pulse [v0.3]**: a cheap craftable magnetic burst on the hand button. Costs glove energy (the same resource climbing needs), so self-defense on a wall spends your safety margin — defense is a budgeting decision, not a free action.

### 8.1¼ Ground threat **[v0.6]**

- **Nest robbing [v0.8]**: stingwing nests hold 1–2 eggs. Taking one is quick (0.8s) but wakes the resident instantly and cancels any stun on it, so the practical route is *pulse it, rob it, and be somewhere else*. Eggs are good food and feed the Ascender rig.
- **Ridgerunner** (boar icon): patrols an island top on foot. When it spots you standing on its island it lowers its head and charges. The hit does almost nothing (6 damage) — **the shove is the weapon**: a hard horizontal launch that puts you in the air, and the danger is entirely what's behind you. On a wide island it's a nuisance; two steps from a 2000px drop it's lethal.

It never leaves its own island, so a charge is survivable if you read the ground and give yourself room, and it's the first threat that makes *where you stand* matter on flat terrain rather than on a wall. Counterplay: jump it, out-walk the cooldown, hop onto a hill it can't reach you on, or pulse it.

**Feeding one [v0.11].** Hold the hand button near a ridgerunner while carrying a skyberry or a ration and it takes the food and stops charging — permanently, and across saves. A tamed runner trots after you on its island and is drawn in green with a marker over it.

This is the only threat in the game with a *non-violent* answer, and it should stay that way. Everything else you deal with by routing around it or blasting it; the boar is the one that can be talked down, which costs you a food item at exactly the moment food is scarce (4.4) and makes the choice mean something. It also converts the most annoying threat in the game into a small companionship beat — a boar following you around an island you have stripped bare is doing more work for the mood of the place than another charge would.

### 8.1½ Neutral life — and livestock **[v0.5]**

The wall is a biome, so most of what lives there shouldn't want to kill you. Both neutral species are **catchable, respawning livestock** and both are crafting inputs, which turns wildlife from scenery into a renewable resource layer:

- **Cliff lizards** (gecko icon): live on the faces and skitter away when you get close. Caught by **holding the hand button** while you grip the wall next to one. They flee from *inside* your reach radius, so a committed grab lands but a lazy one doesn't — and once your hand is on one it stops struggling. Scales go into **Spring boots** and **Scale armor**.
- **Sky trout** (flying-trout icon): drift in the open air between islands. You cannot hover next to one, so hold-to-catch would be impossible — instead you **catch them by flying through them**, which makes a glide across a gap into a fishing run. A faint halo shows the catch radius. They go into **Jetpack**, **Ripwing jets** and **Resonant magnets**.

Both respawn on a timer (90s) at their home spot, so a patch of wall or sky is a farm you come back to rather than a resource you strip. Since v0.11 they are one of only two things in the world that come back — the other being planters — which quietly promoted them from flavour to the backbone of the food economy.

**Design note:** capture is the first mechanic that rewards *stopping* on a wall rather than racing up it, which is exactly the behaviour the cheap idle-hang cost (4.1) was meant to enable.

### 8.2 Later

Nest colonies (area denial), rock-mimics on climbable faces, storm cells in Band 2 (environmental threat), an apex "leviathan of the sky" whose shadow crossing the sun is the fear beat — the Reaper equivalent. TBD with design input.

## 9. Controls (mobile) **[v0.1, layout fixed in v0.7]**

- **Left thumb:** virtual joystick — walk, steer climbs, steer glides.
- **Right thumb:** a **fixed 3x3 grid**. The bottom row never changes: **Pack**, **Hand** (harvest/catch/loot/feed), **Jump/Glide**. Contextual buttons occupy their own permanent cells above it — thruster directly above jump, let-go above that, base and visor in the columns to the left, and the **cable** button (mount/drop a zipline) top-centre. Buttons appear and disappear, but nothing ever *shifts*: muscle memory for the two you use constantly is worth more than a tidy row.
- **Vital bars sit above the menus [v0.7]**, with a dark backing while one is open — you decide what to eat or craft *because* of what your health and energy say, so hiding them behind the pack was backwards.
- Keyboard supported for desktop playtesting: WASD/arrows, Space (jump/hold to glide), E (interact), C (pack).
- Portrait and landscape both work; canvas scales to viewport.

## 9½. Sound **[v0.9]**

Everything is synthesised with WebAudio — no asset loads, which keeps the whole game a handful of static files. The bed is filtered noise whose level and cutoff track **altitude, airspeed and storms**, so height is audible before it is visible. A sawtooth hum runs only while you are gripping rock and changes pitch by feature (low on a rest ledge, high and thin on slick rock), which makes the climbing state legible without looking. Everything else is short synth blips: grab, jump, land, harvest, scan, craft, discovery, damage, crumble, thunder, beacon. Muted from a HUD toggle, and the preference is saved.

## 9¾. Camera **[v0.9, retuned v0.12]**

The world is framed against a **reference viewport** rather than a fixed zoom, so the same amount of world fits on a phone and a laptop. v0.12 pulled that reference in (380x620, floor 0.75, from 450x750/0.6) — at the old setting the character was small enough that reading a route meant squinting, which was working against the whole point of route features (4.2½). The **Range visor** is a multiplier on the base scale, so it was divided by the same factor: the visor still frames roughly 8000px of sky, it just does it from a closer starting point.

The camera also **leads your velocity** (up to 320px) so you can see what you are flying into.

## 10. Presentation **[v0.1]**

- Vanilla JS + single `<canvas>`, zero dependencies, static files → GitHub Pages.
- Flat stylized silhouette look: gradient sky by altitude, drifting clouds, dark rock, glowing resource nodes.
- All UI symbols and in-world markers are **game-icons.net** glyphs (CC BY 3.0), rendered from inlined path data — no emojis, no external asset loads.
- Version badge always on screen; tapping it shows the changelog ("what's in this build") — the playtest contract.

## 11. Versioning & playtest cadence

Semver-ish: `0.MINOR.PATCH` — minor = new system, patch = tuning/fixes. Each version ships with in-game changelog notes. Rough roadmap:

- **0.1 — First Climb**: core movement (walk/climb/glide), energy, vitals, harvest, personal fabricator, 4 recipes, base kit + Mk2 teaser, 2 threats, 2 islands, version/changelog UI.
- **0.2 — Homestead**: cliff-wall base placement with standable decks, base storage, material-drop death with recoverable caches, respawn at last base, autosave to localStorage, cheaper idle hang.
- **0.3 — Open Sky**: non-blocking climbable cliff *faces* (walk past, grab anywhere, free 2D wall movement, climb down from tops), seeded world remix per run, rock tiers gated by gear (granite/basalt/storm rock), Glove pulse defense, neutral cliff lizards, tutorial layer removed.
- **0.4 — Ground Up**: climbing must be crafted, jumpable hills and stepped shelves, percentage death toll after a grace period (no world caches), playtest cheats, compact inventory.
- **0.5 — Livestock**: pooled crafting across pack and nearby base storage, catchable respawning lizards and sky trout as recipe inputs, jetpack + Ripwing jets on a separate fuel bar, Spring boots (double jump), Scale armor, health kits, bats replace vultures.
- **0.6 — The Shear**: thermals and the Thermal wing, ridgerunners, dedicated let-go button, Range visor, bottom-anchored menu close, iOS long-press hardening.
- **0.7 — Wayfarer**: outposts and relics rewarding horizontal travel, world bounds that follow generation, jetpack as a toggle, fixed button grid, vitals above menus.
- **0.8 — Long Night**: day/night cycle, storms with wind and lightning, sleeping at bases, field scanner and 11-entry log, nest robbing, skysteel, Fabricator Mk3, Storm suit, Ascender rig, and the Signal beacon ending.
- **0.9 — Reading the Rock**: route features on every face, the sky chart with fog of war, discovery-gated recipes, procedural audio, camera look-ahead, a far wider visor, and no ridgerunner on the start island.
- **0.10 — Thorn and Shale**: rock-blended feature colours, razor shale that cuts, genuinely slippery slick rock, thorn gating cliff tops, the Thorn hook, and a searchable wreck at camp.
- **0.11 — Cable and Seed**: islands roughly doubled in size, resources no longer respawn, base planters as the renewable economy, motorised two-way ziplines, tameable ridgerunners, and far less thorn on the start island.
- **0.12 — Stocktake** *(current build)*: the Survey lens (counts and tracks what is left on the rock), deposit markers on the sky chart, and a closer default camera.
- **0.13 — Alive Sky**: predator/prey ecology (nightwings hunting trout), nesting colonies, seasons or altitude weather bands, more codex entries.
- **1.0 — The Ceiling**: what is above the cloud ceiling — the answer to the beacon.

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
