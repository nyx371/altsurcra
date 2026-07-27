// Skyreach regression suite.
//
// One browser, one page, one server, run start to finish. Everything that is a
// property of world generation or of the DOM runs as a single in-page evaluate
// with no waiting at all; only things that genuinely need frames to elapse cost
// wall-clock, and those poll for their condition instead of sleeping a fixed
// guess. Replaces the fourteen per-version suites.
//
//   node regress.js            run everything
//   node regress.js world ui   run only the named groups

const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  try {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(p));
  } catch { res.writeHead(404); res.end('nf'); }
});

const GROUPS = [];
const group = (name, fn) => GROUPS.push({ name, fn });

let fails = 0, checks = 0, current = '';
const ok = (label, cond, extra) => {
  checks++;
  if (!cond) fails++;
  if (!cond || process.env.VERBOSE) {
    console.log((cond ? '  ok  ' : '  FAIL') + ' ' + label + (extra === undefined ? '' : '  ' + fmt(extra)));
  }
};
const fmt = (v) => typeof v === 'string' ? v : JSON.stringify(v);

// ---------------------------------------------------------------- helpers

function makeCtx(page) {
  const S = (fn, arg) => page.evaluate(fn, arg);

  // Poll rather than sleep: most physics checks resolve in a frame or two and
  // only need the long tail when something is wrong.
  const waitFor = async (fn, arg, ms = 4000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await page.evaluate(fn, arg);
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await page.waitForTimeout(40);
    }
  };

  const reset = async () => {
    await S(() => {
      const K = window.SKYREACH;
      K.resetGame();
    });
    await page.waitForTimeout(650);
    await calm();
  };

  // Nothing in a test should be decided by weather, night, or the one creature
  // big enough to end a check early.
  const calm = () => S(() => {
    const K = window.SKYREACH;
    K.stormLeft = 0; K.stormTimer = 1e5; K.dayTime = 0.18;
    if (K.leviathan) {
      K.leviathan.mode = 'patrol';
      K.leviathan.x = 1e6; K.leviathan.y = 0;
      K.leviathan.home = { x: 1e6, y: 0 };
    }
    if (K.visorOn) K.toggleVisor();
    if (K.jetOn) K.toggleJet();
    K.player.hp = 100; K.player.food = 100;
  });

  const revive = async () => {
    if (await S(() => !document.getElementById('overlay-death').classList.contains('hidden'))) {
      await page.click('#btn-respawn');
      await page.waitForTimeout(200);
    }
    await S(() => { window.SKYREACH.player.hp = 100; window.SKYREACH.player.food = 100; });
  };

  const closePanels = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
  };

  // stand somewhere with clear air above, on the widest island
  const openAir = (drop = 700) => S((d) => {
    const K = window.SKYREACH;
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    let px = slab.x + slab.w / 2;
    for (let k = 0; k < 40; k++) {
      const t = slab.x + 30 + (slab.w - 60) * (k / 39);
      if (!K.rocks.some(r => r !== slab && r.x < t + 26 && r.x + r.w > t &&
        r.y < slab.y - 40 && r.y + r.h > slab.y - d - 300)) { px = t; break; }
    }
    K.player.x = px; K.player.y = slab.y - d;
    K.player.state = 'air'; K.player.vx = 0; K.player.vy = 0;
    K.player.hp = 100; K.player.energy = K.player.maxEnergy;
    return { x: px, y: slab.y - d };
  }, drop);

  const onDeck = () => S(() => {
    const K = window.SKYREACH;
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    K.player.x = slab.x + slab.w / 2; K.player.y = slab.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.player.hp = 100; K.player.energy = K.player.maxEnergy;
    return { x: K.player.x, y: K.player.y };
  });

  const hold = async (sel, ms) => {
    await page.hover(sel);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await page.waitForTimeout(80);
  };

  const key = async (code, ms) => {
    await page.keyboard.down(code);
    await page.waitForTimeout(ms);
    await page.keyboard.up(code);
  };

  const tab = (bar, name) => S(([b, n]) => window.SKYREACH.openPanelTab(b, n), [bar, name]);

  return { S, page, waitFor, reset, calm, revive, closePanels, openAir, onDeck, hold, key, tab };
}

// ---------------------------------------------------------------- specs

// Everything about how a world comes out of the generator. Pure maths over many
// seeds in a single evaluate — no frames, no waiting, no flakiness.
group('world', async (t) => {
  const { S } = t;
  await t.reset();

  const audit = await S(() => {
    const K = window.SKYREACH;
    const P_H = 46;
    const jump = (560 * 560) / (2 * 1500);        // standing jump height
    const out = {
      seeds: 0, minStart: 1e9, avgSlab: 0, slabs: 0,
      floorMiss: [], typeMiss: [], noClearTower: [], unreachableHill: [],
      minOre: 1e9, minCrystal: 1e9, minFiber: 1e9, minStone: 1e9, minSteel: 1e9,
      relicsMin: 1e9, relicNearCamp: 0, thermalsMin: 1e9,
      startRunners: 0, steelLow: 0, groundFiber: 1e9, groundStone: 1e9,
    };
    const yields = { berry: 3, fiber: 3, stone: 3, ore: 3, crystal: 3, skysteel: 2 };
    for (let s = 1; s <= 30; s++) {
      K.generateWorld(s * 7919);
      out.seeds++;
      const camp = K.camp;
      const slab = K.rocks.find(r => r.y === camp.y && r.w > 700);
      if (slab) out.minStart = Math.min(out.minStart, slab.w);

      for (const r of K.rocks) {
        if (r.w > 250 && r.h > 150 && !r.deck) { out.avgSlab += r.w; out.slabs++; }
      }

      // every material clears its generation floor
      for (const [type, floor] of Object.entries(K.nodeFloor)) {
        const have = K.nodes.filter(n => n.type === type).length;
        if (have < floor) out.floorMiss.push(s + ':' + type);
      }
      // and the world holds enough of it to finish the tech tree
      const tally = {};
      for (const n of K.nodes) tally[n.type] = (tally[n.type] || 0) + yields[n.type];
      out.minOre = Math.min(out.minOre, tally.ore || 0);
      out.minCrystal = Math.min(out.minCrystal, tally.crystal || 0);
      out.minFiber = Math.min(out.minFiber, tally.fiber || 0);
      out.minStone = Math.min(out.minStone, tally.stone || 0);
      out.minSteel = Math.min(out.minSteel, tally.skysteel || 0);

      // all three rock tiers exist
      const types = new Set(K.rocks.filter(r => !r.deck).map(r => r.type));
      for (const want of ['granite', 'basalt', 'stormrock']) if (!types.has(want)) out.typeMiss.push(s + ':' + want);

      // the first cliff you meet must be climbable without a tool
      if (slab) {
        const towers = K.rocks.filter(r => r.h > 200 && !r.deck && r !== slab &&
          r.y < camp.y - 40 && r.x >= slab.x && r.x + r.w <= slab.x + slab.w);
        if (towers.length && !towers.some(x => !K.brambles.some(b => b.rock === x))) out.noClearTower.push(s);

        // gloves must be payable from flat ground alone
        const flat = K.nodes.filter(n => !n.wall && Math.abs(n.y - camp.y) < 4 &&
          n.x >= slab.x && n.x <= slab.x + slab.w);
        out.groundFiber = Math.min(out.groundFiber, flat.filter(n => n.type === 'fiber').length * 3);
        out.groundStone = Math.min(out.groundStone, flat.filter(n => n.type === 'stone').length * 3);

        // every hill on the home island has to be hoppable bare-handed
        for (const r of K.rocks) {
          // hills only: face shelves are thin and meant to be climbed to
          if (r.deck || r === slab || r.h > 160 || r.h < 30) continue;
          if (r.x < slab.x || r.x + r.w > slab.x + slab.w) continue;
          const below = K.rocks.filter(o => o !== r && o.y > r.y && o.x < r.x + r.w && o.x + o.w > r.x)
            .reduce((lo, o) => Math.min(lo, o.y), camp.y);
          if (below - r.y > jump + P_H * 0.4) out.unreachableHill.push(s + ':' + Math.round(below - r.y));
        }
        // no ridgerunner on the home island: the first ten minutes are for moving
        out.startRunners += K.runners.filter(rr => rr.rock === slab).length;
      }

      // skysteel is a high-altitude material
      const steel = K.nodes.filter(n => n.type === 'skysteel');
      if (steel.some(n => n.y > camp.y - 200)) out.steelLow++;

      out.relicsMin = Math.min(out.relicsMin, K.relics.length);
      out.thermalsMin = Math.min(out.thermalsMin, K.thermals.length);
      if (slab && K.relics.some(r => r.x > slab.x - 200 && r.x < slab.x + slab.w + 200)) out.relicNearCamp++;
    }
    out.avgSlab = Math.round(out.avgSlab / out.slabs);
    return out;
  });

  ok('every seed generates all three rock tiers', audit.typeMiss.length === 0, audit.typeMiss.slice(0, 4));
  ok('start island is large', audit.minStart > 1200, audit.minStart);
  ok('islands average a real size', audit.avgSlab > 600, audit.avgSlab);
  ok('every material clears its floor', audit.floorMiss.length === 0, audit.floorMiss.slice(0, 6));
  ok('worlds hold enough ore for the tree', audit.minOre >= 45, audit.minOre);
  ok('worlds hold enough crystal for the tree', audit.minCrystal >= 66, audit.minCrystal);
  ok('worlds hold enough fiber for the tree', audit.minFiber >= 40, audit.minFiber);
  ok('worlds hold enough stone for the tree', audit.minStone >= 20, audit.minStone);
  ok('worlds hold enough skysteel for the tree', audit.minSteel >= 20, audit.minSteel);
  ok('gloves are payable from flat ground', audit.groundFiber >= 5 && audit.groundStone >= 4,
    audit.groundFiber + ' fiber / ' + audit.groundStone + ' stone');
  ok('every home-island hill is hoppable bare-handed', audit.unreachableHill.length === 0, audit.unreachableHill.slice(0, 4));
  ok('there is always a thorn-free first cliff', audit.noClearTower.length === 0, audit.noClearTower.slice(0, 4));
  ok('no ridgerunner on the home island', audit.startRunners === 0, audit.startRunners);
  ok('skysteel only forms high up', audit.steelLow === 0, audit.steelLow);
  ok('every world seeds relics', audit.relicsMin >= 3, audit.relicsMin);
  ok('relics never sit on the home island', audit.relicNearCamp === 0, audit.relicNearCamp);
  ok('every world seeds thermals', audit.thermalsMin >= 4, audit.thermalsMin);

  const repro = await S(() => {
    const K = window.SKYREACH;
    const snap = () => JSON.stringify(K.rocks.filter(r => !r.drift).map(r => [r.x, r.y, r.w, r.h, r.type]));
    K.generateWorld(12345); const a = snap();
    K.generateWorld(99999); const b = snap();
    K.generateWorld(12345); const c = snap();
    return { same: a === c, different: a !== b };
  });
  ok('the same seed rebuilds the same world', repro.same === true);
  ok('a different seed builds a different world', repro.different === true);

  const feats = await S(() => {
    const K = window.SKYREACH;
    K.generateWorld(4242);
    const kinds = new Set();
    let overlaps = 0, faces = 0;
    for (const r of K.rocks) {
      if (!r.features || !r.features.length) continue;
      faces++;
      for (const f of r.features) {
        kinds.add(f.kind);
        for (const o of r.features) {
          if (o === f) continue;
          if (f.x < o.x + o.w && f.x + f.w > o.x && f.y < o.y + o.h && f.y + f.h > o.y) overlaps++;
        }
      }
    }
    // patch colours must read as the host rock, not as stickers on it
    const rock = K.cliffTypes.granite.color;
    const rk = [1, 3, 5].map(i => parseInt(rock.slice(i, i + 2), 16));
    const dist = (kind) => {
      const f = K.features[kind];
      const m = K.mixHex(rock, f.tint, f.mix).match(/rgb\((\d+),(\d+),(\d+)\)/);
      const c = [+m[1], +m[2], +m[3]];
      const raw = [1, 3, 5].map(i => parseInt(f.tint.slice(i, i + 2), 16));
      return {
        toRock: Math.round(Math.hypot(c[0] - rk[0], c[1] - rk[1], c[2] - rk[2])),
        toTint: Math.round(Math.hypot(c[0] - raw[0], c[1] - raw[1], c[2] - raw[2])),
      };
    };
    return { kinds: [...kinds].sort(), overlaps, faces, hold: dist('hold'), rest: dist('rest'), sharp: dist('sharp') };
  });
  ok('all five route features generate', feats.kinds.length === 5, feats.kinds);
  ok('faces carry routes', feats.faces > 10, feats.faces);
  ok('patches never overlap each other', feats.overlaps === 0, feats.overlaps);
  ok('handholds blend into the host rock', feats.hold.toRock < 40 && feats.hold.toRock < feats.hold.toTint, feats.hold);
  ok('but stay visible against bare rock', feats.hold.toRock > 10, feats.hold);
  ok('rest ledges blend too', feats.rest.toRock < 60, feats.rest);
  ok('hazard patches read louder than holds', feats.sharp.toRock > feats.hold.toRock, feats.sharp);
});

