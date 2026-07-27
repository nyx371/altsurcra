/* Skyreach v0.3 — vanilla JS, no dependencies.
 * World units are pixels; y grows downward. One canvas for the world, DOM for UI.
 *
 * v0.3 world model: cliffs never block movement. You walk in front of them, grab
 * their face (hold up) to climb anywhere on it, and stand on their tops. The world
 * is remixed from a seed on every new game.
 */
(function () {
'use strict';

// ---------- helpers ----------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function svgIcon(name) {
  return '<svg viewBox="0 0 512 512" aria-hidden="true">' + ICONS[name] + '</svg>';
}

const iconPathCache = {};
function iconPaths(name) {
  if (!iconPathCache[name]) {
    iconPathCache[name] = [...ICONS[name].matchAll(/ d="([^"]+)"/g)].map(m => new Path2D(m[1]));
  }
  return iconPathCache[name];
}

function drawIcon(ctx, name, x, y, size, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.fillStyle = color;
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 512, size / 512);
  for (const p of iconPaths(name)) ctx.fill(p);
  ctx.restore();
}

// ---------- tuning ----------

const T = {
  gravity: 1500,
  maxFall: 950,
  walkSpeed: 185,
  jumpVel: 560,
  climbSpeed: 110,      // vertical, on a face
  climbSpeedX: 90,      // horizontal, on a face
  climbDrainMove: 16,   // energy/s while moving on a wall
  climbDrainIdle: 0.9,  // energy/s hanging still — cheap enough to stop and plan a route
  harvestWallCost: 10,  // flat energy per wall harvest
  harvestTime: 0.9,
  regenGround: 7,
  regenCamp: 30,
  campRadius: 150,
  glideFall: 135,
  glideSpeed: 270,
  foodDrain: 0.35,
  starveDps: 2,
  healthRegen: 1.5,
  fallSafeVel: 620,
  fallDmgScale: 0.09,
  invulnTime: 0.9,
  pulseCost: 12,
  pulseRadius: 130,
  captureTime: 1.1,
  eggTime: 0.8,
  relicTime: 1.6,
  critterRespawn: 90,
  jumpVel2: 500,          // second (boot) jump
  jetThrust: 1750,        // upward accel while thrusting
  jetRiseCap: 330,        // top climb rate under thrust
  jetBurn: 34,            // fuel/s
  jetRefill: 13,          // fuel/s on the ground
  jetFuel1: 45,
  jetFuel2: 100,
  armorSoak: 0.45,        // damage removed by scale armor
  medkitHeal: 45,
  thermalLift: -115,      // glide descent inside a thermal (negative = rising)
  thermalLiftWing: -235,  // with the thermal wing fitted
  visorZoom: 0.17,        // camera scale multiplier while the visor is up
  lookAhead: 0.55,        // how far the camera leads your velocity
  lookAheadMax: 320,
  runnerSpeed: 96,
  runnerCharge: 275,
  runnerDamage: 6,
  runnerKnock: 430,
  dayLength: 300,         // seconds for a full day/night turn
  nightStart: 0.72,       // fraction of the cycle where dusk begins
  nightEnd: 0.97,
  stormEvery: 150,        // average gap between storms
  stormLength: 52,
  stormWarn: 9,
  windMax: 260,           // horizontal push while airborne in a storm
  boltAltitude: 1500,     // above this y-line, storms throw lightning
  boltDamage: 22,
  boltEvery: 4.5,
  scanTime: 1.3,
  crumbleHold: 1.6,       // seconds a crumbling patch takes your weight
  crumbleHeal: 26,
  featureFeedback: 0.9,
  eggFood: 25,
  climbBonusAscender: 1.6,
};

// What a stretch of rock is like under your hands. Routes are made of these:
// a good line strings holds and ledges together, a bad one crosses slick rock.
const FEATURES = {
  hold:    { name: 'Handholds',    drain: 0.45, color: '#7ddc7d', mark: 'grab' },
  rest:    { name: 'Rest ledge',   drain: 0,    color: '#8fc7ff', mark: 'ladder' },
  slick:   { name: 'Slick rock',   drain: 2.1,  color: '#ff8a94', mark: 'windy-stripes' },
  crumble: { name: 'Crumbling',    drain: 1.0,  color: '#ffb454', mark: 'broken-wall' },
};

// Everything you can point the scanner at. Completing the log is the run's
// long-form collectible and unlocks the summit beacon.
const CODEX = {
  granite:   { name: 'Granite',      icon: 'stone-block',     note: 'Old, dense, and generous. Bare gloves bite it fine.' },
  basalt:    { name: 'Basalt',       icon: 'stone-block',     note: 'Cooled in columns. Too smooth for anything but spikes.' },
  stormrock: { name: 'Storm rock',   icon: 'crystal-growth',  note: 'Holds a charge. Lightning finds it, and so do magnets.' },
  lizard:    { name: 'Cliff lizard', icon: 'gecko',           note: 'Grips harder than you do, and knows it.' },
  skyfish:   { name: 'Sky trout',    icon: 'flying-trout',    note: 'Rides the same updrafts you do. Schools thicken before a storm.' },
  stingwing: { name: 'Stingwing',    icon: 'wasp-sting',      note: 'Nests on faces. Defends a radius, not a territory.' },
  nightwing: { name: 'Nightwing',    icon: 'bat',             note: 'Hunts the gaps. Bolder after dark, and it knows when you are gliding.' },
  runner:    { name: 'Ridgerunner',  icon: 'boar',            note: 'Will not leave its island. Would happily see you leave yours.' },
  thermal:   { name: 'Thermal',      icon: 'windy-stripes',   note: 'Warm air off sunlit rock. Weaker at night, fierce in a storm.' },
  relic:     { name: 'Relic vault',  icon: 'ancient-ruins',   note: 'Someone built up here before the islands drifted apart.' },
  skysteel:  { name: 'Skysteel',     icon: 'metal-bar',       note: 'Only forms where the air thins. The islands are seeded with it.' },
};
const CODEX_KEYS = Object.keys(CODEX);

// Relics are deliberately absent: they are exploration trophies, never lost on death.
const RAW_MATERIALS = ['berry', 'ration', 'medkit', 'fiber', 'stone', 'ore', 'crystal', 'lizard', 'skyfish', 'egg', 'skysteel', 'basekit'];

// The sky is gentle for your first few falls; after that every death costs you a cut.
const FREE_DEATHS = 4;
const LOSS_FRACTION = 0.25;

// Cliff rock types. Higher tiers need better climbing gear.
const CLIFF_TYPES = {
  granite:   { name: 'Granite',    tier: 1, color: '#332c40', shade: '#2a2435', lip: '#5d7a52', lip2: '#7c9c66' },
  basalt:    { name: 'Basalt',     tier: 2, color: '#20303c', shade: '#1a2731', lip: '#476b74', lip2: '#639099' },
  stormrock: { name: 'Storm rock', tier: 3, color: '#3b2a4e', shade: '#301f42', lip: '#7a5f9e', lip2: '#9b7fc4' },
};

// 0 = bare hands: no face is climbable until you fabricate gloves.
function gloveTier() {
  if (!flags.gloves) return 0;
  return flags.magnets ? 3 : flags.spikes ? 2 : 1;
}

// ---------- world generation ----------

const NODE_TYPES = {
  berry:   { name: 'Skyberries',  icon: 'berry-bush',     item: 'berry',   yield: 2, respawn: 60,  color: '#c96bff' },
  fiber:   { name: 'Fiber',       icon: 'plant-roots',    item: 'fiber',   yield: 2, respawn: 75,  color: '#7ddc7d' },
  stone:   { name: 'Stone',       icon: 'stone-block',    item: 'stone',   yield: 2, respawn: 75,  color: '#c9c2b2' },
  ore:     { name: 'Iron ore',    icon: 'ore',            item: 'ore',     yield: 2, respawn: 120, color: '#ff9d6b' },
  crystal: { name: 'Sky crystal', icon: 'crystal-growth', item: 'crystal', yield: 2, respawn: 150, color: '#6be2ff' },
  skysteel: { name: 'Skysteel',   icon: 'metal-bar',      item: 'skysteel', yield: 1, respawn: 210, color: '#dfe7f5' },
};

// left/right are recomputed from the generated islands, so the walkable area always
// hugs the actual world instead of stopping at an arbitrary invisible line.
const WORLD = { left: 20, right: 4000, top: 300, cloudSea: 2880, kill: 2960 };
const GEN_SPAN = 7200; // how wide generation is allowed to spread

let rocks = [], NODES = [], stingwings = [], razorbeaks = [], lizards = [], skyfish = [];
let thermals = [], runners = [], relics = [];
let summit = null;
let CAMP = { x: 300, y: 2500 };
let worldSeed = 0;

// Lay a route across a face: bands of holds, ledges, slick and crumbling rock.
// Harder rock gets meaner mixes, so the tier you can grip also reads differently.
function faceFeatures(r, rnd) {
  if (r.h < 110 || r.w < 40) return [];
  const out = [];
  const R = (a, b) => a + rnd() * (b - a);
  const mix = r.type === 'stormrock' ? ['slick', 'crumble', 'hold', 'slick', 'rest', 'crumble']
    : r.type === 'basalt' ? ['slick', 'hold', 'crumble', 'hold', 'rest', 'slick']
    : ['hold', 'hold', 'rest', 'slick', 'crumble', 'hold'];
  const rows = Math.max(2, Math.floor(r.h / 95));
  for (let i = 0; i < rows; i++) {
    const per = rnd() < 0.55 ? 2 : 1;
    for (let k = 0; k < per; k++) {
      const kind = mix[Math.floor(rnd() * mix.length)];
      const w = kind === 'rest' ? R(38, 74) : R(46, Math.max(52, r.w * 0.55));
      const h = kind === 'rest' ? R(30, 44) : R(40, 74);
      const patch = {
        kind,
        x: Math.round(clamp(R(r.x + 4, r.x + r.w - w - 4), r.x, r.x + r.w - w)),
        y: Math.round(r.y + 30 + (i / rows) * (r.h - 60) + R(-12, 12)),
        w: Math.round(w), h: Math.round(h),
        brokenUntil: 0,
      };
      // patches never overlap: a stretch of rock must read as exactly one thing
      const clashes = out.some(o => patch.x < o.x + o.w && patch.x + patch.w > o.x &&
        patch.y < o.y + o.h && patch.y + patch.h > o.y);
      if (clashes) continue;
      out.push(patch);
    }
  }
  return out;
}

// The patch under your hands right now.
function featureAt(rect, px, py) {
  if (!rect || !rect.features) return null;
  for (const f of rect.features) {
    if (px >= f.x && px <= f.x + f.w && py >= f.y && py <= f.y + f.h) {
      if (f.kind === 'crumble' && gameTime < f.brokenUntil) return { kind: 'slick', broken: f };
      return f;
    }
  }
  return null;
}

