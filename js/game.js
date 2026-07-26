/* Skyreach v0.1 — vanilla JS, no dependencies.
 * World units are pixels; y grows downward. One canvas for the world, DOM for UI.
 */
(function () {
'use strict';

// ---------- helpers ----------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

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
  climbSpeed: 110,
  climbDrainMove: 16,   // energy/s while moving on a wall
  climbDrainIdle: 0.9,  // energy/s hanging still — cheap enough to stop and plan a route
  harvestWallCost: 10,  // flat energy per wall harvest
  harvestTime: 0.9,
  regenGround: 7,       // energy/s standing anywhere safe
  regenCamp: 30,        // energy/s inside a camp/base radius
  campRadius: 150,
  glideFall: 135,
  glideSpeed: 270,
  foodDrain: 0.35,
  starveDps: 2,
  healthRegen: 1.5,     // hp/s when food > 60
  fallSafeVel: 620,
  fallDmgScale: 0.09,
  invulnTime: 0.9,
  cacheGrabRadius: 60,
};

// Raw materials scatter into a recoverable cache on death; crafted upgrades never do.
const DROP_ON_DEATH = ['berry', 'ration', 'fiber', 'stone', 'ore', 'crystal', 'basekit'];

// ---------- world ----------

// Solid rock. kind 'perch' = one-way rest ledge (land from above, climb through).
const ROCKS = [
  { x: 150,  y: 2500, w: 900, h: 300, taper: 150, name: 'Haven Rock' },
  { x: 820,  y: 2100, w: 230, h: 400, taper: 0 },                       // practice cliff
  { x: 770,  y: 2320, w: 50,  h: 24, taper: 0, kind: 'perch' },
  { x: 1450, y: 2350, w: 400, h: 450, taper: 170, name: 'Skyshard Spire' },
  { x: 1650, y: 1750, w: 200, h: 600, taper: 0 },                       // spire tower
  { x: 1594, y: 2050, w: 56,  h: 24, taper: 0, kind: 'perch' },
  { x: 1800, y: 850,  w: 56,  h: 900, taper: 0, name: 'The Needle' },   // summit spike
];

const WORLD = { left: 20, right: 2380, top: 500, cloudSea: 2880, kill: 2960 };

const NODE_TYPES = {
  berry:   { name: 'Skyberries', icon: 'berry-bush',     item: 'berry',   yield: 2, respawn: 60,  color: '#c96bff' },
  fiber:   { name: 'Fiber',      icon: 'plant-roots',    item: 'fiber',   yield: 2, respawn: 75,  color: '#7ddc7d' },
  stone:   { name: 'Stone',      icon: 'stone-block',    item: 'stone',   yield: 2, respawn: 75,  color: '#c9c2b2' },
  ore:     { name: 'Iron ore',   icon: 'ore',            item: 'ore',     yield: 2, respawn: 120, color: '#ff9d6b' },
  crystal: { name: 'Sky crystal',icon: 'crystal-growth', item: 'crystal', yield: 2, respawn: 150, color: '#6be2ff' },
};

const NODES = [
  // Haven Rock (Band 0)
  { type: 'berry', x: 550,  y: 2500 },
  { type: 'stone', x: 700,  y: 2500 },
  { type: 'stone', x: 470,  y: 2500 },
  { type: 'fiber', x: 810,  y: 2400, wall: true },
  { type: 'fiber', x: 810,  y: 2180, wall: true },
  { type: 'stone', x: 810,  y: 2260, wall: true },
  { type: 'berry', x: 950,  y: 2100 },
  // Skyshard Spire (Band 1)
  { type: 'berry', x: 1540, y: 2350 },
  { type: 'ore',   x: 1440, y: 2500, wall: true },
  { type: 'ore',   x: 1640, y: 2240, wall: true },
  { type: 'ore',   x: 1640, y: 2140, wall: true },
  { type: 'crystal', x: 1640, y: 1985, wall: true },
  { type: 'crystal', x: 1640, y: 1880, wall: true },
  { type: 'crystal', x: 1750, y: 1750 },
  // The Needle
  { type: 'ore',     x: 1790, y: 1500, wall: true },
  { type: 'crystal', x: 1790, y: 1150, wall: true },
  { type: 'crystal', x: 1830, y: 850 },
].map(n => ({ ...n, depletedUntil: 0 }));

const CAMP = { x: 300, y: 2500 };

// ---------- items & recipes ----------

const ITEMS = {
  berry:   { name: 'Skyberries',   icon: 'berry-bush',     eat: 15 },
  ration:  { name: 'Trail ration', icon: 'meat',           eat: 35 },
  fiber:   { name: 'Fiber',        icon: 'plant-roots' },
  stone:   { name: 'Stone',        icon: 'stone-block' },
  ore:     { name: 'Iron ore',     icon: 'ore' },
  crystal: { name: 'Sky crystal',  icon: 'crystal-growth' },
  basekit: { name: 'Base kit',     icon: 'house', place: true },
};

const RECIPES = [
  { id: 'ration',   tier: 'personal', name: 'Trail ration',      icon: 'meat',         cost: { berry: 2 },            desc: 'Dense food. +35 food when eaten.' },
  { id: 'glider',   tier: 'personal', name: 'Glider',            icon: 'hang-glider',  cost: { fiber: 4, stone: 2 },  desc: 'Hold Jump in the air to glide.', flag: 'glider', once: true },
  { id: 'battery1', tier: 'personal', name: 'Glove battery Mk1', icon: 'battery-pack', cost: { ore: 2, crystal: 2 },  desc: 'Max glove energy 100 → 150.', flag: 'battery1', once: true },
  { id: 'basekit',  tier: 'personal', name: 'Base kit',          icon: 'house',        cost: { stone: 6, fiber: 4 },  desc: 'Place on ground or bolt to a cliff. Storage, fast recharge, respawn.' },
  { id: 'mk2',      tier: 'base',     name: 'Fabricator Mk2',    icon: 'anvil',        cost: { ore: 3, crystal: 2 },  desc: 'Unlocks heavy fabrication at this base.' },
  { id: 'battery2', tier: 'mk2',      name: 'Glove battery Mk2', icon: 'battery-pack', cost: { ore: 4, crystal: 4 },  desc: 'Max glove energy → 220. Needs Mk1.', flag: 'battery2', once: true, needs: 'battery1' },
  { id: 'thermal',  tier: 'mk2',      name: 'Thermal wing',      icon: 'hang-glider',  cost: {},                      desc: 'Ride rising air. Coming in v0.3.', locked: true },
  { id: 'grapplebolt', tier: 'mk2',   name: 'Grapple bolt',      icon: 'grapple',      cost: {},                      desc: 'Instant mid-air wall attach. Coming in v0.3.', locked: true },
];

// ---------- state ----------

const P_W = 26, P_H = 46;

const player = {
  x: CAMP.x - P_W / 2, y: CAMP.y - P_H, vx: 0, vy: 0,
  state: 'air', // ground | air | climb | glide
  faceDir: 1,
  climbRect: null, climbSide: 'L',
  detachTimer: 0, invuln: 0,
  hp: 100, food: 100, energy: 100, maxEnergy: 100,
  harvest: null, // {node, t}
  lowWarned: false,
};

const inv = { berry: 0, ration: 0, fiber: 0, stone: 0, ore: 0, crystal: 0, basekit: 0 };
const flags = { glider: false, battery1: false, battery2: false, summit: false };
const bases = [];   // {x, y, mk2, wall, side, store:{}, deck:rect}
const caches = [];  // {x, y, items:{}} — dropped on death, climb back for them
let paused = false;
let gameTime = 0;

const stingwings = [
  { nest: { x: 1628, y: 2020 }, x: 1628, y: 2020, mode: 'idle', t: 0, hitCd: 0 },
];
const razorbeaks = [
  { anchor: { y: 2180, x0: 1120, x1: 1480 }, x: 1300, y: 2180, dir: 1, mode: 'patrol', vx: 95, vy: 0, cd: 0, t: 0 },
];

const clouds = [];
for (let i = 0; i < 26; i++) {
  clouds.push({
    x: Math.random() * 2600 - 100,
    y: 600 + Math.random() * 2100,
    s: 60 + Math.random() * 160,
    v: 4 + Math.random() * 14,
    a: 0.06 + Math.random() * 0.14,
    layer: Math.random() < 0.5 ? 0 : 1,
  });
}

// ---------- goals ----------

const GOALS = [
  { text: 'Harvest fiber and stone from the practice cliff — walk into the wall to climb, hold the claw button near a glowing node.', done: () => flags.glider || (inv.fiber >= 4 && inv.stone >= 2) },
  { text: 'Open your Pack and fabricate the Glider.', done: () => flags.glider },
  { text: 'Climb to the cliff top, jump east and hold Jump to glide to Skyshard Spire.', done: () => player.x > 1400 },
  { text: 'Harvest iron ore and sky crystal from the spire face. Watch the sky.', done: () => flags.battery1 || (inv.ore >= 2 && inv.crystal >= 2) },
  { text: 'Fabricate the Glove battery Mk1.', done: () => flags.battery1 },
  { text: 'Craft a Base kit, place a base near the spire, and build the Fabricator Mk2.', done: () => bases.some(b => b.mk2) },
  { text: 'Fabricate the Glove battery Mk2, then climb The Needle in one push.', done: () => flags.summit },
  { text: 'Bolt a base to The Needle mid-climb — open your Pack while gripping the wall and place a Base kit.', done: () => bases.some(b => b.wall) },
  { text: 'Summit reached, cliff base standing. The Shear opens in v0.3 — thanks for playtesting.', done: () => false },
];

// ---------- input ----------

// Suppress browser touch gestures: pinch zoom, double-tap zoom, long-press menus.
// (The viewport meta asks for no zoom too, but iOS Safari ignores user-scalable=no.)
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  // buttons rely on the synthetic click and are covered by touch-action: manipulation
  if (e.target.closest && e.target.closest('button, a')) return;
  const now = Date.now();
  if (now - lastTouchEnd < 350 && e.cancelable) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

const input = { x: 0, y: 0, jumpHeld: false, jumpPressed: false, interactHeld: false };
const btnState = { jump: false, interact: false };
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

function bindHold(el, prop) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('held');
    if (prop === 'jump') input.jumpPressed = true;
    btnState[prop] = true;
  });
  const up = () => { el.classList.remove('held'); btnState[prop] = false; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
bindHold(btnJump, 'jump');
bindHold(btnInteract, 'interact');
btnPack.addEventListener('click', () => togglePack());
btnBase.addEventListener('click', () => { const b = nearestBase(); if (b) openBase(b); });

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { input.jumpPressed = true; e.preventDefault(); }
  if (e.code === 'KeyC') togglePack();
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
}