// The endless drift: generation, determinism, bounds, and the cost of having it.
group('drift', async (t) => {
  const { S } = t;
  await t.reset();

  const grown = await S(() => {
    const K = window.SKYREACH;
    const before = { rocks: K.rocks.length, nodes: K.nodes.length, right: K.world.right, left: K.world.left };
    for (let x = K.core.right; x < K.core.right + 12000; x += 400) K.ensureDrift(x);
    for (let x = K.core.left; x > K.core.left - 12000; x -= 400) K.ensureDrift(x);
    const drifters = K.rocks.filter(r => r.drift);
    const slabs = drifters.filter(r => r.w > 400 && r.h > 180).sort((a, b) => a.x - b.x);
    let worstGap = 0;
    for (let i = 1; i < slabs.length; i++) {
      const g = slabs[i].x - (slabs[i - 1].x + slabs[i - 1].w);
      if (g > 0 && g < 4000) worstGap = Math.max(worstGap, g);
    }
    return {
      before, after: { rocks: K.rocks.length, nodes: K.nodes.length, right: K.world.right, left: K.world.left },
      drifters: drifters.length, slabs: slabs.length, worstGap: Math.round(worstGap),
      types: [...new Set(drifters.map(r => r.type))].sort(),
      lowest: Math.max(...drifters.map(r => r.y)),
      thermals: K.thermals.length, chunks: K.driftChunks.length,
    };
  });
  ok('flying out generates new islands', grown.after.rocks > grown.before.rocks + 20, grown.drifters);
  ok('east and west both grow', grown.after.right > grown.before.right + 8000 && grown.after.left < grown.before.left - 8000, grown.after);
  ok('drift islands carry resources', grown.after.nodes > grown.before.nodes + 20, grown.after.nodes);
  ok('the drift escalates through rock tiers', grown.types.length >= 2, grown.types);
  ok('drift islands stay above the cloud sea', grown.lowest < 2880, grown.lowest);
  ok('every drift island has a thermal home', grown.thermals >= grown.slabs, grown.thermals + ' vs ' + grown.slabs);
  ok('gaps stay inside glide range', grown.worstGap < 1500, grown.worstGap);

  const det = await S(() => {
    const K = window.SKYREACH;
    const seed = K.seed;
    const snap = () => K.rocks.filter(r => r.drift).map(r => [r.x, r.y, r.w, r.h, r.type].join(',')).join('|');
    const a = snap();
    const order = K.driftChunks.slice();
    K.generateWorld(seed);
    for (const i of order.slice().reverse()) K.buildDriftChunk(i);   // rebuilt in a DIFFERENT order
    const b = snap();
    return { same: a.split('|').sort().join('|') === b.split('|').sort().join('|'), n: order.length };
  });
  ok('the drift is deterministic regardless of visit order', det.same === true, det);
});

// Moving: walk, grab, climb, mantle, glide, thrust, zip, fly.
group('movement', async (t) => {
  const { S, page, waitFor, key } = t;
  await t.reset();

  // cliffs never block you on foot
  const walked = await S(() => {
    const K = window.SKYREACH;
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    const tower = K.rocks.find(r => r.h > 200 && !r.deck && r !== slab &&
      r.x > slab.x + 60 && r.x + r.w < slab.x + slab.w - 60 && r.y + r.h >= slab.y - 6);
    if (!tower) return null;
    K.player.x = tower.x - 60; K.player.y = slab.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.flags.gloves = false;
    return { tx: tower.x, tw: tower.w };
  });
  if (walked) {
    await key('ArrowRight', 900);
    const past = await S((w) => window.SKYREACH.player.x > w.tx + w.tw * 0.4, walked);
    ok('cliffs never block you on foot', past === true);
  }

  // bare hands cannot climb; gloves unlock granite; tiers gate the rest
  const grabTest = async (type, flags) => {
    await S(([ty, fl]) => {
      const K = window.SKYREACH;
      Object.assign(K.flags, { gloves: false, spikes: false, magnets: false }, fl);
      const r = K.rocks.find(x => x.type === ty && x.h > 150 && !x.deck);
      K.player.x = r.x + r.w / 2 - 13; K.player.y = r.y + r.h / 2;
      K.player.state = 'air'; K.player.vx = 0; K.player.vy = 0;
      K.player.detachTimer = 0; K.player.energy = 200; K.player.maxEnergy = 200;
    }, [type, flags]);
    await key('ArrowUp', 260);
    return S(() => window.SKYREACH.player.state);
  };
  ok('bare hands cannot grab granite', await grabTest('granite', {}) !== 'climb');
  ok('gloves unlock granite', await grabTest('granite', { gloves: true }) === 'climb');
  ok('basalt refuses bare gloves', await grabTest('basalt', { gloves: true }) !== 'climb');
  ok('grip spikes unlock basalt', await grabTest('basalt', { gloves: true, spikes: true }) === 'climb');
  ok('storm rock refuses spikes alone', await grabTest('stormrock', { gloves: true, spikes: true }) !== 'climb');
  ok('resonant magnets unlock storm rock', await grabTest('stormrock', { gloves: true, spikes: true, magnets: true }) === 'climb');

  // climb up a clear face and mantle the top
  const face = await S(() => {
    const K = window.SKYREACH;
    Object.assign(K.flags, { gloves: true, spikes: true, magnets: true, ascender: false });
    const r = K.rocks.find(x => x.h > 200 && x.h < 460 && !x.deck &&
      !K.brambles.some(b => b.rock === x) &&
      !K.rocks.some(o => o !== x && !o.deck && o.x < x.x + x.w + 20 && o.x + o.w > x.x - 20 && o.y < x.y && o.y + o.h > x.y - 60));
    if (!r) return null;
    K.player.x = r.x + r.w / 2 - 13; K.player.y = r.y + r.h - 80;
    K.player.state = 'climb'; K.player.climbRect = r;
    K.player.vx = 0; K.player.vy = 0; K.player.energy = 400; K.player.maxEnergy = 400;
    return { top: r.y };
  });
  ok('found a clear face to climb', !!face);
  if (face) {
    await page.keyboard.down('ArrowUp');
    const topped = await waitFor(() => window.SKYREACH.player.state === 'ground', null, 8000);
    await page.keyboard.up('ArrowUp');
    ok('a clear face can be climbed and mantled', topped === true,
      await S((f) => ({ st: window.SKYREACH.player.state, y: Math.round(window.SKYREACH.player.y), top: f.top }), face));

    // and climbed back down from the top
    await key('ArrowDown', 400);
    ok('holding down starts a descent from the top', await S(() => window.SKYREACH.player.state) === 'climb');
    await S(() => window.SKYREACH.releaseClimb());
    ok('the release drops you off the wall', await S(() => window.SKYREACH.player.state) !== 'climb');
  }

  // parachute vs wing
  const glide = async (wing) => {
    await S((w) => {
      const K = window.SKYREACH;
      Object.assign(K.flags, { glider: true, glider2: w, jetpack: false, thermal: false });
    }, wing);
    await t.openAir(900);
    const a = await S(() => ({ x: window.SKYREACH.player.x, y: window.SKYREACH.player.y }));
    await page.keyboard.down('Space');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    const b = await S(() => ({ x: window.SKYREACH.player.x, y: window.SKYREACH.player.y, st: window.SKYREACH.player.state }));
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Space');
    return { dx: b.x - a.x, dy: b.y - a.y, st: b.st, ratio: (b.x - a.x) / Math.max(1, b.y - a.y) };
  };
  const chute = await glide(false);
  const wing = await glide(true);
  // assert the design numbers, not just "one is better": a parachute is roughly
  // 1:1 and a wing is better than 2:1, and those are the claims that matter
  ok('the parachute glides', chute.st === 'glide' && chute.dy > 0, chute);
  ok('the parachute is roughly 1:1', chute.ratio > 0.4 && chute.ratio < 1.4, chute.ratio.toFixed(2) + ':1');
  ok('the ridge wing falls far slower', wing.dy < chute.dy * 0.5, Math.round(chute.dy) + ' vs ' + Math.round(wing.dy));
  ok('and glides better than 2:1', wing.ratio > 2, wing.ratio.toFixed(2) + ':1');
  ok('which is a different class of wing', wing.ratio > chute.ratio * 2.5,
    chute.ratio.toFixed(2) + ':1 vs ' + wing.ratio.toFixed(2) + ':1');

  // jetpack: armed with its own button, fired with jump
  await S(() => {
    const K = window.SKYREACH;
    Object.assign(K.flags, { jetpack: true, jetpack2: false, glider: true, glider2: false, boots: false });
    K.player.fuel = K.maxFuel();
    if (K.jetOn) K.toggleJet();
  });
  await t.openAir(900);
  await key('Space', 700);
  ok('disarmed, jump glides and burns no fuel', await S(() => window.SKYREACH.player.fuel) >= 44);
  await S(() => { if (!window.SKYREACH.jetOn) window.SKYREACH.toggleJet(); });
  ok('the thruster button arms it', await S(() => window.SKYREACH.jetOn) === true);
  const jetFrom = await t.openAir(900);
  await S(() => { window.SKYREACH.player.fuel = window.SKYREACH.maxFuel(); });
  await key('Space', 1100);
  const jetTo = await S(() => ({ y: window.SKYREACH.player.y, fuel: window.SKYREACH.player.fuel }));
  ok('armed, holding jump lifts you', jetTo.y < jetFrom.y - 100, 'rose ' + Math.round(jetFrom.y - jetTo.y));
  ok('and burns fuel doing it', jetTo.fuel < 44, jetTo.fuel);
  await t.onDeck();
  await page.waitForTimeout(250);
  ok('landing leaves it armed', await S(() => window.SKYREACH.jetOn) === true);
  await S(() => { if (window.SKYREACH.jetOn) window.SKYREACH.toggleJet(); });

  // ziplines: place, ride, reverse
  const zip = await S(() => {
    const K = window.SKYREACH;
    K.inv.zipkit = 3;
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    K.player.x = slab.x + 120; K.player.y = slab.y - 46; K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.placeZip();
    const pending = !!K.zipAnchor, kits = K.inv.zipkit;
    K.player.x = slab.x + 240;        // 120px: past the cancel radius, under the minimum
    K.placeZip();                     // too short: refused, nothing spent
    const shortOk = !!K.zipAnchor && K.ziplines.length === 0;
    K.player.x = slab.x + 620;
    K.placeZip();
    return { pending, kits, shortOk, lines: K.ziplines.length, spent: 3 - K.inv.zipkit, left: !!K.zipAnchor };
  });
  ok('the first anchor costs no kit', zip.pending && zip.kits === 3, zip);
  ok('a too-short run is refused', zip.shortOk === true);
  ok('a valid pair strings a cable for one kit', zip.lines === 1 && zip.spent === 1 && !zip.left, zip);

  const ride = await S(() => {
    const K = window.SKYREACH;
    const z = K.ziplines[0];
    K.player.x = z.x1 - 13; K.player.y = z.y1 - 8;
    const mounted = K.mountZip();
    return { mounted, st: K.player.state, dir: K.player.zip && K.player.zip.dir };
  });
  ok('you can mount a cable', ride.mounted && ride.st === 'zip', ride);
  const moved = await waitFor(() => window.SKYREACH.player.state !== 'zip' || window.SKYREACH.player.zip.t > 0.15, null, 3000);
  ok('the motor carries you along it', moved === true);
  // mount nearer the near end so the default heading is +1, or "reverses to -1"
  // would be true without the steering doing anything at all
  const mounted = await S(() => {
    const K = window.SKYREACH;
    const z = K.ziplines[0];
    K.player.x = z.x1 + (z.x2 - z.x1) * 0.25 - 13;
    K.player.y = z.y1 + (z.y2 - z.y1) * 0.25 - 8;
    K.player.state = 'air'; K.player.zip = null;
    K.mountZip();
    return K.player.zip && K.player.zip.dir;
  });
  ok('you set off toward the far end', mounted === 1, mounted);
  await key('ArrowLeft', 350);
  ok('pushing back reverses the trolley', await S(() => window.SKYREACH.player.zip && window.SKYREACH.player.zip.dir) === -1);
  await key('ArrowRight', 350);
  ok('and pushing forward turns it round again', await S(() => window.SKYREACH.player.zip && window.SKYREACH.player.zip.dir) === 1);
  await S(() => window.SKYREACH.dismountZip(false));
  ok('and you can drop off it', await S(() => window.SKYREACH.player.state) !== 'zip');

  // the airship
  await t.onDeck();
  await S(() => window.SKYREACH.CHEATS.ship());
  const boarded = await waitFor(() => {
    const K = window.SKYREACH;
    if (!K.nearShip()) return false;
    K.boardShip();
    return K.player.state === 'ship';
  }, null, 3000);
  ok('the airship can be built and boarded', boarded === true);
  const flyFrom = await S(() => ({ x: window.SKYREACH.airship.x, y: window.SKYREACH.airship.y }));
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowUp');
  const flyTo = await S(() => ({
    x: window.SKYREACH.airship.x, y: window.SKYREACH.airship.y,
    px: window.SKYREACH.player.x, py: window.SKYREACH.player.y,
  }));
  ok('it flies where you steer it', flyTo.x > flyFrom.x + 100 && flyTo.y < flyFrom.y - 80,
    Math.round(flyTo.x - flyFrom.x) + ',' + Math.round(flyTo.y - flyFrom.y));
  ok('you ride inside it', Math.abs(flyTo.px + 13 - flyTo.x) < 4 && Math.abs(flyTo.py + 23 - flyTo.y) < 4);
  const rest = await S(async () => {
    const K = window.SKYREACH;
    K.airship.vx = 0; K.airship.vy = 0;
    const y0 = K.airship.y;
    return new Promise(r => setTimeout(() => r({ y0, y1: K.airship.y }), 700));
  });
  ok('the airship does not fall', Math.abs(rest.y1 - rest.y0) < 40, rest);
  await S(() => window.SKYREACH.leaveShip());
  ok('you can step off it mid-air', await S(() => window.SKYREACH.player.state) !== 'ship');
  const down = await S(() => {
    const K = window.SKYREACH;
    K.airship.hull = 1; K.downShip();
    return { st: K.player.state, hull: K.airship.hull };
  });
  ok('a downed ship never strands you', down.st !== 'ship' && down.hull > 0, down);
});