function generateWorld(seed) {
  worldSeed = seed;
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));

  rocks = []; NODES = []; stingwings = []; razorbeaks = []; lizards = []; skyfish = [];
  thermals = []; runners = []; relics = [];

  const addCliff = (x, y, w, h, type, taper) => {
    const r = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), type, taper: taper || 0 };
    r.features = faceFeatures(r, rnd);
    rocks.push(r);
    return r;
  };
  const addNode = (type, x, y, wall) =>
    NODES.push({ type, x: Math.round(x), y: Math.round(y), wall: !!wall, depletedUntil: 0 });
  const faceNode = (type, r) =>
    addNode(type, R(r.x + 22, r.x + r.w - 22), R(r.y + 40, r.y + r.h - 30), true);
  const addLizard = (r) => {
    const x = R(r.x + 20, r.x + r.w - 20), y = R(r.y + 30, r.y + r.h - 20);
    lizards.push({ r, x, y, tx: x, ty: y, t: R(0, 2), dir: 1, goneUntil: 0 });
  };
  // sky trout: neutral drifters in the open air between islands
  const addSkyfish = (x, y) => {
    skyfish.push({ home: { x, y }, x, y, t: R(0, 6), dir: 1, shy: 0, goneUntil: 0 });
  };
  // rising air: glide into a column to gain altitude instead of spending it
  const addThermal = (x, top, bottom) => {
    thermals.push({ x: Math.round(x), w: Math.round(R(90, 150)), top: Math.round(top), bottom: Math.round(bottom), t: R(0, 6) });
  };
  // ridgerunner: walks an island top and shoulder-charges you off the edge.
  // `farFrom` keeps the starter one away from camp so you meet it by exploring.
  const addRunner = (r, farFrom) => {
    let x = R(r.x + 20, r.x + r.w - 20);
    if (farFrom !== undefined) {
      const mid = r.x + r.w / 2;
      x = farFrom < mid ? R(mid + r.w * 0.15, r.x + r.w - 20) : R(r.x + 20, mid - r.w * 0.15);
    }
    runners.push({ rock: r, x, dir: rnd() < 0.5 ? -1 : 1, mode: 'patrol', cd: 0, t: R(0, 5) });
  };
  const ledgeOn = (r) => {
    // a small standable shelf overlapping the face
    const w = R(44, 74);
    return addCliff(R(r.x - 20, r.x + r.w - w + 20), R(r.y + 70, r.y + r.h - 60), w, 16, r.type, 0);
  };

  // --- start island: safe granite, hills to scramble, practice cliffs ---
  const groundY = 2500;
  const startW = R(760, 980);
  const sx = R(120, 260);
  const slab0 = addCliff(sx, groundY, startW, 300, 'granite', 170);
  CAMP = { x: sx + R(70, 120), y: groundY };

  // Everything needed for your first gloves must be reachable by jumping alone.
  let groundFiber = 0, groundStone = 0;
  const groundNode = (type, x, y) => {
    addNode(type, x, y);
    if (type === 'fiber') groundFiber++;
    if (type === 'stone') groundStone++;
  };

  groundNode('berry', CAMP.x + R(90, 150), groundY);
  groundNode('stone', sx + startW * R(0.4, 0.52), groundY);
  groundNode('fiber', sx + startW * R(0.24, 0.36), groundY);

  // low hills: jumpable without gloves, stepped so a couple of hops gain height
  let hx = sx + R(140, 200);
  const nHills = RI(3, 5);
  for (let i = 0; i < nHills && hx < sx + startW - 150; i++) {
    const hw = R(76, 132);
    const hh = R(36, 86);
    const hill = addCliff(hx, groundY - hh, hw, hh, 'granite', 0);
    groundNode(rnd() < 0.5 ? 'fiber' : 'stone', hill.x + hw / 2, hill.y);
    // a second tier you can only reach off the first
    if (rnd() < 0.55) {
      const sw = R(46, 78), sh = R(40, 74);
      const step = addCliff(hill.x + R(4, Math.max(6, hw - sw - 4)), hill.y - sh, sw, sh, 'granite', 0);
      groundNode(rnd() < 0.6 ? 'fiber' : 'stone', step.x + sw / 2, step.y);
      if (rnd() < 0.5) groundNode('berry', step.x + sw / 2 + R(-14, 14), step.y);
    }
    hx += hw + R(90, 170);
  }
  while (groundFiber < 4) groundNode('fiber', sx + startW * R(0.2, 0.85), groundY);
  while (groundStone < 4) groundNode('stone', sx + startW * R(0.2, 0.85), groundY);
  // deliberately no ridgerunner on the start island: the first ten minutes are
  // for learning to move, not for being shoved off a cliff by a boar

  const nTowers = RI(2, 3);
  let launch = { x: CAMP.x, top: groundY };
  for (let i = 0; i < nTowers; i++) {
    const tw = R(110, 190);
    const th = R(240, 420);
    const tx = sx + startW * (0.35 + 0.62 * (i / nTowers)) + R(-25, 25);
    const t = addCliff(tx, groundY - th, tw, th, 'granite', 0);
    ledgeOn(t);
    faceNode(rnd() < 0.55 ? 'fiber' : 'stone', t);
    faceNode(rnd() < 0.55 ? 'stone' : 'fiber', t);
    if (rnd() < 0.5) addNode('berry', t.x + t.w * R(0.2, 0.8), t.y);
    addLizard(t);
    if (t.y < launch.top) launch = { x: t.x + t.w / 2, top: t.y, right: t.x + t.w };
  }

  // --- chain of islands climbing away from the start ---
  const bandTypes = ['granite', 'granite', 'basalt', 'basalt', 'stormrock'];
  let dir = 1;
  let prevRight = sx + startW;
  let prevLeft = sx;
  let graniteCrystals = 0, graniteOre = 0;

  for (let i = 0; i < bandTypes.length; i++) {
    const type = bandTypes[i];
    const gap = R(240, 400);
    const slabW = R(280, 470);
    const slabTop = clamp(launch.top + R(140, 250), WORLD.top + 700, 2650);
    let x = dir > 0 ? prevRight + gap : prevLeft - gap - slabW;
    if (x < 80 || x + slabW > GEN_SPAN - 120) { dir = -dir; x = dir > 0 ? prevRight + gap : prevLeft - gap - slabW; }
    const slab = addCliff(x, slabTop, slabW, Math.min(R(240, 380), WORLD.cloudSea - 90 - slabTop), type, R(120, 180));

    // a hill or two on the deck of each island, so there is scrambling everywhere
    if (rnd() < 0.7) {
      const hw = R(70, 120), hh = R(36, 78);
      const hill = addCliff(x + R(30, Math.max(40, slabW - hw - 30)), slabTop - hh, hw, hh, type, 0);
      addNode(rnd() < 0.5 ? 'stone' : 'fiber', hill.x + hw / 2, hill.y);
    }

    const tw = R(110, 190);
    const th = R(320, 520);
    const tx = dir > 0 ? x + slabW - tw - R(0, 40) : x + R(0, 40);
    const tower = addCliff(tx, slabTop - th, tw, th, type, 0);
    ledgeOn(tower);
    if (rnd() < 0.6) ledgeOn(slab);

    // resources by band
    addNode('berry', x + slabW * R(0.2, 0.8), slabTop);
    if (type === 'granite') {
      faceNode('ore', tower); faceNode('ore', slab); graniteOre += 2;
      faceNode(rnd() < 0.5 ? 'fiber' : 'stone', tower);
      if (graniteCrystals < 2) { faceNode('crystal', tower); graniteCrystals++; }
    } else if (type === 'basalt') {
      faceNode('crystal', tower); faceNode('crystal', tower);
      faceNode('ore', slab);
      faceNode(rnd() < 0.5 ? 'stone' : 'fiber', slab);
    } else {
      faceNode('crystal', tower); faceNode('crystal', tower); faceNode('crystal', slab);
      faceNode('ore', tower);
      faceNode('skysteel', tower);
      if (rnd() < 0.6) faceNode('skysteel', slab);
    }

    // threats
    if (i >= 1 && rnd() < 0.75) {
      const nx = R(tower.x + 25, tower.x + tower.w - 25), ny = R(tower.y + 80, tower.y + th * 0.6);
      stingwings.push({ nest: { x: nx, y: ny }, x: nx, y: ny, mode: 'idle', t: R(0, 6), hitCd: 0, stun: 0, eggs: RI(1, 2), eggBack: 0 });
    }
    if (rnd() < 0.8) {
      const gx0 = dir > 0 ? prevRight + 20 : x + slabW + 20;
      const gx1 = dir > 0 ? x - 20 : prevLeft - 20;
      if (gx1 - gx0 > 140) {
        const py = slabTop - R(40, 160);
        razorbeaks.push({ anchor: { y: py, x0: gx0, x1: gx1 }, x: (gx0 + gx1) / 2, y: py, dir: 1, mode: 'patrol', vx: 0, vy: 0, cd: 0, t: R(0, 6) });
      }
    }
    addLizard(tower);
    if (rnd() < 0.6) addLizard(slab);
    if (rnd() < 0.7) addRunner(slab);

    // a thermal in the gap you just crossed, rising past the new island
    addThermal(dir > 0 ? x - R(60, 190) : x + slabW + R(60, 190),
      Math.max(WORLD.top + 200, slabTop - R(420, 700)), slabTop + R(120, 260));
    // trout school the gaps you glide across
    const school = RI(1, 2);
    for (let k = 0; k < school; k++) {
      addSkyfish(x + (dir > 0 ? -R(90, 260) : slabW + R(90, 260)), slabTop - R(60, 260));
    }

    prevRight = Math.max(prevRight, x + slabW);
    prevLeft = Math.min(prevLeft, x);
    launch = { x: tower.x + tower.w / 2, top: tower.y };
    if (rnd() < 0.35) dir = -dir;
  }

  // guarantee the early chain can feed the recipes even on a stingy roll
  if (graniteOre < 4) {
    const gr = rocks.find(r => r.type === 'granite' && r.h > 200);
    faceNode('ore', gr); faceNode('ore', gr);
  }

  // --- the summit spike: one long storm-rock push on the last island ---
  const lastTower = rocks[rocks.length - 1].type ? rocks.filter(r => r.h > 200).pop() : null;
  const spikeH = R(650, 850);
  const spike = addCliff(launch.x - R(24, 40), launch.top - spikeH, R(52, 72), spikeH, 'stormrock', 0);
  addNode('crystal', spike.x + spike.w / 2, spike.y);
  faceNode('crystal', spike);
  faceNode('skysteel', spike);
  faceNode('skysteel', spike);
  summit = { x: spike.x + spike.w / 2, y: spike.y };
  addLizard(spike);
  for (let k = 0; k < 2; k++) addSkyfish(spike.x + R(-220, 220), spike.y + R(60, 380));

  // a couple of trout drift near the start island so the first ones are findable
  for (let k = 0; k < 2; k++) addSkyfish(sx + startW * R(0.2, 1.1), groundY - R(150, 330));

  // a thermal beside the start island, and one running the summit spike
  addThermal(sx + startW + R(60, 170), groundY - R(500, 800), groundY + 120);
  addThermal(spike.x + spike.w / 2 + R(-190, 190), spike.y - R(80, 220), spike.y + spikeH * 0.8);

  // --- outposts: the reward for going sideways instead of up ---
  // The main chain climbs; these sit out on the flanks at easy altitudes, so the
  // question "what's over there?" pays as well as "what's up there?".
  const chainLeft = Math.min(...rocks.map(r => r.x));
  const chainRight = Math.max(...rocks.map(r => r.x + r.w));
  const nOutposts = RI(3, 4);
  for (let i = 0; i < nOutposts; i++) {
    const goRight = i % 2 === 0;
    const step = 1 + Math.floor(i / 2);
    const ow = R(300, 480);
    const ox = goRight
      ? chainRight + R(420, 700) * step
      : chainLeft - R(420, 700) * step - ow;
    const oy = clamp(groundY - R(-160, 520), WORLD.top + 900, WORLD.cloudSea - 420);
    const island = addCliff(ox, oy, ow, R(200, 300), rnd() < 0.5 ? 'granite' : 'basalt', R(110, 190));

    // worth the trip: a dense node cluster, a relic, wildlife and a way home
    addNode('berry', ox + ow * R(0.15, 0.4), oy);
    addNode('berry', ox + ow * R(0.6, 0.85), oy);
    faceNode('ore', island); faceNode('crystal', island);
    faceNode(rnd() < 0.5 ? 'fiber' : 'stone', island);
    if (rnd() < 0.7) {
      const tw = R(90, 150), th = R(180, 300);
      const tower = addCliff(ox + R(20, Math.max(30, ow - tw - 20)), oy - th, tw, th, island.type, 0);
      faceNode('crystal', tower);
      ledgeOn(tower);
      addLizard(tower);
    }
    relics.push({ x: Math.round(ox + ow / 2), y: Math.round(oy - 22), taken: false });
    addLizard(island);
    addRunner(island);
    for (let k = 0; k < 2; k++) addSkyfish(ox + R(-160, ow + 160), oy - R(60, 320));
    // a thermal on the way back, so an outpost is not a one-way trip
    addThermal(goRight ? ox - R(80, 220) : ox + ow + R(80, 220), oy - R(400, 650), oy + 160);
    if (rnd() < 0.6) {
      stingwings.push({ nest: { x: island.x + ow / 2, y: oy + 60 }, x: island.x + ow / 2, y: oy + 60, mode: 'idle', t: R(0, 6), hitCd: 0, stun: 0, eggs: RI(1, 2), eggBack: 0 });
    }
  }

  if (NODES.filter(n => n.type === 'skysteel').length < 4) {
    const high = rocks.filter(r => r.h > 200 && !r.deck).sort((a, b) => a.y - b.y).slice(0, 3);
    for (const r of high) { faceNode('skysteel', r); faceNode('skysteel', r); }
  }

  WORLD.top = Math.min(...rocks.map(r => r.y)) - 500;
  // negative coordinates are fine — outposts spread west of the start island
  WORLD.left = Math.min(...rocks.map(r => r.x)) - 420;
  WORLD.right = Math.max(...rocks.map(r => r.x + r.w)) + 420;
  void lastTower;
}

// ---------- items & recipes ----------

const ITEMS = {
  berry:   { name: 'Skyberries',   icon: 'berry-bush',     eat: 15 },
  ration:  { name: 'Trail ration', icon: 'meat',           eat: 35 },
  medkit:  { name: 'Health kit',   icon: 'first-aid-kit',  heal: T.medkitHeal },
  fiber:   { name: 'Fiber',        icon: 'plant-roots' },
  stone:   { name: 'Stone',        icon: 'stone-block' },
  ore:     { name: 'Iron ore',     icon: 'ore' },
  crystal: { name: 'Sky crystal',  icon: 'crystal-growth' },
  lizard:  { name: 'Cliff lizard', icon: 'gecko' },
  skyfish: { name: 'Sky trout',    icon: 'flying-trout' },
  egg:     { name: 'Wing egg',     icon: 'egg-clutch',     eat: T.eggFood },
  skysteel:{ name: 'Skysteel',     icon: 'metal-bar' },
  relic:   { name: 'Relic',        icon: 'emerald' },
  basekit: { name: 'Base kit',     icon: 'house', place: true },
};

const RECIPES = [
  { id: 'gloves',   tier: 'personal', name: 'Magnetic gloves',   icon: 'gloves',          cost: { fiber: 5, stone: 4 },              desc: 'Climb granite faces.', flag: 'gloves', once: true },
  { id: 'ration',   tier: 'personal', name: 'Trail ration',      icon: 'meat',            cost: { berry: 2 },                        desc: '+35 food.' },
  { id: 'medkit',   tier: 'personal', name: 'Health kit',        icon: 'first-aid-kit',   cost: { fiber: 3, berry: 2 },              desc: '+45 health.' },
  { id: 'scanner',  tier: 'personal', name: 'Field scanner',     icon: 'radar-sweep',     cost: { crystal: 2, fiber: 3 },            desc: 'Hold the hand on anything new to log it.', flag: 'scanner', once: true },
  { id: 'glider',   tier: 'personal', name: 'Glider',            icon: 'hang-glider',     cost: { fiber: 4, stone: 2 },              desc: 'Hold Jump to glide.', flag: 'glider', once: true },
  { id: 'boots',    tier: 'personal', name: 'Spring boots',      icon: 'boots',           cost: { lizard: 3, fiber: 4, stone: 2 },   desc: 'Double jump.', flag: 'boots', once: true },
  { id: 'pulse',    tier: 'personal', name: 'Glove pulse',       icon: 'spiky-explosion', cost: { crystal: 1, ore: 1 },              desc: 'Tap hand: blast creatures away.', flag: 'pulse', once: true },
  { id: 'battery1', tier: 'personal', name: 'Battery Mk1',       icon: 'battery-pack',    cost: { ore: 2, crystal: 2 },              desc: 'Energy 100 → 150.', flag: 'battery1', once: true },
  { id: 'spikes',   tier: 'personal', name: 'Grip spikes',       icon: 'spikes',          cost: { ore: 3, stone: 2 },                desc: 'Climb basalt.', flag: 'spikes', once: true },
  { id: 'basekit',  tier: 'personal', name: 'Base kit',          icon: 'house',           cost: { stone: 6, fiber: 4 },              desc: 'Storage, recharge, respawn.' },
  { id: 'visor',    tier: 'personal', name: 'Range visor',       icon: 'binoculars',      cost: { crystal: 2, ore: 2, fiber: 2 },    desc: 'Toggle a long view of the sky.', flag: 'visor', once: true },
  { id: 'mk2',      tier: 'base',     name: 'Fabricator Mk2',    icon: 'anvil',           cost: { ore: 3, crystal: 2 },              desc: 'Heavy fabrication here.' },
  { id: 'thermal',  tier: 'mk2',      name: 'Thermal wing',      icon: 'windy-stripes',   cost: { fiber: 6, crystal: 3, skyfish: 3 }, desc: 'Ride thermals hard. Needs Glider.', flag: 'thermal', once: true, needs: 'glider' },
  { id: 'jetpack',  tier: 'mk2',      name: 'Jetpack',           icon: 'jet-pack',        cost: { ore: 4, crystal: 3, skyfish: 2 },  desc: 'Short burst of lift. Needs Glider.', flag: 'jetpack', once: true, needs: 'glider' },
  { id: 'jetpack2', tier: 'mk2',      name: 'Ripwing jets',      icon: 'thrust',          cost: { ore: 6, crystal: 6, skyfish: 4 },  desc: 'Bigger tank, harder push.', flag: 'jetpack2', once: true, needs: 'jetpack' },
  { id: 'armor',    tier: 'mk2',      name: 'Scale armor',       icon: 'armor-vest',      cost: { lizard: 4, ore: 4, fiber: 3 },     desc: 'Take much less damage.', flag: 'armor', once: true },
  { id: 'battery2', tier: 'mk2',      name: 'Battery Mk2',       icon: 'battery-pack',    cost: { ore: 4, crystal: 4 },              desc: 'Energy → 220.', flag: 'battery2', once: true, needs: 'battery1' },
  { id: 'magnets',  tier: 'mk2',      name: 'Resonant magnets',  icon: 'magnet',          cost: { ore: 2, crystal: 5, skyfish: 2 },  desc: 'Climb storm rock.', flag: 'magnets', once: true, needs: 'spikes' },
  { id: 'compass',  tier: 'mk2',      name: 'Relic compass',     icon: 'compass',         cost: { relic: 1, crystal: 3 },            desc: 'Points to relics you have not found.', flag: 'compass', once: true },
  { id: 'relicbat', tier: 'mk2',      name: 'Relic core',        icon: 'emerald',         cost: { relic: 3, ore: 6, crystal: 6 },    desc: 'Max energy → 320. Needs Battery Mk2.', flag: 'relicbat', once: true, needs: 'battery2' },
  { id: 'mk3',      tier: 'mk2',      name: 'Fabricator Mk3',    icon: 'anvil',           cost: { skysteel: 4, relic: 1, crystal: 8 }, desc: 'Unlocks summit-grade gear here.', flag: 'mk3', once: true },
  { id: 'stormsuit', tier: 'mk3',     name: 'Storm suit',        icon: 'chest-armor',     cost: { skysteel: 5, lizard: 4, ore: 6 },   desc: 'Lightning cannot touch you. Heavy plating.', flag: 'stormsuit', once: true },
  { id: 'ascender', tier: 'mk3',      name: 'Ascender rig',      icon: 'grapple',         cost: { skysteel: 5, crystal: 8, egg: 3 },  desc: 'Climb much faster for less energy.', flag: 'ascender', once: true },
  { id: 'beaconkit', tier: 'mk3',     name: 'Signal beacon',     icon: 'lighthouse',      cost: { skysteel: 6, relic: 2, crystal: 10 }, desc: 'Carry it to the highest rock and answer the sky.', flag: 'beacon', once: true },
];

// A plan becomes available when you have seen the reason for it. This replaces
// a wall of grey recipes with a stream of small discoveries.
const DISCOVERY = {
  gloves:   () => inv.fiber >= 1 && inv.stone >= 1,
  ration:   () => inv.berry >= 2,
  medkit:   () => inv.fiber >= 2 && player.hp < 95,
  scanner:  () => inv.crystal >= 1,
  glider:   () => flags.gloves && inv.fiber >= 3,
  boots:    () => inv.lizard >= 1 || scanned.lizard,
  armor:    () => inv.lizard >= 2,
  pulse:    () => inv.crystal >= 1 && inv.ore >= 1,
  battery1: () => inv.ore >= 2 && inv.crystal >= 1,
  spikes:   () => touchedRock.basalt,
  magnets:  () => touchedRock.stormrock,
  basekit:  () => inv.stone >= 4 && inv.fiber >= 2,
  visor:    () => inv.crystal >= 2,
  mk2:      () => bases.length > 0,
  jetpack:  () => flags.glider && (inv.skyfish >= 1 || scanned.skyfish),
  jetpack2: () => flags.jetpack,
  thermal:  () => scanned.thermal,
  battery2: () => flags.battery1 && bases.some(b => b.mk2),
  compass:  () => inv.relic >= 1,
  relicbat: () => inv.relic >= 2,
  mk3:      () => inv.skysteel >= 1,
  stormsuit: () => bases.some(b => b.mk3),
  ascender: () => bases.some(b => b.mk3),
  beaconkit: () => bases.some(b => b.mk3),
};
const touchedRock = {};

// Playtest helper: skip the discovery chain entirely.
function revealAllPlans() {
  for (const r of RECIPES) known[r.id] = true;
  renderPack();
}

function checkDiscoveries() {
  let found = 0;
  for (const r of RECIPES) {
    if (known[r.id]) continue;
    const test = DISCOVERY[r.id];
    if (test && test()) {
      known[r.id] = true;
      found++;
      toast('New plan: ' + r.name, 'good', r.icon);
      sfx('discover');
    }
  }
  if (found) { renderPack(); saveGame(); }
  return found;
}

// ---------- state ----------

const P_W = 26, P_H = 46;

const player = {
  x: 0, y: 0, vx: 0, vy: 0,
  state: 'air', // ground | air | climb | glide
  faceDir: 1,
  climbRect: null,
  detachTimer: 0, invuln: 0,
  hp: 100, food: 100, energy: 100, maxEnergy: 100,
  fuel: 0, maxFuel: 0, jumps: 0,
  harvest: null,
};

function maxFuel() { return flags.jetpack2 ? T.jetFuel2 : flags.jetpack ? T.jetFuel1 : 0; }