// ---------- physics ----------

function solids() { return ROCKS.filter(r => r.kind !== 'perch'); }

let touchingWall = null; // {rect, side} refreshed by moveX

function moveX(dx) {
  touchingWall = null;
  player.x += dx;
  for (const r of solids()) {
    if (player.x + P_W > r.x && player.x < r.x + r.w &&
        player.y + P_H > r.y && player.y < r.y + r.h) {
      if (dx > 0) { player.x = r.x - P_W; touchingWall = { rect: r, side: 'L' }; }
      else if (dx < 0) { player.x = r.x + r.w; touchingWall = { rect: r, side: 'R' }; }
      player.vx = 0;
    }
  }
  player.x = clamp(player.x, WORLD.left, WORLD.right - P_W);
}

function moveY(dy) {
  const wasBottom = player.y + P_H;
  player.y += dy;
  let landed = false;
  for (const r of ROCKS) {
    const overlapX = player.x + P_W > r.x && player.x < r.x + r.w;
    if (!overlapX) continue;
    if (r.kind === 'perch') {
      // one-way: only catch when falling and feet were above the top
      if (dy > 0 && wasBottom <= r.y + 1 && player.y + P_H > r.y) {
        player.y = r.y - P_H; landed = true; player.vy = 0;
      }
      continue;
    }
    if (player.y + P_H > r.y && player.y < r.y + r.h) {
      if (dy > 0) { player.y = r.y - P_H; landed = true; }
      else if (dy < 0) { player.y = r.y + r.h; }
      player.vy = 0;
    }
  }
  return landed;
}