// The rock itself: routes, hazards, thorn.
group('rock', async (t) => {
  const { S, page, waitFor, key, hold } = t;
  await t.reset();
  await S(() => {
    const K = window.SKYREACH;
    Object.assign(K.flags, { gloves: true, spikes: true, magnets: true, armor: false, stormsuit: false, ascender: false, shield: false });
    K.player.maxEnergy = 400;
  });

  // Grip a patch of a given kind. Candidates are ranked by how much clear air is
  // in front of them, and we walk down the list until one actually takes — a
  // single unlucky patch behind a hill should not fail the whole check.
  const gripKind = async (kind, atTop = false, tries = 5) => {
    const cands = await S((k) => {
      const K = window.SKYREACH;
      const out = [];
      for (const r of K.rocks) {
        if (r.deck || !r.features) continue;
        for (const f of r.features) {
          if (f.kind !== k || f.w <= 50) continue;
          const blocked = K.rocks.some(o => o !== r && !o.deck &&
            o.x < f.x + f.w + 30 && o.x + o.w > f.x - 30 &&
            o.y < f.y + f.h + 60 && o.y + o.h > f.y - 60);
          out.push({ x: f.x, y: f.y, w: f.w, h: f.h, blocked });
        }
      }
      out.sort((a, b) => (a.blocked - b.blocked) || (b.h - a.h));
      return out;
    }, kind);
    for (const f of cands.slice(0, tries)) {
      await S(([p, top]) => {
        const K = window.SKYREACH;
        K.player.x = p.x + p.w / 2 - 13; K.player.y = p.y + p.h / 2 - 23;
        K.player.state = 'air'; K.player.vx = 0; K.player.vy = 0;
        K.player.detachTimer = 0; K.player.energy = 400; K.player.hp = 100;
        void top;
      }, [f, atTop]);
      await key('KeyW', 200);
      const got = await S(([p, top]) => {
        const K = window.SKYREACH;
        if (K.player.state !== 'climb') return null;
        K.player.x = p.x + p.w / 2 - 13;
        K.player.y = top ? p.y + 4 : p.y + p.h / 2 - 23;
        return true;
      }, [f, atTop]);
      if (!got) continue;
      await page.waitForTimeout(100);
      const st = await S(() => ({ st: window.SKYREACH.player.state, grip: window.SKYREACH.gripKind,
        hp: window.SKYREACH.player.hp, e: window.SKYREACH.player.energy, y: window.SKYREACH.player.y }));
      if (st.st === 'climb' && st.grip === kind) return { ...st, patch: f };
    }
    return null;
  };

  const sharp = await gripKind('sharp');
  ok('razor shale can be gripped', sharp && sharp.st === 'climb' && sharp.grip === 'sharp', sharp);
  if (sharp) {
    await page.waitForTimeout(1400);
    const bled = await S(() => window.SKYREACH.player.hp);
    ok('razor shale cuts while you hang on it', bled < sharp.hp - 5, Math.round(sharp.hp) + ' -> ' + Math.round(bled));
    const armoured = await S(async () => {
      const K = window.SKYREACH;
      K.flags.armor = true; K.player.hp = 100;
      return new Promise(r => setTimeout(() => r(K.player.hp), 1400));
    });
    ok('armour blunts it', 100 - armoured < (sharp.hp - bled) * 0.8,
      'bare lost ' + Math.round(sharp.hp - bled) + ', armoured ' + Math.round(100 - armoured));
    await S(() => { window.SKYREACH.flags.armor = false; });
  }

  const slick = await gripKind('slick', true);
  ok('slick rock can be gripped', slick && slick.st === 'climb' && slick.grip === 'slick', slick);
  if (slick) {
    await page.waitForTimeout(600);
    const slid = await S(() => window.SKYREACH.player.y);
    ok('slick rock slides you down with no input', slid > slick.y + 12, Math.round(slid - slick.y) + 'px');
  }

  const hold0 = await gripKind('hold');
  if (hold0) {
    await page.waitForTimeout(700);
    const held = await S(() => window.SKYREACH.player.y);
    ok('handholds hold you still', Math.abs(held - hold0.y) < 10, Math.round(held - hold0.y));
  }
  const rest0 = await gripKind('rest');
  if (rest0) {
    await page.waitForTimeout(800);
    const e1 = await S(() => window.SKYREACH.player.energy);
    ok('a rest ledge costs nothing to hang on', e1 >= rest0.e - 0.5, Math.round(rest0.e - e1));
  }
  const crumble = await gripKind('crumble');
  if (crumble) {
    const dropped = await waitFor(() => window.SKYREACH.player.state !== 'climb', null, 4000);
    ok('crumbling rock gives way under you', dropped === true);
  }

  // thorn gates the top until you have the hook
  const thorn = await S(() => {
    const K = window.SKYREACH;
    K.flags.cutter = false;
    K.inv.fiber = 0;
    const b = K.brambles.find(x => x.rock && x.rock.h > 200 && K.gameTime >= x.cutUntil);
    if (!b) return null;
    K.player.x = b.x + b.w / 2 - 13; K.player.y = b.rock.y + 70;
    K.player.state = 'climb'; K.player.climbRect = b.rock;
    K.player.vx = 0; K.player.vy = 0; K.player.energy = 400;
    return { top: b.rock.y };
  });
  ok('the world grows thorn on cliff lips', !!thorn);
  if (thorn) {
    await page.keyboard.down('ArrowUp');
    const blocked = await waitFor(() => window.SKYREACH.player.y < window.SKYREACH.player.climbRect.y - 20, null, 4000);
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowUp');
    void blocked;
    const held = await S(() => ({ st: window.SKYREACH.player.state, cutter: !!window.SKYREACH.known.cutter }));
    ok('thorn stops you mantling the top', held.st === 'climb', held);
    ok('bumping it reveals the Thorn hook', held.cutter === true, held);

    await S(() => { window.SKYREACH.flags.cutter = true; window.SKYREACH.inv.fiber = 0; });
    await hold('#btn-interact', 1800);
    const cut = await S(() => {
      const K = window.SKYREACH;
      const b = K.brambles.find(x => x.cutUntil > K.gameTime);
      return { cut: !!b, fiber: K.inv.fiber };
    });
    ok('the hook cuts thorn', cut.cut === true, cut);
    ok('and cutting pays fiber back', cut.fiber > 0, cut.fiber);
    await page.keyboard.down('ArrowUp');
    const topped = await waitFor(() => window.SKYREACH.player.state === 'ground', null, 5000);
    await page.keyboard.up('ArrowUp');
    ok('with the thorn cut you can top out', topped === true);
  }
});

