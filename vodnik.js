// MATÚŠKO KOMBAT XII — modul vodnik: VODNÍK zo slovenských rozprávok (BUBLINA, HRNČEK S DUŠOU, MLÁKA) (P7)
//
//   BUBLINA ......... ♪               pomalá bublina; zásah = súper ~1,5 s pláva v bubline hore, potom praskne a súper padne
//   HRNČEK S DUŠOU .. ↓ VPRED ÚDER    hodí hrnček; zásah ukradne ~8 HP, dušička priletí k Vodníkovi a ten ich získa
//   MLÁKA ........... ↓ ↓ KOP         vyleje vodu pred seba (~5 s); súper, ktorý do nej vojde alebo na ňu dopadne, sa pošmykne
//   DOMA PRI VODE ... pasívne         v arénach POTOK a MORE: +25 % poškodenie, rýchlejšie schopnosti, banner VODNÍK JE DOMA!
//   Zo šosu mu stále kvapká voda.
//
// Sprity 'vodnik' (idle walk jump punch kick uppercut sweep block hit fall dizzy win bubble cup pour): bubble = fúka z dlaní
// pri ústach, cup = hod hrnčekom (vrchol podľa peak), pour = vyleje vodu z klobúka (prúd je v sprite, klobúk drží za sebou,
// preto sa počas vylievania otočí, aby mláka vznikla pred ním). Bez sady sa kreslí Šimonovými spritmi so zelenou paletou.
// Schopnosti sa viažu na def.p7 === 'vodnik' (kópia s inou paletou ich zdedí). Sieťová hra: stav len ako čisté dáta
// v F.p7v a vo bojovníkoch (f.p7v, f.p7bub); logika beží len u hostiteľa, hosť kreslí zo stavu.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'vodnik',
  init(api) {
    const { W, GROUND, MOVE, FA, IMG, hooks, ctx } = api;
    const { rnd, chance, clamp } = api;

    // ================================================================ ladenie (snímky pri 60 fps)
    const GRAV = 0.38;                                          // gravitácia z game.js
    const BUB_CD = 360, BUB_V = 2.0, BUB_T = 90, BUB_RISE = 62, BUB_DMG = 6, BUB_R = 13;
    const CUP_CD = 300, CUP_DMG = 8, CUP_VX = 4.4, CUP_VY = -2.6, CUP_G = 0.15, SOUL_T = 38;
    const POOL_CD = 420, POOL_T = 300, POOL_W = 80, SLIP_DMG = 5;
    const HOME = ['potok', 'more'], HOME_DMG = 1.25, HOME_CD = 0.75;
    const SEQ_GAP = 30;
    const WATER = { deep: '#2f7fd8', mid: '#5fb0f0', light: '#bfe8ff', soul: '#7fd4ff' };

    // ================================================================ postava
    const own = !!(FA.vodnik && FA.vodnik.anims && FA.vodnik.anims.idle);
    const DEF = {
      p7: 'vodnik', name: 'VODNÍK', special: 'heligonka', specialName: 'BUBLINA', finisher: 'babality', moveSpecial: null,
      gi: '#2f8a3c', giDark: '#1d5a27', belt: '#d9b13a', hair: '#2b4d2a',
      blurb: ['Vodník z mlynského náhonu.', 'BUBLINA, HRNČEK S DUŠOU', 'a MLÁKA. Pri vode je doma.'],
      ladderStage: 'potok',                                   // v rebríčku najradšej doma pri vode (ladder.js)
      ...(own ? { height: 142 } : { sprites: 'simon', palette: 'vodnik', scale: 1.05, height: 145 }),
    };
    // kde vzniká bublina / hrnček / mláka vzhľadom na chodidlá (podľa spritov; náhrada = Šimonove KIAI a úder)
    const POSE = own ? { mouth: [30, -112], cup: [56, -108], pool: 72, flipPour: true, stream: false }
                     : { mouth: [34, -90], cup: [34, -106], pool: 64, flipPour: false, stream: true };
    api.registerFighter('vodnik', DEF, false);
    // náhradná zelená paleta (kompozitné režimy, fungujú aj bez ctx.filter): frak aj vlasy do zelena, pleť do bledozelena
    api.registerPalette('vodnik', (x, w, h) => {
      const src = document.createElement('canvas'); src.width = w; src.height = h;
      src.getContext('2d').drawImage(x.canvas, 0, 0);
      const step = (mode, fill) => { x.globalCompositeOperation = mode; x.fillStyle = fill; x.fillRect(0, 0, w, h); };
      step('hue', '#2fa84a');
      step('multiply', '#d2ecd0');
      step('soft-light', '#1e6b3a');
      x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-over';
    });

    // ================================================================ pohyby (stav = názov animácie; bez spritov náhrada)
    Object.assign(MOVE, {
      bubble: { startup: 18, active: 12, recovery: 18 },        // ruky k ústam, fúka, bublina sa odlepí na konci fúkania
      cup:    { startup: 22, active: 6, recovery: 12 },         // nápriah, hod vo vrchole (peak), dobeh
      pour:   { startup: 24, active: 10, recovery: 22 },        // zloží klobúk, leje, nasadí späť
    });
    const SPAWN = { bubble: MOVE.bubble.startup + MOVE.bubble.active, cup: MOVE.cup.startup, pour: MOVE.pour.startup + 4 };
    for (const s of ['bubble', 'cup', 'pour']) api.ATTACK_STATES.add(s);
    api.animFallback('bubble', 'kiai'); api.animFallback('cup', 'punch'); api.animFallback('pour', 'kiai');
    api.animFallback('bubbled', 'dizzy');                        // súper v bubline

    // ================================================================ zvuky (Master dodá bubble, pop, splash, soul, slip)
    const has = n => !!(api.A && api.A.sounds && api.A.sounds[n]);
    const ALT = { bubble: [['whoosh', 0.45], ['notes', 0.3]], pop: [['block', 0.7]], splash: [['fall', 0.45], ['whoosh', 0.35]],
                  soul: [['notes', 0.55], ['confirm', 0.3]], slip: [['whoosh', 0.6], ['fall', 0.5]] };
    function snd(n, v = 0.8) { if (has(n)) api.sfx(n, v); else for (const [k, w] of ALT[n] || [[n, v]]) api.sfx(k, w * v / 0.8); }

    // ================================================================ pomôcky
    const isV = f => !!(f && f.def && f.def.p7 === 'vodnik');
    const fight = () => api.fight;
    const host = () => api.NET.role !== 'guest';
    const live = F => !!(F && api.scene === 'fight' && !F.paused);
    const home = F => !!(F && F.stage && HOME.includes(F.stage.id));
    const dmg = (F, n) => home(F) ? Math.round(n * HOME_DMG) : n;
    const cool = (F, n) => home(F) ? Math.round(n * HOME_CD) : n;
    const HEIGHT = f => (f.def && f.def.height) || 138;
    const S = f => (f.def && f.def.scale) || 1;
    const newUse = () => ({ bubble: 0, cup: 0, pour: 0, trap: 0, popBlocked: 0, cupHit: 0, stolen: 0, slip: 0 });
    function st(F) {
      if (!F.p7v) F.p7v = { proj: [], pools: [], souls: [], texts: [], air: [false, false], used: [newUse(), newUse()] };
      return F.p7v;
    }
    function vs(f) { return f.p7v || (f.p7v = { cdC: 0, cdP: 0, ai: 0, chase: null, last: null }); }
    const seq = (inp, s) => !!(inp && inp.history && api.matchSeq(inp, s, SEQ_GAP));
    function hitFrom(a, d, m, dir) {       // zásah zo smeru strely: blok aj odhodenie podľa smeru
      const f0 = a.facing; a.facing = dir;
      try { api.applyHit(a, d, m); } finally { a.facing = f0; }
    }
    const blockingFrom = (o, dir) => (o.state === 'block' || o.state === 'blockstun') && o.facing === -dir;
    function say(F, txt, x, y, c = WATER.light, life = 50, size = 12) { st(F).texts.push({ txt, x, y, c, t: 0, life, size }); }
    function drops(F, x, y, n, up = 2.2) {
      for (let i = 0; i < n; i++) F.fx.push({ kind: 'p7drop', x: x + rnd(-10, 10), y: y + rnd(-6, 6), vx: rnd(-1.8, 1.8), vy: -rnd(0.6, up), t: 0, life: Math.round(rnd(18, 30)) });
    }

    // ================================================================ schopnosti
    function startMove(f, o, mv) {
      const F = fight(); if (!F || F.phase !== 'fight' || !isV(f)) return false;
      const V = st(F), g = vs(f);
      switch (mv) {
        case 'bubble':
          if (f.cd.special > 0) return false;
          f.set('bubble', 'bubble'); f.cd.special = cool(F, BUB_CD);
          break;
        case 'cup':
          if (g.cdC > 0) return false;
          f.set('cup', 'cup'); g.cdC = cool(F, CUP_CD);
          break;
        case 'pour':
          if (g.cdP > 0) return false;
          f.set('pour', 'pour'); g.cdP = cool(F, POOL_CD);
          if (POSE.flipPour) f.facing = o.x >= f.x ? -1 : 1;    // klobúk drží za sebou → otočí sa, prúd dopadne pred neho
          break;
        default: return false;
      }
      f.vx = 0;
      V.used[f.side][mv]++;
      return true;
    }
    const at = (f, p, dir = f.facing) => ({ x: f.x + dir * p[0] * S(f), y: f.y + p[1] * S(f) });
    const toward = (f, o) => (o && o.x < f.x ? -1 : 1);
    function release(F, f) { f.p7bub = null; f.set('fall'); f.vx = 0; f.vy = 0; }
    function trap(F, o, side) {
      o.set('bubbled'); o.p7bub = { s: side, y0: Math.min(o.y, GROUND), at: api.frame };
      o.vx = 0; o.vy = 0; o.stun = 0;
      st(F).used[side].trap++;
      snd('bubble', 0.7); say(F, 'BLUB!', o.x, o.y - HEIGHT(o) - 24, WATER.light, 40, 13);
    }
    function pop(F, f) {                   // bublina praskne: súper padne a dostane malé poškodenie
      const b = f.p7bub; f.p7bub = null;
      const a = b ? F.fighters[b.s] : null;
      drops(F, f.x, f.y - 72, 14, 3);
      if (F.phase === 'fight' && a) {
        const dir = f.x >= a.x ? 1 : -1;
        hitFrom(a, f, { name: 'vodnik_bubble', dmg: dmg(F, BUB_DMG), blockable: false, launch: 2, push: 1.5, hitstun: 16,
                        sound: has('pop') ? 'pop' : 'block', sx: f.x, sy: f.y - 80 }, dir);
        say(F, 'PUK!', f.x, f.y - HEIGHT(f) - 20, WATER.light, 40, 14);
      } else release(F, f);
    }
    function slip(F, pl, o) {
      const a = F.fighters[pl.s]; pl.dead = true;
      if (!a) return;
      const dir = o.vx > 0.2 ? 1 : o.vx < -0.2 ? -1 : (o.x >= a.x ? 1 : -1);
      hitFrom(a, o, { name: 'vodnik_slip', dmg: dmg(F, SLIP_DMG), blockable: false, launch: 2.6, push: 1, hitstun: 16,
                      sound: has('slip') ? 'slip' : 'fall', sx: o.x, sy: GROUND - 14 }, dir);
      if (!has('slip')) snd('slip', 0.6);
      drops(F, o.x, GROUND - 6, 12, 2.6);
      st(F).used[pl.s].slip++;
      say(F, 'ŠMYK!', o.x, o.y - HEIGHT(o) - 30, '#ffe066', 50, 14);
    }

    // ================================================================ vstup (idle/walk/block, pred moves.js: unshift)
    hooks.input.unshift((f, o, inp) => {
      if (!isV(f)) return false;
      const F = fight(); if (!F || !inp || !inp.pressed) return false;
      const p = inp.pressed;
      if (F.phase !== 'fight' || !f.onGround) return !!p.special;     // ♪ VODNÍKA nikdy nespustí heligónku
      let mv = null;
      if (inp instanceof api.CPU) {
        const it = inp.p7vIntent; inp.p7vIntent = null;
        if (it && it.frame === api.frame) mv = it.mv;
        else if (p.special) mv = 'bubble';
      } else if (p.punch && seq(inp, ['down', 'F', 'punch'])) mv = 'cup';
      else if (p.kick && seq(inp, ['down', 'down', 'kick'])) mv = 'pour';
      else if (p.special) mv = 'bubble';
      if (mv && startMove(f, o, mv)) return true;
      return !!p.special;          // ♪ nikdy heligónku; HRNČEK / MLÁKA počas cooldownu prepustia vstup (uppercut, podkop, úder)
    });

    // ================================================================ stavy: Vodníkove útoky a súper v bubline
    hooks.state.push((f, o) => {
      const F = fight(); if (!F) return false;
      switch (f.state) {
        case 'bubble': case 'cup': case 'pour': {
          const m = MOVE[f.state], dir = f.state === 'pour' ? toward(f, o) : f.facing;
          f.vx *= 0.7;
          if (f.state === 'pour' && POSE.flipPour) f.facing = -dir;
          if (f.t === SPAWN[f.state] && F.phase === 'fight') {
            const V = st(F);
            if (f.state === 'bubble') { const h = at(f, POSE.mouth); V.proj.push({ k: 'bub', s: f.side, x: h.x, y: h.y, y0: h.y, vx: dir * BUB_V, dir, t: 0 }); snd('bubble'); }
            else if (f.state === 'cup') { const h = at(f, POSE.cup); V.proj.push({ k: 'cup', s: f.side, x: h.x, y: h.y, vx: dir * CUP_VX, vy: CUP_VY, dir, t: 0, rot: 0 }); api.sfx('whoosh', 0.45); }
            else {
              const px = clamp(f.x + dir * POSE.pool * S(f), 44, W - 44);
              V.pools = V.pools.filter(p => p.s !== f.side);                         // najviac jedna mláka naraz
              V.pools.push({ s: f.side, x: px, t: 0 });
              snd('splash'); drops(F, px, GROUND - 4, 10, 2.4);
            }
          }
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'bubbled': {
          const b = f.p7bub;
          f.vx = 0;
          if (!b || F.phase !== 'fight') { release(F, f); return true; }
          const k = Math.min(1, f.t / 50), ease = 1 - (1 - k) * (1 - k);
          f.y = Math.min(GROUND, b.y0 - BUB_RISE * ease + Math.sin(f.t / 9) * 2.5);
          f.vy = -GRAV;                                            // fyzika game.js pridá gravitáciu → výška sa drží
          if (f.t >= BUB_T) pop(F, f);
          return true;
        }
      }
      return false;
    });

    // ================================================================ zásahy: bublina praskne pri údere, bonus doma pri vode
    hooks.afterHit.push((a, d, m, blocked) => {
      const F = fight(); if (!F || !a || !d) return;
      if (d.p7bub && d.state !== 'bubbled') { d.p7bub = null; drops(F, d.x, d.y - 72, 12, 3); snd('pop', 0.6); }
      if (!isV(a) || blocked || !home(F) || F.phase !== 'fight' || !m || String(m.name || '').startsWith('vodnik_')) return;
      if (!(m.dmg > 0) || d.hp <= 1) return;
      // +25 % k obyčajným úderom (aj KIAI); nikdy nie ako smrteľný úder, ten nechá na game.js (K.O., FINISH HIM, RESPAWN)
      const extra = Math.min(Math.max(1, Math.round(m.dmg * (a.ssj ? 1.3 : 1) * (HOME_DMG - 1))), d.hp - 1);
      d.hp -= extra; d.damageTaken += extra;
      if (!d.ssj && d.hp > 0 && d.hp <= d.maxHp * 0.25) { d.ssj = true; api.banner('SUPER ' + d.def.name + '!', 100, 24, 168, true); api.say('ssj_' + d.id); }
    });

    // ================================================================ každý snímok: strely, mláky, dušičky (hostiteľ), kvapky zo šosu (všetci)
    function bodyHit(o, x, r) { return o.vulnerable && o.state !== 'dizzy' && Math.abs(o.x - x) < 17 + r && o.y > GROUND - 50; }
    function cupHit(o, p) { return o.vulnerable && o.state !== 'dizzy' && Math.abs(o.x - p.x) < 23 && p.y > o.y - HEIGHT(o) && p.y < o.y + 4; }
    function stepHost(F) {
      const V = st(F);
      for (const f of F.fighters) {
        const g = f.p7v;
        if (g) { if (g.cdC > 0) g.cdC--; if (g.cdP > 0) g.cdP--; }
      }
      for (const p of V.proj) {
        p.t++;
        const a = F.fighters[p.s], o = F.fighters[1 - p.s];
        if (F.phase !== 'fight' || p.x < -30 || p.x > W + 30 || p.t > 420) { p.dead = true; continue; }
        if (p.k === 'bub') {
          p.x += p.vx; p.y = p.y0 + Math.sin(p.t / 10) * 5;
          if (o && bodyHit(o, p.x, BUB_R)) {
            p.dead = true;
            if (blockingFrom(o, p.dir) || o.state === 'bubbled') { drops(F, p.x, p.y, 10, 2); snd('pop', 0.7); V.used[p.s].popBlocked++; }
            else trap(F, o, p.s);
          }
        } else {
          p.vy += CUP_G; p.x += p.vx; p.y += p.vy; p.rot += 0.28 * p.dir;
          if (o && a && cupHit(o, p)) {
            p.dead = true;
            const blocked = blockingFrom(o, p.dir), hp0 = o.hp;
            hitFrom(a, o, { name: 'vodnik_cup', dmg: dmg(F, CUP_DMG), hitstun: 16, push: 2.2, sound: 'punch', sx: p.x, sy: p.y }, p.dir);
            F.fx.push({ kind: 'p7shard', x: p.x, y: p.y, vx: -p.dir * 1.2, vy: -2, t: 0, life: 26 }, { kind: 'p7shard', x: p.x, y: p.y, vx: p.dir * 0.8, vy: -2.6, t: 0, life: 26 });
            const lost = hp0 - o.hp;
            V.used[p.s].cupHit++;
            if (!blocked && lost > 0) { V.souls.push({ s: p.s, x0: p.x, y0: p.y, x: p.x, y: p.y, t: 0, amt: lost }); snd('soul', 0.5); }
          } else if (p.y >= GROUND - 3) {
            p.dead = true; api.sfx('block', 0.4);
            for (let i = 0; i < 3; i++) F.fx.push({ kind: 'p7shard', x: p.x, y: GROUND - 4, vx: rnd(-1.6, 1.6), vy: -rnd(1, 2.6), t: 0, life: 24 });
          }
        }
      }
      V.proj = V.proj.filter(p => !p.dead);
      for (const pl of V.pools) {
        pl.t++;
        if (pl.t >= POOL_T || F.phase !== 'fight') { pl.dead = true; continue; }
        const o = F.fighters[1 - pl.s];
        if (!o || isV(o) || pl.t < 8) continue;                 // Vodníka mláka neovplyvní
        const inside = Math.abs(o.x - pl.x) < poolW(pl) / 2 - 2, onG = o.y >= GROUND;
        const landed = onG && V.air[o.side], walking = onG && o.state === 'walk' && Math.abs(o.vx) > 0.2;
        if (inside && (landed || walking) && o.vulnerable && o.state !== 'dizzy') slip(F, pl, o);
      }
      V.pools = V.pools.filter(p => !p.dead);
      for (const f of F.fighters) V.air[f.side] = f.y < GROUND;             // aj 255,8 je ešte vo vzduchu (dopadne o snímok neskôr)
      for (const s of V.souls) {
        s.t++;
        const v = F.fighters[s.s]; if (!v) { s.dead = true; continue; }
        const k = Math.min(1, s.t / SOUL_T), tx = v.x, ty = v.y - 90 * S(v);
        s.x = s.x0 + (tx - s.x0) * k; s.y = s.y0 + (ty - s.y0) * k - Math.sin(k * Math.PI) * 46;
        if (s.t >= SOUL_T) {
          s.dead = true;
          if (F.phase === 'fight' && v.hp > 0) {
            const add = Math.max(0, Math.min(s.amt, v.maxHp - v.hp));
            v.hp += add; V.used[s.s].stolen += add;
            if (add > 0) say(F, '+' + add, v.x, v.y - HEIGHT(v) - 28, WATER.soul, 50, 14);   // pri plnom živote nič nepribudne
            snd('soul', 0.7);
          }
        }
      }
      V.souls = V.souls.filter(s => !s.dead);
      for (const t of V.texts) t.t++;
      V.texts = V.texts.filter(t => t.t < t.life);
    }
    const poolW = pl => POOL_W * Math.min(1, pl.t / 14) * (pl.t > POOL_T - 30 ? Math.max(0.2, (POOL_T - pl.t) / 30) : 1);
    const DRIP = [];                         // kvapky zo šosu: len kozmetika, každý klient si ich počíta sám
    const NO_DRIP = new Set(['fall', 'down', 'getup', 'baby', 'bubbled', 'kroj']);
    hooks.frame.push(() => {
      const F = fight(); if (!live(F)) return;
      if (host()) stepHost(F);
      for (const f of F.fighters) {
        if (!isV(f) || NO_DRIP.has(f.state) || f.y > GROUND + 40) continue;
        if ((api.frame + f.side * 3) % 6 === 0 && chance(0.75)) {
          const s = S(f);
          DRIP.push({ x: f.x - f.facing * rnd(6, 20) * s, y: f.y - rnd(34, 52) * s, vy: rnd(0.2, 0.8), t: 0, sp: 0 });
        }
      }
      for (const d of DRIP) { d.t++; if (d.sp) d.sp++; else { d.vy += 0.24; d.y += d.vy; if (d.y >= GROUND) { d.y = GROUND; d.sp = 1; } } }
      for (let i = DRIP.length - 1; i >= 0; i--) if (DRIP[i].sp > 7 || DRIP[i].t > 150) DRIP.splice(i, 1);
      if (DRIP.length > 90) DRIP.splice(0, DRIP.length - 90);
    });

    hooks.matchStart.push(F => { F.p7v = null; st(F); DRIP.length = 0; });
    hooks.roundStart.push(F => {
      const V = st(F); V.proj.length = 0; V.pools.length = 0; V.souls.length = 0; V.texts.length = 0; V.air = [false, false];
      for (const f of F.fighters) { f.p7bub = null; if (isV(f)) { f.p7v = null; vs(f); } }
      const n = F.fighters.filter(isV).length;
      if (n && home(F)) api.banner(n > 1 ? 'VODNÍCI SÚ DOMA!' : 'VODNÍK JE DOMA!', 130, 20, 162, true);
    });

    // ================================================================ počítač: schopnosti s rozvahou
    const FREE = new Set(['idle', 'walk', 'block']);
    hooks.cpu.unshift((c, f, o, phase) => {
      if (!isV(f) || phase !== 'fight' || !o) return null;
      const F = fight(); if (!F) return null;
      const g = vs(f), V = st(F), lv = clamp(c.level || 0.6, 0.3, 1.3), d = Math.abs(o.x - f.x), toward = o.x > f.x ? 'right' : 'left';
      if (o.state === 'bubbled' && o.p7bub && o.p7bub.s === f.side) {           // súper v mojej bubline: dobehni a puk (rozhodne sa raz)
        if (!g.chase || g.chase.at !== o.p7bub.at) g.chase = { at: o.p7bub.at, go: chance(0.45 + 0.3 * lv) };
        if (g.chase.go) {
          if (!FREE.has(f.state)) return { held: {}, pressed: {} };
          if (d > 66) return { held: { [toward]: true }, pressed: {} };
          return { held: {}, pressed: chance(0.5) ? { kick: true } : { punch: true } };
        }
      }
      if (!FREE.has(f.state) || !f.onGround || c.planT > 0 || c.wait > 1 || api.frame < g.ai) return null;
      const busy = !o.vulnerable || o.state === 'dizzy' || o.state === 'bubbled';
      const cand = [];                                   // vhodné schopnosti s váhou; vyberie sa náhodne, nie stále tá istá
      if (!busy && f.cd.special === 0 && d > 100 && !V.proj.some(p => p.s === f.side && p.k === 'bub')) cand.push(['bubble', 3]);
      if (!busy && g.cdC === 0 && d > 80 && d < 240) cand.push(['cup', f.hp < f.maxHp ? 3 : 1.5]);
      const down = ['fall', 'down', 'getup'].includes(o.state);     // súper leží → mláka ako pasca, kde bude vstávať
      const coming = o.state === 'walk' && Math.sign(o.vx) === Math.sign(f.x - o.x);   // súper ide ku mne → mláka do cesty
      if ((!busy || down) && g.cdP === 0 && d > 50 && d < 230 && !V.pools.some(p => p.s === f.side)) cand.push(['pour', down ? 5 : coming ? 4 : 2.5]);
      let mv = null;
      if (cand.length && chance(0.35 + 0.3 * lv)) {
        const n = g.n || (g.n = {});
        for (const c2 of cand) c2[1] *= (c2[0] === g.last ? 0.35 : 1) / (1 + 1.5 * (n[c2[0]] || 0));   // striedať: menej použitá má prednosť
        let r = rnd(0, cand.reduce((a, c2) => a + c2[1], 0));
        for (const [m, w] of cand) { if ((r -= w) <= 0) { mv = m; break; } }
        mv = mv || cand[cand.length - 1][0];
      }
      if (!mv) { g.ai = api.frame + 24; return null; }   // nič → pôvodná logika (moves.js / game.js)
      g.ai = api.frame + Math.round(rnd(45, 90) / lv); g.last = mv; g.n[mv] = (g.n[mv] || 0) + 1;
      c.p7vIntent = { mv, frame: api.frame };
      c.wait = Math.floor(rnd(18, 36) / lv); c.plan = null; c.planT = 0;
      return { held: {}, pressed: {} };
    });

    // ================================================================ kreslenie
    function drawPool(pl) {
      const w = poolW(pl), x = pl.x, y = GROUND + 1, a = pl.t > POOL_T - 30 ? Math.max(0, (POOL_T - pl.t) / 30) : 1;
      if (w < 2) return;
      ctx.save(); ctx.globalAlpha = 0.85 * a;
      ctx.fillStyle = '#1d4f8f'; ctx.beginPath(); ctx.ellipse(x, y + 1, w / 2 + 2, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WATER.deep; ctx.beginPath(); ctx.ellipse(x, y, w / 2, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WATER.mid; ctx.beginPath(); ctx.ellipse(x - w * 0.08, y - 1, w * 0.34, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WATER.light; ctx.fillRect(Math.round(x - w * 0.28), y - 3, Math.round(w * 0.16), 1); ctx.fillRect(Math.round(x + w * 0.1), y - 2, Math.round(w * 0.08), 1);
      ctx.strokeStyle = 'rgba(220,245,255,0.7)'; ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {                // krúžky na hladine
        const k = ((pl.t + i * 30) % 60) / 60, rx = 4 + k * w * 0.3;
        ctx.globalAlpha = 0.6 * (1 - k) * a; ctx.beginPath(); ctx.ellipse(x + (i ? 12 : -10), y, rx, rx * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    function bubbleAt(x, y, r, a = 1, t = 0) {
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.75, 'rgba(150,215,255,0.16)'); g.addColorStop(1, 'rgba(120,200,255,0.55)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(210,240,255,0.85)'; ctx.lineWidth = Math.max(1, r / 14); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,170,240,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r - 2, 0.2 + t / 20, 1.3 + t / 20); ctx.stroke();   // dúhový lesk
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1.5, r / 9); ctx.beginPath(); ctx.arc(x, y, r * 0.68, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x + r * 0.35), Math.round(y - r * 0.5), 2, 2);
      ctx.restore();
    }
    function drawCup(x, y, rot, dir) {
      const im = IMG['img/teacup'];
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); if (dir < 0) ctx.scale(-1, 1);
      if (im) { const s = 24 / Math.max(im.width, im.height); ctx.drawImage(im, -im.width * s / 2, -im.height * s / 2, im.width * s, im.height * s); }
      else {                                       // hrnček tvarmi: biely s modrým pásikom a uškom, navrchu dušička
        ctx.fillStyle = '#1b2a3a'; ctx.fillRect(-9, -7, 18, 15);
        ctx.fillStyle = '#f4f1ea'; ctx.fillRect(-8, -6, 16, 13);
        ctx.fillStyle = '#3d7fd6'; ctx.fillRect(-8, -2, 16, 3);
        ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(9, 0, 4, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        ctx.fillStyle = WATER.soul; ctx.beginPath(); ctx.arc(0, -8, 4, Math.PI, 0); ctx.fill();
      }
      ctx.restore();
    }
    function drawSoul(s) {                         // modrá dušička s chvostíkom a očkami
      ctx.save();
      for (let i = 3; i >= 1; i--) { ctx.globalAlpha = 0.18 * (4 - i); ctx.fillStyle = WATER.soul; ctx.beginPath(); ctx.arc(s.x - (s.x - s.x0) * 0.06 * i, s.y + i * 3, 6 - i, 0, Math.PI * 2); ctx.fill(); }
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 14);
      g.addColorStop(0, 'rgba(200,240,255,0.9)'); g.addColorStop(1, 'rgba(80,170,255,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = WATER.soul; ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#123'; ctx.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 2, 2, 2); ctx.fillRect(Math.round(s.x) + 1, Math.round(s.y) - 2, 2, 2);
      ctx.restore();
    }
    hooks.drawBack.push((stage, F) => {            // mláky pod postavami
      const V = F.p7v; if (!V) return;
      for (const pl of V.pools) drawPool(pl);
    });
    hooks.drawFront.push((stage, F) => {
      const V = F.p7v;
      for (const f of F.fighters) {
        if (isV(f)) {
          const m = MOVE[f.state];
          if (f.state === 'bubble' && m && f.t >= m.startup - 6 && f.t < SPAWN.bubble) {    // bublina rastie pri ústach
            const h = at(f, POSE.mouth), k = (f.t - (m.startup - 6)) / (SPAWN.bubble - m.startup + 6);
            bubbleAt(h.x, h.y, 2 + (BUB_R - 2) * k, 0.9, f.t);
          }
          if (POSE.stream && f.state === 'pour' && m && f.t >= m.startup - 10 && f.t < m.startup + 10) {   // náhrada: prúd vody na zem
            const h = at(f, [34, -100]), tx = f.x + f.facing * POSE.pool * S(f), k = (f.t - (m.startup - 10)) / 20;
            ctx.save(); ctx.globalAlpha = 0.8 * (1 - Math.max(0, k - 0.6) * 2.5); ctx.strokeStyle = WATER.mid; ctx.lineWidth = 4; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.quadraticCurveTo(tx, h.y - 10, tx, GROUND - 2); ctx.stroke();
            ctx.strokeStyle = WATER.light; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.quadraticCurveTo(tx, h.y - 10, tx, GROUND - 2); ctx.stroke();
            ctx.restore();
          }
        }
        if (f.state === 'bubbled' && f.p7bub) {                  // súper vo veľkej bubline
          const r = 54 * S(f) + Math.sin(f.t / 6) * 2;
          bubbleAt(f.x, f.y - HEIGHT(f) * 0.5, r, 0.95, f.t);
          if (f.t > BUB_T - 24 && f.t % 6 < 3) bubbleAt(f.x, f.y - HEIGHT(f) * 0.5, r + 3, 0.35, f.t);   // čoskoro praskne
        }
      }
      ctx.save();                                  // kvapky zo šosu
      for (const d of DRIP) {
        if (d.sp) { ctx.globalAlpha = 1 - d.sp / 8; ctx.fillStyle = WATER.light; ctx.fillRect(Math.round(d.x) - 2 - d.sp, GROUND - 1, 2, 1); ctx.fillRect(Math.round(d.x) + d.sp, GROUND - 1, 2, 1); }
        else { ctx.globalAlpha = 0.95; ctx.fillStyle = WATER.deep; ctx.fillRect(Math.round(d.x) - 1, Math.round(d.y) - 1, 3, 4); ctx.fillStyle = WATER.light; ctx.fillRect(Math.round(d.x), Math.round(d.y), 1, 2); }
      }
      ctx.restore();
      if (!V) return;
      for (const p of V.proj) { if (p.k === 'bub') bubbleAt(p.x, p.y, BUB_R + Math.sin(p.t / 5) * 1.2, 1, p.t); else drawCup(p.x, p.y, p.rot, p.dir); }
      for (const s of V.souls) drawSoul(s);
      ctx.save();
      for (const q of F.fx) {
        if (q.kind === 'p7drop') { ctx.globalAlpha = Math.max(0, 1 - q.t / q.life); ctx.fillStyle = q.t % 6 < 3 ? WATER.light : WATER.mid; ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 3); }
        else if (q.kind === 'p7shard') { ctx.globalAlpha = Math.max(0, 1 - q.t / q.life); ctx.fillStyle = q.t % 4 < 2 ? '#f4f1ea' : '#3d7fd6'; ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3); }
      }
      ctx.restore();
      for (const t of V.texts) {
        ctx.save(); ctx.globalAlpha = t.t > t.life - 12 ? (t.life - t.t) / 12 : 1;
        api.text(t.txt, t.x, t.y - t.t * 0.3, t.size || 12, 'center', t.c);
        ctx.restore();
      }
    });
    // kvapky a strepy (F.fx): game.js ich posúva; gravitáciu pridáme tu (len hostiteľ, hosť dostane polohy)
    hooks.frame.push(() => {
      const F = fight(); if (!live(F) || !host()) return;
      for (const q of F.fx) if (q.kind === 'p7drop' || q.kind === 'p7shard') { q.vy += 0.2; if (q.y > GROUND) { q.y = GROUND; q.vy = 0; q.vx *= 0.6; } }
    });

    // HUD: HRNČEK (3. ukazovateľ), MLÁKA a DOMA pod menom; v 1. kole nápoveda kombá pre človeka
    function meter(side, label, v, col, slot, row = 0) {
      const right = side === 1, x = right ? W - 12 - 190 : 12, mx = right ? x + 190 - 60 - slot * 66 : x + slot * 66, my = 27 + row * 21;
      ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
      ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * clamp(v, 0, 1)), 4);
      api.text(label, mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
    }
    hooks.drawHud.push(F => {
      if (!F || F.paused) return;
      F.fighters.forEach((f, i) => {
        if (!isV(f)) return;
        const g = f.p7v || {};
        ctx.save();
        meter(i, 'HRNČEK', 1 - (g.cdC || 0) / cool(F, CUP_CD), '#f4f1ea', 2);
        meter(i, 'MLÁKA', 1 - (g.cdP || 0) / cool(F, POOL_CD), WATER.mid, 1, 1);
        if (home(F)) api.text('DOMA +25 %', i === 0 ? 12 + 132 : W - 12 - 132, 61, 7, i === 0 ? 'left' : 'right', WATER.light);
        ctx.restore();
        if (F.round === 1 && (F.phase === 'intro' || (F.phase === 'fight' && F.t < 240)) && api.inputKind(i) !== 'cpu')
          api.text('BUBLINA: ♪ · HRNČEK: ↓ VPRED ÚDER · MLÁKA: ↓ ↓ KOP', i === 0 ? 8 : W - 30, 254, 7, i === 0 ? 'left' : 'right', '#b8f0c0');
      });
    });

    // pre testy, rebríček a scény
    api.vodnik = {
      id: 'vodnik', isVodnik: isV, ownSprites: own, home,
      force(f, mv, ignoreCd = false) {
        const F = fight(); if (!F) return false;
        if (ignoreCd) { f.cd.special = 0; vs(f).cdC = 0; vs(f).cdP = 0; }
        return startMove(f, F.fighters[1 - f.side], mv);
      },
      tune: { BUB_CD, BUB_T, CUP_CD, CUP_DMG, POOL_CD, POOL_T, SLIP_DMG, BUB_DMG, HOME_DMG, HOME_CD },
      help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — rovnaký formát ako api.moves.help (OVLÁDANIE, COMBOS.md)
        ['BUBLINA (VODNÍK)', 'T', 'O', '△', '♪'],
        ['HRNČEK (VODNÍK)', 'S VPRED F', '↓ VPRED K', '↓ ▶ □', 'páčka dole, vpred + ÚDER'],
        ['MLÁKA (VODNÍK)', 'S S G', '↓ ↓ L', '↓ ↓ ✕', 'páčka dole 2× + KOP'],
      ],
    };
  },
});