function standingOn() {
  for (const r of ROCKS) {
    const overlapX = player.x + P_W > r.x && player.x < r.x + r.w;
    if (overlapX && Math.abs(player.y + P_H - r.y) < 2) return r;
  }
  return null;
}

function tryAttach(wall) {
  if (!wall || player.energy <= 3 || player.detachTimer > 0) return false;
  player.state = 'climb';
  player.climbRect = wall.rect;
  player.climbSide = wall.side;
  player.vx = 0; player.vy = 0;
  player.x = wall.side === 'L' ? wall.rect.x - P_W : wall.rect.x + wall.rect.w;
  if (!flags._climbTipShown) {
    flags._climbTipShown = true;
    toast('Magnetic gloves engaged — climbing drains energy', 'good', 'gloves');
  }
  return true;
}

function detach(push) {
  player.state = 'air';
  player.climbRect = null;
  player.detachTimer = push ? 0.35 : 0.15;
}

function nearCampOrBase() {
  if (dist(player.x + P_W / 2, player.y + P_H / 2, CAMP.x, CAMP.y) < T.campRadius) return CAMP;
  for (const b of bases) {
    if (dist(player.x + P_W / 2, player.y + P_H / 2, b.x, b.y) < T.campRadius) return b;
  }
  return null;
}