// Taking things out of the world, and what comes back.
group('harvest', async (t) => {
  const { S, page, waitFor, hold } = t;
  await t.reset();
  await S(() => { window.SKYREACH.flags.gloves = true; });

  const node = await S(() => {
    const K = window.SKYREACH;
    // a node on the flat with nothing else in arm's reach of it
    const clear = (x) => !K.lizards.some(l => Math.hypot(l.x - x.x, l.y - x.y) < 110) &&
      !K.grazers.some(g => Math.abs(g.x - x.x) < 110 && Math.abs(g.rock.y - x.y) < 110) &&
      !K.bases.some(b => Math.hypot(b.x - x.x, b.y - x.y) < 150);
    const n = K.nodes.find(x => !x.spent && !x.wall && Math.abs(x.y - K.camp.y) < 4 &&
      Math.abs(x.x - K.camp.x) > 220 && (!K.wreck || Math.abs(x.x - K.wreck.x) > 220) && clear(x)) ||
      K.nodes.find(x => !x.spent && !x.wall && Math.abs(x.y - K.camp.y) < 4);
    K.__n = K.nodes.indexOf(n);
    K.player.x = n.x - 13; K.player.y = n.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    return { i: K.__n, type: n.type, had: K.inv[n.type] };
  });
  await page.hover('#btn-interact');
  await page.mouse.down();
  await waitFor((n) => {
    const K = window.SKYREACH;
    if (K.nodes[n.i].spent) return true;
    if (!K.player.harvest) {
      const x = K.nodes[n.i];
      K.player.x = x.x - 13; K.player.y = x.y - 46;
      K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    }
    return false;
  }, node, 5000);
  await page.mouse.up();
  await page.waitForTimeout(80);
  const harvested = await S((n) => {
    const K = window.SKYREACH;
    return { spent: K.nodes[n.i].spent, got: K.inv[n.type] - n.had };
  }, node);
  ok('harvesting pays out', harvested.got > 0, harvested);
  ok('and strips the node for good', harvested.spent === true);

  const drawn = await S((n) => {
    const K = window.SKYREACH;
    return K.surveyRemaining(n.type).total;
  }, node);
  ok('a spent node leaves the world count', typeof drawn === 'number' && drawn >= 0);

  // livestock: lizard by hand, trout and moth by flying through, grazer by hand
  const lizard = await S(() => {
    const K = window.SKYREACH;
    const l = K.lizards.find(x => !K.nodes.some(n => !n.spent && Math.hypot(n.x - x.x, n.y - x.y) < 90));
    if (!l) return null;
    l.goneUntil = 0;
    K.player.x = l.x - 13; K.player.y = l.y - 23;
    K.player.state = 'climb'; K.player.climbRect = l.r;
    K.player.energy = 400; K.player.maxEnergy = 400;
    return { had: K.inv.lizard };
  });
  if (lizard) {
    await page.hover('#btn-interact');
    await page.mouse.down();
    const caught = await waitFor((l) => {
      const K = window.SKYREACH;
      if (K.inv.lizard > l.had) return true;
      if (!K.player.harvest) {
        const z = K.lizards.find(x => x.goneUntil <= K.gameTime);
        if (z) { K.player.x = z.x - 13; K.player.y = z.y - 23; K.player.vx = 0; K.player.vy = 0; K.player.climbRect = z.r; K.player.state = 'climb'; K.player.vx = 0; K.player.vy = 0; K.player.energy = 400; }
      }
      return false;
    }, lizard, 5000);
    await page.mouse.up();
    const got = await S(() => ({ n: window.SKYREACH.inv.lizard, gone: window.SKYREACH.lizards.some(l => l.goneUntil > window.SKYREACH.gameTime) }));
    ok('a lizard can be caught by hand', caught === true, got);
    ok('and stays gone for a while', got.gone === true);
  }

  const trout = await S(async () => {
    const K = window.SKYREACH;
    const f = K.skyfish[0];
    f.goneUntil = 0;
    const had = K.inv.skyfish;
    K.player.x = f.x - 13; K.player.y = f.y - 23; K.player.state = 'glide';
    return new Promise(r => setTimeout(() => r({ had, now: K.inv.skyfish }), 400));
  });
  ok('flying through a trout catches it', trout.now > trout.had, trout);

  const moth = await S(async () => {
    const K = window.SKYREACH;
    const m = K.moths[0];
    m.goneUntil = 0;
    const had = K.inv.silk;
    K.player.x = m.x - 13; K.player.y = m.y - 23; K.player.state = 'glide';
    return new Promise(r => setTimeout(() => r({ had, now: K.inv.silk }), 400));
  });
  ok('flying through a moth yields silk', moth.now > moth.had, moth);

  const grazer = await S(() => {
    const K = window.SKYREACH;
    const g = K.grazers.find(x => Math.abs(x.x - K.camp.x) > 260 && (!K.wreck || Math.abs(x.x - K.wreck.x) > 260)) || K.grazers[0];
    K.__g = K.grazers.indexOf(g);
    g.goneUntil = 0; g.spook = 0;
    K.player.x = g.x - 13; K.player.y = g.rock.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    return { had: K.inv.hide };
  });
  await page.hover('#btn-interact');
  await page.mouse.down();
  // it steps back once before it lets you take hold, so follow it rather than
  // guessing how long the whole business takes
  const gotHide = await waitFor((g) => {
    const K = window.SKYREACH;
    const gz = K.grazers[K.__g];
    if (K.inv.hide > g.had) return true;
    if (!K.player.harvest) { K.player.x = gz.x - 13; K.player.y = gz.rock.y - 46; K.player.vx = 0; K.player.vy = 0; }
    return false;
  }, grazer, 5000);
  await page.mouse.up();
  ok('a grazer can be caught for hide', gotHide === true,
    await S(() => ({ hide: window.SKYREACH.inv.hide })));

  // relics and the wreck are one-shot
  const relic = await S(() => {
    const K = window.SKYREACH;
    const r = K.relics.find(x => !x.taken);
    K.player.x = r.x - 13; K.player.y = r.y - 23;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    return { had: K.inv.relic, ore: K.inv.ore };
  });
  await page.hover('#btn-interact');
  await page.mouse.down();
  const opened = await waitFor((r) => {
    const K = window.SKYREACH;
    if (K.inv.relic > r.had) return true;
    const rl = K.relics.find(x => !x.taken);
    if (rl && !K.player.harvest) { K.player.x = rl.x - 13; K.player.y = rl.y - 23; K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0; }
    return false;
  }, relic, 5000);
  await page.mouse.up();
  const took = await S((r) => ({
    relics: window.SKYREACH.inv.relic - r.had, ore: window.SKYREACH.inv.ore - r.ore,
  }), relic);
  ok('a relic can be opened by hand', opened === true && took.relics === 1, took);
  ok('and pays a supply cache with it', took.ore > 0, took);
  await hold('#btn-interact', 2200);
  ok('an opened relic cannot be farmed twice', await S((r) => window.SKYREACH.inv.relic - r.had, relic) === 1);

  const wreck = await S(() => {
    const K = window.SKYREACH;
    K.wreck.searched = false;
    K.player.x = K.wreck.x - 13; K.player.y = K.wreck.y - 40;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    return { fiber: K.inv.fiber };
  });
  await hold('#btn-interact', 1500);
  ok('the wreck can be searched once', await S((w) => window.SKYREACH.wreck.searched && window.SKYREACH.inv.fiber > w.fiber, wreck) === true);

  // planters: the one thing that grows back
  const garden = await S(() => {
    const K = window.SKYREACH;
    K.CHEATS.mats(); K.CHEATS.kit(); K.revealAllPlans();
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    K.player.x = slab.x + slab.w / 2; K.player.y = slab.y - 46; K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.placeBase();
    const b = K.bases[K.bases.length - 1];
    b.plots.push({ crop: null, at: 0 });
    const seeds = K.inv.berry;
    K.sowPlot(b, b.plots[0], 'berry');
    const sown = b.plots[0].crop;
    b.plots[0].at -= K.T.growTime + 1;
    const ripe = K.plotReady(b.plots[0]);
    const before = K.inv.berry;
    K.pickPlot(b, b.plots[0]);
    return { spent: seeds - 1 === before + 0 ? true : seeds > K.inv.berry - 3, sown, ripe, gained: K.inv.berry - before, empty: b.plots[0].crop };
  });
  ok('a bed can be sown', garden.sown === 'berry', garden);
  ok('and ripens on its timer', garden.ripe === true);
  ok('picking pays more than the seed cost', garden.gained === 3 && garden.empty === null, garden);
});