const inv = { berry: 0, ration: 0, medkit: 0, fiber: 0, stone: 0, ore: 0, crystal: 0, lizard: 0, skyfish: 0, egg: 0, skysteel: 0, relic: 0, basekit: 0 };
const flags = {
  gloves: false, glider: false, boots: false, pulse: false,
  battery1: false, battery2: false, spikes: false, magnets: false,
  jetpack: false, jetpack2: false, armor: false, visor: false, thermal: false,
  compass: false, relicbat: false,
  scanner: false, mk3: false, stormsuit: false, ascender: false, beacon: false,
};
let visorOn = false;
let jetOn = false;
// world clock, weather and the field log
let dayTime = 0.12;          // 0..1 through the day
let stormTimer = 90;         // seconds until the next storm rolls in
let stormLeft = 0;           // seconds of storm remaining
let windX = 0;
let boltTimer = 0;
let boltFlash = 0;
const scanned = {};          // codex key -> true
const known = {};            // recipe id -> discovered
const seenCells = new Set(); // fog of war: 300px grid cells you have laid eyes on
const MAP_CELL = 300;
let beaconLit = false;
let runStats = { lit: 0 };
const bases = [];   // {x, y, mk2, wall, store:{}, deck:rect}
let deaths = 0;
let paused = false;
let gameTime = 0;
let pulseFx = null;  // {x, y, t}
let jumpFx = null;   // double-jump puff
let crumbleFx = null;// burst when a hold breaks
let gripKind = null; // what the hands are on right now, for HUD + audio

let clouds = [];
function initClouds() {
  clouds = [];
  for (let i = 0; i < 30; i++) {
    clouds.push({
      x: Math.random() * (WORLD.right + 400) - 200,
      y: WORLD.top + 200 + Math.random() * (WORLD.cloudSea - WORLD.top - 400),
      s: 60 + Math.random() * 160,
      v: 4 + Math.random() * 14,
      a: 0.06 + Math.random() * 0.14,
      layer: Math.random() < 0.5 ? 0 : 1,
    });
  }
}

// ---------- audio ----------
// Everything is synthesised — no asset loads, and the wind can follow altitude
// and weather continuously instead of looping a sample.
const audio = { ctx: null, on: true, master: null, windGain: null, windFilter: null, humOsc: null, humGain: null };

function initAudio() {
  if (audio.ctx || !audio.on) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    const ctx = audio.ctx = new AC();
    audio.master = ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(ctx.destination);

    // wind bed: filtered noise whose cutoff and level track altitude and storms
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    audio.windFilter = ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 420;
    audio.windFilter.Q.value = 0.7;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0.02;
    noise.connect(audio.windFilter).connect(audio.windGain).connect(audio.master);
    noise.start();

    // magnetic glove hum, gated on actually gripping rock
    audio.humOsc = ctx.createOscillator();
    audio.humOsc.type = 'sawtooth';
    audio.humOsc.frequency.value = 74;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 320;
    audio.humGain = ctx.createGain();
    audio.humGain.gain.value = 0;
    audio.humOsc.connect(humFilter).connect(audio.humGain).connect(audio.master);
    audio.humOsc.start();
  } catch (e) { audio.ctx = null; }
}

const SFX = {
  grab:     { f: 180, to: 90,   d: 0.12, type: 'square',   g: 0.20 },
  jump:     { f: 300, to: 520,  d: 0.10, type: 'sine',     g: 0.15 },
  land:     { f: 140, to: 60,   d: 0.12, type: 'sine',     g: 0.18 },
  harvest:  { f: 620, to: 900,  d: 0.11, type: 'triangle', g: 0.14 },
  scan:     { f: 880, to: 1320, d: 0.16, type: 'sine',     g: 0.12 },
  craft:    { f: 420, to: 700,  d: 0.20, type: 'triangle', g: 0.16 },
  discover: { f: 520, to: 990,  d: 0.28, type: 'sine',     g: 0.18 },
  hurt:     { f: 220, to: 70,   d: 0.22, type: 'sawtooth', g: 0.22 },
  crumble:  { f: 160, to: 40,   d: 0.34, type: 'sawtooth', g: 0.20 },
  thunder:  { f: 90,  to: 32,   d: 0.85, type: 'sawtooth', g: 0.30 },
  beacon:   { f: 330, to: 660,  d: 0.9,  type: 'sine',     g: 0.22 },
  pulse:    { f: 700, to: 140,  d: 0.26, type: 'square',   g: 0.18 },
};

function sfx(name) {
  const s = SFX[name];
  if (!s || !audio.on || !audio.ctx) return;
  const ctx = audio.ctx, now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = s.type;
  osc.frequency.setValueAtTime(s.f, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(s.to, 20), now + s.d);
  g.gain.setValueAtTime(s.g, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + s.d);
  osc.connect(g).connect(audio.master);
  osc.start(now);
  osc.stop(now + s.d + 0.02);
}

function updateAudio(dt) {
  if (!audio.ctx) return;
  const alt = clamp((2500 - player.y) / 2200, 0, 1);
  const airborne = player.state === 'air' || player.state === 'glide';
  const target = 0.012 + alt * 0.05 + (storming() ? 0.10 : 0) + (airborne ? 0.03 : 0);
  const cut = 300 + alt * 500 + (storming() ? 700 : 0) + Math.abs(player.vx) * 0.6;
  audio.windGain.gain.value += (target - audio.windGain.gain.value) * clamp(dt * 2, 0, 1);
  audio.windFilter.frequency.value += (cut - audio.windFilter.frequency.value) * clamp(dt * 2, 0, 1);
  const humTarget = player.state === 'climb' ? (gripKind === 'slick' ? 0.05 : 0.03) : 0;
  audio.humGain.gain.value += (humTarget - audio.humGain.gain.value) * clamp(dt * 6, 0, 1);
  if (player.state === 'climb') {
    audio.humOsc.frequency.value = gripKind === 'rest' ? 58 : gripKind === 'slick' ? 96 : 74;
  }
}

function toggleAudio() {
  audio.on = !audio.on;
  if (audio.on) { initAudio(); if (audio.ctx) audio.master.gain.value = 0.5; }
  else if (audio.ctx) audio.master.gain.value = 0;
  const b = document.getElementById('btn-sound');
  if (b) b.innerHTML = svgIcon(audio.on ? 'sound-on' : 'sound-off');
  saveGame();
}

// browsers only allow audio to start from a gesture
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => { if (audio.on) initAudio(); }, { once: true }));

// ---------- input ----------

// Suppress browser touch gestures: pinch zoom, double-tap zoom, long-press menus.
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
// belt and braces against the iOS long-press magnifier: no selection may start,
// and any that somehow does gets dropped immediately
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('dragstart', e => e.preventDefault());
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection && window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
});
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  // Menus need rapid repeat taps (craft, eat, take); only the game surface
  // needs the double-tap-zoom guard.
  if (e.target.closest && e.target.closest('button, a, .overlay')) return;
  const now = Date.now();
  if (now - lastTouchEnd < 350 && e.cancelable) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

const input = { x: 0, y: 0, jumpHeld: false, jumpPressed: false, interactHeld: false, interactPressed: false, jetHeld: false };
const btnState = { jump: false, interact: false, jet: false };
const keys = {};
const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

const stickZone = document.getElementById('stick-zone');
const stickBase = document.getElementById('stick-base');
const stickNub = document.getElementById('stick-nub');

stickZone.addEventListener('pointerdown', e => {
  if (joy.active) return;
  joy.active = true; joy.id = e.pointerId;
  joy.ox = e.clientX; joy.oy = e.clientY; joy.x = 0; joy.y = 0;
  stickBase.style.display = 'block';
  stickBase.style.left = (e.clientX - 58) + 'px';
  stickBase.style.top = (e.clientY - 58) + 'px';
  stickZone.setPointerCapture(e.pointerId);
});
stickZone.addEventListener('pointermove', e => {
  if (!joy.active || e.pointerId !== joy.id) return;
  let dx = (e.clientX - joy.ox) / 46, dy = (e.clientY - joy.oy) / 46;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  joy.x = dx; joy.y = dy;
  stickNub.style.transform = 'translate(-50%,-50%) translate(' + dx * 32 + 'px,' + dy * 32 + 'px)';
});
function joyEnd(e) {
  if (e.pointerId !== joy.id) return;
  joy.active = false; joy.x = 0; joy.y = 0;
  stickBase.style.display = 'none';
  stickNub.style.transform = 'translate(-50%,-50%)';
}
stickZone.addEventListener('pointerup', joyEnd);
stickZone.addEventListener('pointercancel', joyEnd);

const btnJump = document.getElementById('btn-jump');
const btnInteract = document.getElementById('btn-interact');
const btnPack = document.getElementById('btn-pack');
const btnBase = document.getElementById('btn-base');
const btnJet = document.getElementById('btn-jet');
const btnRelease = document.getElementById('btn-release');
const btnVisor = document.getElementById('btn-visor');

function bindHold(el, prop) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('held');
    if (prop === 'jump') input.jumpPressed = true;
    if (prop === 'interact') input.interactPressed = true;
    btnState[prop] = true;
  });
  const up = () => { el.classList.remove('held'); btnState[prop] = false; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
bindHold(btnJump, 'jump');
bindHold(btnInteract, 'interact');
btnJet.addEventListener('click', toggleJet);

// The jetpack latches on: holding a button while also steering and gliding was a
// three-thumb problem on a phone. It cuts out on its own when the tank runs dry.
function toggleJet() {
  if (!flags.jetpack) return;
  if (!jetOn && player.fuel <= 0) { toast('Tank empty — land to refuel', 'bad', 'fuel-tank'); return; }
  jetOn = !jetOn;
  btnJet.classList.toggle('on', jetOn);
}
function jetOff() {
  if (!jetOn) return;
  jetOn = false;
  btnJet.classList.remove('on');
}
btnPack.addEventListener('click', () => togglePack());
btnBase.addEventListener('click', () => { const b = nearestBase(); if (b) openBase(b); });
btnRelease.addEventListener('click', releaseClimb);
btnVisor.addEventListener('click', toggleVisor);

function toggleVisor() {
  if (!flags.visor) return;
  visorOn = !visorOn;
  btnVisor.classList.toggle('on', visorOn);
}

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { input.jumpPressed = true; e.preventDefault(); }
  if (e.code === 'KeyE') input.interactPressed = true;
  if (e.code === 'KeyC') togglePack();
  if (e.code === 'KeyQ') releaseClimb();
  if (e.code === 'KeyV') toggleVisor();
  if (e.code === 'KeyM') { renderMap(); openOverlay('overlay-map'); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') toggleJet();
  if (e.code === 'Escape') closeOverlays();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pollInput() {
  let kx = 0, ky = 0;
  if (keys.ArrowLeft || keys.KeyA) kx -= 1;
  if (keys.ArrowRight || keys.KeyD) kx += 1;
  if (keys.ArrowUp || keys.KeyW) ky -= 1;
  if (keys.ArrowDown || keys.KeyS) ky += 1;
  const jx = Math.abs(joy.x) > 0.25 ? joy.x : 0;
  const jy = Math.abs(joy.y) > 0.25 ? joy.y : 0;
  input.x = clamp(kx + jx, -1, 1);
  input.y = clamp(ky + jy, -1, 1);
  input.jumpHeld = btnState.jump || !!keys.Space;
  input.interactHeld = btnState.interact || !!keys.KeyE;
  input.jetHeld = jetOn;
}

// ---------- physics ----------

function standingOn() {
  for (const r of rocks) {
    const overlapX = player.x + P_W > r.x && player.x < r.x + r.w;
    if (overlapX && Math.abs(player.y + P_H - r.y) < 2) return r;
  }
  return null;
}

function moveY(dy) {
  const wasBottom = player.y + P_H;
  player.y += dy;
  let landed = false;
  if (dy > 0) {
    for (const r of rocks) {
      const overlapX = player.x + P_W > r.x && player.x < r.x + r.w;
      if (overlapX && wasBottom <= r.y + 1 && player.y + P_H > r.y) {
        player.y = r.y - P_H; landed = true; player.vy = 0;
      }
    }
  }
  return landed;
}

// The climbable face under a world point — biggest rect wins, so a shelf
// overlapping a tower never steals the grab.
function faceAt(px, py) {
  let best = null, ba = 0;
  for (const r of rocks) {
    if (r.deck) continue;
    if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
    const a = r.w * r.h;
    if (a > ba) { ba = a; best = r; }
  }
  return best;
}

function canClimb(r) { return CLIFF_TYPES[r.type].tier <= gloveTier(); }

let gripToastAt = -99;
function gripFeedback(r) {
  // Learning what a rock is happens on contact, not on the throttled message.
  if (flags.gloves && !touchedRock[r.type]) {
    touchedRock[r.type] = true;
    checkDiscoveries();
  }
  if (gameTime - gripToastAt < 6) return;
  gripToastAt = gameTime;
  if (!flags.gloves) { toast('No grip — fabricate gloves', 'bad', 'gloves'); return; }
  const def = CLIFF_TYPES[r.type];
  toast(def.name + ' — needs ' + (def.tier === 2 ? 'Grip spikes' : 'Resonant magnets'), 'bad',
    def.tier === 2 ? 'spikes' : 'magnet');
}

function tryGrab() {
  if (player.energy <= 3 || player.detachTimer > 0) return false;
  const r = faceAt(player.x + P_W / 2, player.y + P_H / 2);
  if (!r) return false;
  if (!canClimb(r)) { gripFeedback(r); return false; }
  jetOff(); // grabbing rock ends the burn
  sfx('grab');
  player.state = 'climb';
  player.climbRect = r;
  player.vx = 0; player.vy = 0;
  return true;
}

function detach(push) {
  player.state = 'air';
  player.climbRect = null;
  gripKind = null;
  player.detachTimer = push ? 0.35 : 0.15;
}

// Deliberate let-go: drop straight off the wall without the shove a jump gives.
function releaseClimb() {
  if (player.state !== 'climb') return;
  detach(true);
  player.vx = 0;
  player.vy = 40;
  player.harvest = null;
}

// ---------- world clock & weather ----------

function nightAmount() {
  // 0 by day, 1 at deep night, with soft dusk and dawn either side
  const t = dayTime;
  if (t < T.nightStart - 0.08) return t < 0.04 ? (0.04 - t) / 0.04 : 0;
  if (t < T.nightStart) return (t - (T.nightStart - 0.08)) / 0.08;
  if (t < T.nightEnd) return 1;
  return Math.max(0, 1 - (t - T.nightEnd) / 0.03);
}
const isNight = () => nightAmount() > 0.5;
const storming = () => stormLeft > 0;

// Reveal the map around the player — further when the visor is up.
function revealAround() {
  const reach = visorOn && flags.visor ? 4 : 2;
  const cx = Math.floor((player.x + P_W / 2) / MAP_CELL);
  const cy = Math.floor((player.y + P_H / 2) / MAP_CELL);
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) seenCells.add((cx + i) + ',' + (cy + j));
  }
}

function cellSeen(x, y) {
  return seenCells.has(Math.floor(x / MAP_CELL) + ',' + Math.floor(y / MAP_CELL));
}

function updateWorldClock(dt) {
  revealAround();
  const wasNight = isNight();
  dayTime = (dayTime + dt / T.dayLength) % 1;
  if (!wasNight && isNight()) toast('Night falls — the gaps get dangerous', 'bad', 'moon');
  if (wasNight && !isNight()) toast('Dawn', 'good', 'sun');

  if (stormLeft > 0) {
    stormLeft -= dt;
    // wind swings slowly through the storm rather than sitting at one value
    windX = Math.sin(gameTime * 0.35) * T.windMax * clamp(stormLeft / 6, 0, 1);
    if (stormLeft <= 0) { windX = 0; toast('The wind drops', 'good', 'windy-stripes'); }
  } else {
    stormTimer -= dt;
    if (stormTimer <= T.stormWarn && stormTimer + dt > T.stormWarn) {
      toast('Storm front building', 'bad', 'lightning-storm');
    }
    if (stormTimer <= 0) {
      stormLeft = T.stormLength;
      stormTimer = T.stormEvery * (0.7 + Math.random() * 0.6);
      boltTimer = T.boltEvery;
      toast('Storm — mind the high rock', 'bad', 'lightning-storm');
    }
  }

  // lightning hunts anything high and exposed while a storm runs
  if (storming()) {
    boltTimer -= dt;
    if (boltTimer <= 0) {
      boltTimer = T.boltEvery * (0.6 + Math.random() * 0.8);
      const exposed = player.y < T.boltAltitude && player.state !== 'climb';
      if (exposed && !flags.stormsuit && !deathCause) {
        boltFlash = 0.35;
        sfx('thunder');
        hurt(T.boltDamage, 'Struck out of the storm');
        toast('Lightning!', 'bad', 'lightning-storm');
      } else if (player.y < T.boltAltitude) {
        boltFlash = 0.2;
        sfx('thunder');
      }
    }
  }
  boltFlash = Math.max(0, boltFlash - dt);
}

function restUntilDawn() {
  if (player.food < 25) { toast('Too hungry to rest', 'bad', 'meat'); return; }
  dayTime = 0.02;
  stormLeft = 0; windX = 0;
  stormTimer = Math.max(stormTimer, 40);
  player.food = Math.max(0, player.food - 22);
  player.energy = player.maxEnergy;
  player.fuel = maxFuel();
  player.hp = Math.min(100, player.hp + 25);
  toast('Rested until dawn', 'good', 'bed');
  closeOverlays();
  saveGame();
}