function updatePlayer(dt) {
  player.detachTimer = Math.max(0, player.detachTimer - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  if (input.x !== 0) player.faceDir = input.x > 0 ? 1 : -1;

  if (player.state === 'climb') {
    const r = player.climbRect;
    // step off onto an adjacent perch when pushing away from the wall
    const away = player.climbSide === 'L' ? -1 : 1;
    if (input.x * away > 0.4) {
      const feet = player.y + P_H;
      for (const p of ROCKS) {
        if (p.kind !== 'perch') continue;
        const nearFace = player.climbSide === 'L' ? Math.abs(p.x + p.w - r.x) < 8 : Math.abs(p.x - (r.x + r.w)) < 8;
        if (nearFace && Math.abs(feet - p.y) < 30) {
          player.x = clamp(p.x + p.w / 2 - P_W / 2, p.x - 4, p.x + p.w - P_W + 4);
          player.y = p.y - P_H;
          player.state = 'ground'; player.climbRect = null;
          return;
        }
      }
    }

    let vy = input.y * T.climbSpeed;
    const moving = Math.abs(input.y) > 0.1;
    player.energy -= (moving ? T.climbDrainMove * Math.abs(input.y) : T.climbDrainIdle) * dt;

    if (player.energy < 25 && !player.lowWarned) {
      player.lowWarned = true;
      toast('Grip failing — find a ledge!', 'bad', 'power-lightning');
    }
    if (player.energy <= 0) {
      player.energy = 0;
      toast('Gloves dead — falling!', 'bad', 'power-lightning');
      detach(false);
      return;
    }

    // mantle over the top
    if (input.y < -0.1 && player.y + P_H + vy * dt <= r.y + 10) {
      player.y = r.y - P_H;
      player.x = player.climbSide === 'L' ? r.x + 4 : r.x + r.w - P_W - 4;
      player.state = 'ground'; player.climbRect = null;
      player.vy = 0;
      return;
    }
    const landed = moveY(vy * dt);
    if (landed) { player.state = 'ground'; player.climbRect = null; return; }
    // slid off the bottom of the face
    if (player.y > r.y + r.h) { detach(false); return; }

    if (input.jumpPressed) {
      detach(true);
      player.vx = away * 240;
      player.vy = -380;
      return;
    }
    return;
  }

  // --- ground / air / glide ---
  const grounded = player.state === 'ground';

  if (grounded) {
    player.vx = input.x * T.walkSpeed;
    player.lowWarned = false;
    if (input.jumpPressed) { player.vy = -T.jumpVel; player.state = 'air'; }
    else if (!standingOn()) player.state = 'air';
  } else {
    // air control
    player.vx += input.x * 900 * dt;
    player.vx = clamp(player.vx, -T.glideSpeed, T.glideSpeed);
    if (input.x === 0) player.vx *= Math.pow(0.35, dt);

    if (player.state === 'glide') {
      if (!input.jumpHeld || !flags.glider) player.state = 'air';
      else player.vy += (T.glideFall - player.vy) * clamp(4 * dt, 0, 1);
    }
    if (player.state === 'air') {
      player.vy += T.gravity * dt;
      player.vy = Math.min(player.vy, T.maxFall);
      if (flags.glider && input.jumpHeld && player.vy > -60 && player.detachTimer <= 0) {
        player.state = 'glide';
        player.vy = Math.min(player.vy, T.glideFall + 120);
      }
    }
  }

  const impactVy = player.vy;
  moveX(player.vx * dt);

  // magnetic auto-attach on wall contact (airborne), or push into a wall from the ground
  if (touchingWall) {
    const towardWall = (touchingWall.side === 'L' && input.x > 0.2) || (touchingWall.side === 'R' && input.x < -0.2);
    if ((player.state === 'air' || player.state === 'glide') && (towardWall || player.detachTimer <= 0)) {
      if (tryAttach(touchingWall)) return;
    } else if (grounded && towardWall) {
      if (tryAttach(touchingWall)) return;
    }
  }

  const landed = moveY(player.vy * dt);
  if (landed && player.state !== 'ground') {
    player.state = 'ground';
    if (impactVy > T.fallSafeVel) {
      const dmg = (impactVy - T.fallSafeVel) * T.fallDmgScale;
      hurt(dmg, 'The rock is unforgiving');
    }
  }

  // energy regen on the ground
  if (player.state === 'ground') {
    const zone = nearCampOrBase();
    player.energy += (zone ? T.regenCamp : T.regenGround) * dt;
    if (zone) lastSafe = zone;
  }
  player.energy = clamp(player.energy, 0, player.maxEnergy);
}

// ---------- vitals / damage ----------

let deathCause = null;

function hurt(dmg, cause) {
  if (player.invuln > 0 || deathCause) return;
  player.hp -= dmg;
  player.invuln = T.invulnTime;
  if (player.hp <= 0) die(cause || 'The sky took you');
}

function die(cause) {
  if (deathCause) return;
  deathCause = cause;
  paused = true;
  const dropped = dropCache(player.x + P_W / 2, player.y + P_H / 2);
  document.getElementById('death-title').textContent = cause;
  document.getElementById('death-note').textContent = dropped
    ? 'Your materials scattered where you fell. Your gear and upgrades are still yours — go back and get the rest.'
    : 'You were carrying nothing. Your gear and upgrades are still yours.';
  document.getElementById('overlay-death').classList.remove('hidden');
  saveGame();
}

// You wake at the last safe place you actually stood. Deaths are usually long falls,
// so "nearest to the corpse" would drag you back down past every base you built.
let lastSafe = CAMP;

// A wall base is anchored at the rock face, so you stand on its deck, not inside the cliff.
function standPos(place) {
  if (!place.wall) return { x: place.x, y: place.y };
  return {
    x: place.side === 'L' ? place.x - DECK_W / 2 : place.x + DECK_W / 2,
    y: place.y - DECK_H,
  };
}

function dropCache(x, y) {
  const items = {};
  let any = false;
  for (const id of DROP_ON_DEATH) {
    if (inv[id] > 0) { items[id] = inv[id]; inv[id] = 0; any = true; }
  }
  if (!any) return false;
  // Keep the cache retrievable: never let it sink into the cloud sea.
  caches.push({ x: clamp(x, WORLD.left, WORLD.right), y: Math.min(y, WORLD.cloudSea - 140), items });
  while (caches.length > 3) caches.shift();
  return true;
}

function respawn() {
  deathCause = null;
  player.hp = 100;
  player.food = Math.max(50, player.food);
  player.energy = player.maxEnergy;
  const sp = standPos(lastSafe);
  player.x = sp.x - P_W / 2;
  player.y = sp.y - P_H - 2;
  player.vx = 0; player.vy = 0;
  player.state = 'air';
  player.climbRect = null;
  document.getElementById('overlay-death').classList.add('hidden');
  paused = anyOverlayOpen();
  saveGame();
}

function updateCaches() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  for (let i = caches.length - 1; i >= 0; i--) {
    if (dist(px, py, caches[i].x, caches[i].y) > T.cacheGrabRadius) continue;
    let n = 0;
    for (const [id, count] of Object.entries(caches[i].items)) { inv[id] += count; n += count; }
    caches.splice(i, 1);
    toast('Cache recovered — ' + n + ' items', 'good', 'swap-bag');
    saveGame();
  }
}

function updateVitals(dt) {
  player.food = Math.max(0, player.food - T.foodDrain * dt);
  if (player.food <= 0) hurtStarve(T.starveDps * dt);
  else if (player.food > 60 && player.hp < 100) player.hp = Math.min(100, player.hp + T.healthRegen * dt);
  if (player.y > WORLD.kill) die('You fell into the cloud sea');
}

function hurtStarve(dmg) { // starvation ignores the invuln window
  if (deathCause) return;
  player.hp -= dmg;
  if (player.hp <= 0) die('Starved in the high air');
}

// ---------- harvesting & interaction ----------

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

function nearestBase() {
  const px = player.x + P_W / 2, py = player.y + P_H / 2;
  for (const b of bases) if (dist(px, py, b.x, b.y) < 90) return b;
  return null;
}

