// MATÚŠKO KOMBAT XII — modul glitch: GLITCH, pokazená kópia súpera z rozbitej videohry (LAG, REWIND, KLON, RESPAWN) (P7)
//
//   LAG ....... ♪               pomalá vlna; zásah = súper ~2 s „laguje“ (každých 8 snímok ho to vráti späť), blok ju zastaví
//   REWIND .... VZAD VZAD ♪     pretočí sa o 2 s späť: vráti si život aj pozíciu (kruhový záznam 120 snímok), raz za kolo
//   KLON ...... ↓ VPRED ♪       polopriehľadná kópia ~3 s ide k súperovi, 1–2× udrie (dá sa zablokovať), rozpadne sa na pixely
//   RESPAWN ... pasívne         raz za zápas namiesto K.O. sa rozsype na pixely, 1,5 s je nezraniteľný, vráti sa s 25 % života
//
// Vyzerá ako súper (f.mimic = súperove sprity, proti GLITCHOVI Matúško) s paletou 'glitch' a digitálnymi efektmi.
// Registrovaný ako nevoliteľný (selectable = false): odomyká ho rebríček. Schopnosti sa viažu na def.p7 === 'glitch',
// takže kópia s inou paletou ({ ...ROSTER.glitch, name: …, palette: … }) ich zdedí.
// Sieťová hra: všetok stav je čisté dáta v F.p7g a vo bojovníkoch (f.p7g, f.p7lag, f.mimic); logika beží len u hostiteľa,
// hosť iba kreslí. Kruhový záznam pre REWIND je len u hostiteľa (WeakMap), na kreslenie netreba.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'glitch',
  init(api) {
    const { W, GROUND, MOVE, FA, IMG, hooks, ctx } = api;
    const { rnd, chance, clamp } = api;

    // ================================================================ ladenie (snímky pri 60 fps)
    const LAG_CD = 360, LAG_T = 120, LAG_SNAP = 8, LAG_KEEP = 0.2, LAG_V = 2.6, LAG_DMG = 3;
    const CLONE_CD = 480, CLONE_LIFE = 180, CLONE_V = 2.1, CLONE_DMG = 4;
    const REC_N = 120;                         // REWIND: 2 s záznamu
    const RSP_T = 90, RSP_HP = 0.25, HIDE_Y = GROUND + 400;
    const SEQ_GAP = 30;                        // max. snímok medzi stlačeniami v kombe (benevolentné pre deti)
    const COL = { cyan: '#2bf0ff', mag: '#ff2bd6', red: '#ff2050', vio: '#7a3cff', white: '#ffffff' };

    // ================================================================ postava
    const hasSet = id => !!(id && FA[id] && FA[id].anims && FA[id].anims.idle);
    const DEF = {
      p7: 'glitch', name: 'GLITCH', palette: 'glitch', special: 'husle', specialName: 'LAG', finisher: 'babality', moveSpecial: null,
      gi: '#3fe0d0', giDark: '#6b3fd0', belt: '#ff2bd6', hair: '#140f2a',
      blurb: ['Pokazená kópia súpera', 'z rozbitej hry: LAG, KLON,', 'REWIND a jeden RESPAWN.'],
    };
    api.registerFighter('glitch', DEF, false);

    // paleta: studený tyrkysovo-fialový tón (tiene fialové, svetlá tyrkysové) + vodorovné riadky ako na starej obrazovke
    api.registerPalette('glitch', (x, w, h) => {
      const src = document.createElement('canvas'); src.width = w; src.height = h;
      src.getContext('2d').drawImage(x.canvas, 0, 0);
      const step = (mode, fill) => { x.globalCompositeOperation = mode; x.fillStyle = fill; x.fillRect(0, 0, w, h); };
      step('saturation', '#808080');                     // odfarbiť
      step('screen', '#2a0a55');                         // tiene do fialova
      step('multiply', '#8ffff2');                       // svetlá do tyrkysova
      step('soft-light', '#6a30ff');                     // fialový nádych v polotónoch
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(8,0,30,0.42)'; for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
      x.fillStyle = 'rgba(160,255,250,0.10)'; for (let y = 1; y < h; y += 3) x.fillRect(0, y, w, 1);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);   // pôvodný obrys
      x.globalCompositeOperation = 'source-over';
    });

    // ================================================================ pohyby
    Object.assign(MOVE, {
      glitch_lag:   { startup: 12, active: 1, recovery: 18 },
      glitch_clone: { startup: 14, active: 1, recovery: 16 },
      glitch_rw:    { startup: 4, active: 1, recovery: 19 },
    });
    api.ATTACK_STATES.add('glitch_lag'); api.ATTACK_STATES.add('glitch_clone');
    api.animFallback('glitch_lag', 'kiai'); api.animFallback('glitch_clone', 'kiai'); api.animFallback('glitch_rw', 'hit');

    // ================================================================ zvuky (Master dodá glitch, rewind, respawn; dovtedy náhrada z existujúcich)
    const has = n => !!(api.A && api.A.sounds && api.A.sounds[n]);
    const ALT = { glitch: [['crack', 0.3], ['select', 0.5]], rewind: [['whoosh', 0.8], ['teleport', 0.45]], respawn: [['confirm', 0.7], ['teleport', 0.4]] };
    function snd(n, v = 0.8) { if (has(n)) api.sfx(n, v); else for (const [k, w] of ALT[n] || [[n, v]]) api.sfx(k, w * v / 0.8); }

    // ================================================================ pomôcky
    const isG = f => !!(f && f.def && f.def.p7 === 'glitch');
    const fight = () => api.fight;
    const host = () => api.NET.role !== 'guest';
    const live = F => !!(F && api.scene === 'fight' && !F.paused);
    const newUse = () => ({ lag: 0, clone: 0, rewind: 0, respawn: 0, lagHit: 0, cloneHit: 0 });
    function st(F) {
      if (!F.p7g) F.p7g = { proj: [], clones: [], vhs: null, texts: [], rsp: [false, false], used: [newUse(), newUse()] };
      return F.p7g;
    }
    function gs(f) { return f.p7g || (f.p7g = { rw: false, cdK: 0, rsp: 0, rx: 0, ai: 0, rwRoll: 0, last: null }); }
    const seq = (inp, s) => !!(inp && inp.history && api.matchSeq(inp, s, SEQ_GAP));
    const HEIGHT = f => (f.def && f.def.height) || 138;
    // zásah z iného smeru, než kam sa práve pozerá GLITCH (strela, klon): blok aj odhodenie podľa smeru útoku
    function hitFrom(a, d, m, dir) {
      const f0 = a.facing; a.facing = dir;
      try { api.applyHit(a, d, m); } finally { a.facing = f0; }
    }
    function pixels(F, x, y, n, spread = 24, up = 1) {   // rozsypanie na pixely (game.js ich posúva a maže, kreslí tento modul)
      for (let i = 0; i < n; i++) {
        const c = [COL.cyan, COL.mag, COL.vio, COL.white, '#111111'][i % 5];
        F.fx.push({ kind: 'p7px', x: x + rnd(-spread, spread), y: y + rnd(-60, 60), vx: rnd(-1.6, 1.6), vy: -rnd(0.2, 1.4) * up, c, s: chance(0.3) ? 4 : 3, t: 0, life: Math.round(rnd(30, 60)) });
      }
    }
    function say(F, txt, x, y, c = COL.cyan, life = 60, size = 12) { st(F).texts.push({ txt, x, y, c, t: 0, life, size }); }

    // ================================================================ REWIND: kruhový záznam (len hostiteľ, netreba ho posielať)
    const REC = new WeakMap();
    function rec(f) {
      let r = REC.get(f);
      if (!r) REC.set(f, (r = { xs: new Float32Array(REC_N), hs: new Float32Array(REC_N), i: 0, n: 0 }));
      return r;
    }
    function recPush(f) { const r = rec(f); r.xs[r.i] = f.x; r.hs[r.i] = f.hp; r.i = (r.i + 1) % REC_N; r.n = Math.min(REC_N, r.n + 1); }
    function recOldest(f) { const r = REC.get(f); if (!r || !r.n) return null; const k = r.n >= REC_N ? r.i : 0; return { x: r.xs[k], hp: r.hs[k], k, r }; }

    // ================================================================ schopnosti
    function startMove(f, o, mv) {
      const F = fight(); if (!F || F.phase !== 'fight' || !isG(f)) return false;
      const G = st(F), g = gs(f);
      switch (mv) {
        case 'lag':
          if (f.cd.special > 0 || G.proj.some(p => p.s === f.side)) return false;
          f.set('glitch_lag', 'glitch_lag'); f.vx = 0; f.cd.special = LAG_CD;
          break;
        case 'clone':
          if (g.cdK > 0 || G.clones.some(c => c.s === f.side)) return false;
          f.set('glitch_clone', 'glitch_clone'); f.vx = 0; g.cdK = CLONE_CD;
          break;
        case 'rewind':
          if (g.rw || !doRewind(F, f)) return false;
          break;
        default: return false;
      }
      G.used[f.side][mv]++;
      return true;
    }
    function doRewind(F, f) {
      const old = recOldest(f); if (!old || old.r.n < 20) return false;
      const r = old.r, pts = [];
      for (let j = 0; j <= 7; j++) { const idx = (old.k + Math.floor(j * (r.n - 1) / 7)) % REC_N; pts.push(Math.round(r.xs[idx])); }
      const gain = Math.max(0, Math.min(f.maxHp, Math.round(old.hp)) - f.hp);
      f.hp += gain;
      f.x = clamp(old.x, 22, W - 22); f.y = GROUND; f.vx = 0; f.vy = 0; f.p7lag = null;
      f.set('glitch_rw', 'glitch_rw');
      gs(f).rw = true; r.n = 0;
      st(F).vhs = { t: 0, life: 50, s: f.side, pts, gain };
      snd('rewind'); api.shake(4);
      say(F, gain > 0 ? '◀◀ +' + gain : '◀◀', f.x, f.y - 160, gain > 0 ? '#7dff6a' : COL.white, 60, 13);
      return true;
    }
    function spawnLag(F, f) {
      st(F).proj.push({ k: 'lag', s: f.side, x: f.x + f.facing * 36, y: f.y - 70, vx: f.facing * LAG_V, dir: f.facing, t: 0 });
      snd('glitch', 0.6);
    }
    function spawnClone(F, f) {
      st(F).clones.push({ s: f.side, x: clamp(f.x + f.facing * 26, 22, W - 22), y: GROUND, dir: f.facing, t: 0, st: 'walk', stT: 0, hit: false, hits: 0, swings: 0 });
      snd('glitch', 0.5); pixels(F, f.x + f.facing * 26, f.y - 70, 10, 14);
    }
    function startLag(F, d) {
      d.p7lag = { t: LAG_T, ax: d.x };
      say(F, 'LAG!', d.x, d.y - 168, COL.red, 40, 14);
    }
    // RESPAWN: namiesto K.O. (hp ≤ 0 vo fáze fight) — game.js K.O. neuvidí, lebo hp > 0 a stav 'down' je nezraniteľný
    function startRespawn(F, d) {
      const G = st(F), g = gs(d);
      G.rsp[d.side] = true; G.used[d.side].respawn++;
      g.rsp = RSP_T; g.rx = clamp(d.x, 40, W - 40);
      d.hp = 1; d.set('down'); d.vx = 0; d.vy = 0; d.stun = 0; d.flash = 0; d.y = HIDE_Y;
      d.p7lag = null;
      pixels(F, g.rx, GROUND - 70, 40, 22);
      snd('glitch', 0.9); api.shake(5);
      say(F, 'GAME OVER?', g.rx, GROUND - 150, COL.mag, 50, 13);
    }
    function endRespawn(F, f) {
      const g = gs(f);
      g.rsp = 0;
      f.x = g.rx; f.y = GROUND; f.vx = 0; f.vy = 0;
      f.set('idle');
      if (F.phase === 'fight') {                         // po čase (TIME) sa kolo už rozhodlo, život sa nedopĺňa
        f.hp = Math.max(f.hp, Math.round(f.maxHp * RSP_HP));
        pixels(F, f.x, f.y - 70, 16, 20, -0.4);
        snd('respawn'); F.flash = Math.max(F.flash, 5);
        say(F, 'RESPAWN', f.x, f.y - 156, '#7dff6a', 80, 16);
      }
    }

    // ================================================================ vstup (idle/walk/block, pred moves.js: unshift)
    hooks.input.unshift((f, o, inp) => {
      if (!isG(f)) return false;
      const F = fight(); if (!F || !inp || !inp.pressed) return false;
      const p = inp.pressed;
      if (F.phase !== 'fight' || !f.onGround) return !!p.special;     // ♪ GLITCHA nikdy nespustí husle (ani vo FINISH HIM)
      let mv = null;
      if (inp instanceof api.CPU) {
        const it = inp.p7Intent; inp.p7Intent = null;
        if (it && it.frame === api.frame) mv = it.mv;
        else if (p.special) mv = 'lag';
      } else if (p.special) {
        if (seq(inp, ['B', 'B', 'special'])) mv = 'rewind';
        else if (seq(inp, ['down', 'F', 'special'])) mv = 'clone';
        else mv = 'lag';
      }
      if (mv && startMove(f, o, mv)) return true;
      return !!p.special;                                              // nepripravené: ♪ nič neurobí (ako u ostatných)
    });

    // ================================================================ vlastné stavy GLITCHA
    hooks.state.push((f, o) => {
      const F = fight(); if (!F) return false;
      const m = MOVE[f.state];
      switch (f.state) {
        case 'glitch_lag': case 'glitch_clone':
          f.vx *= 0.7;
          if (f.t === m.startup && F.phase === 'fight') { if (f.state === 'glitch_lag') spawnLag(F, f); else spawnClone(F, f); }
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        case 'glitch_rw':
          f.vx = 0;
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
      }
      return false;
    });

    // ================================================================ zásahy: RESPAWN, LAG
    hooks.afterHit.push((a, d, m, blocked) => {
      const F = fight(); if (!F || !d) return;
      if (isG(d) && d.hp <= 0 && F.phase === 'fight' && !st(F).rsp[d.side] && !(gs(d).rsp > 0)) startRespawn(F, d);
      if (!m) return;
      if (m.name === 'glitch_lag' && !blocked && F.phase === 'fight' && d.hp > 0 && d.state !== 'dizzy') { startLag(F, d); st(F).used[a.side].lagHit++; }
      if (m.name === 'glitch_clone' && !blocked) st(F).used[a.side].cloneHit++;
    });

    // ================================================================ každý snímok (hostiteľ): záznam, LAG, RESPAWN, strely, klony
    const LAG_OK = new Set(['idle', 'walk', 'block', 'blockstun', 'hit', 'jump', 'airkick', 'airpunch', 'punch', 'kick', 'kiai', 'special',
      'uppercut', 'sweep', 'punch2', 'combo3', 'deaf', 'dance', 'glitch_lag', 'glitch_clone', 'bubble', 'cup', 'pour']);
    function bodyHit(o, x, r) {            // ako lúč KIAI v game.js: pri tele a súper nie je vysoko vo výskoku (dá sa preskočiť)
      return o.vulnerable && o.state !== 'dizzy' && Math.abs(o.x - x) < 17 + r && o.y > GROUND - 45;
    }
    function stepClone(F, c) {
      const a = F.fighters[c.s], o = F.fighters[1 - c.s];
      c.t++; c.stT++;
      if (F.phase !== 'fight' || c.t >= CLONE_LIFE || c.hits >= 2 || c.swings >= 3 || !a || gs(a).rsp > 0) { c.dead = true; return; }
      const dx = o.x - c.x, dist = Math.abs(dx);
      if (c.st === 'walk') {
        c.dir = dx >= 0 ? 1 : -1;
        if (dist > 58) c.x = clamp(c.x + c.dir * CLONE_V, 22, W - 22);
        else if (o.vulnerable && o.state !== 'dizzy' && c.stT > 6) { c.st = c.swings % 2 ? 'kick' : 'punch'; c.stT = 0; c.hit = false; api.sfx('whoosh', 0.3); }
        return;
      }
      const m = MOVE[c.st];
      if (!c.hit && c.stT >= m.startup && c.stT < m.startup + m.active && o.vulnerable && o.state !== 'dizzy') {
        const xa = c.x + c.dir * m.x0, xb = c.x + c.dir * m.x1, hx0 = Math.min(xa, xb), hx1 = Math.max(xa, xb);
        const hy0 = c.y + m.y0, hy1 = c.y + m.y1, h0 = o.x - 17, h1 = o.x + 17, v0 = o.y - HEIGHT(o), v1 = o.y;
        if (!(hx1 < h0 || hx0 > h1 || hy1 < v0 || hy0 > v1)) {
          c.hit = true; c.hits++;
          hitFrom(a, o, { name: 'glitch_clone', dmg: CLONE_DMG, hitstun: 14, push: 2.4, sound: c.st, sx: c.dir > 0 ? hx1 - 4 : hx0 + 4, sy: (hy0 + hy1) / 2 }, c.dir);
        }
      }
      if (c.stT >= m.startup + m.active + m.recovery) { c.st = 'walk'; c.stT = 0; c.swings++; }
    }
    hooks.frame.push(() => {
      const F = fight(); if (!live(F) || !host()) return;
      const G = st(F);
      for (const f of F.fighters) {
        // LAG: každých 8 snímok späť na pozíciu spred 8 snímok (ponechá sa len kúsok pohybu)
        const lg = f.p7lag;
        if (lg) {
          lg.t--;
          if (lg.t <= 0 || F.phase !== 'fight') f.p7lag = null;
          else if (lg.t % LAG_SNAP === 0) {
            if (LAG_OK.has(f.state) && f.vulnerable) { f.x = clamp(lg.ax + (f.x - lg.ax) * LAG_KEEP, 22, W - 22); if (lg.t % 40 === 0) snd('glitch', 0.25); }
            lg.ax = f.x;
          }
        }
        if (!isG(f)) continue;
        const g = gs(f);
        if (g.cdK > 0) g.cdK--;
        if (g.rsp > 0) {                                  // RESPAWN: nezraniteľný, skrytý pod zemou, kreslí ho tento modul
          if (F.phase !== 'fight') { endRespawn(F, f); continue; }
          g.rsp--; f.t = Math.min(f.t, 20); f.y = HIDE_Y; f.vx = 0; f.vy = 0;
          if (f.state !== 'down') f.set('down');
          if (g.rsp % 6 === 0) pixels(F, g.rx, GROUND - 70, 3, 18, 0.6);
          if (g.rsp === 0) endRespawn(F, f);
          continue;
        }
        if (F.phase === 'fight' && f.state !== 'glitch_rw') recPush(f);
      }
      // strely LAG
      for (const p of G.proj) {
        p.t++; p.x += p.vx;
        const a = F.fighters[p.s], o = F.fighters[1 - p.s];
        if (F.phase !== 'fight' || p.x < -40 || p.x > W + 40 || p.t > 260) { p.dead = true; continue; }
        if (p.t % 10 === 0) F.fx.push({ kind: 'p7px', x: p.x - p.dir * rnd(8, 20), y: p.y + rnd(-14, 14), vx: -p.dir * 0.4, vy: 0, c: chance(0.5) ? COL.cyan : COL.mag, s: 3, t: 0, life: 22 });
        if (a && o && bodyHit(o, p.x, 10)) {
          p.dead = true;
          hitFrom(a, o, { name: 'glitch_lag', dmg: LAG_DMG, hitstun: 10, push: 1.2, sound: has('glitch') ? 'glitch' : 'punch', sx: p.x, sy: p.y }, p.dir);
          pixels(F, p.x, p.y, 8, 8);
        }
      }
      G.proj = G.proj.filter(p => !p.dead);
      // klony
      for (const c of G.clones) {
        stepClone(F, c);
        if (c.dead) { pixels(F, c.x, c.y - 70, 26, 18); snd('glitch', 0.4); }
      }
      G.clones = G.clones.filter(c => !c.dead);
      for (const t of G.texts) t.t++;
      G.texts = G.texts.filter(t => t.t < t.life);
      if (G.vhs && ++G.vhs.t >= G.vhs.life) G.vhs = null;
    });

    hooks.matchStart.push(F => {
      F.p7g = null; st(F);
      for (const f of F.fighters) {
        if (!isG(f)) continue;
        const o = F.fighters[1 - f.side];
        f.mimic = isG(o) ? 'matusko' : (hasSet(o.sid) ? o.sid : 'matusko');   // GLITCH proti GLITCHOVI = Matúško
      }
    });
    hooks.roundStart.push(F => {
      const G = st(F); G.proj.length = 0; G.clones.length = 0; G.texts.length = 0; G.vhs = null;
      for (const f of F.fighters) {
        f.p7lag = null;
        if (isG(f)) { f.p7g = null; gs(f); REC.delete(f); }
      }
    });

    // ================================================================ počítač: schopnosti s rozvahou, nie stále dokola
    const FREE = new Set(['idle', 'walk', 'block']);
    hooks.cpu.unshift((c, f, o, phase) => {
      if (!isG(f) || phase !== 'fight' || !o) return null;
      const F = fight(); if (!F) return null;
      const g = gs(f), lv = clamp(c.level || 0.6, 0.3, 1.3);
      if (!FREE.has(f.state) || !f.onGround) return null;
      // REWIND reaktívne: po veľkej strate života za posledné 2 s (raz za kolo; kockou najviac raz za 30 snímok)
      if (!g.rw && api.frame >= g.rwRoll) {
        const old = recOldest(f);
        if (old && old.r.n >= 60 && old.hp - f.hp >= 18) {
          g.rwRoll = api.frame + 30;
          if (chance(0.5 + 0.3 * lv)) { c.p7Intent = { mv: 'rewind', frame: api.frame }; c.plan = null; c.planT = 0; return { held: {}, pressed: {} }; }
        }
      }
      if (c.planT > 0 || c.wait > 1 || api.frame < g.ai) return null;
      const d = Math.abs(o.x - f.x), G = st(F), busy = !o.vulnerable || o.state === 'dizzy';
      const cand = [];                                   // vhodné schopnosti s váhou; vyberie sa náhodne
      if (!busy && f.cd.special === 0 && !o.p7lag && d > 110 && !G.proj.some(p => p.s === f.side)) cand.push(['lag', 3]);
      if (!busy && g.cdK === 0 && d > 80 && d < 280) cand.push(['clone', 2]);
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
      c.p7Intent = { mv, frame: api.frame };
      c.wait = Math.floor(rnd(18, 36) / lv); c.plan = null; c.planT = 0;
      return { held: {}, pressed: {} };
    });

    // ================================================================ kreslenie
    // jednofarebná silueta snímky (RGB rozdvojenie, klon, chýbajúca textúra); obmedzená pamäť (LRU), aby na mobile nerástla
    const TINT = new Map(), IMG_ID = new WeakMap(), TINT_MAX = 96;
    let imgSeq = 0;
    function tinted(img, a, fr, col) {
      let id = IMG_ID.get(img); if (!id) IMG_ID.set(img, (id = ++imgSeq));
      const key = id + '|' + col + '|' + fr;
      let c = TINT.get(key);
      if (c) { TINT.delete(key); TINT.set(key, c); return c; }
      if (TINT.size >= TINT_MAX) { const k0 = TINT.keys().next().value; c = TINT.get(k0); TINT.delete(k0); }
      {
        c = c || document.createElement('canvas'); c.width = a.w; c.height = a.h;
        const x = c.getContext('2d');
        x.drawImage(img, fr * a.w, 0, a.w, a.h, 0, 0, a.w, a.h);
        x.globalCompositeOperation = 'source-in';
        if (col === 'missing') {               // fialovo-čierna šachovnica „chýbajúca textúra“ (Minecraft)
          for (let yy = 0; yy < a.h; yy += 6) for (let xx = 0; xx < a.w; xx += 6) { x.fillStyle = ((xx + yy) / 6) % 2 ? '#000000' : '#f800f8'; x.fillRect(xx, yy, 6, 6); }
        } else { x.fillStyle = col; x.fillRect(0, 0, a.w, a.h); }
        x.globalCompositeOperation = 'source-over';
        TINT.set(key, c);
      }
      return c;
    }
    // falošný bojovník pre api.animFor / api.frameOf (klon, rozpad pri RESPAWN)
    const fake = (f, state, t, x, y, dir, move) => ({ state, t, x, y, facing: dir, def: f.def, sid: f.sid, id: f.id, move: move || null, flip: 0, vx: 0, onGround: true });
    function frameInfo(f) {
      const an = api.animFor(f); if (!an || !an.img || !an.a) return null;
      if (f.state === 'jump' && f.flip && an.name !== 'flip') return null;   // salto bez videa: točená snímka (efekty vynechať)
      return { an, a: an.a, fr: api.frameOf(f, an) };
    }
    function blit(img, info, x, y, dir, opt = {}) {   // img = celý pás (sx podľa snímky) alebo jedna snímka (opt.single)
      const a = info.a, sc = a.scale || 1, s = opt.scale || 1;
      ctx.save();
      if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
      if (opt.op) ctx.globalCompositeOperation = opt.op;
      ctx.translate(Math.round(x), Math.round(y)); if (dir < 0) ctx.scale(-1, 1); if (s !== 1) ctx.scale(s, s);
      if (opt.single) ctx.drawImage(img, Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc));
      else ctx.drawImage(img, info.fr * a.w, 0, a.w, a.h, Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc));
      ctx.restore();
    }
    function slices(info, x, y, dir, spread, alpha, seed, scale = 1) {   // pás snímky po vodorovných riadkoch, každý posunutý
      const a = info.a, sc = a.scale || 1, img = info.an.img, H3 = 3;
      ctx.save(); ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(Math.round(x), Math.round(y)); if (dir < 0) ctx.scale(-1, 1); if (scale !== 1) ctx.scale(scale, scale);
      for (let sy = 0, i = 0; sy < a.h; sy += H3, i++) {
        const r = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453, k = (r - Math.floor(r)) * 2 - 1;
        ctx.drawImage(img, info.fr * a.w, sy, a.w, H3, Math.round(-a.ax * sc + k * spread), Math.round((-a.ay + sy) * sc), Math.round(a.w * sc), Math.round(H3 * sc));
      }
      ctx.restore();
    }
    // náhodné glitch udalosti (len kozmetika, každý klient si ich losuje sám)
    const EV = [{ band: 0, bandEnd: 0, drop: 0, dropEnd: 0, tear: false, seed: 1 }, { band: 0, bandEnd: 0, drop: 0, dropEnd: 0, tear: false, seed: 2 }];
    function events(side) {
      const e = EV[side & 1], fr = api.frame;
      if (fr >= e.band && fr >= e.bandEnd) { e.bandEnd = fr + 3 + Math.floor(rnd(0, 4)); e.band = e.bandEnd + 40 + Math.floor(rnd(0, 80)); e.tear = chance(0.35); e.seed = Math.floor(rnd(1, 999)); }
      if (fr >= e.drop && fr >= e.dropEnd) { if (!e.drop) e.drop = fr + Math.floor(rnd(120, 300)); else { e.dropEnd = fr + 3; e.drop = e.dropEnd + Math.floor(rnd(260, 480)); } }
      return { band: fr < e.bandEnd, tear: fr < e.bandEnd && e.tear, drop: fr < e.dropEnd, seed: e.seed };
    }
    function bandShift(x0, y0, w, h, dx) {      // posun vodorovného pásu obrazovky (aj s pozadím) — klasický „glitch“
      const T = ctx.getTransform(), k = T.a || 1, sx = Math.round(x0 * k + T.e), sy = Math.round(y0 * k + T.f);   // k = mierka plátna (RES v game.js)
      const cw = ctx.canvas.width, ch = ctx.canvas.height;
      const ax = clamp(sx, 0, cw - 1), ay = clamp(sy, 0, ch - 1), aw = Math.min(Math.round(w * k), cw - ax), ah = Math.min(Math.round(h * k), ch - ay);
      if (aw <= 0 || ah <= 0) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(ctx.canvas, ax, ay, aw, ah, ax + Math.round(dx * k), ay, aw, ah);
      ctx.restore();
    }
    function blocks(x, y, h, n) {
      ctx.save();
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = [COL.cyan, COL.mag, COL.white, '#000000', COL.vio][Math.floor(rnd(0, 5))];
        const s = chance(0.5) ? 2 : chance(0.5) ? 4 : 6;
        ctx.fillRect(Math.round(x + rnd(-30, 30)), Math.round(y - rnd(4, h)), s, s);
      }
      ctx.restore();
    }
    function hidden(f) { return !!(f.p7g && f.p7g.rsp > 0) || f.y > GROUND + 50; }

    // pod postavami: RGB rozdvojenie GLITCHA (červená a azúrová kópia s posunom 2–3 px) a klony
    hooks.drawBack.push((stage, F) => {
      for (const f of F.fighters) {
        if (!isG(f) || hidden(f) || f.state === 'baby') continue;
        const info = frameInfo(f); if (!info) continue;
        const off = 2 + ((api.frame >> 3) & 1), s = f.def.scale || 1;
        blit(tinted(info.an.img, info.a, info.fr, COL.red), info, f.x - off, f.y, f.facing, { single: true, alpha: 0.75, scale: s });
        blit(tinted(info.an.img, info.a, info.fr, COL.cyan), info, f.x + off, f.y, f.facing, { single: true, alpha: 0.75, scale: s });
      }
      const G = F.p7g; if (!G) return;
      for (const c of G.clones) drawClone(F, c);
    });
    function drawClone(F, c) {
      const a = F.fighters[c.s]; if (!a) return;
      const state = c.st === 'walk' ? 'walk' : c.st, info = frameInfo(fake(a, state, c.st === 'walk' ? c.t : c.stT, c.x, c.y, c.dir, state === 'walk' ? null : state));
      const fade = Math.min(1, c.t / 10) * (c.t > CLONE_LIFE - 20 ? (CLONE_LIFE - c.t) / 20 : 1);
      const jit = api.frame % 23 < 2 ? rnd(-3, 3) : 0;
      if (!info) {                                   // bez spritov: kreslená postava
        ctx.save(); ctx.globalAlpha = 0.45 * fade;
        api.drawFigure(Math.round(c.x + jit), c.y, c.dir, api.POSES[c.st === 'walk' ? (Math.floor(c.t / 10) % 2 ? 'walkA' : 'walkB') : c.st] || api.POSES.stand, a.def);
        ctx.restore(); return;
      }
      const s = a.def.scale || 1;
      blit(tinted(info.an.img, info.a, info.fr, COL.mag), info, c.x - 3 + jit, c.y, c.dir, { single: true, alpha: 0.35 * fade, scale: s });
      blit(tinted(info.an.img, info.a, info.fr, COL.cyan), info, c.x + 3 + jit, c.y, c.dir, { single: true, alpha: 0.35 * fade, scale: s });
      blit(info.an.img, info, c.x + jit, c.y, c.dir, { alpha: (api.frame % 9 < 7 ? 0.55 : 0.3) * fade, scale: s });
    }

    // nad postavami: glitch efekty tela, strely LAG, stav LAG, RESPAWN, VHS
    hooks.drawFront.push((stage, F) => {
      for (const f of F.fighters) {
        if (!isG(f)) continue;
        if (f.p7g && f.p7g.rsp > 0) { drawRespawn(F, f); continue; }
        if (hidden(f) || f.state === 'baby') continue;
        const info = frameInfo(f), e = events(f.side), h = HEIGHT(f), s = f.def.scale || 1;
        if (info && e.drop) blit(tinted(info.an.img, info.a, info.fr, 'missing'), info, f.x, f.y, f.facing, { single: true, alpha: 0.92, scale: s });
        if (info && e.tear) {
          blit(tinted(info.an.img, info.a, info.fr, COL.red), info, f.x - 6, f.y, f.facing, { single: true, alpha: 0.4, op: 'screen', scale: s });
          blit(tinted(info.an.img, info.a, info.fr, COL.cyan), info, f.x + 6, f.y, f.facing, { single: true, alpha: 0.4, op: 'screen', scale: s });
        }
        if (e.band) {
          const n = 1 + (e.seed % 3);
          for (let i = 0; i < n; i++) {
            const y0 = f.y - h + ((e.seed * (i + 3) * 37) % Math.max(1, h - 14)), bh = 4 + ((e.seed + i * 11) % 9), dx = ((e.seed + i) % 2 ? 1 : -1) * (3 + ((e.seed * (i + 1)) % 7));
            bandShift(f.x - 48, y0, 96, bh, dx);
          }
        }
        if (chance(0.45)) blocks(f.x, f.y, h, 1 + Math.floor(rnd(0, 3)));
      }
      const G = F.p7g; if (!G) return;
      for (const p of G.proj) drawLagWave(p);
      for (const f of F.fighters) if (f.p7lag && f.p7lag.t > 0 && !hidden(f)) drawLagged(f);
      ctx.save();
      for (const q of F.fx) {
        if (q.kind !== 'p7px') continue;
        ctx.globalAlpha = clamp(1.4 - q.t / q.life * 1.4, 0, 1); ctx.fillStyle = q.c;
        ctx.fillRect(Math.round(q.x), Math.round(q.y), q.s || 3, q.s || 3);
      }
      ctx.restore();
      for (const t of G.texts) {
        ctx.save(); ctx.globalAlpha = t.t > t.life - 12 ? (t.life - t.t) / 12 : 1;
        const jx = t.t < 10 && t.t % 3 === 0 ? 2 : 0;
        api.text(t.txt, t.x + jx, t.y - t.t * 0.25, t.size || 12, 'center', t.c);
        ctx.restore();
      }
      if (G.vhs) drawVHS(F, G.vhs);
    });
    function drawLagWave(p) {             // pomalá vlna: oblúky ako signál Wi-Fi, azúrová s fialovým tieňom
      const t = p.t, d = p.dir;
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const r = 8 + i * 8 + (t % 12) * 0.5, wob = Math.sin(t / 4 + i) * 1.5, cx = p.x - d * 14;
        for (const [col, ox, lw, al] of [[COL.mag, -2, 4, 0.55], [COL.cyan, 0, 3, 0.95]]) {
          ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.globalAlpha = al * (1 - i * 0.18);
          ctx.beginPath(); ctx.arc(cx + ox, p.y + wob, r, d > 0 ? -0.8 : Math.PI - 0.8, d > 0 ? 0.8 : Math.PI + 0.8); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = COL.white; ctx.fillRect(Math.round(p.x - d * 14) - 2, Math.round(p.y) - 2, 4, 4);
      ctx.restore();
      if (t % 20 < 14) api.text('LAG', p.x - d * 6, p.y - 24, 8, 'center', COL.cyan);
    }
    function drawLagged(f) {              // nad hlavou: ikona načítavania + LAG 999 ms
      const x = f.x, y = f.y - HEIGHT(f) - 24, k = Math.floor(api.frame / 4) % 8;
      ctx.save();
      for (let i = 0; i < 8; i++) {
        const ang = i / 8 * Math.PI * 2 - Math.PI / 2, on = (i - k + 8) % 8;
        ctx.globalAlpha = on === 0 ? 1 : Math.max(0.15, 0.8 - on * 0.1);
        ctx.fillStyle = on === 0 ? COL.white : '#9fb0c8';
        ctx.fillRect(Math.round(x + Math.cos(ang) * 8) - 2, Math.round(y + Math.sin(ang) * 8) - 2, 4, 4);
      }
      ctx.restore();
      api.text('LAG 999 ms', x, y - 14, 9, 'center', api.frame % 30 < 20 ? '#ff5050' : '#ffd200');
    }
    function drawRespawn(F, f) {
      const g = f.p7g, el = RSP_T - g.rsp, x = g.rx, y = GROUND;
      if (el < 26) {                                // rozpad: riadky sa rozchádzajú a blednú
        const info = frameInfo(fake(f, 'hit', 4, x, y, f.facing));
        if (info) slices(info, x, y, f.facing, 2 + el * 1.6, 1 - el / 26, 7, f.def.scale || 1);
      } else if (el >= RSP_T - 22) {                // zloženie: riadky sa zbiehajú
        const k = (el - (RSP_T - 22)) / 22, info = frameInfo(fake(f, 'idle', el, x, y, f.facing));
        if (info) slices(info, x, y, f.facing, (1 - k) * 34, 0.35 + 0.65 * k, 3, f.def.scale || 1);
      }
      if (el >= 18 && el < RSP_T - 4) {             // načítavanie
        const k = clamp((el - 18) / (RSP_T - 26), 0, 1), bx = Math.round(x - 32), by = Math.round(y - 96);
        ctx.save();
        ctx.fillStyle = '#000'; ctx.fillRect(bx - 2, by - 2, 68, 10);
        ctx.fillStyle = '#2a2350'; ctx.fillRect(bx, by, 64, 6);
        ctx.fillStyle = '#7dff6a'; ctx.fillRect(bx, by, Math.round(64 * k), 6);
        ctx.restore();
        api.text('RESPAWN' + '...'.slice(0, 1 + Math.floor(el / 10) % 3), x, by - 6, 9, 'center', '#7dff6a');
      }
    }
    function drawVHS(F, v) {              // REWIND: pásy, ◀◀, chvenie, stopa „pretáčania“
      const k = v.t / v.life, a = v.t < 6 ? 1 : 1 - Math.max(0, (v.t - 30) / (v.life - 30));
      const f = F.fighters[v.s];
      ctx.save();
      if (f && v.pts && v.t < 34) {               // duchovia na ceste späť
        const info = frameInfo(f);
        if (info) for (let i = 0; i < v.pts.length - 1; i++) {
          const al = 0.32 * (1 - v.t / 34) * ((i + 1) / v.pts.length);
          blit(tinted(info.an.img, info.a, info.fr, i % 2 ? COL.cyan : COL.mag), info, v.pts[i], GROUND, f.facing, { single: true, alpha: al, scale: f.def.scale || 1 });
        }
      }
      ctx.globalAlpha = 0.5 * a;                  // sledovacie pásy VHS
      for (let i = 0; i < 4; i++) {
        const y = ((v.t * 7 + i * 71) % 290) - 10, hh = 3 + (i % 3) * 3;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(200,220,255,0.35)';
        ctx.fillRect(0, y, W, hh);
        for (let n = 0; n < 14; n++) { ctx.fillStyle = chance(0.5) ? '#ffffff' : '#000000'; ctx.fillRect(Math.round(rnd(0, W)), Math.round(y + rnd(-2, hh + 2)), Math.round(rnd(2, 10)), 1); }
      }
      ctx.globalAlpha = 0.18 * a; ctx.fillStyle = '#3a6cff'; ctx.fillRect(0, 0, W, 270);
      ctx.restore();
      if (v.t % 16 < 11 || k < 0.2) {
        ctx.save(); ctx.globalAlpha = Math.max(0.2, a);
        const jx = Math.round(rnd(-1.5, 1.5));
        api.text('◀◀ REWIND', 28 + jx, 76, 14, 'left', COL.white);
        ctx.restore();
      }
    }

    // HUD: KLON (cooldown), ◀◀ (REWIND v tomto kole), 1UP (RESPAWN v zápase); v 1. kole nápoveda kombá pre človeka
    function meter(side, label, v, col) {
      const right = side === 1, x = right ? W - 12 - 190 : 12, mx = right ? x + 190 - 60 - 132 : x + 132, my = 27;
      ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
      ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * clamp(v, 0, 1)), 4);
      api.text(label, mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
    }
    hooks.drawHud.push(F => {
      if (!F || F.paused) return;
      F.fighters.forEach((f, i) => {
        if (!isG(f)) return;
        const g = f.p7g || {}, G = F.p7g || { rsp: [] };
        ctx.save();
        meter(i, 'KLON', 1 - (g.cdK || 0) / CLONE_CD, '#ff7ae0');
        const right = i === 1, x0 = right ? W - 56 : 56;
        const icons = [['◀◀', !g.rw, COL.white], ['1UP', !G.rsp[i], '#7dff6a']];
        icons.forEach(([lbl, on, col], k) => api.text(lbl, x0 + (right ? -1 : 1) * k * 26, 54, 8, right ? 'right' : 'left', on ? col : '#555'));
        ctx.restore();
        if (F.round === 1 && (F.phase === 'intro' || (F.phase === 'fight' && F.t < 240)) && api.inputKind(i) !== 'cpu')
          api.text('LAG: ♪ · KLON: ↓ VPRED ♪ · REWIND: VZAD VZAD ♪', i === 0 ? 8 : W - 30, 254, 7, i === 0 ? 'left' : 'right', '#9ff8ff');
      });
    });

    // pre testy, rebríček a scény
    api.glitch = {
      id: 'glitch', isGlitch: isG,
      force(f, mv, ignoreCd = false) {     // spustí schopnosť bez komba (test, scény)
        const F = fight(); if (!F) return false;
        if (ignoreCd) { f.cd.special = 0; gs(f).cdK = 0; gs(f).rw = false; }
        return startMove(f, F.fighters[1 - f.side], mv);
      },
      record: f => { const r = REC.get(f); return r ? r.n : 0; },
      tune: { LAG_CD, LAG_T, CLONE_CD, CLONE_LIFE, RSP_T, RSP_HP },
      help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — rovnaký formát ako api.moves.help (OVLÁDANIE, COMBOS.md)
        ['LAG (GLITCH)', 'T', 'O', '△', '♪'],
        ['CLONE (GLITCH)', 'S VPRED T', '↓ VPRED O', '↓ ▶ △', 'páčka dole, vpred + ♪'],
        ['REWIND (GLITCH)', 'VZAD VZAD T', 'VZAD VZAD O', '◀ ◀ △', 'páčka vzad 2× + ♪'],
      ],
    };
  },
});