function inThermal() {
  const cx = player.x + P_W / 2, cy = player.y + P_H / 2;
  for (const th of thermals) {
    if (cx > th.x - th.w / 2 && cx < th.x + th.w / 2 && cy > th.top && cy < th.bottom) return th;
  }
  return null;
}

function nearCampOrBase() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  if (dist(px, py, CAMP.x, CAMP.y) < T.campRadius) return CAMP;
  for (const b of bases) if (dist(px, py, b.x, b.y) < T.campRadius) return b;
  return null;
}

let lastSafe = null; // set after world gen

// A wall base is anchored at the rock face; you stand on its deck.
const DECK_W = 78, DECK_H = 12;
function standPos(place) {
  if (!place.wall) return { x: place.x, y: place.y };
  return { x: place.x, y: place.y - DECK_H };
}

function updatePlayer(dt) {
  player.detachTimer = Math.max(0, player.detachTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  if (input.x !== 0) player.faceDir = input.x > 0 ? 1 : -1;

  if (player.state === 'climb') {
    const r = player.climbRect;
    const movingMag = Math.hypot(input.x, input.y);
    // the ascender rig makes every part of a climb faster and cheaper
    const climbBoost = flags.ascender ? T.climbBonusAscender : 1;
    const drainScale = flags.ascender ? 0.75 : 1;

    // what is under your hands decides what this stretch costs
    const feat = featureAt(r, player.x + P_W / 2, player.y + P_H / 2);
    gripKind = feat ? feat.kind : null;
    const featDrain = feat ? FEATURES[feat.kind].drain : 1;

    // crumbling rock only takes your weight for so long
    if (feat && feat.kind === 'crumble' && !feat.broken) {
      feat.load = (feat.load || 0) + dt;
      if (feat.load >= T.crumbleHold) {
        feat.load = 0;
        feat.brokenUntil = gameTime + T.crumbleHeal;
        crumbleFx = { x: player.x + P_W / 2, y: player.y + P_H / 2, t: 0 };
        sfx('crumble');
        toast('The rock gave way', 'bad', 'broken-wall');
        detach(false);
        return;
      }
    } else if (feat && feat.load) {
      feat.load = Math.max(0, feat.load - dt * 0.5);
    }

    const drain = movingMag > 0.1
      ? T.climbDrainMove * Math.min(movingMag, 1) * drainScale * featDrain
      : T.climbDrainIdle * (feat && feat.kind === 'rest' ? 0 : featDrain);
    player.energy -= drain * dt;
    if (player.energy <= 0) { player.energy = 0; detach(false); return; }

    // mantle over the top
    if (input.y < -0.1 && player.y + P_H + input.y * T.climbSpeed * climbBoost * dt <= r.y + 10) {
      player.y = r.y - P_H;
      player.state = 'ground'; player.climbRect = null;
      player.vy = 0;
      return;
    }

    player.x += input.x * T.climbSpeedX * climbBoost * dt;
    const cx = player.x + P_W / 2;
    if (cx < r.x - 4 || cx > r.x + r.w + 4) { detach(false); return; } // slid off the side

    const landed = moveY(input.y * T.climbSpeed * climbBoost * dt);
    if (landed) { player.state = 'ground'; player.climbRect = null; return; }
    if (player.y > r.y + r.h) { detach(false); return; } // off the bottom

    if (input.jumpPressed) {
      detach(true);
      player.vx = input.x * 260;
      player.vy = -380;
      return;
    }
    return;
  }

  // --- ground / air / glide ---
  const grounded = player.state === 'ground';
  const thrusting = flags.jetpack && input.jetHeld && player.fuel > 0 && !grounded;

  if (grounded) {
    player.vx = input.x * T.walkSpeed;
    player.jumps = 0;
    if (input.jumpPressed) { player.vy = -T.jumpVel; player.state = 'air'; player.jumps = 1; sfx('jump'); }
    else if (input.y < -0.5 && tryGrab()) return; // grab a face you're standing in front of
    else if (input.y > 0.6) {
      // climb down the face of whatever you're standing on
      const on = standingOn();
      if (on && !on.deck && on.h > 60 && canClimb(on)) {
        player.y = on.y - P_H + 12;
        player.state = 'climb';
        player.climbRect = on;
        player.vx = 0; player.vy = 0;
        return;
      }
      if (on && !on.deck && on.h > 60 && !canClimb(on)) gripFeedback(on);
    }
    if (player.state === 'ground' && !standingOn()) player.state = 'air';
  } else {
    // air control
    player.vx += input.x * 900 * dt;
    player.vx = clamp(player.vx, -T.glideSpeed, T.glideSpeed);
    if (input.x === 0) player.vx *= Math.pow(0.35, dt);

    // boots: one extra jump in mid-air
    if (input.jumpPressed && flags.boots && player.jumps < 2 && !thrusting) {
      player.vy = -T.jumpVel2;
      player.jumps = 2;
      player.state = 'air';
      sfx('jump');
      jumpFx = { x: player.x + P_W / 2, y: player.y + P_H, t: 0 };
    }

    if (player.state === 'glide') {
      if (!input.jumpHeld || !flags.glider) player.state = 'air';
      else {
        // rising air turns a glide into a climb — the only way up that costs nothing
        let lift = T.glideFall;
        if (inThermal()) {
          lift = flags.thermal ? T.thermalLiftWing : T.thermalLift;
          // sun-warmed rock drives thermals: weak at night, violent in a storm
          lift *= storming() ? 1.35 : (1 - nightAmount() * 0.55);
        }
        player.vy += (lift - player.vy) * clamp(4 * dt, 0, 1);
      }
    }
    if (player.state === 'air') {
      player.vy += T.gravity * dt;
      player.vy = Math.min(player.vy, T.maxFall);
      if (flags.glider && input.jumpHeld && player.vy > -60 && player.detachTimer <= 0) {
        player.state = 'glide';
        player.vy = Math.min(player.vy, T.glideFall + 120);
      }
    }

    // jetpack: its own button and its own tank, so lift never competes with the glide
    if (thrusting) {
      player.fuel = Math.max(0, player.fuel - T.jetBurn * dt);
      player.vy = Math.max(player.vy - T.jetThrust * dt, -T.jetRiseCap);
      player.state = 'air';
      player.jumps = Math.max(player.jumps, 1);
      if (player.fuel <= 0) { jetOff(); toast('Tank dry', 'bad', 'fuel-tank'); }
    }
    // reach up to grab a face while falling or gliding past it
    if (input.y < -0.4 && tryGrab()) return;
  }

  const impactVy = player.vy;
  // storm wind shoves you around while you are off the rock
  const drift = (player.state === 'air' || player.state === 'glide') ? windX * dt : 0;
  player.x = clamp(player.x + player.vx * dt + drift, WORLD.left, WORLD.right - P_W);

  const landed = moveY(player.vy * dt);
  if (landed && player.state !== 'ground') {
    player.state = 'ground';
    sfx('land');
    if (impactVy > T.fallSafeVel) {
      hurt((impactVy - T.fallSafeVel) * T.fallDmgScale, 'The rock is unforgiving');
    }
  }

  if (player.state === 'ground') {
    const zone = nearCampOrBase();
    player.energy += (zone ? T.regenCamp : T.regenGround) * dt;
    if (zone) lastSafe = zone;
    player.jumps = 0;
    player.fuel = Math.min(maxFuel(), player.fuel + T.jetRefill * dt);
    jetOff(); // landing always cuts the thruster
  }
  player.energy = clamp(player.energy, 0, player.maxEnergy);
}

// ---------- vitals / damage ----------

let deathCause = null;

function hurt(dmg, cause) {
  if (player.invuln > 0 || deathCause) return;
  sfx('hurt');
  if (flags.stormsuit) dmg *= 0.4;
  else if (flags.armor) dmg *= (1 - T.armorSoak);
  player.hp -= dmg;
  player.invuln = T.invulnTime;
  if (player.hp <= 0) die(cause || 'The sky took you');
}

// Nothing is left lying in the world — a fall costs you a share of what you
// carried, and only once the sky stops being polite about it.
function applyDeathToll() {
  deaths++;
  if (deaths <= FREE_DEATHS) return null;
  const lost = [];
  for (const id of RAW_MATERIALS) {
    const cut = Math.floor(inv[id] * LOSS_FRACTION);
    if (cut > 0) { inv[id] -= cut; lost.push(cut + ' ' + ITEMS[id].name.toLowerCase()); }
  }
  return lost.length ? lost : null;
}

function die(cause) {
  if (deathCause) return;
  deathCause = cause;
  paused = true;
  const lost = applyDeathToll();
  const grace = FREE_DEATHS - deaths + 1;
  document.getElementById('death-title').textContent = cause;
  document.getElementById('death-note').textContent =
    lost ? 'Lost in the fall: ' + lost.join(', ') + '.'
    : deaths <= FREE_DEATHS
      ? 'Nothing lost. ' + grace + ' more forgiving ' + (grace === 1 ? 'fall' : 'falls') + '.'
      : 'Nothing on you to lose.';
  document.getElementById('overlay-death').classList.remove('hidden');
  document.body.classList.add('menu-open');
  saveGame();
}

function respawn() {
  deathCause = null;
  player.hp = 100;
  player.food = Math.max(50, player.food);
  player.energy = player.maxEnergy;
  const sp = standPos(lastSafe || CAMP);
  player.x = sp.x - P_W / 2;
  player.y = sp.y - P_H - 2;
  player.vx = 0; player.vy = 0;
  player.state = 'air';
  player.climbRect = null;
  document.getElementById('overlay-death').classList.add('hidden');
  document.body.classList.toggle('menu-open', anyOverlayOpen());
  paused = anyOverlayOpen();
  saveGame();
}

function updateVitals(dt) {
  player.food = Math.max(0, player.food - T.foodDrain * dt);
  if (player.food <= 0) hurtStarve(T.starveDps * dt);
  else if (player.food > 60 && player.hp < 100) player.hp = Math.min(100, player.hp + T.healthRegen * dt);
  if (player.y > WORLD.kill) die('You fell into the cloud sea');
}

function hurtStarve(dmg) {
  if (deathCause) return;
  player.hp -= dmg;
  if (player.hp <= 0) die('Starved in the high air');
}

// ---------- harvesting, pulse & interaction ----------

function nearestNode() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  let best = null, bd = 70;
  for (const n of NODES) {
    if (gameTime < n.depletedUntil) continue;
    const d = dist(px, py, n.x, n.y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// What the scanner is pointed at right now — creatures first, then the rock itself.
function scanTarget() {
  if (!flags.scanner) return null;
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  const near = (x, y, r) => dist(px, py, x, y) < r;
  for (const l of lizards) if (gameTime < l.goneUntil ? false : near(l.x, l.y, 90)) return 'lizard';
  for (const f of skyfish) if (gameTime < f.goneUntil ? false : near(f.x, f.y, 120)) return 'skyfish';
  for (const w of stingwings) if (near(w.x, w.y, 150)) return 'stingwing';
  for (const b of razorbeaks) if (near(b.x, b.y, 170)) return 'nightwing';
  for (const rr of runners) if (near(rr.x, rr.rock.y - 18, 150)) return 'runner';
  for (const rl of relics) if (near(rl.x, rl.y, 120)) return 'relic';
  if (inThermal()) return 'thermal';
  const n = nearestNode();
  if (n && n.type === 'skysteel') return 'skysteel';
  const r = player.climbRect || faceAt(px, py) || standingOn();
  if (r && !r.deck && CODEX[r.type]) return r.type;
  return null;
}

function unscannedTarget() {
  const t = scanTarget();
  return t && !scanned[t] ? t : null;
}

function scanCount() { return CODEX_KEYS.filter(k => scanned[k]).length; }

function recordScan(key) {
  scanned[key] = true;
  const n = scanCount();
  toast('Logged: ' + CODEX[key].name + ' (' + n + '/' + CODEX_KEYS.length + ')', 'good', 'radar-sweep');
  sfx('scan');
  checkDiscoveries();
  if (n === CODEX_KEYS.length) toast('Field log complete', 'good', 'open-book');
  renderLog();
  saveGame();
}

// A nest can be robbed, at a price: the resident wakes up angry.
function nearestNest() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  for (const w of stingwings) {
    if (w.eggs > 0 && gameTime > (w.eggBack || 0) && dist(px, py, w.nest.x, w.nest.y) < 58) return w;
  }
  return null;
}

function nearestRelic() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  for (const r of relics) if (!r.taken && dist(px, py, r.x, r.y) < 62) return r;
  return null;
}

// Live critters you can grab by hand. They come back after a while.
function nearestCritter() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  let best = null, bd = 60;
  for (const l of lizards) {
    if (gameTime < l.goneUntil) continue;
    const d = dist(px, py, l.x, l.y);
    if (d < bd) { bd = d; best = { c: l, item: 'lizard' }; }
  }
  return best;
}

function nearestBase() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  for (const b of bases) if (dist(px, py, b.x, b.y) < 90) return b;
  return null;
}

function threatInRange(radius) {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  for (const w of stingwings) if (dist(px, py, w.x, w.y) < radius) return true;
  for (const b of razorbeaks) if (dist(px, py, b.x, b.y) < radius) return true;
  for (const r of runners) if (dist(px, py, r.x, r.rock.y - 18) < radius) return true;
  return false;
}

function firePulse() {
  if (player.energy < T.pulseCost) return;
  player.energy -= T.pulseCost;
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  pulseFx = { x: px, y: py, t: 0 };
  sfx('pulse');
  for (const w of stingwings) {
    if (dist(px, py, w.x, w.y) < T.pulseRadius) { w.stun = 4; w.mode = 'return'; w.hitCd = 1.5; }
  }
  for (const b of razorbeaks) {
    if (dist(px, py, b.x, b.y) < T.pulseRadius) { b.mode = 'rise'; b.cd = 5; }
  }
  for (const r of runners) {
    if (dist(px, py, r.x, r.rock.y - 18) < T.pulseRadius) {
      r.mode = 'patrol'; r.cd = 4; r.dir = r.x < px ? -1 : 1;
    }
  }
}

function updateInteraction(dt) {
  // Nodes and lizards share the same faces — reach for whichever is actually closer.
  const pc = playerCenter();
  let node = nearestNode();
  let critter = nearestCritter();
  if (node && critter) {
    if (dist(pc.x, pc.y, critter.c.x, critter.c.y) < dist(pc.x, pc.y, node.x, node.y)) node = null;
    else critter = null;
  }
  const relic = nearestRelic();
  const nest = relic ? null : nearestNest();
  const scan = (relic || nest) ? null : unscannedTarget();
  if (relic || nest) { node = null; critter = null; }
  if (scan) { node = null; critter = null; } // logging something new comes first

  // a tap of the hand doubles as the pulse when something is on you
  if (input.interactPressed && flags.pulse && threatInRange(T.pulseRadius)) firePulse();

  if (input.interactHeld && relic) {
    if (!player.harvest || player.harvest.relic !== relic) player.harvest = { relic, t: 0, total: T.relicTime };
    player.harvest.t += dt;
    if (player.harvest.t >= T.relicTime) {
      relic.taken = true;
      player.harvest = null;
      const haul = { ore: 6, crystal: 5, fiber: 4, stone: 4 };
      for (const [k, v] of Object.entries(haul)) inv[k] += v;
      inv.relic += 1;
      checkDiscoveries();
      toast('Relic recovered — and a cache of supplies', 'good', 'emerald');
      saveGame();
    }
  } else if (input.interactHeld && nest) {
    if (!player.harvest || player.harvest.nest !== nest) player.harvest = { nest, t: 0, total: T.eggTime };
    player.harvest.t += dt;
    if (player.harvest.t >= T.eggTime) {
      nest.eggs -= 1;
      nest.eggBack = gameTime + 150;
      inv.egg += 1;
      player.harvest = null;
      // robbing a nest is never free
      nest.mode = 'chase'; nest.stun = 0; nest.hitCd = 0.4;
      toast('Egg taken — it saw you', 'bad', 'egg-clutch');
      saveGame();
    }
  } else if (input.interactHeld && scan) {
    if (!player.harvest || player.harvest.scan !== scan) player.harvest = { scan, t: 0, total: T.scanTime };
    player.harvest.t += dt;
    if (player.harvest.t >= T.scanTime) {
      const key = player.harvest.scan;
      player.harvest = null;
      recordScan(key);
    }
  } else if (input.interactHeld && critter) {
    if (!player.harvest || player.harvest.critter !== critter.c) player.harvest = { critter: critter.c, t: 0, total: T.captureTime };
    player.harvest.t += dt;
    if (player.harvest.t >= T.captureTime) {
      inv[critter.item] += 1;
      critter.c.goneUntil = gameTime + T.critterRespawn;
      checkDiscoveries();
      player.harvest = null;
      toast('Caught a ' + ITEMS[critter.item].name.toLowerCase(), 'good', ITEMS[critter.item].icon);
      saveGame();
    }
  } else if (input.interactHeld && node) {
    if (!player.harvest || player.harvest.node !== node) player.harvest = { node, t: 0, total: T.harvestTime };
    player.harvest.t += dt;
    if (player.harvest.t >= T.harvestTime) {
      const def = NODE_TYPES[node.type];
      if (player.state === 'climb') {
        player.energy = Math.max(0, player.energy - T.harvestWallCost);
      }
      inv[def.item] += def.yield;
      node.depletedUntil = gameTime + def.respawn;
      player.harvest = null;
      toast('+' + def.yield + ' ' + def.name, 'good', def.icon);
      sfx('harvest');
      checkDiscoveries();
      saveGame();
    }
  } else {
    if (input.interactHeld && !node) {
      const b = nearestBase();
      if (b && !player._baseTapLatch) { player._baseTapLatch = true; openBase(b); }
    }
    player.harvest = null;
  }
  if (!input.interactHeld) player._baseTapLatch = false;

  const ring = document.querySelector('#btn-interact .abtn-ring circle');
  const prog = player.harvest ? player.harvest.t / player.harvest.total : 0;
  ring.style.strokeDashoffset = String(207.3 * (1 - prog));
  btnInteract.classList.toggle('glide-ready', !!node || !!critter || !!relic || !!nest || !!scan);
  btnInteract.classList.toggle('scanning', !!scan && !relic && !nest);
  btnBase.classList.toggle('hidden', !nearestBase());
  btnJet.classList.toggle('hidden', !flags.jetpack);
  btnRelease.classList.toggle('hidden', player.state !== 'climb');
  btnVisor.classList.toggle('hidden', !flags.visor);
}