function updateInteraction(dt) {
  const node = nearestNode();

  if (input.interactHeld && node) {
    if (!player.harvest || player.harvest.node !== node) player.harvest = { node, t: 0 };
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
    // keyboard fallback: E opens a base when no node competes for the button
    if (input.interactHeld && !node) {
      const b = nearestBase();
      if (b && !player._baseTapLatch) { player._baseTapLatch = true; openBase(b); }
    }
    player.harvest = null;
  }
  if (!input.interactHeld) player._baseTapLatch = false;

  // interact button feedback
  const ring = document.querySelector('#btn-interact .abtn-ring circle');
  const prog = player.harvest ? player.harvest.t / T.harvestTime : 0;
  ring.style.strokeDashoffset = String(207.3 * (1 - prog));
  btnInteract.classList.toggle('glide-ready', !!node);

  // a base in reach gets its own button, so standing on a resource never hides your door
  btnBase.classList.toggle('hidden', !nearestBase());
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
        toast('Stingwing hit!', 'bad', 'wasp-sting');
      }
    } else { // return
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
        hurt(15, 'Torn from the wind');
        player.vy += 260; player.vx += b.dir * 160;
        toast('Razorbeak strike!', 'bad', 'vulture');
        b.mode = 'rise'; b.cd = 2.5;
      } else if (b.swoopT > 2.6 || !airborne) { b.mode = 'rise'; b.cd = 1.5; }
    } else { // rise back to patrol height
      const ang = Math.atan2(b.anchor.y - b.y, (b.anchor.x0 + b.anchor.x1) / 2 - b.x);
      b.x += Math.cos(ang) * 150 * dt;
      b.y += Math.sin(ang) * 150 * dt;
      if (Math.abs(b.y - b.anchor.y) < 20) { b.mode = 'patrol'; b.vx = 0; b.vy = 0; }
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

function canAfford(recipe) {
  return Object.entries(recipe.cost).every(([k, v]) => inv[k] >= v);
}

function craft(recipe, base) {
  if (recipe.locked) return;
  if (recipe.once && flags[recipe.flag]) return;
  if (recipe.needs && !flags[recipe.needs]) { toast('Requires ' + recipe.needs.replace('battery1', 'Glove battery Mk1'), 'bad'); return; }
  if (!canAfford(recipe)) { toast('Not enough materials', 'bad'); return; }
  for (const [k, v] of Object.entries(recipe.cost)) inv[k] -= v;

  if (recipe.id === 'ration') { inv.ration += 1; toast('Trail ration fabricated', 'good', 'meat'); }
  if (recipe.id === 'glider') { flags.glider = true; toast('Glider fabricated — hold Jump in the air', 'good', 'hang-glider'); }
  if (recipe.id === 'battery1') { flags.battery1 = true; player.maxEnergy = 150; player.energy = 150; toast('Battery Mk1 — max energy 150', 'good', 'battery-pack'); }
  if (recipe.id === 'battery2') { flags.battery2 = true; player.maxEnergy = 220; player.energy = 220; toast('Battery Mk2 — max energy 220', 'good', 'battery-pack'); }
  if (recipe.id === 'basekit') { inv.basekit += 1; toast('Base kit ready — place it from your Pack', 'good', 'house'); }
  if (recipe.id === 'mk2' && base) { base.mk2 = true; toast('Fabricator Mk2 online', 'good', 'anvil'); }
  renderPack();
  if (openBaseRef && !document.getElementById('overlay-base').classList.contains('hidden')) renderBase(openBaseRef);
  saveGame();
}

function eatItem(id) {
  if (inv[id] <= 0) return;
  inv[id] -= 1;
  player.food = Math.min(100, player.food + ITEMS[id].eat);
  toast('+' + ITEMS[id].eat + ' food', 'good', ITEMS[id].icon);
  renderPack();
}

// Bases go on flat ground or bolt straight onto a cliff face. A wall base extends a
// deck you can stand on, turning any cliff into a rest stop.
const DECK_W = 78, DECK_H = 12;

function makeWallDeck(base) {
  const x = base.side === 'L' ? base.x - DECK_W : base.x;
  const deck = { x, y: base.y - DECK_H, w: DECK_W, h: DECK_H, kind: 'perch', deck: true };
  ROCKS.push(deck);
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
    const r = player.climbRect;
    // anchor at the rock face, deck sticking out on the player's side
    const side = player.climbSide;
    b = {
      x: side === 'L' ? r.x : r.x + r.w,
      y: player.y + P_H,
      mk2: false, wall: true, side, store: {},
    };
    makeWallDeck(b);
    bases.push(b);
    lastSafe = b;
    player.state = 'ground';
    player.climbRect = null;
    const sp = standPos(b);
    player.x = sp.x - P_W / 2;
    player.y = sp.y - P_H;
    toast('Base bolted to the cliff — respawn point set', 'good', 'hut');
  } else {
    b = { x: player.x + P_W / 2, y: player.y + P_H, mk2: false, wall: false, store: {} };
    bases.push(b);
    lastSafe = b;
    toast('Base placed — respawn point set', 'good', 'house');
  }
  inv.basekit -= 1;
  closeOverlays();
  saveGame();
}

// ---------- storage ----------

function storeItem(base, id, all) {
  const n = all ? inv[id] : 1;
  if (n <= 0) return;
  inv[id] -= n;
  base.store[id] = (base.store[id] || 0) + n;
  renderBase(base);
  saveGame();
}

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
  for (const id of DROP_ON_DEATH) {
    if (inv[id] > 0) { base.store[id] = (base.store[id] || 0) + inv[id]; moved += inv[id]; inv[id] = 0; }
  }
  if (moved) toast('Stored ' + moved + ' items', 'good', 'chest');
  renderBase(base);
  saveGame();
}

// ---------- save / load ----------