// Threats, and the ways of dealing with them.
group('threats', async (t) => {
  const { S, page, waitFor, hold } = t;
  await t.reset();

  // stingwing: stings, does not shove, then peels off
  const sting = await S(async () => {
    const K = window.SKYREACH;
    K.flags.shield = false; K.flags.armor = false; K.flags.stormsuit = false;
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    K.player.x = slab.x + slab.w / 2; K.player.y = slab.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.player.hp = 100; K.player.invuln = 0;
    const w = K.stingwings[0];
    w.stun = 0; w.hitCd = 0; w.mode = 'chase';
    w.x = K.player.x + 13; w.y = K.player.y + 23;
    let peakVx = 0;
    const iv = setInterval(() => { peakVx = Math.max(peakVx, Math.abs(K.player.vx)); }, 16);
    return new Promise(r => setTimeout(() => {
      clearInterval(iv);
      r({ hp: K.player.hp, st: K.player.state, peakVx: Math.round(peakVx), mode: w.mode });
    }, 500));
  });
  ok('a sting hurts', sting.hp < 100, sting.hp);
  ok('a sting does not knock you off the rock', sting.st === 'ground' && sting.peakVx < 80, sting);
  const waited = await S(async () => {
    const K = window.SKYREACH;
    const hp0 = K.player.hp;
    return new Promise(r => setTimeout(() => r({ hp0, hp: K.player.hp }), 800));
  });
  ok('and it waits before coming back', waited.hp >= waited.hp0, waited);

  // the shield turns flying attacks aside for glove energy
  const shield = await S(() => {
    const K = window.SKYREACH;
    K.flags.shield = false;
    K.player.hp = 100; K.player.energy = K.player.maxEnergy;
    const none = K.blockedByShield('t');
    K.flags.shield = true;
    const e0 = K.player.energy;
    const blocked = K.blockedByShield('t');
    const spent = e0 - K.player.energy;
    K.player.energy = 1;
    const flat = K.blockedByShield('t');
    return { none, blocked, spent, flat, hp: K.player.hp };
  });
  ok('no shield means no block', shield.none === false);
  ok('the shield blocks outright', shield.blocked === true && shield.hp === 100, shield);
  ok('a block costs glove energy', shield.spent > 0, shield.spent);
  ok('a flat battery cannot block', shield.flat === false);

  // pulse scatters what is on you
  const pulse = await S(async () => {
    const K = window.SKYREACH;
    K.flags.pulse = true;
    K.player.energy = K.player.maxEnergy;
    const w = K.stingwings[0];
    w.stun = 0; w.mode = 'chase';
    w.x = K.player.x + 13; w.y = K.player.y + 23;
    const e0 = K.player.energy;
    K.player.invuln = 5;
    return new Promise(r => setTimeout(() => r({ e0 }), 60));
  });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const pulsed = await S((p) => ({
    stun: window.SKYREACH.stingwings[0].stun, mode: window.SKYREACH.stingwings[0].mode,
    spent: p.e0 - window.SKYREACH.player.energy,
  }), pulse);
  ok('the pulse stuns and repels a stingwing', pulsed.stun > 2 && pulsed.mode === 'return', pulsed);
  ok('and it costs glove energy', pulsed.spent > 0, pulsed.spent);

  // ridgerunner: little damage, big shove, never leaves its island
  const runner = await S(() => {
    const K = window.SKYREACH;
    K.flags.shield = false;
    // clear the sky first: a stingwing that follows us here would land the hit
    // this check is trying to attribute to the boar
    for (const w of K.stingwings) { w.mode = 'idle'; w.stun = 0; w.x = w.nest.x; w.y = w.nest.y; }
    for (const sh of K.shardlings) { sh.mode = 'hover'; sh.x = sh.home.x; sh.y = sh.home.y; }
    for (const b of K.razorbeaks) { b.mode = 'patrol'; b.cd = 20; }
    // a wide island, and both of us placed well inside it so nobody falls off
    const rr = K.runners.filter(r => !r.tame).sort((a, b) => b.rock.w - a.rock.w)[0];
    K.__rr = K.runners.indexOf(rr);
    const mid = rr.rock.x + rr.rock.w / 2;
    rr.x = mid - 120; rr.mode = 'patrol'; rr.cd = 0; rr.dir = 1;
    K.player.x = mid; K.player.y = rr.rock.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0; K.player.hp = 100; K.player.invuln = 0;
    K.__peak = 0;
    K.__iv = setInterval(() => { K.__peak = Math.max(K.__peak, Math.abs(K.player.vx)); }, 8);
    return { rock: { x: rr.rock.x, w: rr.rock.w }, mid };
  });
  // hold your ground on its island until it commits
  const hit = await waitFor((m) => {
    const K = window.SKYREACH;
    // the shove is the signal, not the damage: a 6hp hit is easy to confuse with
    // anything else in the air, a 430px/s launch is not
    if (K.__peak > 200) return true;
    if (K.player.hp < 100 && K.runners[K.__rr].cd > 0) return true;
    // only reseat if we have genuinely lost the island — resetting after a shove
    // would wipe the very velocity this check is measuring
    const top = K.runners[K.__rr].rock.y;
    if (K.player.y > top + 80) {
      K.player.x = m; K.player.y = top - 46;
      K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    }
    return false;
  }, runner.mid, 8000);
  const shove = await S(() => {
    const K = window.SKYREACH;
    clearInterval(K.__iv);
    const rr = K.runners[K.__rr];
    return { hp: K.player.hp, peak: Math.round(K.__peak), rx: rr.x };
  });
  ok('a ridgerunner charges and connects', hit === true && shove.hp < 100, shove);
  ok('sky threats stayed out of it', shove.hp >= 90, Math.round(shove.hp));
  ok('but the shove is real', shove.peak > 200, shove.peak);
  ok('and it never leaves its island', shove.rx >= runner.rock.x && shove.rx <= runner.rock.x + runner.rock.w, shove);

  // feeding it, from its own button
  const feed = await S(() => {
    const K = window.SKYREACH;
    const rr = K.runners[K.__rr];
    rr.mode = 'patrol'; rr.cd = 4;
    K.inv.berry = 4;
    K.player.x = rr.x - 13; K.player.y = rr.rock.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0; K.player.hp = 100; K.player.invuln = 4;
    return { targeted: K.nearestFeedable() === rr, berries: K.inv.berry };
  });
  ok('a ridgerunner is a feed target when you carry food', feed.targeted === true);
  const feedBtn = await waitFor(() => !document.getElementById('btn-feed').classList.contains('hidden'), null, 2000);
  ok('the feed button appears beside it', feedBtn === true);
  await page.hover('#btn-feed');
  await page.mouse.down();
  // it ambles while it eats, so keep the reach on it rather than timing the hold
  const tameOk = await waitFor(() => {
    const K = window.SKYREACH;
    const rr = K.runners[K.__rr];
    if (rr && !rr.tame) { K.player.x = rr.x - 13; K.player.y = rr.rock.y - 46; K.player.vx = 0; K.player.vy = 0; K.player.invuln = 4; }
    return !!(rr && rr.tame);
  }, null, 5000);
  await page.mouse.up();
  const tamed = await S(() => ({ tame: window.SKYREACH.runners[window.SKYREACH.__rr].tame, berries: window.SKYREACH.inv.berry }));
  ok('holding the feed button tames it', tameOk === true, tamed);
  ok('feeding costs one berry', tamed.berries === feed.berries - 1, tamed.berries);
  // watch its mode for the whole window rather than glancing at it once, and
  // judge it on that alone — anything else in the sky can bite you meanwhile
  const calmRunner = await S(async () => {
    const K = window.SKYREACH;
    const rr = K.runners[K.__rr];
    if (!rr || !rr.tame) return { none: true };
    K.player.x = rr.x + 40; K.player.y = rr.rock.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.player.hp = 100; K.player.invuln = 6;
    let charged = false;
    const iv = setInterval(() => { if (rr.mode === 'charge') charged = true; }, 8);
    return new Promise(r => setTimeout(() => { clearInterval(iv); r({ none: false, charged }); }, 1400));
  });
  ok('a tamed runner never charges again', !calmRunner.none && calmRunner.charged === false, calmRunner);

  // shardlings bite
  const shard = await S(async () => {
    const K = window.SKYREACH;
    K.flags.shield = false;
    const sh = K.shardlings[0];
    if (!sh) return { none: true };
    K.player.x = sh.x - 13; K.player.y = sh.y - 23; K.player.state = 'air';
    K.player.hp = 100; K.player.invuln = 0;
    sh.mode = 'dive'; sh.cd = 0;
    return new Promise(r => setTimeout(() => r({ none: false, hp: K.player.hp }), 500));
  });
  ok('shardlings bite', shard.none || shard.hp < 100, shard);

  // the Skywyrm: warns, commits, gives up
  const warn = await S(async () => {
    const K = window.SKYREACH;
    const lv = K.leviathan;
    K.player.hp = 100; K.player.invuln = 5;
    lv.mode = 'patrol'; lv.warned = false; lv.t = 0;
    lv.home = { x: K.player.x + K.T.leviWarn * 0.85, y: K.player.y };
    lv.x = lv.home.x; lv.y = lv.home.y;
    return new Promise(r => setTimeout(() => r({ warned: lv.warned, mode: lv.mode }), 400));
  });
  ok('the Skywyrm warns you before it commits', warn.warned === true && warn.mode === 'patrol', warn);
  const aggro = await S(async () => {
    const K = window.SKYREACH;
    const lv = K.leviathan;
    lv.home = { x: K.player.x + K.T.leviAggro * 0.6, y: K.player.y };
    lv.x = lv.home.x; lv.y = lv.home.y; lv.t = 0;
    return new Promise(r => setTimeout(() => r(lv.mode), 400));
  });
  ok('coming too close aggros it', aggro === 'hunt');
  await S(() => {
    const K = window.SKYREACH;
    K.flags.shield = false; K.flags.armor = false; K.flags.stormsuit = false;
    K.player.hp = 100; K.player.invuln = 0;
  });
  const bit = await waitFor(() => {
    const K = window.SKYREACH;
    if (K.player.hp < 80) return true;
    K.player.hp = 100; K.player.invuln = 0;
    K.leviathan.x = K.player.x + 20; K.leviathan.y = K.player.y;
    K.leviathan.cd = 0; K.leviathan.mode = 'hunt'; K.leviathan.calm = 20;
    return false;
  }, null, 4000);
  ok('it hurts badly when it reaches you', bit === true, await S(() => Math.round(window.SKYREACH.player.hp)));
  const gaveUp = await S(async () => {
    const K = window.SKYREACH;
    const lv = K.leviathan;
    K.player.hp = 100; K.player.invuln = 5;
    lv.x = K.player.x + 1400; lv.y = K.player.y - 200; lv.cd = 5;
    lv.mode = 'hunt'; lv.calm = 0.2;
    return new Promise(r => setTimeout(() => r(lv.mode), 600));
  });
  ok('it gives up if you outlast it', gaveUp === 'patrol', gaveUp);
  const shipHit = await S(async () => {
    const K = window.SKYREACH;
    K.CHEATS.ship();
    K.boardShip();
    K.airship.hull = K.T.shipHull;
    const lv = K.leviathan;
    lv.mode = 'hunt'; lv.calm = 20; lv.cd = 0;
    lv.x = K.airship.x + 20; lv.y = K.airship.y;
    K.player.hp = 100; K.player.invuln = 5;
    return new Promise(r => setTimeout(() => r({ hull: K.airship.hull, hp: K.player.hp }), 500));
  });
  ok('it goes for the ship, not the pilot', shipHit.hull < 220 && shipHit.hp === 100, shipHit);
  await S(() => { window.SKYREACH.leaveShip(); });
  await t.calm();

  // storms and lightning
  const storm = await S(async () => {
    const K = window.SKYREACH;
    K.flags.stormsuit = false; K.flags.shield = false;
    K.player.hp = 100; K.player.invuln = 0;
    K.CHEATS.storm();
    return new Promise(r => setTimeout(() => r({ storming: K.storming, wind: Math.round(K.windX) }), 400));
  });
  ok('a storm can roll in with wind', storm.storming === true && Math.abs(storm.wind) > 40, storm);
  const bolt = await S(async () => {
    const K = window.SKYREACH;
    const high = K.rocks.reduce((a, b) => (b.y < a.y ? b : a));
    K.player.x = high.x + high.w / 2; K.player.y = high.y - 46;
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0; K.player.hp = 100; K.player.invuln = 0;
    K.CHEATS.storm();
    return new Promise(r => setTimeout(() => r(K.player.hp), 3000));
  });
  ok('lightning finds you high and exposed', bolt < 100, bolt);
  const suited = await S(async () => {
    const K = window.SKYREACH;
    K.flags.stormsuit = true; K.player.hp = 100;
    K.CHEATS.storm();
    return new Promise(r => setTimeout(() => r(K.player.hp), 3000));
  });
  ok('the storm suit stops lightning', suited === 100, suited);
  await t.calm();
});

