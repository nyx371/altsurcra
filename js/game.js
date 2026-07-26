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
  visorZoom: 0.5,         // camera scale multiplier while the visor is up
  runnerSpeed: 96,
  runnerCharge: 275,
  runnerDamage: 6,
  runnerKnock: 430,
};

// Relics are deliberately absent: they are exploration trophies, never lost on death.
const RAW_MATERIALS = ['berry', 'ration', 'medkit', 'fiber', 'stone', 'ore', 'crystal', 'lizard', 'skyfish', 'basekit'];

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
};

// left/right are recomputed from the generated islands, so the walkable area always
// hugs the actual world instead of stopping at an arbitrary invisible line.
const WORLD = { left: 20, right: 4000, top: 300, cloudSea: 2880, kill: 2960 };
const GEN_SPAN = 7200; // how wide generation is allowed to spread

let rocks = [], NODES = [], stingwings = [], razorbeaks = [], lizards = [], skyfish = [];
let thermals = [], runners = [], relics = [];
let CAMP = { x: 300, y: 2500 };
let worldSeed = 0;

function generateWorld(seed) {
  worldSeed = seed;
  const rnd = mulberry32(seed);
  const R = (a, b) => a + rnd() * (b - a);
  const RI = (a, b) => Math.floor(R(a, b + 1));

  rocks = []; NODES = []; stingwings = []; razorbeaks = []; lizards = []; skyfish = [];
  thermals = []; runners = []; relics = [];

  const addCliff = (x, y, w, h, type, taper) => {
    const r = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), type, taper: taper || 0 };
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
  if (rnd() < 0.7) addRunner(slab0, CAMP.x);

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
    }

    // threats
    if (i >= 1 && rnd() < 0.75) {
      const nx = R(tower.x + 25, tower.x + tower.w - 25), ny = R(tower.y + 80, tower.y + th * 0.6);
      stingwings.push({ nest: { x: nx, y: ny }, x: nx, y: ny, mode: 'idle', t: R(0, 6), hitCd: 0, stun: 0 });
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
      stingwings.push({ nest: { x: island.x + ow / 2, y: oy + 60 }, x: island.x + ow / 2, y: oy + 60, mode: 'idle', t: R(0, 6), hitCd: 0, stun: 0 });
    }
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
  relic:   { name: 'Relic',        icon: 'emerald' },
  basekit: { name: 'Base kit',     icon: 'house', place: true },
};

const RECIPES = [
  { id: 'gloves',   tier: 'personal', name: 'Magnetic gloves',   icon: 'gloves',          cost: { fiber: 5, stone: 4 },              desc: 'Climb granite faces.', flag: 'gloves', once: true },
  { id: 'ration',   tier: 'personal', name: 'Trail ration',      icon: 'meat',            cost: { berry: 2 },                        desc: '+35 food.' },
  { id: 'medkit',   tier: 'personal', name: 'Health kit',        icon: 'first-aid-kit',   cost: { fiber: 3, berry: 2 },              desc: '+45 health.' },
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
];

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

const inv = { berry: 0, ration: 0, medkit: 0, fiber: 0, stone: 0, ore: 0, crystal: 0, lizard: 0, skyfish: 0, relic: 0, basekit: 0 };
const flags = {
  gloves: false, glider: false, boots: false, pulse: false,
  battery1: false, battery2: false, spikes: false, magnets: false,
  jetpack: false, jetpack2: false, armor: false, visor: false, thermal: false,
  compass: false, relicbat: false,
};
let visorOn = false;
let jetOn = false;
const bases = [];   // {x, y, mk2, wall, store:{}, deck:rect}
let deaths = 0;
let paused = false;
let gameTime = 0;
let pulseFx = null; // {x, y, t}
let jumpFx = null;  // double-jump puff

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
  player.state = 'climb';
  player.climbRect = r;
  player.vx = 0; player.vy = 0;
  return true;
}