const SAVE_KEY = 'skyreach.save.v1';
let saveNoticeUntil = 0;
let wiping = false; // set during a wipe so the unload autosave can't resurrect the save

function saveGame() {
  if (wiping) return;
  try {
    const data = {
      v: GAME_VERSION,
      gameTime,
      player: {
        x: player.x, y: player.y, hp: player.hp, food: player.food,
        energy: player.energy, maxEnergy: player.maxEnergy,
      },
      inv, flags,
      bases: bases.map(b => ({ x: b.x, y: b.y, mk2: b.mk2, wall: !!b.wall, side: b.side, store: b.store || {} })),
      lastSafe: bases.indexOf(lastSafe), // -1 = the starting camp
      caches,
      nodes: NODES.map(n => Math.max(0, n.depletedUntil - gameTime)),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    saveNoticeUntil = gameTime + 1.4;
  } catch (e) { /* private mode / quota — play on without persistence */ }
}

function loadGame() {
  let data;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return false; }
  if (!data || !data.player) return false;

  gameTime = data.gameTime || 0;
  Object.assign(player, data.player);
  player.vx = 0; player.vy = 0; player.state = 'air'; player.climbRect = null; player.harvest = null;
  for (const k of Object.keys(inv)) inv[k] = data.inv && data.inv[k] ? data.inv[k] : 0;
  for (const k of Object.keys(flags)) flags[k] = !!(data.flags && data.flags[k]);

  bases.length = 0;
  for (const b of data.bases || []) {
    const base = { x: b.x, y: b.y, mk2: !!b.mk2, wall: !!b.wall, side: b.side, store: b.store || {} };
    if (base.wall) makeWallDeck(base);
    bases.push(base);
  }
  const li = typeof data.lastSafe === 'number' ? data.lastSafe : -1;
  lastSafe = li >= 0 && bases[li] ? bases[li] : CAMP;
  caches.length = 0;
  for (const c of data.caches || []) caches.push(c);
  if (data.nodes) NODES.forEach((n, i) => { n.depletedUntil = gameTime + (data.nodes[i] || 0); });
  return true;
}

function resetGame() {
  wiping = true;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
}

// overlay plumbing

function anyOverlayOpen() {
  return [...document.querySelectorAll('.overlay')].some(o => !o.classList.contains('hidden'));
}
function openOverlay(id) {
  document.getElementById(id).classList.remove('hidden');
  paused = true;
}
function closeOverlays() {
  if (deathCause) return; // death overlay only closes via respawn
  document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
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
    const lack = inv[k] < v ? ' lack' : '';
    return '<span class="' + lack + '"><span class="c-icon">' + svgIcon(ITEMS[k].icon) + '</span>' + inv[k] + '/' + v + '</span>';
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

function renderPack() {
  const grid = document.getElementById('inv-grid');
  grid.innerHTML = '';
  let any = false;
  for (const [id, def] of Object.entries(ITEMS)) {
    if (inv[id] <= 0) continue;
    any = true;
    const el = document.createElement('div');
    el.className = 'inv-item';
    el.innerHTML = '<span class="i-icon">' + svgIcon(def.icon) + '</span><span></span><span class="i-count">' + inv[id] + '</span>';
    el.children[1].textContent = def.name;
    if (def.eat) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Eat';
      b.addEventListener('click', () => eatItem(id));
      el.appendChild(b);
    }
    if (def.place) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Place';
      b.addEventListener('click', placeBase);
      el.appendChild(b);
    }
    grid.appendChild(el);
  }
  if (!any) grid.innerHTML = '<div class="inv-empty">Empty. Cliff faces hold what you need.</div>';

  const list = document.getElementById('recipe-list');
  list.innerHTML = '';
  for (const r of RECIPES) if (r.tier === 'personal') list.appendChild(recipeRow(r));
}

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
    ? 'Heavy fabrication online. Glove energy recharges fast inside the base perimeter.'
    : 'A powered fabricator needs an anchor point. Build the Mk2 here to unlock heavier gear.';

  // storage
  const store = document.getElementById('base-store');
  store.innerHTML = '';
  const ids = Object.keys(base.store || {}).filter(id => base.store[id] > 0);
  if (!ids.length) {
    store.innerHTML = '<div class="inv-empty">Storage empty. Stash materials here so a fall cannot cost you them.</div>';
  } else {
    for (const id of ids) {
      const el = document.createElement('div');
      el.className = 'inv-item';
      el.innerHTML = '<span class="i-icon">' + svgIcon(ITEMS[id].icon) + '</span><span></span><span class="i-count">' + base.store[id] + '</span>';
      el.children[1].textContent = ITEMS[id].name;
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = 'Take';
      b.addEventListener('click', () => takeItem(base, id, true));
      el.appendChild(b);
      store.appendChild(el);
    }
  }
  const carrying = DROP_ON_DEATH.some(id => inv[id] > 0);
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

// wipe save — two taps, so a stray thumb never nukes a playtest
const resetBtn = document.getElementById('btn-reset');
resetBtn.addEventListener('click', () => {
  if (resetBtn.classList.contains('confirm')) { resetGame(); return; }
  resetBtn.classList.add('confirm');
  resetBtn.textContent = 'Tap again to wipe everything';
  setTimeout(() => {
    resetBtn.classList.remove('confirm');
    resetBtn.textContent = 'Wipe save & restart';
  }, 3000);
});

// static UI icons