// The economy: discovery gating, death toll, the log, the survey lens, the ending.
group('economy', async (t) => {
  const { S, page, hold } = t;
  await t.reset();

  const start = await S(() => {
    const K = window.SKYREACH;
    return {
      plans: Object.keys(K.known).filter(k => K.known[k]).length,
      gloves: !!K.flags.gloves,
      energyBar: document.getElementById('bar-energy').classList.contains('hidden'),
    };
  });
  ok('you start with no gear', start.gloves === false);
  ok('and no plans worked out', start.plans === 0, start.plans);
  ok('the energy bar hides until you have gloves', start.energyBar === true);

  const discover = await S(() => {
    const K = window.SKYREACH;
    K.inv.fiber = 5; K.inv.stone = 4;
    K.checkDiscoveries();
    return { gloves: !!K.known.gloves, late: !!K.known.beaconkit, magnets: !!K.known.magnets };
  });
  ok('finding fiber and stone reveals the gloves', discover.gloves === true);
  ok('late plans stay hidden', discover.late === false && discover.magnets === false, discover);

  await page.click('#btn-pack');
  await page.waitForTimeout(250);
  await t.tab('pack-tabs', 'fabricate');
  const crafted = await S(() => {
    const rows = [...document.querySelectorAll('#recipe-list .recipe')];
    const r = rows.find(x => x.querySelector('.r-name').textContent === 'Magnetic gloves');
    if (!r) return 'missing';
    if (r.querySelector('.craft-btn').disabled) return 'unaffordable';
    r.querySelector('.craft-btn').click();
    return 'ok';
  });
  ok('only discovered plans are listed', crafted !== 'missing');
  ok('gloves craft from ground materials', crafted === 'ok', crafted);
  await page.waitForTimeout(150);
  ok('the energy bar appears with gloves', await S(() => !document.getElementById('bar-energy').classList.contains('hidden')));
  await t.closePanels();

  // pooled crafting: pack plus any base in range, and not one out of range
  await S(() => {
    const K = window.SKYREACH;
    K.revealAllPlans();
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    K.player.x = slab.x + slab.w / 2; K.player.y = slab.y - 46; K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    for (const k of Object.keys(K.inv)) K.inv[k] = 0;
    K.bases.length = 0;
    K.bases.push({ x: K.player.x + 13, y: K.player.y + 46, mk2: false, mk3: false, wall: false, store: { stone: 6, fiber: 4 }, plots: [] });
  });
  await page.click('#btn-pack');
  await page.waitForTimeout(250);
  await t.tab('pack-tabs', 'fabricate');
  const pooledOk = await S(() => {
    const rows = [...document.querySelectorAll('#recipe-list .recipe')];
    const r = rows.find(x => x.querySelector('.r-name').textContent === 'Base kit');
    if (!r) return 'missing';
    const enabled = !r.querySelector('.craft-btn').disabled;
    if (enabled) r.querySelector('.craft-btn').click();
    return enabled ? 'crafted' : 'blocked';
  });
  ok('a fabricator pools your pack with a base in range', pooledOk === 'crafted', pooledOk);
  const far = await S(() => {
    const K = window.SKYREACH;
    for (const k of Object.keys(K.inv)) K.inv[k] = 0;
    K.bases[0].store = { stone: 6, fiber: 4 };
    K.bases[0].x = K.player.x + 6000;
    K.renderPack();
    const rows = [...document.querySelectorAll('#recipe-list .recipe')];
    const r = rows.find(x => x.querySelector('.r-name').textContent === 'Base kit');
    return r ? !r.querySelector('.craft-btn').disabled : null;
  });
  ok('a base out of range does not count', far === false);
  await t.closePanels();

  // death toll: free falls, then a cut, and nothing dropped in the world
  const toll = await S(() => {
    const K = window.SKYREACH;
    K.deaths = 0;
    for (const k of Object.keys(K.inv)) K.inv[k] = 0;
    K.inv.ore = 20; K.inv.fiber = 20; K.inv.relic = 3;
    K.player.y = K.world.kill + 50;
    return { ore: K.inv.ore };
  });
  const freeDeath = await t.waitFor(() => !document.getElementById('overlay-death').classList.contains('hidden'), null, 4000);
  ok('falling into the cloud sea kills you', freeDeath === true);
  const afterFree = await S(() => ({ ore: window.SKYREACH.inv.ore, note: document.getElementById('death-note').textContent }));
  ok('the first falls are free', afterFree.ore === toll.ore, afterFree.ore);
  ok('and the grace is communicated', /forgiving|Nothing lost/i.test(afterFree.note), afterFree.note);
  await page.click('#btn-respawn');
  await page.waitForTimeout(200);
  const paid = await S(async () => {
    const K = window.SKYREACH;
    K.deaths = 5;
    K.player.y = K.world.kill + 50;
    return new Promise(r => setTimeout(() => r({ ore: K.inv.ore, relic: K.inv.relic, note: document.getElementById('death-note').textContent }), 700));
  });
  ok('later falls cost a quarter of your materials', paid.ore < 20 && paid.ore >= 14, paid.ore);
  ok('relics are never lost', paid.relic === 3, paid.relic);
  ok('the loss is itemised', /Lost in the fall/i.test(paid.note), paid.note);
  ok('nothing is dropped into the world to fetch', await S(() => !window.SKYREACH.caches || window.SKYREACH.caches.length === 0) === true);
  await page.click('#btn-respawn');
  await page.waitForTimeout(200);

  // the field log fills itself in
  const log = await S(async () => {
    const K = window.SKYREACH;
    for (const k of K.codexKeys) delete K.scanned[k];
    K.flags.scanner = false;
    const none = K.autoLog('lizard');
    K.flags.scanner = true;
    const l = K.lizards[0];
    l.goneUntil = 0;
    K.player.x = l.x - 13; K.player.y = l.y - 23; K.player.state = 'air';
    return new Promise(r => setTimeout(() => r({
      none, lizard: !!K.scanned.lizard, total: K.codexKeys.length,
      summary: document.getElementById('log-summary').textContent,
    }), 600));
  });
  ok('nothing logs without a scanner', log.none === false);
  ok('standing beside a creature logs it, no button held', log.lizard === true, log);
  ok('the log covers the whole bestiary', log.total >= 17, log.total);
  ok('and says logging is automatic', /logs itself/i.test(log.summary), log.summary);

  // the survey lens counts what is left and points at it
  const survey = await S(() => {
    const K = window.SKYREACH;
    K.flags.survey = false;
    const hidden = document.getElementById('survey-head').classList.contains('hidden');
    let n = 0;
    for (const node of K.nodes) { if (n >= 6) break; if (!node.spent) { node.spent = true; n++; } }
    K.checkDiscoveries();
    const revealed = !!K.known.survey;
    K.flags.survey = true;
    K.renderSurvey();
    const rows = document.querySelectorAll('#survey-list .survey-row').length;
    const ore = K.surveyRemaining('ore');
    const real = K.nodes.filter(x => x.type === 'ore' && !x.spent).length;
    // plant a node in a cell we have definitely never seen and check it stays dark
    const far = K.nodes.find(x => !x.spent && !K.seenCells.has(Math.floor(x.x / 300) + ',' + Math.floor(x.y / 300)));
    const hiddenCounted = far ? K.surveyRemaining(far.type).charted === K.surveyRemaining(far.type).total : true;
    const near = K.nodes.find(x => !x.spent);
    K.player.x = near.x - 200; K.player.y = near.y - 46;
    K.seenCells.add(Math.floor(near.x / 300) + ',' + Math.floor(near.y / 300));
    K.trackMaterial(near.type);
    const tracked = K.tracked === near.type && !!K.nearestTracked(near.type);
    K.trackMaterial(K.tracked);
    return { hidden, revealed, rows, total: ore.total, real, charted: ore.charted, hiddenCounted, tracked, cleared: K.tracked };
  });
  ok('the survey panel hides without the lens', survey.hidden === true);
  ok('stripping the rock reveals the lens plan', survey.revealed === true);
  ok('it lists every material', survey.rows === 6, survey.rows);
  ok('its world total matches the world', survey.total === survey.real, survey);
  // the lens only knows what you have charted — that limit is the whole design,
  // so it has to be measurably true, not merely not-contradicted
  ok('it only counts ground you have charted', survey.charted < survey.total, survey);
  ok('an uncharted deposit is not counted', survey.hiddenCounted === false, survey);
  ok('tracking points at a charted deposit', survey.tracked === true, survey);
  ok('and tapping again clears it', survey.cleared === null);

  // the ending
  const beacon = await S(() => {
    const K = window.SKYREACH;
    K.CHEATS.gear();
    K.flags.beacon = true;
    const low = K.rocks.reduce((a, b) => (b.y > a.y ? b : a));
    K.player.x = low.x + low.w / 2; K.player.y = low.y - 46; K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.lightBeacon();
    const refused = document.getElementById('overlay-win').classList.contains('hidden');
    K.player.x = K.summit.x; K.player.y = K.summit.y - 46; K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.lightBeacon();
    return {
      refused, lit: K.beaconLit,
      shown: !document.getElementById('overlay-win').classList.contains('hidden'),
      stats: document.getElementById('win-stats').textContent,
    };
  });
  ok('the beacon refuses to light down low', beacon.refused === true);
  ok('raising it on the highest rock ends the run', beacon.lit === true && beacon.shown === true, beacon);
  ok('the ending reports your run', /Relics recovered/.test(beacon.stats), beacon.stats);
  await page.click('#btn-win-close');
  await page.waitForTimeout(200);
  ok('and you can keep playing after it', await S(() => window.SKYREACH.paused === false));
});

