# Skyreach regression suite

One file, one browser, one pass. The game has no dependencies; this suite needs
`playwright-core` and a Chromium binary.

```sh
cd tests && npm install
node regress.js                 # everything, ~75s
node regress.js world drift     # just the named groups
VERBOSE=1 node regress.js       # print every passing check, not just failures
CHROMIUM=/path/to/chromium node regress.js
```

Groups, in the order they run:

| group | covers |
|---|---|
| `world` | generation invariants over 30 seeds: island sizes, material floors and totals, hoppable hills, a thorn-free first cliff, rock tiers, relic placement, route features and their colours |
| `drift` | endless islands east and west, escalation, glide-range gaps, determinism regardless of visit order |
| `movement` | walking past cliffs, gear-gated grabs, climbing and mantling, parachute vs Ridge wing, arm-then-jump thrust, ziplines, the airship |
| `rock` | razor shale, slick rock, handholds, rest ledges, crumbling rock, thorn and the hook |
| `harvest` | nodes going spent, livestock by hand and on the wing, relics, the wreck, planters |
| `threats` | stingwing sting-and-peel, the shield, the pulse, ridgerunners, taming, shardlings, the Skywyrm, storms and lightning |
| `economy` | discovery gating, pooled crafting, the death toll, the field log, the survey lens, the ending |
| `ui` | fixed button grid, panel tabs, message placement, vitals over menus, survey view, sky chart, audio, no emoji, iOS hardening |
| `debug` | invincible and fly mode: what they ignore, what they flag, and that neither ever reaches a save |
| `persistence` | one save/load round trip covering every system, then a wipe |
| `perf` | 60fps with a large drift loaded, normal and at survey range |

Anything that is a property of world generation or of the DOM runs as a single
in-page evaluate with no waiting — `world` and `drift` together take under two
seconds for 36 checks. Only things that genuinely need frames to elapse cost
wall-clock, and those poll for their condition rather than sleeping a guess.