document.querySelector('#bar-health .bar-icon').innerHTML = svgIcon('hearts');
document.querySelector('#bar-food .bar-icon').innerHTML = svgIcon('meat');
document.querySelector('#bar-energy .bar-icon').innerHTML = svgIcon('power-lightning');
document.querySelector('#version-badge .badge-icon').innerHTML = svgIcon('mountain-climbing');
document.getElementById('version-text').textContent = 'v' + GAME_VERSION;
document.querySelector('#btn-pack .abtn-icon').innerHTML = svgIcon('knapsack');
document.querySelector('#btn-base .abtn-icon').innerHTML = svgIcon('house');
document.querySelector('#btn-interact .abtn-icon').innerHTML = svgIcon('grapple');
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

  // jump button doubles as the glide indicator
  const jumpIcon = document.querySelector('#btn-jump .abtn-icon');
  const gliding = player.state === 'glide' || (flags.glider && (player.state === 'air'));
  const want = gliding ? 'hang-glider' : 'jump-across';
  if (jumpIcon.dataset.icon !== want) { jumpIcon.dataset.icon = want; jumpIcon.innerHTML = svgIcon(want); }
  btnJump.classList.toggle('glide-ready', player.state === 'glide');

  const goal = GOALS.find(g => !g.done());
  const gt = document.getElementById('goal-text');
  if (goal && gt.textContent !== goal.text) gt.textContent = goal.text;
}

// ---------- goals ----------

function updateGoals() {
  if (!flags.summit) {
    const on = standingOn();
    if (on && on.name === 'The Needle' && player.state === 'ground') {
      flags.summit = true;
      toast('The Needle — summit reached', 'good', 'mountain-climbing');
    }
  }
}

// ---------- rendering ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let cw = 0, chh = 0, dpr = 1, scale = 1;
const cam = { x: CAMP.x, y: CAMP.y - 100 };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth; chh = window.innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(chh * dpr);
  scale = Math.max(Math.min(cw / 450, chh / 750), 0.6);
}
window.addEventListener('resize', resize);
resize();

function skyColor(y) {
  // deep indigo up high, warm haze near the cloud sea
  const t = clamp((y - 700) / 1900, 0, 1);
  const top = [To(11, 21, 48), To(120, 150, 205)];
  const bot = [To(38, 60, 110), To(215, 190, 170)];
  function To(r, g, b) { return { r, g, b }; }
  function mix(a, b, k) { return 'rgb(' + Math.round(lerp(a.r, b.r, k)) + ',' + Math.round(lerp(a.g, b.g, k)) + ',' + Math.round(lerp(a.b, b.b, k)) + ')'; }
  return [mix(top[0], top[1], t), mix(bot[0], bot[1], t)];
}