function detach(push) {
  player.state = 'air';
  player.climbRect = null;
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
    player.energy -= (movingMag > 0.1 ? T.climbDrainMove * Math.min(movingMag, 1) : T.climbDrainIdle) * dt;
    if (player.energy <= 0) { player.energy = 0; detach(false); return; }

    // mantle over the top
    if (input.y < -0.1 && player.y + P_H + input.y * T.climbSpeed * dt <= r.y + 10) {
      player.y = r.y - P_H;
      player.state = 'ground'; player.climbRect = null;
      player.vy = 0;
      return;
    }

    player.x += input.x * T.climbSpeedX * dt;
    const cx = player.x + P_W / 2;
    if (cx < r.x - 4 || cx > r.x + r.w + 4) { detach(false); return; } // slid off the side

    const landed = moveY(input.y * T.climbSpeed * dt);
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
    if (input.jumpPressed) { player.vy = -T.jumpVel; player.state = 'air'; player.jumps = 1; }
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
      jumpFx = { x: player.x + P_W / 2, y: player.y + P_H, t: 0 };
    }

    if (player.state === 'glide') {
      if (!input.jumpHeld || !flags.glider) player.state = 'air';
      else {
        // rising air turns a glide into a climb — the only way up that costs nothing
        const lift = inThermal() ? (flags.thermal ? T.thermalLiftWing : T.thermalLift) : T.glideFall;
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
  player.x = clamp(player.x + player.vx * dt, WORLD.left, WORLD.right - P_W);

  const landed = moveY(player.vy * dt);
  if (landed && player.state !== 'ground') {
    player.state = 'ground';
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
  if (flags.armor) dmg *= (1 - T.armorSoak);
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
  if (relic) { node = null; critter = null; } // a relic always wins the hand

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
      toast('Relic recovered — and a cache of supplies', 'good', 'emerald');
      saveGame();
    }
  } else if (input.interactHeld && critter) {
    if (!player.harvest || player.harvest.critter !== critter.c) player.harvest = { critter: critter.c, t: 0, total: T.captureTime };
    player.harvest.t += dt;
    if (player.harvest.t >= T.captureTime) {
      inv[critter.item] += 1;
      critter.c.goneUntil = gameTime + T.critterRespawn;
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
  btnInteract.classList.toggle('glide-ready', !!node || !!critter || !!relic);
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
      if (airborne && dToPlayer < 270 && b.cd <= 0 && !deathCause) { b.mode = 'swoop'; b.swoopT = 0; }
    } else if (b.mode === 'swoop') {
      b.swoopT += dt;
      const ang = Math.atan2(pc.y - b.y, pc.x - b.x);
      b.vx = (b.vx || 0) + Math.cos(ang) * 600 * dt;
      b.vy = (b.vy || 0) + Math.sin(ang) * 600 * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 330) { b.vx *= 330 / sp; b.vy *= 330 / sp; }
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
      lizards: lizards.map(l => Math.max(0, l.goneUntil - gameTime)),
      skyfish: skyfish.map(f => Math.max(0, f.goneUntil - gameTime)),
      inv, flags,
      bases: bases.map(b => ({ x: b.x, y: b.y, mk2: b.mk2, wall: !!b.wall, store: b.store || {} })),
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
    const base = { x: b.x, y: b.y, mk2: !!b.mk2, wall: !!b.wall, store: b.store || {} };
    if (base.wall) makeWallDeck(base);
    bases.push(base);
  }
  const li = typeof data.lastSafe === 'number' ? data.lastSafe : -1;
  lastSafe = li >= 0 && bases[li] ? bases[li] : CAMP;
  deaths = data.deaths || 0;
  if (data.nodes) NODES.forEach((n, i) => { n.depletedUntil = gameTime + (data.nodes[i] || 0); });
  if (data.relics) relics.forEach((r, i) => { r.taken = !!data.relics[i]; });
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
  if (!any) grid.innerHTML = '<div class="inv-empty">Empty</div>';

  const list = document.getElementById('recipe-list');
  list.innerHTML = '';
  for (const r of RECIPES) if (r.tier === 'personal') list.appendChild(recipeRow(r));
}