// ---------- creatures ----------

function playerCenter() { return { x: player.x + P_W / 2, y: player.y + P_H / 2 }; }

function knockOffWall(dirX) {
  if (player.state === 'climb') detach(true);
  player.state = player.state === 'glide' ? 'glide' : 'air';
  player.vx = dirX * 260;
  player.vy = Math.min(player.vy, -140);
}

function updateStingwings(dt) {
  const pc = playerCenter();
  for (const w of stingwings) {
    w.t += dt; w.hitCd = Math.max(0, w.hitCd - dt);
    if (w.stun > 0) { w.stun -= dt; w.y += 20 * dt; continue; }
    const dToPlayer = dist(w.x, w.y, pc.x, pc.y);
    if (w.mode === 'idle') {
      w.x = w.nest.x + Math.sin(w.t * 1.3) * 38;
      w.y = w.nest.y + Math.cos(w.t * 1.7) * 26;
      if (dToPlayer < 180 && !deathCause) w.mode = 'chase';
    } else if (w.mode === 'chase') {
      const ang = Math.atan2(pc.y - w.y, pc.x - w.x);
      w.x += Math.cos(ang) * 170 * dt;
      w.y += Math.sin(ang) * 170 * dt;
      if (dToPlayer > 420 || deathCause) w.mode = 'return';
      if (dToPlayer < 28 && w.hitCd <= 0) {
        w.hitCd = 1.2;
        hurt(12, 'Stung out of the sky');
        knockOffWall(pc.x > w.x ? 1 : -1);
      }
    } else {
      const ang = Math.atan2(w.nest.y - w.y, w.nest.x - w.x);
      w.x += Math.cos(ang) * 130 * dt;
      w.y += Math.sin(ang) * 130 * dt;
      if (dist(w.x, w.y, w.nest.x, w.nest.y) < 12) { w.mode = 'idle'; w.t = 0; }
    }
  }
}

function updateRazorbeaks(dt) {
  const pc = playerCenter();
  for (const b of razorbeaks) {
    b.t += dt; b.cd = Math.max(0, b.cd - dt);
    const airborne = player.state === 'air' || player.state === 'glide';
    const dToPlayer = dist(b.x, b.y, pc.x, pc.y);
    if (b.mode === 'patrol') {
      b.x += b.dir * 95 * dt;
      b.y = b.anchor.y + Math.sin(b.t * 1.1) * 16;
      if (b.x < b.anchor.x0) b.dir = 1;
      if (b.x > b.anchor.x1) b.dir = -1;
      const reach = 270 * (1 + nightAmount() * 0.55);
      if (airborne && dToPlayer < reach && b.cd <= 0 && !deathCause) { b.mode = 'swoop'; b.swoopT = 0; }
    } else if (b.mode === 'swoop') {
      b.swoopT += dt;
      const ang = Math.atan2(pc.y - b.y, pc.x - b.x);
      b.vx = (b.vx || 0) + Math.cos(ang) * 600 * dt;
      b.vy = (b.vy || 0) + Math.sin(ang) * 600 * dt;
      const sp = Math.hypot(b.vx, b.vy);
      const cap = 330 * (1 + nightAmount() * 0.25);
      if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.dir = b.vx > 0 ? 1 : -1;
      if (dToPlayer < 30) {
        hurt(15, 'Torn from the wind by a nightwing');
        player.vy += 260; player.vx += b.dir * 160;
        b.mode = 'rise'; b.cd = 2.5;
      } else if (b.swoopT > 2.6 || !airborne) { b.mode = 'rise'; b.cd = 1.5; }
    } else {
      const ang = Math.atan2(b.anchor.y - b.y, (b.anchor.x0 + b.anchor.x1) / 2 - b.x);
      b.x += Math.cos(ang) * 150 * dt;
      b.y += Math.sin(ang) * 150 * dt;
      if (Math.abs(b.y - b.anchor.y) < 20) { b.mode = 'patrol'; b.vx = 0; b.vy = 0; }
    }
  }
}

function updateSkyfish(dt) {
  const pc = playerCenter();
  for (const f of skyfish) {
    if (gameTime < f.goneUntil) continue;
    f.t += dt;
    const d = dist(f.x, f.y, pc.x, pc.y);
    // You cannot hover next to a trout, so you catch one by flying through it.
    if (d < 32) {
      f.goneUntil = gameTime + T.critterRespawn;
      inv.skyfish += 1;
      checkDiscoveries();
      toast('Caught a sky trout', 'good', 'flying-trout');
      saveGame();
      continue;
    }
    // lazy figure-of-eight drift around home, with a small shy drift away up close
    f.x = f.home.x + Math.sin(f.t * 0.55) * 70;
    f.y = f.home.y + Math.sin(f.t * 1.1) * 26;
    if (d < 90) {
      const ang = Math.atan2(f.y - pc.y, f.x - pc.x);
      f.home.x = clamp(f.home.x + Math.cos(ang) * 26 * dt, WORLD.left + 40, WORLD.right - 40);
      f.home.y = clamp(f.home.y + Math.sin(ang) * 26 * dt, WORLD.top + 100, WORLD.cloudSea - 160);
    }
    f.dir = Math.cos(f.t * 0.55) > 0 ? 1 : -1;
  }
}

// Ridgerunner: patrols an island top, then shoulder-charges. Barely hurts —
// the danger is the shove and the edge behind you.
function updateRunners(dt) {
  const pc = playerCenter();
  for (const rr of runners) {
    const r = rr.rock;
    rr.t += dt;
    rr.cd = Math.max(0, rr.cd - dt);
    const onSameTop = player.state === 'ground' && Math.abs(player.y + P_H - r.y) < 4 &&
      player.x + P_W > r.x && player.x < r.x + r.w;
    const dx = pc.x - rr.x;

    if (rr.mode === 'patrol') {
      rr.x += rr.dir * T.runnerSpeed * dt;
      if (rr.x < r.x + 14) { rr.x = r.x + 14; rr.dir = 1; }
      if (rr.x > r.x + r.w - 14) { rr.x = r.x + r.w - 14; rr.dir = -1; }
      if (onSameTop && Math.abs(dx) < 300 && rr.cd <= 0 && !deathCause) {
        rr.mode = 'charge';
        rr.dir = dx > 0 ? 1 : -1;
        rr.chargeT = 0;
      }
    } else {
      rr.chargeT += dt;
      rr.x += rr.dir * T.runnerCharge * dt;
      // it will not run off its own island
      if (rr.x < r.x + 12 || rr.x > r.x + r.w - 12) {
        rr.x = clamp(rr.x, r.x + 12, r.x + r.w - 12);
        rr.mode = 'patrol'; rr.cd = 2.2;
      }
      if (rr.chargeT > 2.4) { rr.mode = 'patrol'; rr.cd = 1.6; }
      if (Math.abs(dx) < 24 && Math.abs(pc.y - (r.y - 18)) < 46 && rr.cd <= 0) {
        hurt(T.runnerDamage, 'Run down by a ridgerunner');
        player.vx = rr.dir * T.runnerKnock;
        player.vy = -230;
        player.state = 'air';
        rr.cd = 1.4;
        rr.mode = 'patrol';
      }
    }
  }
}

function updateLizards(dt) {
  const pc = playerCenter();
  for (const l of lizards) {
    if (gameTime < l.goneUntil) continue;
    // once your hand is on it, it stops struggling — otherwise it could outrun the grab
    if (player.harvest && player.harvest.critter === l) continue;
    l.t -= dt;
    const dp = dist(l.x, l.y, pc.x, pc.y);
    // flees from closer than your reach, so a committed grab still lands
    if (dp < 48 && l.t < 1.5) {
      // skitter away across the face
      const ang = Math.atan2(l.y - pc.y, l.x - pc.x);
      l.tx = clamp(l.x + Math.cos(ang) * 140, l.r.x + 12, l.r.x + l.r.w - 12);
      l.ty = clamp(l.y + Math.sin(ang) * 140, l.r.y + 12, l.r.y + l.r.h - 12);
      l.t = 2.5;
    } else if (l.t <= 0) {
      l.tx = l.r.x + 12 + Math.random() * (l.r.w - 24);
      l.ty = l.r.y + 12 + Math.random() * (l.r.h - 24);
      l.t = 2 + Math.random() * 4;
    }
    const dx = l.tx - l.x, dy = l.ty - l.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      const sp = dp < 90 ? 78 : 38;
      l.x += dx / d * sp * dt;
      l.y += dy / d * sp * dt;
      if (Math.abs(dx) > 2) l.dir = dx > 0 ? 1 : -1;
    }
  }
}

// ---------- crafting / UI ----------

function toast(text, kind, icon) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.innerHTML = (icon ? '<span class="t-icon">' + svgIcon(icon) + '</span>' : '') + '<span></span>';
  el.lastChild.textContent = text;
  const box = document.getElementById('toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.classList.add('fade'), 1900);
  setTimeout(() => el.remove(), 2400);
}

// Crafting draws on what you carry plus the storage of every base in reach —
// the fabricator does not care which pocket a rock is in.
function suppliers() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  const list = [inv];
  for (const b of bases) {
    if (dist(px, py, b.x, b.y) < T.campRadius) list.push(b.store);
  }
  return list;
}

function pooled(id) {
  return suppliers().reduce((n, s) => n + (s[id] || 0), 0);
}

function canAfford(recipe) {
  return Object.entries(recipe.cost).every(([k, v]) => pooled(k) >= v);
}

function spend(id, count) {
  let left = count;
  for (const s of suppliers()) {
    if (left <= 0) break;
    const take = Math.min(s[id] || 0, left);
    if (take > 0) { s[id] -= take; left -= take; if (s !== inv && s[id] <= 0) delete s[id]; }
  }
  return left === 0;
}

function craft(recipe, base) {
  if (recipe.locked) return;
  if (recipe.once && flags[recipe.flag]) return;
  if (recipe.needs && !flags[recipe.needs]) return;
  if (!canAfford(recipe)) { toast('Not enough materials', 'bad'); return; }
  for (const [k, v] of Object.entries(recipe.cost)) spend(k, v);

  if (recipe.id === 'gloves') { flags.gloves = true; toast('Gloves fitted — hold up at a face', 'good', 'gloves'); }
  if (recipe.id === 'ration') { inv.ration += 1; toast('Trail ration', 'good', 'meat'); }
  if (recipe.id === 'medkit') { inv.medkit += 1; toast('Health kit', 'good', 'first-aid-kit'); }
  if (recipe.id === 'boots') { flags.boots = true; toast('Spring boots — jump again in mid-air', 'good', 'boots'); }
  if (recipe.id === 'armor') { flags.armor = true; toast('Scale armor fitted', 'good', 'armor-vest'); }
  if (recipe.id === 'jetpack') { flags.jetpack = true; player.fuel = maxFuel(); toast('Jetpack — hold the thruster', 'good', 'jet-pack'); }
  if (recipe.id === 'jetpack2') { flags.jetpack2 = true; player.fuel = maxFuel(); toast('Ripwing jets — bigger tank', 'good', 'thrust'); }
  if (recipe.id === 'visor') { flags.visor = true; toast('Range visor — tap to look far', 'good', 'binoculars'); }
  if (recipe.id === 'thermal') { flags.thermal = true; toast('Thermal wing — ride the updrafts', 'good', 'windy-stripes'); }
  if (recipe.id === 'scanner') { flags.scanner = true; toast('Scanner online — hold the hand on anything new', 'good', 'radar-sweep'); }
  if (recipe.id === 'mk3') { if (base) base.mk3 = true; flags.mk3 = true; toast('Fabricator Mk3 online', 'good', 'anvil'); }
  if (recipe.id === 'stormsuit') { flags.stormsuit = true; toast('Storm suit — lightning cannot reach you', 'good', 'chest-armor'); }
  if (recipe.id === 'ascender') { flags.ascender = true; toast('Ascender rig — the wall got shorter', 'good', 'grapple'); }
  if (recipe.id === 'beaconkit') { flags.beacon = true; toast('Beacon built — take it to the highest rock', 'good', 'lighthouse'); }
  if (recipe.id === 'compass') { flags.compass = true; toast('Relic compass — unfound relics now show', 'good', 'compass'); }
  if (recipe.id === 'relicbat') { flags.relicbat = true; player.maxEnergy = 320; player.energy = 320; toast('Relic core — 320 energy', 'good', 'emerald'); }
  if (recipe.id === 'glider') { flags.glider = true; toast('Glider fabricated', 'good', 'hang-glider'); }
  if (recipe.id === 'pulse') { flags.pulse = true; toast('Glove pulse armed', 'good', 'spiky-explosion'); }
  if (recipe.id === 'spikes') { flags.spikes = true; toast('Grip spikes fitted', 'good', 'spikes'); }
  if (recipe.id === 'magnets') { flags.magnets = true; toast('Resonant magnets fitted', 'good', 'magnet'); }
  if (recipe.id === 'battery1') { flags.battery1 = true; player.maxEnergy = 150; player.energy = 150; toast('Battery Mk1 — 150', 'good', 'battery-pack'); }
  if (recipe.id === 'battery2') { flags.battery2 = true; player.maxEnergy = 220; player.energy = 220; toast('Battery Mk2 — 220', 'good', 'battery-pack'); }
  if (recipe.id === 'basekit') { inv.basekit += 1; toast('Base kit ready', 'good', 'house'); }
  if (recipe.id === 'mk2' && base) { base.mk2 = true; toast('Fabricator Mk2 online', 'good', 'anvil'); }
  sfx('craft');
  checkDiscoveries();
  renderPack();
  if (openBaseRef && !document.getElementById('overlay-base').classList.contains('hidden')) renderBase(openBaseRef);
  saveGame();
}

function useItem(id) {
  const def = ITEMS[id];
  if (inv[id] <= 0) return;
  if (def.heal && player.hp >= 100) { toast('Already unhurt', 'bad', def.icon); return; }
  inv[id] -= 1;
  if (def.eat) {
    player.food = Math.min(100, player.food + def.eat);
    toast('+' + def.eat + ' food', 'good', def.icon);
  } else if (def.heal) {
    player.hp = Math.min(100, player.hp + def.heal);
    toast('+' + def.heal + ' health', 'good', def.icon);
  }
  renderPack();
  saveGame();
}

function makeWallDeck(base) {
  const deck = { x: Math.round(base.x - DECK_W / 2), y: Math.round(base.y - DECK_H), w: DECK_W, h: DECK_H, type: 'granite', taper: 0, deck: true };
  rocks.push(deck);
  base.deck = deck;
  return deck;
}

// The run's finish line: carry the beacon to the highest rock and switch it on.
function lightBeacon() {
  if (!flags.beacon || beaconLit) return;
  const on = standingOn();
  const highest = summit ? summit.y : Math.min(...rocks.map(r => r.y));
  if (!on || player.state !== 'ground' || on.y > highest + 30) {
    toast('Take it to the highest rock you can find', 'bad', 'lighthouse');
    return;
  }
  closeOverlays();
  sfx('beacon');
  beaconLit = true;
  runStats.lit += 1;
  document.getElementById('win-stats').textContent =
    'Relics recovered ' + inv.relic + '  ·  Field log ' + scanCount() + '/' + CODEX_KEYS.length +
    '  ·  Falls survived ' + deaths;
  document.getElementById('overlay-win').classList.remove('hidden');
  document.body.classList.add('menu-open');
  paused = true;
  saveGame();
}

function placeBase() {
  if (inv.basekit <= 0) return;
  const onWall = player.state === 'climb';
  if (player.state !== 'ground' && !onWall) {
    toast('Place a base on solid ground or while gripping a wall', 'bad', 'house');
    return;
  }
  let b;
  if (onWall) {
    b = { x: player.x + P_W / 2, y: player.y + P_H, mk2: false, wall: true, store: {} };
    makeWallDeck(b);
    bases.push(b);
    lastSafe = b;
    player.state = 'ground';
    player.climbRect = null;
    const sp = standPos(b);
    player.x = sp.x - P_W / 2;
    player.y = sp.y - P_H;
    toast('Base bolted to the cliff', 'good', 'hut');
  } else {
    b = { x: player.x + P_W / 2, y: player.y + P_H, mk2: false, wall: false, store: {} };
    bases.push(b);
    lastSafe = b;
    toast('Base placed', 'good', 'house');
  }
  inv.basekit -= 1;
  checkDiscoveries();
  closeOverlays();
  saveGame();
}