function w2s(x, y) { return { x: (x - cam.x) * scale + cw / 2, y: (y - cam.y) * scale + chh / 2 }; }

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const [cTop, cBot] = skyColor(cam.y);
  const g = ctx.createLinearGradient(0, 0, 0, chh);
  g.addColorStop(0, cTop); g.addColorStop(1, cBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, chh);

  // stars up high
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

  // far clouds
  for (const c of clouds) if (c.layer === 0) drawIcon(ctx, 'fluffy-cloud', c.x, c.y, c.s, '#ffffff', c.a);

  // rocks
  for (const r of ROCKS) {
    if (r.kind === 'perch') {
      if (r.deck) { // built decking, not rock
        ctx.fillStyle = '#243352';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#8fc7ff';
        ctx.fillRect(r.x, r.y, r.w, 3);
        ctx.fillStyle = 'rgba(143,199,255,0.35)';
        for (let i = 8; i < r.w - 4; i += 18) ctx.fillRect(r.x + i, r.y + r.h, 3, 10);
        continue;
      }
      ctx.fillStyle = '#3a3348';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = '#5d7a52';
      ctx.fillRect(r.x, r.y, r.w, 6);
      continue;
    }
    ctx.fillStyle = '#332c40';
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
    // face shading + grass lip
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(r.x, r.y, 6, r.h);
    ctx.fillStyle = '#5d7a52';
    ctx.fillRect(r.x - 3, r.y, r.w + 6, 9);
    ctx.fillStyle = '#7c9c66';
    ctx.fillRect(r.x - 3, r.y, r.w + 6, 4);
  }

  // camp
  drawZone(CAMP.x, CAMP.y, '#ffb454');
  drawIcon(ctx, 'campfire', CAMP.x, CAMP.y - 16, 34, '#ffb454', 0.9 + Math.sin(gameTime * 7) * 0.1);
  drawIcon(ctx, 'gear-hammer', CAMP.x + 42, CAMP.y - 14, 22, '#aecbff', 0.8);

  // bases
  for (const b of bases) {
    drawZone(b.x, b.y, '#8fc7ff');
    const bx = b.wall ? (b.side === 'L' ? b.x - DECK_W / 2 : b.x + DECK_W / 2) : b.x;
    const by = b.wall ? b.y - DECK_H : b.y;
    if (!b.wall) {
      ctx.fillStyle = '#243352';
      ctx.fillRect(b.x - 30, b.y - 6, 60, 6);
    }
    drawIcon(ctx, b.wall ? 'hut' : 'house', bx, by - 26, 38, '#8fc7ff');
    drawIcon(ctx, 'chest', bx - 26, by - 12, 18, '#c9a86b');
    if (b.mk2) drawIcon(ctx, 'anvil', bx + 26, by - 12, 19, '#ffd76b');
    drawIcon(ctx, 'flying-flag', bx + 4, by - 48, 15, 'rgba(143,199,255,0.55)');
  }

  // death caches
  for (const c of caches) {
    const bob = Math.sin(gameTime * 2.4 + c.x) * 4;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffd76b';
    ctx.beginPath(); ctx.arc(c.x, c.y + bob, 22 + Math.sin(gameTime * 3) * 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawIcon(ctx, 'swap-bag', c.x, c.y + bob, 30, '#ffd76b');
    drawIcon(ctx, 'position-marker', c.x, c.y + bob - 34, 18, '#ffd76b', 0.85);
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

  // stingwing nests + wasps
  for (const w of stingwings) {
    drawIcon(ctx, 'wasp-sting', w.nest.x, w.nest.y, 26, 'rgba(0,0,0,0.35)');
    const flip = (w.mode === 'chase' ? playerCenter().x < w.x : Math.cos(w.t * 1.3) < 0);
    ctx.save();
    ctx.translate(w.x, w.y + Math.sin(gameTime * 14) * 2);
    if (flip) ctx.scale(-1, 1);
    drawIcon(ctx, 'wasp-sting', 0, 0, 30, w.mode === 'chase' ? '#ffd76b' : '#d9b45e');
    ctx.restore();
  }

  // razorbeaks
  for (const b of razorbeaks) {
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.dir < 0) ctx.scale(-1, 1);
    drawIcon(ctx, 'vulture', 0, 0, 44, b.mode === 'swoop' ? '#6b4a66' : '#4a3b52');
    ctx.restore();
  }

  drawPlayer();

  // near clouds
  for (const c of clouds) if (c.layer === 1) drawIcon(ctx, 'fluffy-cloud', c.x, c.y, c.s * 1.4, '#ffffff', c.a * 0.7);

  // cloud sea
  const seaTop = WORLD.cloudSea;
  const sg = ctx.createLinearGradient(0, seaTop - 120, 0, seaTop + 160);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.55, 'rgba(240,238,245,0.85)');
  sg.addColorStop(1, 'rgba(230,228,240,1)');
  ctx.fillStyle = sg;
  ctx.fillRect(cam.x - cw / scale, seaTop - 120, cw * 2 / scale, 400);
  for (let i = 0; i < 8; i++) {
    const cx = ((i * 431) % 2400) + Math.sin(gameTime * 0.3 + i) * 30;
    drawIcon(ctx, 'fluffy-cloud', cx, seaTop - 30 + (i % 3) * 22, 150, '#ffffff', 0.5);
  }

  ctx.restore();

  // screen-edge pointers to off-screen caches, so a lost load is always findable
  for (const c of caches) {
    const s = w2s(c.x, c.y);
    const m = 42;
    if (s.x > m && s.x < cw - m && s.y > m && s.y < chh - m) continue;
    const px = clamp(s.x, m, cw - m), py = clamp(s.y, m, chh - m);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(10,16,36,0.7)';
    ctx.beginPath(); ctx.arc(px, py, 18, 0, Math.PI * 2); ctx.fill();
    drawIcon(ctx, 'swap-bag', px, py, 20, '#ffd76b');
    ctx.restore();
  }

  // brief autosave tick
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
  ctx.globalAlpha = nearCampOrBase() && dist(player.x, player.y, x, y) < T.campRadius + 60 ? 0.35 : 0.1;
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
  // glider canopy
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
  // body
  ctx.fillStyle = '#2c3e63';
  roundRect(px + 3, py + 12, P_W - 6, P_H - 14, 7);
  // head
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath(); ctx.arc(cx, py + 8, 8, 0, Math.PI * 2); ctx.fill();
  // gloves
  const glow = player.state === 'climb';
  ctx.fillStyle = glow ? '#59d7ff' : '#94a8cf';
  const handY = py + (glow ? 14 : 24);
  const wallSide = player.climbSide === 'L' ? 1 : -1;
  if (glow) {
    const hx = player.climbSide === 'L' ? px + P_W + 2 : px - 2;
    ctx.beginPath(); ctx.arc(hx, handY, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx, handY + 14, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(89,215,255,' + (0.25 + Math.sin(gameTime * 8) * 0.12) + ')';
    ctx.beginPath(); ctx.arc(hx + wallSide * 2, handY + 7, 12, 0, Math.PI * 2); ctx.fill();
  } else {
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
    updateCaches();
    updateInteraction(dt);
    updateStingwings(dt);
    updateRazorbeaks(dt);
    updateGoals();
    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x > 2650) c.x = -200;
    }
    autosaveTimer -= dt;
    if (autosaveTimer <= 0) { autosaveTimer = 20; saveGame(); }
  }
  input.jumpPressed = false;

  // camera
  const targetX = clamp(player.x + P_W / 2, cw / scale / 2 * 0.4, 2400);
  const targetY = clamp(player.y, WORLD.top, WORLD.cloudSea + 60 - chh / scale / 2);
  cam.x = lerp(cam.x, targetX, clamp(6 * dt, 0, 1));
  cam.y = lerp(cam.y, targetY, clamp(6 * dt, 0, 1));

  render();
  updateHUD();
  requestAnimationFrame(frame);
}
const resumed = loadGame();
if (resumed) {
  cam.x = player.x; cam.y = player.y;
  if (player.hp <= 0) { player.hp = 100; }
}
requestAnimationFrame(frame);

toast(resumed ? 'Climb resumed — v' + GAME_VERSION : 'Skyreach v' + GAME_VERSION + ' — Homestead',
      'good', 'mountain-climbing');
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

// Debug/playtest handle (also used by automated smoke tests)
window.SKYREACH = {
  player, inv, flags, bases, caches, T, version: GAME_VERSION,
  saveGame, loadGame, getLastSafe: () => lastSafe,
};
})();