// ---------- playtest cheats ----------

const CHEATS = {
  mats() {
    for (const id of ['berry', 'fiber', 'stone', 'ore', 'crystal']) inv[id] += 20;
    toast('+20 of each material', 'good', 'knapsack');
  },
  gear() {
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
    list.appendChild(recipeRow(RECIPES.find(r => r.id === 'mk2'), base));
  } else {
    for (const r of RECIPES) if (r.tier === 'mk2') list.appendChild(recipeRow(r, base));
  }
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
  const top = [To(11, 21, 48), To(120, 150, 205)];
  const bot = [To(38, 60, 110), To(215, 190, 170)];
  function To(r, g, b) { return { r, g, b }; }
  function mix(a, b, k) { return 'rgb(' + Math.round(lerp(a.r, b.r, k)) + ',' + Math.round(lerp(a.g, b.g, k)) + ',' + Math.round(lerp(a.b, b.b, k)) + ')'; }
  return [mix(top[0], top[1], t), mix(bot[0], bot[1], t)];
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

  if (cam.y < 1500) {
    const a = clamp((1500 - cam.y) / 900, 0, 0.8);
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
  ctx.fillStyle = glow ? '#59d7ff' : '#94a8cf';
  if (glow) {
    // both hands up on the face in front
    const handY = py + 10;
    ctx.beginPath(); ctx.arc(px + 1, handY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + P_W - 1, handY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(89,215,255,' + (0.22 + Math.sin(gameTime * 8) * 0.1) + ')';
    ctx.beginPath(); ctx.arc(cx, handY + 2, 16, 0, Math.PI * 2); ctx.fill();
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
  if (!paused) {
    gameTime += dt;
    updatePlayer(dt);
    updateVitals(dt);
    updateInteraction(dt);
    updateStingwings(dt);
    updateRazorbeaks(dt);
    updateLizards(dt);
    updateSkyfish(dt);
    updateRunners(dt);
    if (pulseFx) { pulseFx.t += dt; if (pulseFx.t > 0.45) pulseFx = null; }
    if (jumpFx) { jumpFx.t += dt; if (jumpFx.t > 0.3) jumpFx = null; }
    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x > WORLD.right + 250) c.x = -200;
    }
    autosaveTimer -= dt;
    if (autosaveTimer <= 0) { autosaveTimer = 20; saveGame(); }
  }
  input.jumpPressed = false;
  input.interactPressed = false;

  // the visor pulls the camera way back so you can read a route before committing
  const wantScale = baseScale * (visorOn && flags.visor ? T.visorZoom : 1);
  scale = lerp(scale, wantScale, clamp(6 * dt, 0, 1));

  const targetX = clamp(player.x + P_W / 2, 0, WORLD.right);
  const targetY = clamp(player.y, WORLD.top, WORLD.cloudSea + 60 - chh / scale / 2);
  cam.x = lerp(cam.x, targetX, clamp(6 * dt, 0, 1));
  cam.y = lerp(cam.y, targetY, clamp(6 * dt, 0, 1));

  render();
  updateHUD();
  requestAnimationFrame(frame);
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
cam.x = player.x; cam.y = player.y - 60;
requestAnimationFrame(frame);

toast(resumed ? 'Climb resumed — v' + GAME_VERSION : 'Skyreach v' + GAME_VERSION + ' — Wayfarer', 'good', 'mountain-climbing');
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
  get world() { return WORLD; },
  get visorOn() { return visorOn; },
  get scale() { return scale; },
  maxFuel, releaseClimb, toggleVisor, toggleJet,
  get camp() { return CAMP; },
  get seed() { return worldSeed; },
  getLastSafe: () => lastSafe,
};
})();