// ---------- storage ----------

function takeItem(base, id, all) {
  const have = base.store[id] || 0;
  const n = all ? have : Math.min(1, have);
  if (n <= 0) return;
  base.store[id] = have - n;
  if (base.store[id] <= 0) delete base.store[id];
  inv[id] += n;
  renderBase(base);
  saveGame();
}

function depositAll(base) {
  let moved = 0;
  for (const id of RAW_MATERIALS) {
    if (inv[id] > 0) { base.store[id] = (base.store[id] || 0) + inv[id]; moved += inv[id]; inv[id] = 0; }
  }
  if (moved) toast('Stored ' + moved + ' items', 'good', 'chest');
  renderBase(base);
  saveGame();
}

// ---------- save / load ----------

const SAVE_KEY = 'skyreach.save.v2';
let saveNoticeUntil = 0;
let wiping = false;

function saveGame() {
  if (wiping) return;
  try {
    const data = {
      v: GAME_VERSION,
      seed: worldSeed,
      gameTime,
      player: {
        x: player.x, y: player.y, hp: player.hp, food: player.food,
        energy: player.energy, maxEnergy: player.maxEnergy, fuel: player.fuel,
      },
      relics: relics.map(r => !!r.taken),
      dayTime, stormTimer, stormLeft, scanned, beaconLit, runStats,
      known, touchedRock, seen: [...seenCells], audioOn: audio.on,
      nests: stingwings.map(w => ({ e: w.eggs, b: Math.max(0, (w.eggBack || 0) - gameTime) })),
      lizards: lizards.map(l => Math.max(0, l.goneUntil - gameTime)),
      skyfish: skyfish.map(f => Math.max(0, f.goneUntil - gameTime)),
      inv, flags,
      bases: bases.map(b => ({ x: b.x, y: b.y, mk2: b.mk2, mk3: !!b.mk3, wall: !!b.wall, store: b.store || {} })),
      lastSafe: bases.indexOf(lastSafe),
      deaths,
      nodes: NODES.map(n => Math.max(0, n.depletedUntil - gameTime)),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    saveNoticeUntil = gameTime + 1.4;
  } catch (e) { /* private mode / quota — play on without persistence */ }
}

function loadGame() {
  let data;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return false; }
  if (!data || !data.player || typeof data.seed !== 'number') return false;

  generateWorld(data.seed);
  gameTime = data.gameTime || 0;
  Object.assign(player, data.player);
  player.vx = 0; player.vy = 0; player.state = 'air'; player.climbRect = null; player.harvest = null;
  for (const k of Object.keys(inv)) inv[k] = data.inv && data.inv[k] ? data.inv[k] : 0;
  for (const k of Object.keys(flags)) flags[k] = !!(data.flags && data.flags[k]);

  bases.length = 0;
  for (const b of data.bases || []) {
    const base = { x: b.x, y: b.y, mk2: !!b.mk2, mk3: !!b.mk3, wall: !!b.wall, store: b.store || {} };
    if (base.wall) makeWallDeck(base);
    bases.push(base);
  }
  const li = typeof data.lastSafe === 'number' ? data.lastSafe : -1;
  lastSafe = li >= 0 && bases[li] ? bases[li] : CAMP;
  deaths = data.deaths || 0;
  if (data.nodes) NODES.forEach((n, i) => { n.depletedUntil = gameTime + (data.nodes[i] || 0); });
  if (data.relics) relics.forEach((r, i) => { r.taken = !!data.relics[i]; });
  if (typeof data.dayTime === 'number') dayTime = data.dayTime;
  if (typeof data.stormTimer === 'number') stormTimer = data.stormTimer;
  stormLeft = data.stormLeft || 0;
  beaconLit = !!data.beaconLit;
  runStats = data.runStats || { lit: 0 };
  for (const k of CODEX_KEYS) delete scanned[k];
  if (data.scanned) for (const k of CODEX_KEYS) if (data.scanned[k]) scanned[k] = true;
  for (const k of Object.keys(known)) delete known[k];
  if (data.known) for (const k of Object.keys(data.known)) known[k] = !!data.known[k];
  for (const k of Object.keys(touchedRock)) delete touchedRock[k];
  if (data.touchedRock) for (const k of Object.keys(data.touchedRock)) touchedRock[k] = true;
  seenCells.clear();
  if (data.seen) for (const c of data.seen) seenCells.add(c);
  if (data.audioOn === false) { audio.on = false; if (audio.ctx) audio.master.gain.value = 0; }
  if (data.nests) stingwings.forEach((w, i) => {
    if (!data.nests[i]) return;
    w.eggs = data.nests[i].e; w.eggBack = gameTime + (data.nests[i].b || 0);
  });
  if (data.lizards) lizards.forEach((l, i) => { l.goneUntil = gameTime + (data.lizards[i] || 0); });
  if (data.skyfish) skyfish.forEach((f, i) => { f.goneUntil = gameTime + (data.skyfish[i] || 0); });
  player.fuel = clamp(player.fuel || 0, 0, maxFuel());
  return true;
}

function resetGame() {
  wiping = true;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
}

// ---------- overlays ----------

function anyOverlayOpen() {
  return [...document.querySelectorAll('.overlay')].some(o => !o.classList.contains('hidden'));
}
function openOverlay(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.classList.add('menu-open');
  paused = true;
}
function closeOverlays() {
  if (deathCause) return;
  document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
  document.body.classList.remove('menu-open');
  paused = false;
}
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', closeOverlays));
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('pointerdown', e => { if (e.target === o) closeOverlays(); });
});

function togglePack() {
  const el = document.getElementById('overlay-pack');
  if (el.classList.contains('hidden')) { renderPack(); openOverlay('overlay-pack'); }
  else closeOverlays();
}

function costHTML(recipe) {
  return Object.entries(recipe.cost).map(([k, v]) => {
    const have = pooled(k);
    const lack = have < v ? ' lack' : '';
    const fromStore = have > (inv[k] || 0) ? ' title="includes nearby base storage"' : '';
    return '<span class="' + lack + '"' + fromStore + '><span class="c-icon">' + svgIcon(ITEMS[k].icon) + '</span>' + have + '/' + v + '</span>';
  }).join('');
}

function recipeRow(recipe, base) {
  const row = document.createElement('div');
  const done = recipe.once && flags[recipe.flag];
  const needsLock = recipe.needs && !flags[recipe.needs];
  row.className = 'recipe' + (recipe.locked || needsLock ? ' locked' : '') + (done ? ' done' : '');
  row.innerHTML =
    '<span class="r-icon">' + svgIcon(recipe.icon) + '</span>' +
    '<div class="r-body"><div class="r-name"></div><div class="r-desc"></div><div class="r-cost">' + costHTML(recipe) + '</div></div>' +
    '<button class="craft-btn" type="button"></button>';
  row.querySelector('.r-name').textContent = recipe.name;
  row.querySelector('.r-desc').textContent = recipe.desc;
  const btn = row.querySelector('.craft-btn');
  if (recipe.locked) { btn.textContent = 'Soon'; btn.disabled = true; }
  else if (done) { btn.textContent = 'Built'; btn.disabled = true; }
  else {
    btn.textContent = 'Craft';
    btn.disabled = !canAfford(recipe) || needsLock;
    btn.addEventListener('click', () => craft(recipe, base));
  }
  return row;
}

// Compact tile: icon, count, short name. Tap a usable tile to eat or place it.
function invTile(id, def, count, onUse, useLabel) {
  const el = document.createElement('div');
  el.className = 'inv-item' + (onUse ? ' usable' : '');
  el.innerHTML =
    '<span class="i-icon">' + svgIcon(def.icon) + '</span>' +
    '<span class="i-count">' + count + '</span>' +
    '<span class="i-name"></span>';
  el.querySelector('.i-name').textContent = def.name;
  if (onUse) {
    el.title = useLabel;
    el.addEventListener('click', onUse);
  }
  return el;
}

function renderPack() {
  const grid = document.getElementById('inv-grid');
  grid.innerHTML = '';
  let any = false;
  for (const [id, def] of Object.entries(ITEMS)) {
    if (inv[id] <= 0) continue;
    any = true;
    const use = (def.eat || def.heal) ? () => useItem(id) : def.place ? placeBase : null;
    grid.appendChild(invTile(id, def, inv[id], use, def.heal ? 'Use' : def.eat ? 'Eat' : 'Place'));
  }
  if (flags.beacon && !beaconLit) {
    const el = invTile('beacon', { name: 'Signal beacon', icon: 'lighthouse' }, 1, lightBeacon, 'Raise');
    grid.appendChild(el);
    any = true;
  }
  if (!any) grid.innerHTML = '<div class="inv-empty">Empty</div>';
  renderLog();

  const list = document.getElementById('recipe-list');
  list.innerHTML = '';
  const personal = RECIPES.filter(r => r.tier === 'personal' && known[r.id]);
  for (const r of personal) list.appendChild(recipeRow(r));
  const hidden = RECIPES.filter(r => r.tier === 'personal' && !known[r.id]).length;
  if (!personal.length) {
    list.innerHTML = '<div class="inv-empty">No plans yet. Gather things and look at them.</div>';
  } else if (hidden) {
    const note = document.createElement('div');
    note.className = 'inv-empty';
    note.textContent = hidden + ' more ' + (hidden === 1 ? 'plan' : 'plans') + ' still to work out.';
    list.appendChild(note);
  }
}

// ---------- playtest cheats ----------

const CHEATS = {
  mats() {
    for (const id of ['berry', 'fiber', 'stone', 'ore', 'crystal']) inv[id] += 20;
    toast('+20 of each material', 'good', 'knapsack');
  },
  gear() {
    revealAllPlans();
    for (const k of Object.keys(flags)) flags[k] = true;
    player.maxEnergy = 220; player.energy = 220;
    player.fuel = maxFuel();
    toast('All gear unlocked', 'good', 'gloves');
  },
  vitals() {
    player.hp = 100; player.food = 100; player.energy = player.maxEnergy;
    player.fuel = maxFuel();
    toast('Vitals refilled', 'good', 'hearts');
  },
  critters() {
    inv.lizard += 10; inv.skyfish += 10;
    toast('+10 lizards, +10 trout', 'good', 'cage');
  },
  relics() {
    inv.relic += 3;
    toast('+3 relics', 'good', 'emerald');
  },
  steel() {
    inv.skysteel += 8; inv.egg += 4;
    toast('+8 skysteel, +4 eggs', 'good', 'metal-bar');
  },
  scans() {
    flags.scanner = true;
    for (const k of CODEX_KEYS) scanned[k] = true;
    renderLog();
    toast('Field log filled', 'good', 'open-book');
  },
  storm() {
    stormLeft = T.stormLength; stormTimer = T.stormEvery; boltTimer = 1.5;
    toast('Storm summoned', 'bad', 'lightning-storm');
  },
  night() {
    dayTime = isNight() ? 0.1 : 0.8;
    toast(isNight() ? 'Night' : 'Day', 'good', isNight() ? 'moon' : 'sun');
  },
  kit() {
    inv.basekit += 3;
    toast('+3 base kits', 'good', 'house');
  },
};

document.querySelectorAll('[data-cheat]').forEach(btn => {
  btn.addEventListener('click', () => {
    CHEATS[btn.dataset.cheat]();
    renderPack();
    saveGame();
  });
});

let openBaseRef = null;
function openBase(base) {
  openBaseRef = base;
  renderBase(base);
  openOverlay('overlay-base');
}
function renderBase(base) {
  document.getElementById('base-title').textContent =
    (base.wall ? 'Cliff base' : 'Base') + (base.mk2 ? ' — Fabricator Mk2' : '');
  document.getElementById('base-note').textContent = base.mk2
    ? 'Fast recharge in range.'
    : 'Build the Mk2 here for heavier gear.';

  const store = document.getElementById('base-store');
  store.innerHTML = '';
  const ids = Object.keys(base.store || {}).filter(id => base.store[id] > 0);
  if (!ids.length) {
    store.innerHTML = '<div class="inv-empty">Empty</div>';
  } else {
    for (const id of ids) {
      store.appendChild(invTile(id, ITEMS[id], base.store[id], () => takeItem(base, id, true), 'Take'));
    }
  }
  const carrying = RAW_MATERIALS.some(id => inv[id] > 0);
  const dep = document.getElementById('btn-deposit');
  dep.disabled = !carrying;
  dep.onclick = () => depositAll(base);

  const list = document.getElementById('base-recipe-list');
  list.innerHTML = '';
  if (!base.mk2) {
    if (known.mk2) list.appendChild(recipeRow(RECIPES.find(r => r.id === 'mk2'), base));
  } else {
    for (const r of RECIPES) if (r.tier === 'mk2' && known[r.id]) list.appendChild(recipeRow(r, base));
    if (base.mk3) for (const r of RECIPES) if (r.tier === 'mk3' && known[r.id]) list.appendChild(recipeRow(r, base));
  }
  if (!list.children.length) list.innerHTML = '<div class="inv-empty">Nothing worked out for this bench yet.</div>';
  const rest = document.getElementById('btn-rest');
  rest.disabled = player.food < 25;
  rest.textContent = isNight() ? 'Sleep until dawn' : 'Rest here';
  rest.onclick = restUntilDawn;
}

// ---------- field log ----------

function renderLog() {
  const n = scanCount();
  const done = n === CODEX_KEYS.length;
  const summary = document.getElementById('log-summary');
  if (summary) {
    summary.textContent = flags.scanner
      ? 'Logged ' + n + ' of ' + CODEX_KEYS.length + (done ? ' — complete.' : '.')
      : 'Build a Field scanner to start logging what lives up here.';
  }
  const prog = document.getElementById('log-progress');
  if (prog) prog.textContent = 'Logged ' + n + ' of ' + CODEX_KEYS.length + (done ? ' — complete.' : '');
  const list = document.getElementById('log-list');
  if (!list) return;
  list.innerHTML = '';
  for (const key of CODEX_KEYS) {
    const def = CODEX[key];
    const got = !!scanned[key];
    const el = document.createElement('div');
    el.className = 'log-entry' + (got ? '' : ' unknown');
    el.innerHTML = '<span class="l-icon">' + svgIcon(got ? def.icon : 'radar-sweep') + '</span>' +
      '<div><div class="l-name"></div><div class="l-note"></div></div>';
    el.querySelector('.l-name').textContent = got ? def.name : 'Unlogged';
    el.querySelector('.l-note').textContent = got ? def.note : 'Scan one to fill this in.';
    list.appendChild(el);
  }
}

// ---------- sky chart ----------

function renderMap() {
  const cv = document.getElementById('map-canvas');
  const g = cv.getContext('2d');
  const W = Math.min(640, Math.round(window.innerWidth * 0.9));
  const worldW = WORLD.right - WORLD.left;
  const worldH = (WORLD.cloudSea + 120) - WORLD.top;
  const H = Math.max(200, Math.round(W * (worldH / worldW)));
  const dp = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dp; cv.height = H * dp;
  cv.style.height = H + 'px';
  g.setTransform(dp, 0, 0, dp, 0, 0);

  const sx = W / worldW, sy = H / worldH;
  const mx = x => (x - WORLD.left) * sx;
  const my = y => (y - WORLD.top) * sy;

  g.fillStyle = '#0a1024';
  g.fillRect(0, 0, W, H);

  // the cloud sea at the bottom
  g.fillStyle = 'rgba(230,228,240,0.14)';
  g.fillRect(0, my(WORLD.cloudSea), W, H - my(WORLD.cloudSea));

  // only islands in cells you have laid eyes on
  let seenRocks = 0;
  for (const r of rocks) {
    if (r.deck) continue;
    if (!cellSeen(r.x + r.w / 2, r.y + r.h / 2)) continue;
    seenRocks++;
    const def = CLIFF_TYPES[r.type] || CLIFF_TYPES.granite;
    g.fillStyle = def.color;
    g.fillRect(mx(r.x), my(r.y), Math.max(2, r.w * sx), Math.max(2, r.h * sy));
    g.fillStyle = def.lip2;
    g.fillRect(mx(r.x), my(r.y), Math.max(2, r.w * sx), 2);
  }

  const dot = (x, y, col, rad) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(mx(x), my(y), rad || 4, 0, Math.PI * 2); g.fill();
  };

  dot(CAMP.x, CAMP.y, '#ffb454', 5);
  for (const b of bases) dot(b.x, b.y, '#8fc7ff', 5);
  for (const rl of relics) {
    if (rl.taken) dot(rl.x, rl.y, 'rgba(120,140,170,0.7)', 3);
    else if (flags.compass || cellSeen(rl.x, rl.y)) dot(rl.x, rl.y, '#7dffb0', 5);
  }
  if (summit && cellSeen(summit.x, summit.y)) dot(summit.x, summit.y, beaconLit ? '#ffd76b' : '#e8eefb', 5);

  // player, with a heading tick
  const px = mx(player.x + P_W / 2), py = my(player.y + P_H / 2);
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.arc(px, py, 6, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(px, py, 2.5, 0, Math.PI * 2); g.fill();

  const pct = Math.round(100 * seenRocks / Math.max(1, rocks.filter(r => !r.deck).length));
  document.getElementById('map-note').textContent =
    'Charted ' + pct + '% of the islands' +
    (flags.compass ? ' · compass marks every unopened relic' : '') +
    ' · the visor charts further while it is up.';
}