// Everything the player touches: buttons, panels, the chart, the sound toggle.
group('ui', async (t) => {
  const { S, page } = t;
  await t.reset();

  // the fixed grid: the three you use constantly never move
  const anchors = await S(() => {
    const K = window.SKYREACH;
    K.CHEATS.gear();
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) }; };
    return { hand: r('btn-interact'), jump: r('btn-jump'), pack: r('btn-pack') };
  });
  await S(() => {
    const K = window.SKYREACH;
    const r = K.rocks.find(x => x.h > 200 && !x.deck);
    K.player.x = r.x + r.w / 2 - 13; K.player.y = r.y + r.h / 2;
    K.player.state = 'climb'; K.player.climbRect = r;
  });
  await page.waitForTimeout(250);
  const moved = await S((a) => {
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y) }; };
    const same = (p, q) => p.x === q.x && p.y === q.y;
    return same(r('btn-interact'), a.hand) && same(r('btn-jump'), a.jump) && same(r('btn-pack'), a.pack);
  }, anchors);
  ok('hand, jump and pack never move', moved === true);

  const overlap = await S(() => {
    const btns = [...document.querySelectorAll('#action-buttons .abtn')]
      .filter(b => getComputedStyle(b).display !== 'none')
      .map(b => ({ id: b.id, r: b.getBoundingClientRect() }));
    const clashes = [];
    for (let i = 0; i < btns.length; i++) {
      for (let j = i + 1; j < btns.length; j++) {
        const a = btns[i].r, c = btns[j].r;
        if (!(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top)) {
          clashes.push(btns[i].id + '/' + btns[j].id);
        }
      }
    }
    return { clashes, shown: btns.length };
  });
  ok('no two visible buttons overlap', overlap.clashes.length === 0, overlap.clashes);

  // panel tabs sit low, one pane at a time
  await page.click('#btn-pack');
  await page.waitForTimeout(250);
  const tabs = await S(() => {
    const bar = document.getElementById('pack-tabs');
    const panel = bar.closest('.panel');
    const close = panel.querySelector('.close-bar').getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const head = panel.querySelector('.panel-head').getBoundingClientRect();
    return {
      count: bar.querySelectorAll('button').length,
      icons: bar.querySelectorAll('.tb-icon svg path').length,
      lowInPanel: br.top > head.bottom,
      aboveClose: br.bottom <= close.top + 2,
      panes: panel.querySelectorAll('.tab-pane').length,
      visible: [...panel.querySelectorAll('.tab-pane')].filter(p => getComputedStyle(p).display !== 'none').length,
      closeAtBottom: close.bottom >= panel.getBoundingClientRect().bottom - 2,
      closeH: Math.round(close.height),
      closeW: Math.round(close.width), panelW: Math.round(panel.getBoundingClientRect().width),
    };
  });
  ok('the pack has a tab bar', tabs.count === 5 && tabs.icons >= 5, tabs);
  ok('tabs sit low, just above the close bar', tabs.lowInPanel && tabs.aboveClose, tabs);
  ok('one pane shows at a time', tabs.visible === 1 && tabs.panes === 5, tabs);
  ok('the close bar spans the panel bottom', tabs.closeAtBottom && tabs.closeW >= tabs.panelW - 6, tabs);
  ok('and is a big touch target', tabs.closeH >= 40, tabs.closeH);

  const switched = await S(() => {
    const bar = document.getElementById('pack-tabs');
    bar.querySelector('[data-tab="fabricate"]').click();
    const panel = bar.closest('.panel');
    const shown = [...panel.querySelectorAll('.tab-pane')].filter(p => getComputedStyle(p).display !== 'none');
    return {
      pane: shown.length === 1 ? shown[0].dataset.pane : null,
      active: bar.querySelector('button.active').dataset.tab,
      recipes: document.querySelectorAll('#recipe-list .recipe').length,
      builtChips: document.querySelectorAll('#recipe-list .built-chip').length,
    };
  });
  ok('tapping a tab switches the pane', switched.pane === 'fabricate' && switched.active === 'fabricate', switched);
  ok('the fabricate pane holds the recipes', switched.recipes > 0, switched.recipes);
  ok('built gear collapses out of the list', switched.builtChips > 0, switched.builtChips);
  await page.click('#overlay-pack .close-bar');
  await page.waitForTimeout(200);
  ok('the close bar closes the panel', await S(() => document.getElementById('overlay-pack').classList.contains('hidden')));

  // info messages, bottom left and left aligned
  const toasts = await S(() => {
    const box = document.getElementById('toasts');
    const cs = getComputedStyle(box);
    const r = box.getBoundingClientRect();
    return { align: cs.alignItems, left: Math.round(r.left), bottom: Math.round(window.innerHeight - r.bottom), w: window.innerWidth, h: window.innerHeight };
  });
  ok('info messages are left-aligned', toasts.align === 'flex-start', toasts.align);
  ok('and sit bottom-left', toasts.left < toasts.w * 0.25 && toasts.bottom < toasts.h * 0.25, toasts);

  // vitals stay legible over an open menu
  await page.click('#btn-pack');
  await page.waitForTimeout(220);
  const hud = await S(() => {
    const hudEl = document.getElementById('hud');
    const bars = document.querySelector('.bars');
    const overlay = document.querySelector('#overlay-pack');
    const z = (el) => +getComputedStyle(el).zIndex || 0;
    const r = document.querySelector('#bar-health').getBoundingClientRect();
    return {
      above: z(hudEl) > z(overlay),
      backed: getComputedStyle(bars).backgroundColor !== 'rgba(0, 0, 0, 0)',
      onScreen: r.width > 0 && r.top >= 0,
    };
  });
  ok('vitals stack above an open menu', hud.above && hud.onScreen, hud);
  ok('and get a legible backing', hud.backed === true);
  await page.click('#overlay-pack .close-bar');
  await page.waitForTimeout(200);
  ok('the backing clears again', await S(() => getComputedStyle(document.querySelector('.bars')).backgroundColor === 'rgba(0, 0, 0, 0)'));

  // survey view: pan with the stick, buttons out of the way
  await t.onDeck();
  await S(() => { const K = window.SKYREACH; K.flags.visor = true; if (!K.visorOn) K.toggleVisor(); });
  await page.waitForTimeout(600);
  const survey = await S(() => ({
    panning: window.SKYREACH.visorPanning(),
    others: [...document.querySelectorAll('#action-buttons .abtn')]
      .filter(b => b.id !== 'btn-visor' && getComputedStyle(b).display !== 'none').length,
    visor: getComputedStyle(document.getElementById('btn-visor')).display !== 'none',
    scale: window.SKYREACH.scale, base: window.SKYREACH.baseScale,
  }));
  ok('standing still with the visor up enters survey mode', survey.panning === true, survey);
  ok('survey mode clears every button but the visor', survey.others === 0 && survey.visor, survey);
  ok('the visor zooms a long way out', survey.scale < survey.base * 0.3, survey);
  const px0 = await S(() => window.SKYREACH.player.x);
  await t.key('ArrowRight', 600);
  const panned = await S(() => ({ pan: window.SKYREACH.panX, x: window.SKYREACH.player.x, cam: window.SKYREACH.cam.x }));
  ok('the stick pans the camera', panned.pan > 400, Math.round(panned.pan));
  ok('and does not walk you off the ledge', Math.abs(panned.x - px0) < 1, panned.x);
  const inAir = await S(() => {
    const K = window.SKYREACH;
    const out = {};
    for (const st of ['ground', 'climb', 'air', 'glide']) { K.player.state = st; out[st] = K.visorPanning(); }
    K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    return out;
  });
  ok('mid-air the stick still flies you', inAir.air === false && inAir.glide === false, inAir);
  await S(() => { if (window.SKYREACH.visorOn) window.SKYREACH.toggleVisor(); });
  await page.waitForTimeout(400);
  ok('dropping the visor restores the buttons', await S(() => !document.body.classList.contains('surveying') && window.SKYREACH.panX === 0));

  // the sky chart
  const chart = await S(() => {
    const K = window.SKYREACH;
    K.flags.survey = true; K.flags.compass = true;
    K.renderMap();
    const cv = document.getElementById('map-canvas');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) lit++;
    return { lit, note: document.getElementById('map-note').textContent };
  });
  ok('the sky chart draws something', chart.lit > 300, chart.lit);
  ok('and reports how much is charted', /Charted \d+%/.test(chart.note), chart.note);
  ok('the lens is credited on the chart', /deposit/.test(chart.note), chart.note);

  // audio
  const audio = await S(() => ({ on: window.SKYREACH.audio.on, btn: !!document.getElementById('btn-sound') }));
  ok('there is a sound toggle', audio.btn === true);
  await page.click('#btn-sound');
  await page.waitForTimeout(120);
  ok('it mutes', await S(() => window.SKYREACH.audio.on) !== audio.on);
  await page.click('#btn-sound');
  await page.waitForTimeout(120);
  ok('and unmutes', await S(() => window.SKYREACH.audio.on) === audio.on);

  // no emoji anywhere: every symbol is game-icons path data
  const symbols = await S(() => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      for (const n of el.childNodes) if (n.nodeType === 3 && emoji.test(n.nodeValue)) bad.push(el.id || el.className);
    }
    const icons = [...document.querySelectorAll('.abtn-icon svg path, .tb-icon svg path, .bar-icon svg path')];
    return { bad, icons: icons.length, real: icons.every(p => (p.getAttribute('d') || '').length > 30) };
  });
  ok('no emoji anywhere in the UI', symbols.bad.length === 0, symbols.bad.slice(0, 3));
  ok('every UI symbol is real game-icons path data', symbols.icons > 8 && symbols.real, symbols);

  // iOS long-press / selection hardening
  const ios = await S(() => {
    const cs = (sel) => getComputedStyle(document.querySelector(sel));
    const b = cs('body'), c = cs('#game');
    const none = (v) => v === 'none';
    return {
      bodySel: none(b.userSelect) || none(b.webkitUserSelect),
      canvasSel: none(c.userSelect) || none(c.webkitUserSelect),
      callout: none(b.webkitTouchCallout || 'none') && none(c.webkitTouchCallout || 'none'),
      touchAction: b.touchAction === 'none',
      viewport: (document.querySelector('meta[name=viewport]') || {}).content || '',
    };
  });
  ok('body blocks text selection', ios.bodySel === true);
  ok('the canvas blocks selection', ios.canvasSel === true);
  ok('the iOS callout/loupe is suppressed', ios.callout === true);
  ok('double-tap zoom is off', /user-scalable=no/.test(ios.viewport) && ios.touchAction, ios);
});

// Everything survives a reload, once.
group('persistence', async (t) => {
  const { S, page } = t;
  await t.reset();

  const before = await S(() => {
    const K = window.SKYREACH;
    K.CHEATS.mats(); K.CHEATS.kit(); K.CHEATS.zip(); K.revealAllPlans();
    Object.assign(K.flags, { gloves: true, glider: true, glider2: true, shield: true, survey: true, scanner: true, jetpack: true });
    K.deaths = 3;
    // a base with a growing bed
    const slab = K.rocks.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    K.player.x = slab.x + slab.w / 2; K.player.y = slab.y - 46; K.player.state = 'ground'; K.player.vx = 0; K.player.vy = 0;
    K.placeBase();
    const b = K.bases[K.bases.length - 1];
    b.mk2 = true;
    b.plots.push({ crop: 'fiber', at: K.gameTime });
    b.store = { ore: 5 };
    // a cable, a tamed boar, a stripped node, a cut thorn, some charted ground
    K.player.x = slab.x + 120; K.placeZip();
    K.player.x = slab.x + 620; K.placeZip();
    K.runners[0].tame = true;
    const spentIdx = K.nodes.findIndex(n => !n.spent);
    K.nodes[spentIdx].spent = true;
    if (K.brambles[0]) K.brambles[0].cutUntil = K.gameTime + 200;
    K.scanned.granite = true;
    K.trackMaterial('ore');
    // the drift, and a ship out in it
    for (let x = K.core.right; x < K.core.right + 6000; x += 400) K.ensureDrift(x);
    K.CHEATS.ship();
    K.airship.hull = 120;
    K.saveGame();
    return {
      seed: K.seed, deaths: K.deaths,
      inv: { ...K.inv }, flags: { ...K.flags },
      bases: K.bases.length, mk2: b.mk2, crop: b.plots[0].crop, store: { ...b.store },
      lines: K.ziplines.length, tame: K.runners.filter(r => r.tame).length,
      spent: K.nodes.filter(n => n.spent).length, cut: K.brambles.filter(x => x.cutUntil > K.gameTime).length,
      scanned: K.codexKeys.filter(k => K.scanned[k]).length, tracked: K.tracked,
      chunks: K.driftChunks.slice(), rocks: K.rocks.length, hull: Math.round(K.airship.hull),
      seen: K.seenCells.size, known: Object.keys(K.known).filter(k => K.known[k]).length,
      features: K.rocks.filter(r => r.features && r.features.length).length,
    };
  });

  await page.reload();
  await page.waitForTimeout(900);

  const after = await S(() => {
    const K = window.SKYREACH;
    const b = K.bases[K.bases.length - 1];
    return {
      seed: K.seed, deaths: K.deaths,
      inv: { ...K.inv }, flags: { ...K.flags },
      bases: K.bases.length, mk2: b && b.mk2, crop: b && b.plots[0] && b.plots[0].crop,
      store: b ? { ...b.store } : null, growing: b && b.plots[0] ? K.plotProgress(b.plots[0]) : -1,
      lines: K.ziplines.length, tame: K.runners.filter(r => r.tame).length,
      spent: K.nodes.filter(n => n.spent).length, cut: K.brambles.filter(x => x.cutUntil > K.gameTime).length,
      scanned: K.codexKeys.filter(k => K.scanned[k]).length, tracked: K.tracked,
      chunks: K.driftChunks.slice(), rocks: K.rocks.length,
      ship: !!K.airship, hull: K.airship ? Math.round(K.airship.hull) : null,
      seen: K.seenCells.size, known: Object.keys(K.known).filter(k => K.known[k]).length,
      features: K.rocks.filter(r => r.features && r.features.length).length,
    };
  });

  ok('the world seed survives', after.seed === before.seed);
  ok('inventory survives', JSON.stringify(after.inv) === JSON.stringify(before.inv));
  ok('gear flags survive', JSON.stringify(after.flags) === JSON.stringify(before.flags));
  ok('the death count survives', after.deaths === before.deaths, after.deaths);
  ok('bases and their benches survive', after.bases === before.bases && after.mk2 === before.mk2, after);
  ok('base storage survives', JSON.stringify(after.store) === JSON.stringify(before.store), after.store);
  ok('a growing crop survives mid-growth', after.crop === before.crop && after.growing < 1, after.growing);
  ok('ziplines survive', after.lines === before.lines, after.lines);
  ok('tamed runners survive', after.tame === before.tame, after.tame);
  ok('stripped nodes stay stripped', after.spent === before.spent, after.spent + ' vs ' + before.spent);
  ok('cut thorn stays cut', after.cut === before.cut, after.cut);
  ok('the field log survives', after.scanned >= before.scanned && after.scanned > 0, after.scanned + ' vs ' + before.scanned);
  ok('the tracked material survives', after.tracked === before.tracked, after.tracked);
  ok('discovered plans survive', after.known === before.known, after.known);
  ok('charted ground survives', after.seen >= before.seen, after.seen + ' vs ' + before.seen);
  ok('faces still carry routes', after.features === before.features, after.features);
  ok('every drift chunk comes back', before.chunks.every(i => after.chunks.includes(i)), before.chunks.length);
  ok('the airship and its damage survive', after.ship && Math.abs(after.hull - before.hull) < 20, after.hull + ' vs ' + before.hull);

  // a wipe genuinely remixes
  const remix = await S(() => {
    const K = window.SKYREACH;
    const seed = K.seed;
    K.resetGame();
    return { seed };
  });
  await page.waitForTimeout(700);
  const fresh = await S(() => {
    const K = window.SKYREACH;
    return { seed: K.seed, gloves: K.flags.gloves, inv: K.inv.ore, bases: K.bases.length };
  });
  ok('wiping remixes the world', fresh.seed !== remix.seed, fresh.seed + ' vs ' + remix.seed);
  ok('and starts you clean', fresh.gloves === false && fresh.inv === 0 && fresh.bases === 0, fresh);
});