// changelog

document.getElementById('version-badge').addEventListener('click', () => {
  const body = document.getElementById('changelog-body');
  body.innerHTML = '';
  for (const entry of CHANGELOG) {
    const div = document.createElement('div');
    div.className = 'cl-entry';
    div.innerHTML = '<span class="cl-ver"></span><span class="cl-meta"></span><ul></ul>';
    div.querySelector('.cl-ver').textContent = 'v' + entry.version + ' — ' + entry.name;
    div.querySelector('.cl-meta').textContent = entry.date;
    const ul = div.querySelector('ul');
    for (const note of entry.notes) {
      const li = document.createElement('li');
      li.textContent = note;
      ul.appendChild(li);
    }
    body.appendChild(div);
  }
  openOverlay('overlay-changelog');
});

document.getElementById('btn-respawn').addEventListener('click', respawn);
document.getElementById('btn-open-log').addEventListener('click', () => { renderLog(); openOverlay('overlay-log'); });
document.getElementById('btn-map').addEventListener('click', () => { renderMap(); openOverlay('overlay-map'); });
document.getElementById('btn-sound').addEventListener('click', toggleAudio);
document.getElementById('btn-win-close').addEventListener('click', () => {
  document.getElementById('overlay-win').classList.add('hidden');
  document.body.classList.toggle('menu-open', anyOverlayOpen());
  paused = anyOverlayOpen();
});

const resetBtn = document.getElementById('btn-reset');
resetBtn.addEventListener('click', () => {
  if (resetBtn.classList.contains('confirm')) { resetGame(); return; }
  resetBtn.classList.add('confirm');
  resetBtn.textContent = 'Tap again — new world, fresh start';
  setTimeout(() => {
    resetBtn.classList.remove('confirm');
    resetBtn.textContent = 'Wipe save & remix a new world';
  }, 3000);
});

// static UI icons

document.querySelector('#bar-health .bar-icon').innerHTML = svgIcon('hearts');
document.querySelector('#bar-food .bar-icon').innerHTML = svgIcon('meat');
document.querySelector('#bar-energy .bar-icon').innerHTML = svgIcon('power-lightning');
document.querySelector('#bar-fuel .bar-icon').innerHTML = svgIcon('fuel-tank');
document.querySelector('#btn-jet .abtn-icon').innerHTML = svgIcon('jet-pack');
document.querySelector('#btn-release .abtn-icon').innerHTML = svgIcon('falling');
document.querySelector('#btn-visor .abtn-icon').innerHTML = svgIcon('binoculars');
document.querySelector('#version-badge .badge-icon').innerHTML = svgIcon('mountain-climbing');
document.getElementById('version-text').textContent = 'v' + GAME_VERSION;
document.querySelector('#btn-pack .abtn-icon').innerHTML = svgIcon('knapsack');
document.querySelector('#btn-base .abtn-icon').innerHTML = svgIcon('house');
document.querySelector('#btn-interact .abtn-icon').innerHTML = svgIcon('hand');
document.querySelector('#btn-jump .abtn-icon').innerHTML = svgIcon('jump-across');
document.getElementById('pack-icon').innerHTML = svgIcon('gear-hammer');
document.getElementById('base-icon').innerHTML = svgIcon('house');
document.getElementById('cl-icon').innerHTML = svgIcon('mountain-climbing');
document.getElementById('log-icon').innerHTML = svgIcon('open-book');
document.getElementById('map-icon').innerHTML = svgIcon('treasure-map');
document.getElementById('btn-map').innerHTML = svgIcon('treasure-map');
document.getElementById('btn-sound').innerHTML = svgIcon('sound-on');
document.getElementById('win-icon').innerHTML = svgIcon('lighthouse');

function updateHUD() {
  document.querySelector('#bar-health .bar-fill').style.width = player.hp + '%';
  document.querySelector('#bar-food .bar-fill').style.width = player.food + '%';
  document.querySelector('#bar-energy .bar-fill').style.width = (player.energy / player.maxEnergy * 100) + '%';
  document.getElementById('bar-health').classList.toggle('warn', player.hp < 25);
  document.getElementById('bar-food').classList.toggle('warn', player.food < 20);
  document.getElementById('bar-energy').classList.toggle('warn', player.energy < player.maxEnergy * 0.2);
  // glove energy means nothing until you have gloves; same for jet fuel
  document.getElementById('bar-energy').classList.toggle('hidden', !flags.gloves);
  const fuelBar = document.getElementById('bar-fuel');
  fuelBar.classList.toggle('hidden', !flags.jetpack);
  if (flags.jetpack) {
    fuelBar.querySelector('.bar-fill').style.width = (player.fuel / maxFuel() * 100) + '%';
    fuelBar.classList.toggle('warn', player.fuel < maxFuel() * 0.2);
  }
  btnJet.classList.toggle('glide-ready', flags.jetpack && player.fuel > 0);

  // weather + clock strip under the bars
  const w = document.getElementById('weather');
  const night = isNight(), storm = storming();
  const wState = (night ? 'n' : 'd') + (storm ? 's' : '') + (storm ? Math.round(windX / 60) : '');
  if (w.dataset.state !== wState) {
    w.dataset.state = wState;
    let html = '<span class="w-icon ' + (night ? 'w-night' : '') + '">' + svgIcon(night ? 'moon' : 'sun') + '</span>';
    if (storm) {
      html += '<span class="w-icon w-storm">' + svgIcon('lightning-storm') + '</span>' +
        '<span class="w-icon w-storm" style="transform:scaleX(' + (windX >= 0 ? 1 : -1) + ')">' + svgIcon('windy-stripes') + '</span>';
    }
    w.innerHTML = html;
    w.classList.toggle('hidden', !night && !storm);
  }

  const jumpIcon = document.querySelector('#btn-jump .abtn-icon');
  const want = (player.state === 'glide' || (flags.glider && player.state === 'air')) ? 'hang-glider' : 'jump-across';
  if (jumpIcon.dataset.icon !== want) { jumpIcon.dataset.icon = want; jumpIcon.innerHTML = svgIcon(want); }
  btnJump.classList.toggle('glide-ready', player.state === 'glide');
}

// ---------- rendering ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let cw = 0, chh = 0, dpr = 1, scale = 1;
const cam = { x: 300, y: 2400 };

let baseScale = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth; chh = window.innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(chh * dpr);
  baseScale = Math.max(Math.min(cw / 450, chh / 750), 0.6);
  scale = baseScale;
}
window.addEventListener('resize', resize);
resize();

function skyColor(y) {
  const t = clamp((y - 700) / 1900, 0, 1);
  const To = (r, g, b) => ({ r, g, b });
  const mixc = (a, b, k) => To(lerp(a.r, b.r, k), lerp(a.g, b.g, k), lerp(a.b, b.b, k));
  const out = c => 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')';

  let top = mixc(To(11, 21, 48), To(120, 150, 205), t);
  let bot = mixc(To(38, 60, 110), To(215, 190, 170), t);
  // dusk warms the horizon, night drains it to indigo
  const n = nightAmount();
  if (n > 0) {
    const dusk = n < 1 ? Math.sin(n * Math.PI) : 0;
    top = mixc(top, To(6, 9, 26), n);
    bot = mixc(bot, To(14, 18, 44), n);
    bot = mixc(bot, To(120, 68, 78), dusk * 0.5);
  }
  if (storming()) {
    const k = clamp(stormLeft / 6, 0, 1) * 0.55;
    top = mixc(top, To(48, 50, 62), k);
    bot = mixc(bot, To(78, 80, 92), k);
  }
  return [out(top), out(bot)];
}

function w2s(x, y) { return { x: (x - cam.x) * scale + cw / 2, y: (y - cam.y) * scale + chh / 2 }; }

function drawCliff(r) {
  const def = CLIFF_TYPES[r.type];
  if (r.deck) {
    ctx.fillStyle = '#243352';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#8fc7ff';
    ctx.fillRect(r.x, r.y, r.w, 3);
    ctx.fillStyle = 'rgba(143,199,255,0.35)';
    for (let i = 8; i < r.w - 4; i += 18) ctx.fillRect(r.x + i, r.y + r.h, 3, 10);
    return;
  }
  ctx.fillStyle = def.color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (r.taper) {
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.lineTo(r.x + r.w * 0.62, r.y + r.h + r.taper);
    ctx.lineTo(r.x + r.w * 0.3, r.y + r.h + r.taper * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  // simple face texture per type, deterministic per rect
  ctx.fillStyle = def.shade;
  if (r.type === 'basalt') {
    for (let i = 0; i < r.w; i += 26) ctx.fillRect(r.x + i + (r.y % 13), r.y + 6, 3, r.h - 12);
  } else if (r.type === 'stormrock') {
    for (let i = 0; i < 8; i++) {
      const fx = r.x + ((r.x * 7 + i * 131) % Math.max(r.w - 10, 1));
      const fy = r.y + ((r.y * 3 + i * 197) % Math.max(r.h - 10, 1));
      ctx.fillRect(fx, fy, 4, 4);
    }
    ctx.fillStyle = 'rgba(155,127,196,0.35)';
    for (let i = 0; i < 4; i++) {
      const fx = r.x + ((r.x * 11 + i * 89) % Math.max(r.w - 8, 1));
      const fy = r.y + ((r.y * 5 + i * 241) % Math.max(r.h - 8, 1));
      ctx.fillRect(fx, fy, 3, 3);
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const fx = r.x + ((r.x * 13 + i * 103) % Math.max(r.w - 14, 1));
      const fy = r.y + ((r.y * 7 + i * 167) % Math.max(r.h - 14, 1));
      ctx.fillRect(fx, fy, 8, 3);
    }
  }
  // route features — the shape of a climb, readable from a distance
  if (r.features) {
    for (const f of r.features) {
      const broken = f.kind === 'crumble' && gameTime < f.brokenUntil;
      const def = FEATURES[broken ? 'slick' : f.kind];
      ctx.save();
      ctx.globalAlpha = broken ? 0.3 : 0.42;
      ctx.fillStyle = def.color;
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.globalAlpha = broken ? 0.45 : 0.85;
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(f.x + 1, f.y + 1, f.w - 2, f.h - 2);
      ctx.restore();
      // texture that reads without colour: notches, rungs, cracks, streaks
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = def.color;
      if (f.kind === 'hold' && !broken) {
        for (let i = 6; i < f.w - 6; i += 15) for (let j = 8; j < f.h - 6; j += 16) ctx.fillRect(f.x + i, f.y + j, 6, 4);
      } else if (f.kind === 'rest') {
        ctx.fillRect(f.x + 2, f.y + f.h - 4, f.w - 4, 3);
      } else if (f.kind === 'crumble' && !broken) {
        for (let i = 8; i < f.w - 4; i += 19) ctx.fillRect(f.x + i, f.y + 5, 2, f.h - 12);
      } else {
        for (let j = 8; j < f.h - 4; j += 13) ctx.fillRect(f.x + 5, f.y + j, f.w - 10, 2);
      }
      ctx.restore();
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(r.x, r.y, 5, r.h);
  // top lip
  ctx.fillStyle = def.lip;
  ctx.fillRect(r.x - 3, r.y, r.w + 6, 9);
  ctx.fillStyle = def.lip2;
  ctx.fillRect(r.x - 3, r.y, r.w + 6, 4);
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const [cTop, cBot] = skyColor(cam.y);
  const g = ctx.createLinearGradient(0, 0, 0, chh);
  g.addColorStop(0, cTop); g.addColorStop(1, cBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, chh);

  const starA = Math.max(clamp((1500 - cam.y) / 900, 0, 0.8), nightAmount() * 0.85);
  if (starA > 0.02) {
    const a = starA;
    ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 733) % 1000) / 1000 * cw;
      const sy = ((i * 271) % 1000) / 1000 * chh * 0.7;
      ctx.fillRect(sx, sy, 2, 2);
    }
  }

  ctx.save();
  ctx.translate(cw / 2, chh / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x, -cam.y);

  for (const c of clouds) if (c.layer === 0) drawIcon(ctx, 'fluffy-cloud', c.x, c.y, c.s, '#ffffff', c.a);

  // thermals: columns of rising air, drawn behind the rock
  const activeThermal = inThermal();
  for (const th of thermals) {
    const hot = th === activeThermal;
    const g2 = ctx.createLinearGradient(0, th.bottom, 0, th.top);
    g2.addColorStop(0, hot ? 'rgba(255,214,107,0.20)' : 'rgba(200,230,255,0.10)');
    g2.addColorStop(1, 'rgba(200,230,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(th.x - th.w / 2, th.top, th.w, th.bottom - th.top);
    // motes streaming upward
    const span = th.bottom - th.top;
    for (let i = 0; i < 7; i++) {
      const phase = (gameTime * (hot ? 150 : 80) + i * span / 7) % span;
      const my = th.bottom - phase;
      const mx = th.x + Math.sin((gameTime + i) * 1.6) * th.w * 0.3;
      drawIcon(ctx, 'windy-stripes', mx, my, hot ? 22 : 16, hot ? '#ffd76b' : '#cfe0ff', hot ? 0.5 : 0.28);
    }
  }

  for (const r of rocks) drawCliff(r);

  // ridgerunners patrol island tops
  for (const rr of runners) {
    ctx.save();
    ctx.translate(rr.x, rr.rock.y - 17 + Math.abs(Math.sin(rr.t * (rr.mode === 'charge' ? 14 : 6))) * 2);
    if (rr.dir < 0) ctx.scale(-1, 1);
    drawIcon(ctx, 'boar', 0, 0, 36, rr.mode === 'charge' ? '#e08a5a' : '#9a7355');
    ctx.restore();
    if (rr.mode === 'charge') {
      ctx.globalAlpha = 0.5;
      drawIcon(ctx, 'windy-stripes', rr.x - rr.dir * 26, rr.rock.y - 20, 18, '#e08a5a');
      ctx.globalAlpha = 1;
    }
  }

  // camp
  drawZone(CAMP.x, CAMP.y, '#ffb454');
  drawIcon(ctx, 'campfire', CAMP.x, CAMP.y - 16, 34, '#ffb454', 0.9 + Math.sin(gameTime * 7) * 0.1);
  drawIcon(ctx, 'gear-hammer', CAMP.x + 42, CAMP.y - 14, 22, '#aecbff', 0.8);

  // bases
  for (const b of bases) {
    drawZone(b.x, b.y, '#8fc7ff');
    const by = b.wall ? b.y - DECK_H : b.y;
    if (!b.wall) {
      ctx.fillStyle = '#243352';
      ctx.fillRect(b.x - 30, b.y - 6, 60, 6);
    }
    drawIcon(ctx, b.wall ? 'hut' : 'house', b.x, by - 26, 38, '#8fc7ff');
    drawIcon(ctx, 'chest', b.x - 26, by - 12, 18, '#c9a86b');
    if (b.mk2) drawIcon(ctx, 'anvil', b.x + 26, by - 12, 19, '#ffd76b');
    drawIcon(ctx, 'flying-flag', b.x + 4, by - 48, 15, 'rgba(143,199,255,0.55)');
  }


  // relics: the payoff for going sideways
  for (const rl of relics) {
    if (rl.taken) {
      drawIcon(ctx, 'open-treasure-chest', rl.x, rl.y, 26, '#6c7a99', 0.55);
      continue;
    }
    const bob = Math.sin(gameTime * 1.8 + rl.x) * 3;
    ctx.save();
    ctx.globalAlpha = 0.3 + Math.sin(gameTime * 2.5 + rl.x) * 0.12;
    ctx.fillStyle = '#7dffb0';
    ctx.beginPath(); ctx.arc(rl.x, rl.y + bob, 30, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawIcon(ctx, 'ancient-ruins', rl.x, rl.y + 8 + bob, 40, '#4c6a5a', 0.9);
    drawIcon(ctx, 'locked-chest', rl.x, rl.y + bob, 26, '#7dffb0');
    if (player.harvest && player.harvest.relic === rl) {
      ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(rl.x, rl.y + bob, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (player.harvest.t / player.harvest.total));
      ctx.stroke();
    }
  }

  // nest eggs
  for (const w of stingwings) {
    if (w.eggs > 0 && gameTime > (w.eggBack || 0)) {
      drawIcon(ctx, 'egg-clutch', w.nest.x, w.nest.y + 12, 20, '#f0e2c0', 0.9);
    }
  }

  // the lit beacon
  if (beaconLit && summit) {
    const pulse = 0.5 + Math.sin(gameTime * 3) * 0.3;
    ctx.save();
    ctx.globalAlpha = pulse * 0.5;
    const bg = ctx.createRadialGradient(summit.x, summit.y - 40, 10, summit.x, summit.y - 40, 340);
    bg.addColorStop(0, 'rgba(255,215,107,0.9)');
    bg.addColorStop(1, 'rgba(255,215,107,0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(summit.x, summit.y - 40, 340, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawIcon(ctx, 'lighthouse', summit.x, summit.y - 34, 46, '#ffd76b');
  }

  // nodes
  const active = nearestNode();
  for (const n of NODES) {
    const def = NODE_TYPES[n.type];
    const depleted = gameTime < n.depletedUntil;
    const bob = n.wall ? 0 : Math.sin(gameTime * 2 + n.x) * 2;
    const nx = n.x, ny = n.y - (n.wall ? 0 : 14) + bob;
    ctx.globalAlpha = depleted ? 0.22 : 1;
    ctx.fillStyle = 'rgba(10,16,36,0.75)';
    ctx.beginPath(); ctx.arc(nx, ny, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = def.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(nx, ny, 16, 0, Math.PI * 2); ctx.stroke();
    drawIcon(ctx, def.icon, nx, ny, 21, depleted ? '#888' : def.color);
    ctx.globalAlpha = 1;
    if (n === active && !depleted) {
      const pulse = 20 + Math.sin(gameTime * 6) * 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(nx, ny, pulse, 0, Math.PI * 2); ctx.stroke();
      if (player.harvest && player.harvest.node === n) {
        ctx.strokeStyle = '#8fe3ff'; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(nx, ny, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (player.harvest.t / T.harvestTime));
        ctx.stroke();
      }
    }
  }

  // lizards — neutral, live on the faces, catchable
  for (const l of lizards) {
    if (gameTime < l.goneUntil) continue;
    ctx.save();
    ctx.translate(l.x, l.y);
    if (l.dir < 0) ctx.scale(-1, 1);
    drawIcon(ctx, 'gecko', 0, 0, 24, '#8fce7a', 0.9);
    ctx.restore();
  }

  // sky trout — neutral drifters, catchable
  for (const f of skyfish) {
    if (gameTime < f.goneUntil) continue;
    ctx.save();
    ctx.translate(f.x, f.y + Math.sin(gameTime * 2 + f.home.x) * 3);
    if (f.dir < 0) ctx.scale(-1, 1);
    drawIcon(ctx, 'flying-trout', 0, 0, 30, '#8fd8e8', 0.92);
    ctx.restore();
    // faint halo marking the fly-through catch radius
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(gameTime * 3 + f.home.x) * 0.06;
    ctx.strokeStyle = '#8fd8e8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // catch/harvest ring on a live critter
  if (player.harvest && player.harvest.critter) {
    const c = player.harvest.critter;
    ctx.strokeStyle = '#8fe3ff'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (player.harvest.t / player.harvest.total));
    ctx.stroke();
  }

  // scanner sweep on the current target
  if (player.harvest && player.harvest.scan) {
    const pc2 = playerCenter();
    const p2 = player.harvest.t / player.harvest.total;
    ctx.strokeStyle = 'rgba(159,245,196,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(pc2.x, pc2.y, 26 + p2 * 30, 0, Math.PI * 2); ctx.stroke();
  }

  if (crumbleFx) {
    ctx.save();
    ctx.globalAlpha = 1 - crumbleFx.t / 0.5;
    ctx.fillStyle = '#ffb454';
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, d = crumbleFx.t * 190;
      ctx.fillRect(crumbleFx.x + Math.cos(a) * d, crumbleFx.y + Math.sin(a) * d + crumbleFx.t * 90, 4, 4);
    }
    ctx.restore();
  }

  // double-jump puff
  if (jumpFx) {
    ctx.strokeStyle = 'rgba(200,225,255,' + (1 - jumpFx.t / 0.3) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(jumpFx.x, jumpFx.y, 10 + jumpFx.t * 70, 5 + jumpFx.t * 22, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // stingwing nests + wasps
  for (const w of stingwings) {
    drawIcon(ctx, 'wasp-sting', w.nest.x, w.nest.y, 26, 'rgba(0,0,0,0.35)');
    const flip = (w.mode === 'chase' ? playerCenter().x < w.x : Math.cos(w.t * 1.3) < 0);
    ctx.save();
    ctx.translate(w.x, w.y + Math.sin(gameTime * 14) * 2);
    if (flip) ctx.scale(-1, 1);
    const col = w.stun > 0 ? '#8a7a52' : (w.mode === 'chase' ? '#ffd76b' : '#d9b45e');
    drawIcon(ctx, 'wasp-sting', 0, 0, 30, col, w.stun > 0 ? 0.6 : 1);
    ctx.restore();
  }

  // razorbeaks
  for (const b of razorbeaks) {
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.dir < 0) ctx.scale(-1, 1);
    drawIcon(ctx, 'bat', 0, 0, 42, b.mode === 'swoop' ? '#8a5a86' : '#5b4566');
    ctx.restore();
  }

  // glove pulse burst
  if (pulseFx) {
    const t = pulseFx.t;
    ctx.strokeStyle = 'rgba(143,227,255,' + (1 - t / 0.45) + ')';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(pulseFx.x, pulseFx.y, t / 0.45 * T.pulseRadius, 0, Math.PI * 2); ctx.stroke();
  }

  drawPlayer();

  for (const c of clouds) if (c.layer === 1) drawIcon(ctx, 'fluffy-cloud', c.x, c.y, c.s * 1.4, '#ffffff', c.a * 0.7);

  // cloud sea
  const seaTop = WORLD.cloudSea;
  const sg = ctx.createLinearGradient(0, seaTop - 120, 0, seaTop + 160);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.55, 'rgba(240,238,245,0.85)');
  sg.addColorStop(1, 'rgba(230,228,240,1)');
  ctx.fillStyle = sg;
  ctx.fillRect(cam.x - cw / scale, seaTop - 120, cw * 2 / scale, 400);
  for (let i = 0; i < 10; i++) {
    const cx = ((i * 431) % (WORLD.right + 200)) + Math.sin(gameTime * 0.3 + i) * 30;
    drawIcon(ctx, 'fluffy-cloud', cx, seaTop - 30 + (i % 3) * 22, 150, '#ffffff', 0.5);
  }

  ctx.restore();

  // relic compass: screen-edge arrows toward relics you have not opened yet
  if (flags.compass) {
    for (const rl of relics) {
      if (rl.taken) continue;
      const s = w2s(rl.x, rl.y);
      const m = 46;
      const onScreen = s.x > m && s.x < cw - m && s.y > m && s.y < chh - m;
      if (onScreen) continue;
      const px = clamp(s.x, m, cw - m), py = clamp(s.y, m, chh - m);
      const far = Math.round(dist(player.x, player.y, rl.x, rl.y) / 10);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(10,16,36,0.72)';
      ctx.beginPath(); ctx.arc(px, py, 19, 0, Math.PI * 2); ctx.fill();
      drawIcon(ctx, 'emerald', px, py - 2, 19, '#7dffb0');
      ctx.fillStyle = '#7dffb0';
      ctx.font = '600 9px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(far + 'm', px, py + 15);
      ctx.restore();
    }
  }

  // storm: driving gusts across the screen, plus the flash of a strike
  if (storming()) {
    const k = clamp(stormLeft / 6, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.16 * k;
    ctx.strokeStyle = '#dce6ff'; ctx.lineWidth = 2;
    const dirW = windX >= 0 ? 1 : -1;
    for (let i = 0; i < 26; i++) {
      const gx = ((i * 197 + gameTime * (240 + Math.abs(windX)) * dirW) % (cw + 260)) - 130;
      const gy = (i * 137) % chh;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 46 * dirW, gy + 12); ctx.stroke();
    }
    ctx.restore();
  }
  if (boltFlash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (boltFlash * 0.75) + ')';
    ctx.fillRect(0, 0, cw, chh);
  }

  // At visor range everything is tiny, so overlay legible markers for the things
  // that matter: your bases, camp, relics, the summit, and live threats.
  if (visorOn && flags.visor) {
    const mark = (wx, wy, icon, col, size) => {
      const p = w2s(wx, wy);
      if (p.x < -20 || p.x > cw + 20 || p.y < -20 || p.y > chh + 20) return;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(10,16,36,0.55)';
      ctx.beginPath(); ctx.arc(p.x, p.y, (size || 15) + 3, 0, Math.PI * 2); ctx.fill();
      drawIcon(ctx, icon, p.x, p.y, (size || 15) * 1.6, col);
      ctx.restore();
    };
    mark(CAMP.x, CAMP.y - 20, 'campfire', '#ffb454');
    for (const b of bases) mark(b.x, b.y - 20, b.wall ? 'hut' : 'house', '#8fc7ff');
    for (const rl of relics) if (!rl.taken) mark(rl.x, rl.y, 'emerald', '#7dffb0');
    if (summit) mark(summit.x, summit.y - 20, beaconLit ? 'lighthouse' : 'mountain-climbing', beaconLit ? '#ffd76b' : '#cfe0ff');
    for (const w of stingwings) mark(w.x, w.y, 'wasp-sting', '#ffd76b', 11);
    for (const b of razorbeaks) mark(b.x, b.y, 'bat', '#c98ac4', 11);
    for (const rr of runners) mark(rr.x, rr.rock.y - 18, 'boar', '#e08a5a', 11);
    for (const th of thermals) mark(th.x, (th.top + th.bottom) / 2, 'windy-stripes', '#cfe0ff', 11);
  }

  // visor tint, so the pulled-back view reads as looking through something
  if (visorOn && flags.visor) {
    ctx.save();
    ctx.strokeStyle = 'rgba(159,245,196,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, cw - 16, chh - 16);
    ctx.fillStyle = 'rgba(120,255,190,0.05)';
    ctx.fillRect(0, 0, cw, chh);
    ctx.restore();
  }

  if (gameTime < saveNoticeUntil) {
    ctx.save();
    ctx.globalAlpha = clamp(saveNoticeUntil - gameTime, 0, 1) * 0.7;
    drawIcon(ctx, 'save', cw - 24, chh - 24, 18, '#aecbff');
    ctx.restore();
  }
}

function drawZone(x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = dist(player.x, player.y, x, y) < T.campRadius + 60 ? 0.35 : 0.1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.arc(x, y, T.campRadius, Math.PI, 0); ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const px = player.x, py = player.y;
  const cx = px + P_W / 2;
  const blink = player.invuln > 0 && Math.floor(gameTime * 14) % 2 === 0;
  if (blink) return;

  ctx.save();
  if (player.state === 'glide') {
    ctx.fillStyle = '#ff8a4a';
    ctx.beginPath();
    ctx.moveTo(cx - 30, py - 4);
    ctx.quadraticCurveTo(cx, py - 26, cx + 30, py - 4);
    ctx.quadraticCurveTo(cx, py - 12, cx - 30, py - 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 22, py - 7); ctx.lineTo(cx - 6, py + 12);
    ctx.moveTo(cx + 22, py - 7); ctx.lineTo(cx + 6, py + 12);
    ctx.stroke();
  }
  // jet exhaust
  if (flags.jetpack && input.jetHeld && player.fuel > 0 && player.state !== 'ground' && player.state !== 'climb') {
    const flick = 14 + Math.random() * 16;
    const gr = ctx.createLinearGradient(0, py + P_H, 0, py + P_H + flick);
    gr.addColorStop(0, 'rgba(255,214,107,0.95)');
    gr.addColorStop(1, 'rgba(255,120,60,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(px + 5, py + P_H - 2);
    ctx.lineTo(px + P_W - 5, py + P_H - 2);
    ctx.lineTo(cx, py + P_H + flick);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = flags.armor ? '#3a5680' : '#2c3e63';
  roundRect(px + 3, py + 12, P_W - 6, P_H - 14, 7);
  if (flags.armor) {
    ctx.fillStyle = '#8fb4e8';
    ctx.fillRect(px + 6, py + 18, P_W - 12, 3);
  }
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(cx, py + 8, 8, 0, Math.PI * 2); ctx.fill();

  const glow = player.state === 'climb';
  const gripCol = glow && gripKind ? FEATURES[gripKind].color : '#59d7ff';
  ctx.fillStyle = glow ? gripCol : '#94a8cf';
  if (glow) {
    // both hands up on the face in front
    const handY = py + 10;
    ctx.beginPath(); ctx.arc(px + 1, handY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + P_W - 1, handY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.22 + Math.sin(gameTime * 8) * 0.1;
    ctx.fillStyle = gripCol;
    ctx.beginPath(); ctx.arc(cx, handY + 2, 16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    const handY = py + 24;
    ctx.beginPath(); ctx.arc(px + 3, handY, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + P_W - 3, handY, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

// ---------- main loop ----------

let autosaveTimer = 20;
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  pollInput();
  try {
    step(dt);
  } catch (err) {
    // A thrown frame used to kill requestAnimationFrame outright and freeze the
    // game with no feedback. Keep the loop alive and surface it once instead.
    if (!frame.warned) {
      frame.warned = true;
      console.error('Skyreach frame error:', err);
      toast('Something glitched — still running', 'bad', 'spiky-explosion');
    }
  }
  input.jumpPressed = false;
  input.interactPressed = false;

  // the visor pulls the camera way back so you can read a route before committing
  const wantScale = baseScale * (visorOn && flags.visor ? T.visorZoom : 1);
  scale = lerp(scale, wantScale, clamp(6 * dt, 0, 1));

  // Lead the camera along your velocity so you can see what you are flying into.
  const leadX = clamp(player.vx * T.lookAhead, -T.lookAheadMax, T.lookAheadMax);
  const leadY = clamp(player.vy * T.lookAhead * 0.7, -T.lookAheadMax, T.lookAheadMax);
  const targetX = clamp(player.x + P_W / 2 + leadX, WORLD.left, WORLD.right);
  const targetY = clamp(player.y + leadY, WORLD.top, WORLD.cloudSea + 60 - chh / scale / 2);
  // ease harder when the lead is large, so fast flight feels smooth not snappy
  cam.x = lerp(cam.x, targetX, clamp(4.5 * dt, 0, 1));
  cam.y = lerp(cam.y, targetY, clamp(4.5 * dt, 0, 1));

  render();
  updateHUD();
  requestAnimationFrame(frame);
}

function step(dt) {
  if (!paused) {
    gameTime += dt;
    updatePlayer(dt);
    updateWorldClock(dt);
    updateAudio(dt);
    updateVitals(dt);
    updateInteraction(dt);
    updateStingwings(dt);
    updateRazorbeaks(dt);
    updateLizards(dt);
    updateSkyfish(dt);
    updateRunners(dt);
    if (pulseFx) { pulseFx.t += dt; if (pulseFx.t > 0.45) pulseFx = null; }
    if (jumpFx) { jumpFx.t += dt; if (jumpFx.t > 0.3) jumpFx = null; }
    if (crumbleFx) { crumbleFx.t += dt; if (crumbleFx.t > 0.5) crumbleFx = null; }
    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x > WORLD.right + 250) c.x = -200;
    }
    autosaveTimer -= dt;
    if (autosaveTimer <= 0) { autosaveTimer = 20; saveGame(); }
  }
}

// ---------- boot ----------

const resumed = loadGame();

if (!resumed) {
  generateWorld((Math.random() * 0xffffffff) >>> 0);
  player.x = CAMP.x - P_W / 2;
  player.y = CAMP.y - P_H;
  lastSafe = CAMP;
}
initClouds();
checkDiscoveries();
revealAround();
document.getElementById('btn-sound').innerHTML = svgIcon(audio.on ? 'sound-on' : 'sound-off');
cam.x = player.x; cam.y = player.y - 60;
requestAnimationFrame(frame);

toast(resumed ? 'Climb resumed — v' + GAME_VERSION : 'Skyreach v' + GAME_VERSION + ' — Reading the Rock', 'good', 'mountain-climbing');
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

// Debug/playtest handle (also used by automated smoke tests)
window.SKYREACH = {
  player, inv, flags, bases, T, version: GAME_VERSION,
  saveGame, loadGame, generateWorld, CHEATS,
  get deaths() { return deaths; },
  set deaths(v) { deaths = v; },
  get paused() { return paused; },
  get gameTime() { return gameTime; },
  get deathCause() { return deathCause; },
  get rocks() { return rocks; },
  get nodes() { return NODES; },
  get stingwings() { return stingwings; },
  get razorbeaks() { return razorbeaks; },
  get lizards() { return lizards; },
  get skyfish() { return skyfish; },
  get thermals() { return thermals; },
  get runners() { return runners; },
  get relics() { return relics; },
  get jetOn() { return jetOn; },
  get dayTime() { return dayTime; }, set dayTime(v) { dayTime = v; },
  get storming() { return stormLeft > 0; },
  get windX() { return windX; },
  get scanned() { return scanned; },
  get known() { return known; },
  get touchedRock() { return touchedRock; },
  get seenCells() { return seenCells; },
  get audio() { return audio; },
  get gripKind() { return gripKind; },
  get cam() { return cam; },
  checkDiscoveries, renderMap, featureAt, toggleAudio, resetGame, revealAllPlans,
  inThermal,
  get beaconLit() { return beaconLit; },
  get summit() { return summit; },
  set stormLeft(v) { stormLeft = v; },
  set stormTimer(v) { stormTimer = v; },
  isNight, lightBeacon, restUntilDawn,
  get world() { return WORLD; },
  get visorOn() { return visorOn; },
  get scale() { return scale; },
  maxFuel, releaseClimb, toggleVisor, toggleJet,
  get camp() { return CAMP; },
  get seed() { return worldSeed; },
  getLastSafe: () => lastSafe,
};
})();