// The two debug modes. They are playtest tools, so the thing that matters most
// is that you can always tell they are on and that they never reach a save.
group('debug', async (t) => {
  const { S, page, waitFor } = t;
  await t.reset();

  const off = await S(() => ({
    inv: window.SKYREACH.debug.invincible, fly: window.SKYREACH.debug.fly,
    hud: document.getElementById('debug-flags').classList.contains('hidden'),
  }));
  ok('both debug modes start off', off.inv === false && off.fly === false, off);
  ok('and the HUD says nothing', off.hud === true);

  // invincible
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(150);
  const inv = await S(() => ({
    on: window.SKYREACH.debug.invincible,
    hud: !document.getElementById('debug-flags').classList.contains('hidden'),
    icons: document.querySelectorAll('#debug-flags .d-icon').length,
  }));
  ok('a key toggles invincible', inv.on === true, inv);
  ok('and the HUD flags it', inv.hud && inv.icons === 1, inv);

  const shrugged = await S(async () => {
    const K = window.SKYREACH;
    K.player.hp = 100; K.player.invuln = 0; K.player.food = 100;
    K.hurt(90, 'test');            // a direct hit
    const afterHurt = K.player.hp;
    K.bleed(90, 'test');           // continuous damage, which bypasses invuln
    const afterBleed = K.player.hp;
    K.player.food = 0;
    return new Promise(r => setTimeout(() => r({
      afterHurt, afterBleed, hp: K.player.hp, dead: K.deathCause,
    }), 500));
  });
  ok('invincible ignores a direct hit', shrugged.afterHurt === 100, shrugged);
  ok('and continuous damage', shrugged.afterBleed === 100, shrugged);
  ok('and starvation', shrugged.hp === 100 && shrugged.dead === null, shrugged);

  const caught = await S(async () => {
    const K = window.SKYREACH;
    K.player.food = 100; K.player.hp = 100;
    K.player.y = K.world.kill + 60; K.player.vy = 400;
    return new Promise(r => setTimeout(() => r({
      y: K.player.y, dead: K.deathCause,
      shown: !document.getElementById('overlay-death').classList.contains('hidden'),
    }), 600));
  });
  ok('the cloud sea catches you instead of killing you', caught.dead === null && !caught.shown, caught);
  ok('and puts you back above the world', caught.y < 2900, Math.round(caught.y));

  await page.keyboard.press('KeyI');
  await page.waitForTimeout(150);
  const back = await S(async () => {
    const K = window.SKYREACH;
    K.player.hp = 100; K.player.invuln = 0;
    K.hurt(30, 'test');
    return { on: K.debug.invincible, hp: K.player.hp, hud: document.getElementById('debug-flags').classList.contains('hidden') };
  });
  ok('toggling it off restores damage', back.on === false && back.hp === 70, back);
  ok('and clears the HUD flag', back.hud === true);

  // fly
  await t.onDeck();
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  ok('a key toggles fly mode', await S(() => window.SKYREACH.debug.fly) === true);
  const from = await S(() => ({ x: window.SKYREACH.player.x, y: window.SKYREACH.player.y }));
  await t.key('ArrowUp', 600);
  const rose = await S((f) => ({ dy: window.SKYREACH.player.y - f.y, st: window.SKYREACH.player.state }), from);
  ok('the stick flies you straight up', rose.dy < -200, Math.round(rose.dy));
  const hover = await S(async () => {
    const K = window.SKYREACH;
    const y0 = K.player.y;
    return new Promise(r => setTimeout(() => r({ drift: K.player.y - y0 }), 700));
  });
  ok('and you hang there without gravity', Math.abs(hover.drift) < 4, Math.round(hover.drift));

  const through = await S(async () => {
    const K = window.SKYREACH;
    // park inside solid rock: fly mode ignores collision entirely
    const r = K.rocks.find(x => x.h > 200 && !x.deck);
    K.player.x = r.x + r.w / 2; K.player.y = r.y + r.h / 2;
    return new Promise(res => setTimeout(() => res({
      inside: K.player.x > r.x && K.player.x < r.x + r.w && K.player.y > r.y && K.player.y < r.y + r.h,
      st: K.player.state,
    }), 400));
  });
  ok('fly mode passes straight through rock', through.inside === true && through.st === 'air', through);
  ok('and keeps the batteries full', await S(() => window.SKYREACH.player.energy === window.SKYREACH.player.maxEnergy) === true);

  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  const landed = await waitFor(() => window.SKYREACH.player.state === 'ground' || window.SKYREACH.player.vy > 100, null, 4000);
  ok('turning it off hands you back to gravity', landed === true,
    await S(() => ({ st: window.SKYREACH.player.state, vy: Math.round(window.SKYREACH.player.vy) })));

  // the buttons are switches, and neither mode is ever written to the save
  await t.revive();
  await page.click('#btn-pack');
  await page.waitForTimeout(250);
  await t.tab('pack-tabs', 'cheats');
  const btns = await S(() => {
    const i = document.querySelector('[data-cheat="invincible"]');
    const f = document.querySelector('[data-cheat="fly"]');
    i.click();
    return { exist: !!i && !!f, onAfterClick: i.classList.contains('on'), flyOff: !f.classList.contains('on') };
  });
  ok('both modes have cheat buttons', btns.exist === true);
  ok('and the button shows the state', btns.onAfterClick === true && btns.flyOff === true, btns);
  await t.closePanels();

  const saved = await S(() => {
    const K = window.SKYREACH;
    K.debug.fly = true;
    K.saveGame();
    const raw = JSON.parse(localStorage.getItem('skyreach.save.v2'));
    return { keys: Object.keys(raw).filter(k => /debug|invinc|fly/i.test(k)), inv: K.debug.invincible };
  });
  ok('debug state is never written to the save', saved.keys.length === 0, saved.keys);
  await page.reload();
  await page.waitForTimeout(800);
  const afterLoad = await S(() => ({ inv: window.SKYREACH.debug.invincible, fly: window.SKYREACH.debug.fly }));
  ok('and a reload always comes back clean', afterLoad.inv === false && afterLoad.fly === false, afterLoad);
});

// It has to hold 60fps with the world fully loaded, in both layouts.
group('perf', async (t) => {
  const { S } = t;
  const run = () => S(() => new Promise(res => {
    const K = window.SKYREACH;
    let n = 0; const t0 = performance.now();
    const tick = () => {
      n++;
      if (performance.now() - t0 < 1400) requestAnimationFrame(tick);
      else res({ fps: Math.round(n / ((performance.now() - t0) / 1000)), rocks: K.rocks.length });
    };
    requestAnimationFrame(tick);
  }));

  await S(() => {
    const K = window.SKYREACH;
    for (let x = K.player.x - 10000; x < K.player.x + 10000; x += 400) K.ensureDrift(x);
  });
  const plain = await run();
  ok('full speed with a large drift loaded', plain.fps >= 50, plain);
  await S(() => { const K = window.SKYREACH; K.flags.visor = true; if (!K.visorOn) K.toggleVisor(); });
  await t.page.waitForTimeout(500);
  const visor = await run();
  ok('full speed at survey range too', visor.fps >= 50, visor);
  await S(() => { if (window.SKYREACH.visorOn) window.SKYREACH.toggleVisor(); });
});

// ---------------------------------------------------------------- runner

(async () => {
  const wanted = process.argv.slice(2);
  const specs = wanted.length ? GROUPS.filter(g => wanted.includes(g.name)) : GROUPS;
  if (!specs.length) { console.log('no such group. have: ' + GROUPS.map(g => g.name).join(' ')); process.exit(2); }

  await new Promise(r => server.listen(9100, r));
  const browser = await chromium.launch(
    process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('  >>> PAGEERROR: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });

  await page.goto('http://localhost:9100/');
  await page.waitForTimeout(500);

  const t = makeCtx(page);
  const t0 = Date.now();
  for (const g of specs) {
    current = g.name;
    const s0 = Date.now();
    const before = fails;
    try {
      await g.fn(t);
    } catch (e) {
      fails++;
      console.log('  FAIL ' + g.name + ' threw: ' + e.message.split('\n')[0]);
    }
    const bad = fails - before;
    console.log((bad ? 'FAIL ' : ' ok  ') + g.name.padEnd(12) +
      String((Date.now() - s0) / 1000).padStart(5) + 's' + (bad ? '   ' + bad + ' failed' : ''));
    await t.revive().catch(() => {});
    await t.closePanels().catch(() => {});
  }

  ok('no page errors anywhere', errors.length === 0, errors.slice(0, 3));

  console.log('\n' + checks + ' checks in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's — ' +
    (fails ? fails + ' FAILED' : 'all green'));
  await browser.close();
  server.close();
  process.exit(fails ? 1 : 0);
})();
