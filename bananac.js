// MATÚŠKO KOMBAT XII — modul bananac: BANÁNÁČ, chlapík v banánovom kostýme (paródia na Fortnite) (P14)
//
//   BUILD ........ ♪               pred sebou postaví drevenú stenu s klincami (vyrastie zdola za 0,3 s, ako vo Fortnite
//                                  najprv modrý náčrt): zastaví strely aj údery a nikto cez ňu neprejde; po 3 zásahoch
//                                  alebo 4 s sa rozpadne na triesky; najviac jedna stena naraz
//   EMOTE ........ ↓ VPRED ♪       začne tancovať; súper do 120 px musí ~1,5 s tancovať s ním a nemôže útočiť
//                                  (kto práve drží blok, ubráni sa); po 0,7 s môže Banánáč tanec prerušiť úderom / kopom
//   LOOT LLAMA ... VZAD VZAD ♪     raz za kolo vyhodí hore piňatu-lamu, pukne a vypadne náhodný darček:
//                                  ZDRAVIE +15 HP Banánáčovi · BOMBA pred súpera (vybuchne, dá sa blokovať)
//                                  · BANÁNOVÁ ŠUPKA na zemi (súper sa na nej pošmykne a spadne)
//   Výhra: tanec (sprite win). Hlášku bananac_wins volá game.js.
//
// Sprity 'bananac' (idle walk jump punch kick uppercut sweep block hit fall dizzy win dance build throw): build = kľakne
// a kladivkuje, throw = oboma rukami vyhodí niečo hore (vrchol okolo 6.–7. snímky), dance = tanec pre EMOTE. KIAI nemá
// vlastný sprite → použije sa punch. Bez sady sa kreslí Šimonovými spritmi so žltou paletou (mierka 1, výška ~150 px).
// Schopnosti sa viažu na def.p14 === 'bananac' (kópia s inou paletou ich zdedí). Sieťová hra: stav len ako čisté dáta
// v F.p14b (steny, lamy, darčeky, výbuchy, nápisy — strelec je side) a na bojovníkovi (f.p14, f.p14d); logika beží len
// u hostiteľa, hosť kreslí zo stavu.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'bananac',
  init(api) {
    const { W, GROUND, MOVE, FA, IMG, hooks, ctx } = api;
    const { rnd, chance, clamp } = api;

    // ================================================================ ladenie (snímky pri 60 fps)
    const SEQ_GAP = 30;                                                  // medzera medzi stlačeniami v kombe (deti, joystick)
    const BUILD_CD = 330;                                                // ♪ BUILD: 5,5 s (meter ŠPECIÁL v HUD)
    const WALL_DIST = 54, WALL_HW = 20, WALL_H = 130, WALL_RISE = 18, WALL_LIFE = 240, WALL_HP = 3;
    const WALL_SOLID = 44;                                               // stred bojovníka ostane aspoň takto ďaleko od stredu steny
    const WALL_MIN_X = 22 + WALL_SOLID + 4;                              // stena nikdy tak pri kraji, aby sa za ňu nezmestil bojovník
    const EMOTE_CD = 480, EMOTE_T = 90, EMOTE_PULL = 12, EMOTE_CANCEL = 42, EMOTE_RANGE = 120, DANCE_T = 90;
    const HEAL = 15, BOMB_DMG = 8, BOMB_R = 54, BOMB_FUSE = 26, PEEL_T = 480, PEEL_DMG = 4, GIFT_T = 34, GIFT_G = 0.22;
    const WOOD = { light: '#e2a65c', mid: '#d0904a', dark: '#a8682f', edge: '#8a5326', line: '#3d220c', grain: 'rgba(110,60,20,0.45)' };
    const LLAMA_COL = ['#ff5fc8', '#ffd23a', '#4fc3ff', '#8a4fff', '#7dff6a'];

    // ================================================================ postava
    const own = !!(FA.bananac && FA.bananac.anims && FA.bananac.anims.idle);
    const DEF = {
      p14: 'bananac', name: 'BANÁNÁČ', short: 'BANÁNÁČ', special: 'heligonka', specialName: 'BUILD', finisher: 'friendship', moveSpecial: null,
      gi: '#ffd93b', giDark: '#d9a21a', belt: '#5a3a14', hair: '#6b4a1e',              // farby kreslených náhrad (portrét, bábätko)
      blurb: ['Chlapík v banánovom kostýme.', 'Postaví stenu, zatancuje', 'a hodí piňatu-lamu.'],
      ...(own ? { height: 155 } : { sprites: 'simon', palette: 'bananac', height: 150 }),
    };
    api.registerFighter('bananac', DEF, false);     // nevoliteľný: odomyká ho rebrík HORA (ladder.js)
    // náhradná žltá paleta (kompozitné režimy, fungujú aj bez ctx.filter): všetko do jasnej banánovej žltej
    api.registerPalette('bananac', (x, w, h) => {
      const src = document.createElement('canvas'); src.width = w; src.height = h;
      src.getContext('2d').drawImage(x.canvas, 0, 0);
      const step = (mode, fill) => { x.globalCompositeOperation = mode; x.fillStyle = fill; x.fillRect(0, 0, w, h); };
      step('saturation', '#808080'); step('screen', '#8a8a8a'); step('color', '#ffd200');
      x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-over';
    });
    const SET = own ? FA.bananac.anims : null;
    if (SET) {                                      // doplnky k sade (len keď chýbajú; Master ich môže dodať v sprites.json)
      if (!SET.kiai && SET.punch) SET.kiai = Object.assign({}, SET.punch, { alias: 'punch' });   // KIAI: vystretá ruka (game.js načíta ako bananac/kiai)
      if (SET.throw && !SET.throw.peak) SET.throw.peak = [6, 7];      // vyhodenie: vec letí z rúk na 7. snímke
      if (SET.build && !SET.build.peak) SET.build.peak = [2, 11];     // výpad (0–1), kľak a kladivkovanie (2–11), vstávanie
    }

    // ================================================================ pohyby (stav = vlastný názov, animácia cez animFallback)
    Object.assign(MOVE, {
      bn_build: { startup: 6, active: 18, recovery: 14 },               // výpad, kladivkuje (stena rastie), vstane
      bn_throw: { startup: 22, active: 6, recovery: 18 },               // nápriah, výskok s vyhodením, dopad
      bn_emote: { startup: EMOTE_PULL, active: 1, recovery: EMOTE_T - EMOTE_PULL - 1 },
    });
    api.ATTACK_STATES.add('bn_build'); api.ATTACK_STATES.add('bn_throw');   // snímky podľa fáz (peak), nie slučka
    api.animFallback('bn_build', own ? 'build' : 'punch');
    api.animFallback('bn_throw', own ? 'throw' : 'kiai');
    api.animFallback('bn_emote', 'dance');                             // Banánáč aj Šimon (náhrada) majú sprite dance

    // ================================================================ zvuky (len existujúce, inak syntetická náhrada game.js)
    const snd = (n, v = 0.8) => api.sfx(n, v);

    // ================================================================ pomôcky
    const isB = f => !!(f && f.def && f.def.p14 === 'bananac');
    const fight = () => api.fight;
    const host = () => api.NET.role !== 'guest';
    const live = F => !!(F && api.scene === 'fight' && !F.paused);
    const HEIGHT = f => (f.def && f.def.height) || 138;
    const S = f => (f.def && f.def.scale) || 1;
    const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
    const newUse = () => ({ build: 0, emote: 0, llama: 0, wallHits: 0, wallBroken: 0, blocked: 0, danced: 0, resisted: 0,
                            heal: 0, healed: 0, bomb: 0, bombHit: 0, bombBlocked: 0, peel: 0, slip: 0 });
    function st(F) {
      if (!F.p14b) F.p14b = { walls: [], llamas: [], gifts: [], booms: [], texts: [], air: [false, false], used: [newUse(), newUse()] };
      return F.p14b;
    }
    function bs(f) { return f.p14 || (f.p14 = { cdE: 0, llama: false, gift: null, ai: 0, last: null, n: {}, react: null }); }
    const seq = (inp, s) => !!(inp && inp.history && api.matchSeq(inp, s, SEQ_GAP));
    function hitFrom(a, d, m, dir) {       // zásah zo smeru (bomba, šupka): blok aj odhodenie podľa smeru
      const f0 = a.facing; a.facing = dir;
      try { api.applyHit(a, d, m); } finally { a.facing = f0; }
    }
    function say(F, txt, x, y, c = '#ffe066', life = 50, size = 12) { st(F).texts.push({ txt, x: clamp(x, 30, W - 30), y, c, t: 0, life, size }); }
    const wallK = w => { const k = Math.min(1, w.t / WALL_RISE); return 1 - (1 - k) * (1 - k); };   // rýchlo vyrastie, na konci spomalí
    const wallTop = w => GROUND - WALL_H * wallK(w);
    const between = (w, a, b) => !!(a && b && (a.x - w.x) * (b.x - w.x) < 0);
    const alive = w => !w.dead;
    function ownerSide(p) {
      if (p.owner && typeof p.owner.side === 'number') return p.owner.side;
      if (typeof p.side === 'number') return p.side;
      if (typeof p.s === 'number') return p.s;
      return -1;
    }

    // ================================================================ schopnosti
    function startMove(f, o, mv, gift) {
      const F = fight(); if (!F || F.phase !== 'fight' || !isB(f) || !f.onGround) return false;
      const B = st(F), g = bs(f);
      switch (mv) {
        case 'build':
          if (f.cd.special > 0) return false;
          f.set('bn_build', 'bn_build'); f.cd.special = BUILD_CD;
          break;
        case 'emote':
          if (g.cdE > 0) return false;
          f.set('bn_emote'); g.cdE = EMOTE_CD;
          snd('notes', 0.7); snd('crowd', 0.4);
          say(F, 'EMOTE!', f.x, f.y - HEIGHT(f) - 22, '#ff9ff0', 50, 13);
          break;
        case 'llama': {
          if (g.llama) return false;
          f.set('bn_throw', 'bn_throw'); g.llama = true;
          const r = Math.random();                                         // darček sa vyberie hneď (test ho vynúti cez Math.random)
          g.gift = ['heal', 'bomb', 'peel'].includes(gift) ? gift : r < 1 / 3 ? 'heal' : r < 2 / 3 ? 'bomb' : 'peel';
          break;
        }
        default: return false;
      }
      if (o) f.facing = o.x >= f.x ? 1 : -1;
      f.vx = 0;
      B.used[f.side][mv]++;
      return true;
    }

    // ---------------------------------------------------------------- BUILD: stena
    function spawnWall(F, f) {
      const B = st(F);
      for (const w of B.walls) if (w.s === f.side && alive(w)) breakWall(F, w);          // najviac jedna stena naraz
      const x = clamp(f.x + f.facing * WALL_DIST, WALL_MIN_X, W - WALL_MIN_X);
      B.walls.push({ s: f.side, x, dir: f.facing, t: 0, hp: WALL_HP, hits: 0, fl: 0 });
      for (let i = 0; i < 6; i++) F.fx.push({ kind: 'spark', x: x + rnd(-WALL_HW, WALL_HW), y: GROUND - rnd(0, 8), vx: rnd(-1.4, 1.4), vy: -rnd(0.6, 2), c: '#e9cf9a', t: 0, life: 20 });
    }
    function chips(F, x, y, n, spread = 1) {
      const col = [WOOD.light, WOOD.mid, WOOD.dark, '#f1c98a'];
      for (let i = 0; i < n; i++) F.fx.push({ kind: 'p14chip', x: x + rnd(-6, 6) * spread, y: y + rnd(-8, 8) * spread, vx: rnd(-2.6, 2.6), vy: -rnd(1, 4.2),
                                             rot: rnd(0, 6.28), vr: rnd(-0.4, 0.4), c: col[i % col.length], w: Math.round(rnd(5, 10)), t: 0, life: Math.round(rnd(36, 60)) });
    }
    function breakWall(F, w) {
      if (w.dead) return;
      w.dead = true;
      const top = wallTop(w);
      for (let i = 0; i < 4; i++) chips(F, w.x, top + (GROUND - top) * (i + 0.5) / 4, 5, 2.2);
      snd('crack', 0.55); snd('fall', 0.35);
      if (F.phase === 'fight') { st(F).used[w.s].wallBroken++; say(F, 'PRASK!', w.x, top - 10, '#f1c98a', 40, 13); }
    }
    function wallHit(F, w, x, y) {
      if (w.dead) return;
      const B = st(F);
      w.hp--; w.hits++; w.fl = 8;
      B.used[w.s].wallHits++; B.used[w.s].blocked++;
      chips(F, x, y, 6); snd('block', 0.75); api.shake(2);
      if (w.hp <= 0) breakWall(F, w);
    }
    const nearFace = (w, dir) => w.x - dir * WALL_HW;                    // strana steny, ku ktorej prilieta strela smerom dir
    function blockShots(F, w) {
      const fs = F.fighters, top = wallTop(w) - 8;
      // KIAI lúč (game.js): zásah na stene, lúč sa pri kreslení skráti po stenu
      for (const b of F.beams) {
        const a = b.owner, o = a && fs[1 - a.side];
        if (!a || b.hit || b.t >= 26 || !between(w, a, o) || b.y < top) continue;
        b.hit = true; b.p14cut = nearFace(w, b.dir);
        wallHit(F, w, b.p14cut, b.y);
      }
      // noty heligónky (game.js): pohnú sa až po tomto háčiku → zastaviť pred stenou
      for (const n of F.notes) {
        const a = n.owner, o = a && fs[1 - a.side], dir = sgn(n.vx);
        if (n.dead || !a || !dir || !between(w, a, o) || n.y < top) continue;
        if ((n.x - (w.x + dir * WALL_HW)) * dir < 0 && (n.x + n.vx - nearFace(w, dir)) * dir >= 0) { n.dead = true; wallHit(F, w, nearFace(w, dir), n.y); }
      }
      // strely modulov: F.<modul>.proj (enemies: lano, ľadová guľa, blesk; rocky: HAV, kosť; glitch: LAG; vodnik: bublina, hrnček; …)
      for (const k in F) {
        const v = F[k];
        if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray(v.proj)) continue;
        for (const p of v.proj) {
          if (!p || p.dead || typeof p.x !== 'number') continue;
          const s = ownerSide(p); if (s < 0) continue;
          const a = fs[s], o = fs[1 - s];
          if (!between(w, a, o) || (typeof p.y === 'number' && p.y < top)) continue;
          if (typeof p.len === 'number' && typeof p.dir === 'number' && 'hit' in p) {          // vlna (HAV): ako lúč
            if (!p.hit) { p.hit = true; p.p14cut = nearFace(w, p.dir); wallHit(F, w, p.p14cut, p.y); }
            continue;
          }
          const rope = p.kind === 'rope';
          if (rope && p.st !== 'out') continue;
          const vx = rope ? (p.dir || 0) * 12 : (typeof p.vx === 'number' ? p.vx : 0), dir = sgn(vx);
          if (!dir || (p.kind === 'bone' && p.st && p.st !== 'fly')) continue;
          if ((p.x - (w.x + dir * WALL_HW)) * dir >= 0 || (p.x + vx - nearFace(w, dir)) * dir < 0) continue;   // už je za stenou / ešte nedoletí
          const fx = nearFace(w, dir);
          if (rope) { p.st = 'back'; p.x = fx; }                                            // lano sa od steny vráti
          else if (p.kind === 'bone' && p.st === 'fly') { p.st = 'bounce'; p.x = fx - dir * 4; p.vx = -p.vx * 0.35; p.vy = -4.2; }   // kosť sa odrazí
          else p.dead = true;
          wallHit(F, w, fx, typeof p.y === 'number' ? p.y : GROUND - 90);
        }
      }
      // klony GLITCHA narazia do steny a rozpadnú sa
      const clones = F.p7g && F.p7g.clones;
      if (Array.isArray(clones)) for (const c of clones) {
        if (!c || c.dead || typeof c.x !== 'number') continue;
        const o = fs[1 - c.s];
        if (o && (c.x - w.x) * (o.x - w.x) < 0 && Math.abs(c.x - w.x) < WALL_SOLID) { c.dead = true; wallHit(F, w, nearFace(w, sgn(o.x - c.x)), GROUND - 80); }
      }
    }
    // údery a kopy cez stenu: zásahová zóna by prešla stenou skôr než k súperovi → zásah berie stena
    function blockMelee(F, w) {
      const top = wallTop(w);
      for (const a of F.fighters) {
        const o = F.fighters[1 - a.side], m = MOVE[a.move];
        if (!m || a.hitDone || !api.HIT_STATES.has(a.state) || !between(w, a, o) || typeof m.x0 !== 'number') continue;
        const tn = a.t + 1;
        if (tn < m.startup - 1 || tn >= m.startup + m.active) continue;
        const px = a.x + (a.vx || 0), py = a.y + (a.vy || 0);
        const xa = px + a.facing * m.x0, xb = px + a.facing * (m.x1 + 6);
        const hx0 = Math.min(xa, xb), hx1 = Math.max(xa, xb), hy0 = py + m.y0, hy1 = py + m.y1;
        if (hx1 < w.x - WALL_HW || hx0 > w.x + WALL_HW || hy1 < top || hy0 > GROUND) continue;
        a.hitDone = true;
        if (a.state === 'torpedo') a.enFlyEnd = 'blocked';             // MAJSTER MRAK sa od steny odrazí (enemies.js)
        wallHit(F, w, nearFace(w, a.facing), clamp((hy0 + hy1) / 2, top + 6, GROUND - 6));
      }
    }
    // nikto cez stenu neprejde (ani Banánáč); rastúca stena súpera postupne odsunie
    function pushOut(F, w) {
      for (const f of F.fighters) {
        if (f.y < GROUND - 200 || f.y > GROUND + 20) continue;            // skrytý nad obrazovkou / pod zemou (teleport, RESPAWN)
        const d = f.x - w.x;
        if (Math.abs(d) >= WALL_SOLID) continue;
        const side = d ? sgn(d) : (f.side === w.s ? -w.dir : w.dir);
        const tx = clamp(w.x + side * WALL_SOLID, 22, W - 22);
        f.x = w.t < WALL_RISE ? f.x + clamp(tx - f.x, -5, 5) : tx;
      }
    }

    // ---------------------------------------------------------------- EMOTE: tanec
    const PULL_BASE = new Set(['idle', 'walk', 'hit', 'punch', 'kick', 'uppercut', 'sweep', 'kiai', 'special']);
    const NO_PULL = new Set(['teleport', 'warp', 'torpedo', 'flykick', 'airkick', 'jump', 'bn_build', 'bn_throw']);
    function pull(F, f, o) {
      const B = st(F);
      if (!o || Math.abs(o.x - f.x) > EMOTE_RANGE || !o.onGround || o.y > GROUND + 1 || !o.vulnerable || o.hp <= 0) return;
      if ((o.state === 'block' || o.state === 'blockstun') && o.facing === (f.x >= o.x ? 1 : -1)) {
        B.used[f.side].resisted++;
        say(F, 'NETANCUJEM!', o.x, o.y - HEIGHT(o) - 18, '#9fd8ff', 50, 11);
        return;
      }
      if (!(PULL_BASE.has(o.state) || (api.ATTACK_STATES.has(o.state) && !NO_PULL.has(o.state)))) return;
      o.set('dance'); o.stun = DANCE_T; o.vx = 0; o.p14d = f.side;      // stav 'dance' z game.js (ako po heligónke), bez poškodenia
      B.used[f.side].danced++;
      snd('crowd', 0.5);
      say(F, 'TANCUJ!', o.x, o.y - HEIGHT(o) - 18, '#ff9ff0', 55, 13);
    }

    // ---------------------------------------------------------------- LOOT LLAMA: piňata a darčeky
    function spawnLlama(F, f) {
      const g = bs(f), gift = g.gift || 'heal'; g.gift = null;
      st(F).llamas.push({ s: f.side, x: f.x + f.facing * 12 * S(f), y: f.y - 172 * S(f), vx: f.facing * 0.45, vy: -1.5, t: 0, gift, dir: f.facing });
      snd('whoosh', 0.6);
    }
    function aim(F, s, gift) {               // kam dopadne bomba / šupka: pred súpera (na jeho strane steny)
      const a = F.fighters[s], o = F.fighters[1 - s], dir = o.x >= a.x ? 1 : -1;
      let tx = o.x - dir * (gift === 'bomb' ? 16 : 48);
      for (const w of st(F).walls) if (alive(w) && Math.abs(tx - w.x) < WALL_HW + 10) tx = w.x + sgn(o.x - w.x || dir) * (WALL_HW + 10);
      return clamp(tx, 30, W - 30);
    }
    function popLlama(F, L) {
      const B = st(F), a = F.fighters[L.s];
      L.dead = true;
      snd('pop', 0.8); snd('crowd', 0.3);
      for (let i = 0; i < 26; i++) F.fx.push({ kind: 'p14conf', x: L.x + rnd(-8, 8), y: L.y + rnd(-8, 8), vx: rnd(-2.6, 2.6), vy: rnd(-3, 1), c: LLAMA_COL[i % LLAMA_COL.length], t: 0, life: Math.round(rnd(40, 70)) });
      const label = { heal: 'ZDRAVIE!', bomb: 'BOMBA!', peel: 'ŠUPKA!' }[L.gift];
      say(F, 'LOOT! ' + label, L.x, L.y + 12, '#ffe066', 50, 12);
      B.used[L.s][L.gift]++;
      const gf = { k: L.gift, s: L.s, x: L.x, y: L.y, vx: 0, vy: -1, t: 0, st: 'fall', tx: L.x, ft: 0 };
      if (L.gift !== 'heal' && a) {
        gf.tx = aim(F, L.s, L.gift);
        gf.vx = (gf.tx - gf.x) / GIFT_T;
        gf.vy = ((GROUND - 8) - gf.y - 0.5 * GIFT_G * GIFT_T * GIFT_T) / GIFT_T;
      }
      B.gifts.push(gf);
    }
    function explode(F, gf) {
      const B = st(F), a = F.fighters[gf.s], o = F.fighters[1 - gf.s];
      gf.dead = true;
      B.booms.push({ x: gf.x, y: GROUND - 22, t: 0 });
      snd('boom', 0.8); snd('kick', 0.5); api.shake(7);
      if (!a || !o || F.phase !== 'fight') return;
      if (Math.abs(o.x - gf.x) < BOMB_R + 17 && o.y > GROUND - 110 && o.vulnerable && o.state !== 'dizzy') {
        const dir = o.x >= gf.x ? 1 : -1, blocked = (o.state === 'block' || o.state === 'blockstun') && o.facing === -dir;
        hitFrom(a, o, { name: 'bananac_bomb', dmg: BOMB_DMG, launch: 3, push: 2.6, hitstun: 18, sound: 'kick', sx: o.x - dir * 6, sy: o.y - 60 }, dir);
        B.used[gf.s][blocked ? 'bombBlocked' : 'bombHit']++;
      }
    }
    function slipOn(F, gf, o) {
      const B = st(F), a = F.fighters[gf.s];
      gf.dead = true;
      if (!a) return;
      const dir = o.vx > 0.2 ? 1 : o.vx < -0.2 ? -1 : (o.x >= gf.x ? 1 : -1);
      hitFrom(a, o, { name: 'bananac_peel', dmg: PEEL_DMG, blockable: false, launch: 2.6, push: 1, hitstun: 16, sound: 'slip', sx: o.x, sy: GROUND - 14 }, dir);
      B.used[gf.s].slip++;
      F.fx.push({ kind: 'p14peel', x: gf.x, y: GROUND - 6, vx: -dir * 1.6, vy: -3.6, rot: 0, vr: 0.35 * -dir, t: 0, life: 40 });
      say(F, 'ŠMYK!', o.x, o.y - HEIGHT(o) - 24, '#ffe066', 50, 14);
    }
    function stepGifts(F) {
      const B = st(F);
      for (const L of B.llamas) {
        L.t++; L.vy += 0.08; L.x = clamp(L.x + L.vx, 20, W - 20); L.y += L.vy;
        if (L.vy >= 0 || L.t > 50) popLlama(F, L);                       // vo vrchole pukne
      }
      B.llamas = B.llamas.filter(L => !L.dead);
      for (const gf of B.gifts) {
        gf.t++;
        const a = F.fighters[gf.s], o = F.fighters[1 - gf.s];
        if (gf.k === 'heal') {                                            // srdiečko padá rovno na Banánáča
          if (!a) { gf.dead = true; continue; }
          gf.vy = Math.min(gf.vy + 0.16, 3.2); gf.y += gf.vy; gf.x += (a.x - gf.x) * 0.1;
          if (gf.y >= a.y - HEIGHT(a) * 0.6 || gf.t > 140) {
            gf.dead = true;
            if (F.phase === 'fight' && a.hp > 0) {
              const add = Math.max(0, Math.min(HEAL, a.maxHp - a.hp));
              a.hp += add; B.used[gf.s].healed += add;
              say(F, add > 0 ? '+' + add : 'PLNÝ!', a.x, a.y - HEIGHT(a) - 26, '#7dff6a', 55, 15);
              snd('soul', 0.7); snd('confirm', 0.3);
              for (let i = 0; i < 6; i++) F.fx.push({ kind: 'heart', x: a.x + rnd(-18, 18), y: a.y - rnd(60, 130), vy: -0.8, t: 0, life: 40 });
            }
          }
          continue;
        }
        if (gf.st === 'fall') {                                           // bomba / šupka letí oblúkom pred súpera
          gf.vy += GIFT_G; gf.x += gf.vx; gf.y += gf.vy;
          if (gf.y >= GROUND - 8 || gf.t > GIFT_T + 20) { gf.y = GROUND - 8; gf.vx = 0; gf.vy = 0; gf.st = gf.k === 'bomb' ? 'fuse' : 'ground'; gf.ft = 0; snd(gf.k === 'bomb' ? 'fall' : 'slip', 0.35); }
          continue;
        }
        gf.ft++;
        if (gf.k === 'bomb') { if (gf.ft >= BOMB_FUSE) explode(F, gf); continue; }
        if (gf.ft >= PEEL_T) { gf.dead = true; continue; }                 // šupka po čase zmizne
        if (!o || isB(o) && o.side === gf.s || gf.ft < 6) continue;
        const inside = Math.abs(o.x - gf.x) < 20, onG = o.y >= GROUND;
        const landed = onG && B.air[o.side], walking = onG && o.state === 'walk' && Math.abs(o.vx) > 0.2;
        if (inside && (landed || walking) && o.vulnerable && o.state !== 'dizzy' && F.phase === 'fight') slipOn(F, gf, o);
      }
      B.gifts = B.gifts.filter(gf => !gf.dead);
      for (const bm of B.booms) bm.t++;
      B.booms = B.booms.filter(bm => bm.t < 34);
    }

    // ================================================================ vstup (idle/walk/block, pred moves.js: unshift)
    hooks.input.unshift((f, o, inp) => {
      if (!isB(f)) return false;
      const F = fight(); if (!F || !inp || !inp.pressed) return false;
      const p = inp.pressed;
      if (F.phase !== 'fight' || !f.onGround) return !!p.special;       // ♪ BANÁNÁČA nikdy nespustí heligónku (ani vo FINISH HIM)
      let mv = null;
      if (inp instanceof api.CPU) {
        const it = inp.p14Intent; inp.p14Intent = null;
        if (it && it.frame === api.frame) mv = it.mv;
        else if (p.special) mv = 'build';
      } else if (p.special && seq(inp, ['down', 'F', 'special'])) mv = 'emote';
      else if (p.special && seq(inp, ['B', 'B', 'special'])) mv = 'llama';
      else if (p.special) mv = 'build';
      if (mv && startMove(f, o, mv)) return true;
      return !!p.special;          // počas cooldownu ♪ nič nespraví (žiadne noty)
    });

    // ================================================================ stavy Banánáča
    hooks.state.push((f, o, inp) => {
      const F = fight(); if (!F) return false;
      switch (f.state) {
        case 'bn_build': {
          const m = MOVE.bn_build;
          f.vx *= 0.6;
          if (f.t === m.startup && F.phase === 'fight') spawnWall(F, f);
          if (f.t >= m.startup && f.t <= m.startup + WALL_RISE && (f.t - m.startup) % 5 === 0) snd('block', 0.4);   // ťuk-ťuk kladivkom
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'bn_throw': {
          const m = MOVE.bn_throw;
          f.vx *= 0.6;
          if (f.t === m.startup) snd('whoosh', 0.45);
          if (f.t === m.startup + m.active && F.phase === 'fight') spawnLlama(F, f);
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'bn_emote': {
          f.vx = 0;
          if (f.t === EMOTE_PULL && F.phase === 'fight') pull(F, f, o);
          if (f.t % 18 === 6) snd('notes', 0.35);
          if (f.t % 8 === 0 && host()) F.fx.push({ kind: 'note', x: f.x + rnd(-26, 26), y: f.y - rnd(110, 160), vx: rnd(-0.3, 0.3), vy: -0.7, t: 0, life: 46 });
          if (F.phase === 'fight' && f.t >= EMOTE_CANCEL && inp && inp.pressed) {       // tanec sa dá prerušiť útokom (alebo blokom)
            const p = inp.pressed, h = inp.held || {};
            if (p.punch || p.kick) {
              if (o) f.facing = o.x >= f.x ? 1 : -1;
              if (p.kick) { f.set('kick', 'kick'); snd('whoosh', 0.45); } else { f.set('punch', 'punch'); snd('whoosh', 0.35); }
              return true;
            }
            if (h.down) { f.set('block'); return true; }
          }
          if (f.t >= EMOTE_T || F.phase !== 'fight') f.set('idle');
          return true;
        }
      }
      return false;
    });

    // ================================================================ každý snímok (hostiteľ; unshift → pred strelami ostatných modulov)
    function stepHost(F) {
      const B = st(F);
      for (const f of F.fighters) {
        if (f.p14 && f.p14.cdE > 0) f.p14.cdE--;
        if (f.p14d !== undefined && f.p14d !== null && f.state !== 'dance') f.p14d = null;
      }
      const ph = F.phase;
      if (ph !== 'fight' && ph !== 'roundEnd' && ph !== 'intro') {      // FINISH HIM a zakončenia: stena, lama aj darčeky zmiznú
        for (const w of B.walls) breakWall(F, w);
        B.walls.length = 0; B.llamas.length = 0; B.gifts.length = 0;
      }
      for (const w of B.walls) {
        if (w.dead) continue;
        w.t++; if (w.fl > 0) w.fl--;
        if (w.t >= WALL_LIFE) { breakWall(F, w); continue; }
        blockShots(F, w);
        if (!w.dead) blockMelee(F, w);
        if (!w.dead) pushOut(F, w);
      }
      B.walls = B.walls.filter(alive);
      stepGifts(F);
      for (const f of F.fighters) B.air[f.side] = f.y < GROUND;
      for (const t of B.texts) t.t++;
      B.texts = B.texts.filter(t => t.t < t.life);
      for (const q of F.fx) {                                            // triesky a konfety: gravitácia (pohyb rieši game.js)
        if (q.kind === 'p14chip' || q.kind === 'p14peel') { q.vy += 0.24; q.rot += q.vr; if (q.y > GROUND - 2) { q.y = GROUND - 2; q.vy = -q.vy * 0.25; q.vx *= 0.6; q.vr *= 0.5; } }
        else if (q.kind === 'p14conf') { q.vy = Math.min(q.vy + 0.07, 1.6); q.vx *= 0.97; }
      }
    }
    hooks.frame.unshift(() => {
      const F = fight(); if (!live(F) || !host()) return;
      stepHost(F);
    });
    hooks.matchStart.push(F => { F.p14b = null; st(F); });
    hooks.roundStart.push(F => {
      const B = st(F);
      B.walls.length = 0; B.llamas.length = 0; B.gifts.length = 0; B.booms.length = 0; B.texts.length = 0; B.air = [false, false];
      for (const f of F.fighters) { f.p14d = null; if (isB(f)) { f.p14 = null; bs(f); } }
    });

    // ================================================================ počítač: stena proti strelám, tanec zblízka, lama
    const FREE = new Set(['idle', 'walk', 'block']);
    const RANGED = new Set(['kiai', 'special', 'iceball', 'lightning', 'rope', 'hav', 'kost', 'bubble', 'cup', 'glitch_lag']);
    function threat(F, f, o) {               // súper chystá strelu alebo strela letí k Banánáčovi
      const d = Math.abs(o.x - f.x), dirTo = f.x > o.x ? 1 : -1;
      const m = MOVE[o.move] || MOVE[o.state];
      if (d > 110 && RANGED.has(o.state) && !(o.state === 'special' && o.def && o.def.special === 'husle') && m && o.t < (m.startup || 0)) return true;
      for (const n of F.notes) if (n.owner === o && sgn(n.vx) === dirTo && Math.abs(f.x - n.x) > 50) return true;
      for (const k in F) {
        const v = F[k];
        if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray(v.proj)) continue;
        for (const p of v.proj) {
          if (!p || p.dead || ownerSide(p) !== o.side || typeof p.x !== 'number') continue;
          const vx = p.kind === 'rope' ? (p.st === 'out' ? (p.dir || 0) * 12 : 0) : (p.vx || 0), dd = Math.abs(f.x - p.x);
          if (sgn(vx) === dirTo && dd > 50 && dd < 300) return true;
        }
      }
      return false;
    }
    function intent(c, mv, lv) { c.p14Intent = { mv, frame: api.frame }; c.wait = Math.floor(rnd(18, 36) / lv); c.plan = null; c.planT = 0; return { held: {}, pressed: {} }; }
    hooks.cpu.unshift((c, f, o, phase) => {
      if (phase !== 'fight' || !o) return null;
      const F = fight(); if (!F) return null;
      if (!isB(f)) {                         // ostatní počítačoví súperi: pri stene BANÁNÁČA do nej búšia (3 zásahy ju rozbijú)
        const w = F.p14b && F.p14b.walls.find(q => alive(q) && between(q, f, o) && Math.abs(f.x - q.x) < WALL_SOLID + 10);
        if (!w || !FREE.has(f.state) || !f.onGround || c.planT > 0 || c.wait > 1) return null;
        c.wait = Math.floor(rnd(14, 30) / clamp(c.level || 0.6, 0.3, 1.3)); c.plan = null; c.planT = 0;
        return { held: {}, pressed: chance(0.5) ? { kick: true } : { punch: true } };
      }
      const g = bs(f), B = st(F), lv = clamp(c.level || 0.6, 0.3, 1.3), d = Math.abs(o.x - f.x);
      const wall = B.walls.find(w => alive(w) && between(w, f, o));
      if (f.state === 'bn_emote') {                                       // súper tancuje blízko → preruš tanec a udri
        if (f.t >= EMOTE_CANCEL && o.state === 'dance' && d < 84 && !wall && chance(0.06 + 0.08 * lv)) return { held: {}, pressed: chance(0.5) ? { kick: true } : { punch: true } };
        return { held: {}, pressed: {} };
      }
      if (!FREE.has(f.state) || !f.onGround) return null;
      const myWall = B.walls.some(w => alive(w) && w.s === f.side);
      if (!myWall && f.cd.special === 0 && threat(F, f, o)) {             // reakcia na strelu (rozhodne sa raz za útok)
        const key = o.state + ':' + (api.frame - o.t);
        if (g.react !== key) { g.react = key; if (chance(0.3 + 0.35 * lv)) return intent(c, 'build', lv); }
      }
      const busy = !o.vulnerable || o.state === 'dizzy' || o.state === 'dance';
      if (!wall && !busy && g.cdE === 0 && d < 100 && o.onGround && chance(0.012 + 0.012 * lv)) return intent(c, 'emote', lv);   // zblízka: tanec
      if (wall) {                                                         // za stenou: čaká, občas lama (preletí ponad stenu)
        if (!g.llama && chance(0.015 + 0.015 * lv)) return intent(c, 'llama', lv);
        if (api.ATTACK_STATES.has(o.state) && d < 110) return { held: { down: true }, pressed: {} };
        return { held: {}, pressed: {} };
      }
      if (c.planT > 0 || c.wait > 1 || api.frame < g.ai) return null;
      const cand = [];                                   // vhodné schopnosti s váhou; vyberie sa náhodne, nie stále tá istá
      if (!busy && !myWall && f.cd.special === 0 && d > 170 && (o.cd.kiai === 0 || o.cd.special === 0)) cand.push(['build', 0.9]);
      if (!busy && g.cdE === 0 && d < 105 && o.onGround) cand.push(['emote', 3]);
      if (!g.llama && d > 70) cand.push(['llama', f.hp < f.maxHp * 0.6 ? 4 : 1.6]);
      let mv = null;
      if (cand.length && chance(0.35 + 0.3 * lv)) {
        const n = g.n;
        for (const c2 of cand) c2[1] *= (c2[0] === g.last ? 0.35 : 1) / (1 + 1.5 * (n[c2[0]] || 0));   // striedať: menej použitá má prednosť
        let r = rnd(0, cand.reduce((a, c2) => a + c2[1], 0));
        for (const [m2, w2] of cand) { if ((r -= w2) <= 0) { mv = m2; break; } }
        mv = mv || cand[cand.length - 1][0];
      }
      if (!mv) { g.ai = api.frame + 24; return null; }   // nič → pôvodná logika (moves.js / game.js)
      g.ai = api.frame + Math.round(rnd(50, 100) / lv); g.last = mv; g.n[mv] = (g.n[mv] || 0) + 1;
      return intent(c, mv, lv);
    });

    // ================================================================ kreslenie
    function nail(x, y) {
      ctx.fillStyle = '#4a4f57'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      ctx.fillStyle = '#c9d1db'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
    }
    function drawWall(w) {
      const k = wallK(w), h = Math.round(WALL_H * k);
      const end = WALL_LIFE - w.t, jig = (w.fl > 0 ? (w.fl % 4 < 2 ? 1 : -1) : 0) + (end < 45 && end % 8 < 4 ? 1 : 0);
      const x0 = Math.round(w.x - WALL_HW) + jig, wd = WALL_HW * 2, yb = GROUND + 2, yt0 = yb - WALL_H, yt = yb - h;
      ctx.save();
      if (w.t < WALL_RISE + 8) {                                         // modrý náčrt stavby (ako vo Fortnite)
        const a = w.t < WALL_RISE ? 1 : 1 - (w.t - WALL_RISE) / 8;
        ctx.globalAlpha = 0.85 * a;
        ctx.fillStyle = 'rgba(70,160,255,0.28)'; ctx.fillRect(x0, yt0, wd, WALL_H);
        ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, yt0 + 0.5, wd - 1, WALL_H - 1);
        ctx.beginPath();
        for (let i = 1; i < 5; i++) { ctx.moveTo(x0, yt0 + i * WALL_H / 5); ctx.lineTo(x0 + wd, yt0 + i * WALL_H / 5); }
        ctx.moveTo(x0 + wd / 2, yt0); ctx.lineTo(x0 + wd / 2, yb); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (h >= 2) {
        ctx.beginPath(); ctx.rect(x0 - 4, yt, wd + 12, h + 2); ctx.clip();
        ctx.fillStyle = '#6e4019';                                         // bočná hrana (hrúbka dosky)
        ctx.beginPath(); ctx.moveTo(x0 + wd, yt0); ctx.lineTo(x0 + wd + 6, yt0 + 5); ctx.lineTo(x0 + wd + 6, yb); ctx.lineTo(x0 + wd, yb); ctx.closePath(); ctx.fill();
        const n = 5, ph = WALL_H / n;
        for (let i = 0; i < n; i++) {
          const py = Math.round(yt0 + i * ph), hh = Math.round(ph);
          ctx.fillStyle = i % 2 ? WOOD.mid : WOOD.light; ctx.fillRect(x0, py, wd, hh);
          ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fillRect(x0, py + 1, wd, 2);
          ctx.fillStyle = WOOD.dark; ctx.fillRect(x0, py + hh - 3, wd, 3);
          ctx.strokeStyle = WOOD.grain; ctx.lineWidth = 1; ctx.beginPath();
          ctx.moveTo(x0 + 6, py + hh * 0.42); ctx.quadraticCurveTo(x0 + wd * 0.5, py + hh * (i % 2 ? 0.2 : 0.62), x0 + wd - 6, py + hh * 0.48);
          ctx.moveTo(x0 + 10, py + hh * 0.7); ctx.lineTo(x0 + wd - 14, py + hh * 0.68); ctx.stroke();
          if (i === 1 || i === 3) { ctx.fillStyle = WOOD.edge; ctx.beginPath(); ctx.ellipse(x0 + (i === 1 ? 12 : wd - 13), py + hh * 0.5, 3.2, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
          nail(x0 + 6, py + hh / 2); nail(x0 + wd - 6, py + hh / 2);
        }
        ctx.fillStyle = WOOD.edge; ctx.fillRect(x0 - 2, yt0, 4, WALL_H); ctx.fillRect(x0 + wd - 2, yt0, 4, WALL_H);   // stĺpiky
        ctx.strokeStyle = WOOD.line; ctx.lineWidth = 2; ctx.strokeRect(x0 - 2, yt0, wd + 4, WALL_H + 2);
        if (w.hits >= 1) {                                                // praskliny po zásahoch
          ctx.strokeStyle = '#3d220c'; ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(x0 + wd * 0.3, yt0 + 30); ctx.lineTo(x0 + wd * 0.5, yt0 + 44); ctx.lineTo(x0 + wd * 0.38, yt0 + 58); ctx.lineTo(x0 + wd * 0.62, yt0 + 74);
          if (w.hits >= 2) { ctx.moveTo(x0 + wd * 0.75, yt0 + 70); ctx.lineTo(x0 + wd * 0.55, yt0 + 88); ctx.lineTo(x0 + wd * 0.7, yt0 + 104); ctx.lineTo(x0 + wd * 0.45, yt0 + 118); }
          ctx.stroke();
        }
        if (w.fl > 0) { ctx.globalAlpha = w.fl / 12; ctx.fillStyle = '#fff'; ctx.fillRect(x0, yt, wd, h); ctx.globalAlpha = 1; }
      }
      ctx.restore();
      if (w.t >= WALL_RISE) for (let i = 0; i < WALL_HP; i++) {           // život steny (ako vo Fortnite): 3 políčka
        const bx = Math.round(w.x) - 15 + i * 11, by = yt0 - 9;
        ctx.fillStyle = '#000'; ctx.fillRect(bx - 1, by - 1, 10, 6);
        ctx.fillStyle = i < w.hp ? '#7dff6a' : '#553322'; ctx.fillRect(bx, by, 8, 4);
      }
      else if (w.t % 4 < 2) for (let i = 0; i < 3; i++) F_spark(w.x + rnd(-WALL_HW, WALL_HW), yt);   // piliny pri raste
    }
    function F_spark(x, y) { ctx.fillStyle = '#f1d9a8'; ctx.fillRect(Math.round(x), Math.round(y) - 1, 2, 2); }
    function drawPeel(x, y, a = 1, rot = 0) {   // banánová šupka: tri ovisnuté cípy, hnedé konce
      ctx.save(); ctx.globalAlpha = a; ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot); ctx.scale(1.4, 1.4);
      ctx.lineJoin = 'round';
      const flap = (sx, ex, ey, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(sx - 3, -4); ctx.quadraticCurveTo(ex * 0.5, ey - 7, ex, ey); ctx.quadraticCurveTo(ex * 0.6, ey - 1, sx + 3, -1); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#6b4a10'; ctx.lineWidth = 1; ctx.stroke(); };
      flap(-2, -15, 3, '#ffd23a'); flap(2, 15, 3, '#ffd23a'); flap(0, 4, 5, '#f7c21f');
      ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(0, -3, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6b4a10'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#5a3a14'; ctx.fillRect(-1, -11, 3, 5); ctx.fillRect(-16, 2, 3, 2); ctx.fillRect(14, 2, 3, 2);   // stopka a hnedé končeky
      ctx.restore();
    }
    function drawBomb(x, y, t, fuse) {
      const blink = fuse && Math.floor(t / (t > BOMB_FUSE - 10 ? 2 : 4)) % 2 === 0;
      ctx.save(); ctx.translate(Math.round(x), Math.round(y));
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? '#ff3b2f' : '#3a3f4a'; ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(-4, -5, 3, 3);
      ctx.fillStyle = '#555'; ctx.fillRect(-2, -11, 5, 4);
      ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1, -11); ctx.quadraticCurveTo(6, -17, 9, -14); ctx.stroke();
      const sp = t % 4 < 2;                                                 // iskra na zápalnej šnúre
      ctx.fillStyle = sp ? '#fff3a0' : '#ff9d1a'; ctx.fillRect(8, -17, 3, 3); ctx.fillRect(sp ? 11 : 6, -15, 2, 2); ctx.fillRect(9, sp ? -20 : -12, 2, 2);
      ctx.restore();
    }
    function drawHeart(x, y, t) {
      ctx.save(); ctx.translate(Math.round(x), Math.round(y + Math.sin(t / 4) * 1.5));
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-5, -2, 6.5, 0, Math.PI * 2); ctx.arc(5, -2, 6.5, 0, Math.PI * 2); ctx.moveTo(-11, 0); ctx.lineTo(0, 12); ctx.lineTo(11, 0); ctx.fill();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(-5, -2, 5, 0, Math.PI * 2); ctx.arc(5, -2, 5, 0, Math.PI * 2); ctx.moveTo(-9.6, 0); ctx.lineTo(0, 10); ctx.lineTo(9.6, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-1, -5, 2, 8); ctx.fillRect(-4, -2, 8, 2);
      ctx.restore();
    }
    function drawLlama(x, y, dir, t) {          // piňata-lama: pestré pásiky, krk, hlava s ušami, nôžky
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(Math.sin(t / 5) * 0.25); ctx.scale(dir, 1);
      const R = (px, py, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px, py, w, h); };
      R(-13, 4, 27, 13, '#000'); for (const lx of [-11, -5, 3, 9]) R(lx, 14, 4, 8, '#000');
      for (const lx of [-10, -4, 4, 10]) R(lx, 15, 2, 6, '#8a4fff');
      ['#ff5fc8', '#ffd23a', '#4fc3ff', '#8a4fff'].forEach((c, i) => R(-12, 5 + i * 3, 25, 3, c));
      R(7, -14, 9, 20, '#000'); ['#4fc3ff', '#ff5fc8', '#ffd23a', '#8a4fff', '#7dff6a', '#ff5fc8'].forEach((c, i) => R(8, -13 + i * 3, 7, 3, c));
      R(5, -22, 17, 10, '#000'); R(6, -21, 15, 8, '#8a4fff'); R(18, -19, 4, 5, '#ff5fc8');
      R(7, -29, 4, 8, '#000'); R(13, -29, 4, 8, '#000'); R(8, -28, 2, 6, '#ffd23a'); R(14, -28, 2, 6, '#ffd23a');
      R(15, -19, 2, 2, '#000');
      R(-16, 2, 4, 6, '#000'); R(-15, 3, 2, 4, '#ff5fc8');                // chvostík
      for (let i = 0; i < 6; i++) R(-12 + i * 4, 17, 2, 2, LLAMA_COL[i % LLAMA_COL.length]);   // strapce
      ctx.restore();
    }
    function drawBoom(bm) {
      const k = bm.t / 34, r = 14 + 34 * Math.min(1, bm.t / 8);
      ctx.save();
      if (bm.t < 18) {
        const spikes = 14;
        for (const [rr, col] of [[1, '#ff5a1f'], [0.72, '#ffb21a'], [0.42, '#fff3a0']]) {
          ctx.fillStyle = col; ctx.beginPath();
          for (let i = 0; i < spikes * 2; i++) { const a = i / (spikes * 2) * Math.PI * 2 + bm.t * 0.05, q = (i % 2 ? 0.55 : 1) * r * rr; ctx.lineTo(bm.x + Math.cos(a) * q, bm.y + Math.sin(a) * q * 0.8); }
          ctx.closePath(); ctx.fill();
        }
      }
      for (let i = 0; i < 5; i++) {                                         // kreslený dym
        const a = i / 5 * Math.PI * 2, d = 10 + bm.t * 1.2;
        ctx.globalAlpha = Math.max(0, 0.75 - k * 0.8); ctx.fillStyle = i % 2 ? '#b9b9c4' : '#d8d8e0';
        ctx.beginPath(); ctx.arc(bm.x + Math.cos(a) * d, bm.y - bm.t * 0.6 + Math.sin(a) * d * 0.5, 7 + bm.t * 0.35, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      if (bm.t < 26) { ctx.save(); ctx.globalAlpha = bm.t > 18 ? (26 - bm.t) / 8 : 1; api.text('BUM!', bm.x, bm.y - 30 - bm.t * 0.4, 16, 'center', '#ffe23a'); ctx.restore(); }
    }
    function drawDisco(f, o) {                  // disko guľa nad tanečníkmi počas EMOTE
      const x = o && o.state === 'dance' && o.p14d === f.side ? (f.x + o.x) / 2 : f.x, y = 74, t = api.frame;
      ctx.save();
      ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - 10); ctx.stroke();
      const cols = ['rgba(255,95,200,0.16)', 'rgba(79,195,255,0.16)', 'rgba(255,210,58,0.16)'];
      for (let i = 0; i < 3; i++) {
        const a = t / 20 + i * 2.1, bx = x + Math.sin(a) * 110;
        ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx - 22, GROUND); ctx.lineTo(bx + 22, GROUND); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
      for (let gx = -2; gx <= 2; gx++) for (let gy = -2; gy <= 2; gy++) {
        if (gx * gx + gy * gy > 5) continue;
        ctx.fillStyle = (gx + gy + Math.floor(t / 6)) % 3 === 0 ? '#ffffff' : (gx + gy) % 2 ? '#aeb8c4' : '#d6dde6';
        ctx.fillRect(Math.round(x + gx * 3.6 - 1.6), Math.round(y + gy * 3.6 - 1.6), 3, 3);
      }
      if (t % 10 < 5) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(x + 6), Math.round(y - 8), 2, 2); }
      ctx.restore();
    }
    function drawHammer(f) {                    // náhrada bez spritov: kladivko v ruke počas BUILD
      const m = MOVE.bn_build; if (f.t < m.startup - 2 || f.t > m.startup + m.active + 4) return;
      const a = Math.sin(f.t * 1.2) * 0.9 - 0.3, hx = f.x + f.facing * 34, hy = f.y - 96;
      ctx.save(); ctx.translate(Math.round(hx), Math.round(hy)); ctx.scale(f.facing, 1); ctx.rotate(a);
      ctx.fillStyle = '#000'; ctx.fillRect(-2, -18, 5, 20); ctx.fillStyle = '#8a5326'; ctx.fillRect(-1, -17, 3, 18);
      ctx.fillStyle = '#000'; ctx.fillRect(-6, -24, 14, 8); ctx.fillStyle = '#9aa3ad'; ctx.fillRect(-5, -23, 12, 6);
      ctx.restore();
    }
    hooks.drawBack.push((stage, F) => {        // steny pod postavami; lúč / HAV zastavený stenou sa skráti po stenu
      const B = F.p14b; if (!B) return;
      for (const b of F.beams) if (typeof b.p14cut === 'number') b.len = Math.min(b.len, Math.max(0, (b.p14cut - b.x) * b.dir));
      for (const k in F) { const v = F[k]; if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.proj)) for (const p of v.proj) if (p && typeof p.p14cut === 'number' && typeof p.len === 'number') p.len = Math.min(p.len, Math.max(0, (p.p14cut - p.x) * p.dir)); }
      for (const w of B.walls) { try { drawWall(w); } catch (e) { /* kreslenie nesmie zhodiť hru */ } }
    });
    hooks.drawFront.push((stage, F) => {
      const B = F.p14b;
      for (const f of F.fighters) {
        if (!isB(f)) continue;
        if (f.state === 'bn_emote') drawDisco(f, F.fighters[1 - f.side]);
        if (!own && f.state === 'bn_build') drawHammer(f);
        if (!own && f.state === 'bn_throw' && f.t < MOVE.bn_throw.startup + MOVE.bn_throw.active) drawLlama(f.x + f.facing * 6, f.y - 150 - Math.max(0, f.t - MOVE.bn_throw.startup) * 3, f.facing, f.t);
      }
      for (const f of F.fighters) if (f.state === 'dance' && f.p14d !== null && f.p14d !== undefined && f.t % 24 < 12) api.text('♪', f.x + (f.t % 48 < 24 ? -22 : 22), f.y - 120, 14, 'center', '#ff9ff0');
      if (!B) return;
      for (const gf of B.gifts) if (gf.k === 'peel' && gf.st === 'ground') drawPeel(gf.x, GROUND - 3, gf.ft > PEEL_T - 40 ? (PEEL_T - gf.ft) / 40 : 1);   // šupka na zemi (pred nohami, nech je vidieť)
      for (const L of B.llamas) drawLlama(L.x, L.y, L.dir, L.t);
      for (const gf of B.gifts) {
        if (gf.k === 'heal') drawHeart(gf.x, gf.y, gf.t);
        else if (gf.k === 'bomb') drawBomb(gf.x, gf.y, gf.st === 'fuse' ? gf.ft : gf.t, gf.st === 'fuse');
        else if (gf.st !== 'ground') drawPeel(gf.x, gf.y, 1, gf.t * 0.3);
      }
      for (const bm of B.booms) drawBoom(bm);
      ctx.save();
      for (const q of F.fx) {
        if (q.kind === 'p14chip') {
          ctx.globalAlpha = Math.max(0, Math.min(1, (q.life - q.t) / 12));
          ctx.save(); ctx.translate(Math.round(q.x), Math.round(q.y)); ctx.rotate(q.rot || 0);
          ctx.fillStyle = '#3d220c'; ctx.fillRect(-q.w / 2 - 1, -2, q.w + 2, 4); ctx.fillStyle = q.c; ctx.fillRect(-q.w / 2, -1, q.w, 2);
          ctx.restore();
        } else if (q.kind === 'p14conf') {
          ctx.globalAlpha = Math.max(0, Math.min(1, (q.life - q.t) / 15)); ctx.fillStyle = q.c; ctx.fillRect(Math.round(q.x), Math.round(q.y), 3, 3);
        } else if (q.kind === 'p14peel') {
          ctx.globalAlpha = 1; drawPeel(q.x, q.y, Math.max(0, (q.life - q.t) / 20), q.rot || 0);
        }
      }
      ctx.restore();
      for (const t of B.texts) {
        ctx.save(); ctx.globalAlpha = t.t > t.life - 12 ? (t.life - t.t) / 12 : 1;
        api.text(t.txt, t.x, t.y - t.t * 0.3, t.size || 12, 'center', t.c);
        ctx.restore();
      }
    });

    // HUD: EMOTE (3. ukazovateľ) a LLAMA (raz za kolo) pod menom; v 1. kole nápoveda kombá pre človeka
    function meter(side, label, v, col, slot, row = 0) {
      const right = side === 1, x = right ? W - 12 - 190 : 12, mx = right ? x + 190 - 60 - slot * 66 : x + slot * 66, my = 27 + row * 21;
      ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
      ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * clamp(v, 0, 1)), 4);
      api.text(label, mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
    }
    hooks.drawHud.push(F => {
      if (!F || F.paused) return;
      F.fighters.forEach((f, i) => {
        if (!isB(f)) return;
        const g = f.p14 || {};
        ctx.save();
        meter(i, 'EMOTE', 1 - (g.cdE || 0) / EMOTE_CD, '#ff9ff0', 2);
        meter(i, 'LLAMA', g.llama ? 0 : 1, '#7dff6a', 1, 1);
        ctx.restore();
        if (F.round === 1 && (F.phase === 'intro' || (F.phase === 'fight' && F.t < 240)) && api.inputKind(i) !== 'cpu')
          api.text('BUILD: ♪ · EMOTE: ↓ VPRED ♪ · LLAMA: VZAD VZAD ♪', i === 0 ? 8 : W - 30, 254, 7, i === 0 ? 'left' : 'right', '#ffe98a');
      });
    });

    // ================================================================ portrét (náhrada, kým Master nedodá img/portrait_bananac)
    let portraitDone = false;
    hooks.frame.push(() => {
      if (portraitDone || api.scene === 'loading') return;
      portraitDone = true;
      if (IMG['img/portrait_bananac'] || !own) return;
      const im = IMG['bananac/idle'], a = SET.idle; if (!im || !a) return;
      const c = document.createElement('canvas'); c.width = 96; c.height = 120;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#3a7bd5'); g.addColorStop(0.6, '#1f4f9a'); g.addColorStop(1, '#0d2147');
      x.fillStyle = g; x.fillRect(0, 0, 96, 120);
      x.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 6; i++) x.fillRect(0, 12 + i * 20, 96, 6);   // pásy ako v lobby
      x.imageSmoothingEnabled = false;
      const sw = 64, sh = 80, sx = clamp(Math.round(a.ax - sw / 2), 0, a.w - sw);   // hlava a hruď z prvej snímky postoja
      x.drawImage(im, sx, 0, sw, sh, 0, 0, 96, 120);
      IMG['img/portrait_bananac'] = c;
    });

    // BABALITY: bábätko-banán s cumlíkom (drawBaby v game.js ho kreslí a poskakuje); dodaný obrázok baby_bananac ho prepíše
    function babyBanana() {
      const c = document.createElement('canvas'); c.width = 56; c.height = 64;
      const x = c.getContext('2d');
      x.lineJoin = 'round'; x.lineCap = 'round';
      x.beginPath(); x.moveTo(30, 5); x.quadraticCurveTo(47, 20, 42, 44); x.quadraticCurveTo(38, 58, 27, 58); x.quadraticCurveTo(14, 57, 14, 44); x.quadraticCurveTo(13, 22, 30, 5); x.closePath();
      x.fillStyle = '#ffd93b'; x.fill(); x.strokeStyle = '#6b4a10'; x.lineWidth = 2; x.stroke();
      x.strokeStyle = '#e8b81f'; x.lineWidth = 3; x.beginPath(); x.moveTo(37, 17); x.quadraticCurveTo(42, 32, 38, 50); x.stroke();
      x.fillStyle = '#5a3a14'; x.fillRect(28, 0, 4, 7);                                                      // stopka
      x.fillStyle = '#e8b48c'; x.beginPath(); x.ellipse(27, 31, 8, 9, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#a8703f'; x.lineWidth = 1; x.stroke();
      x.fillStyle = '#1b1b1b'; x.fillRect(23, 27, 3, 3); x.fillRect(29, 27, 3, 3);                         // očká
      x.fillStyle = '#fff'; x.fillRect(23, 27, 1, 1); x.fillRect(29, 27, 1, 1);
      x.fillStyle = '#5fb4ff'; x.beginPath(); x.arc(27, 36, 3.2, 0, Math.PI * 2); x.fill(); x.fillStyle = '#d8f0ff'; x.fillRect(26, 35, 2, 2);   // cumlík
      x.fillStyle = '#fff'; x.strokeStyle = '#555'; x.lineWidth = 1;
      for (const [hx, hy] of [[12, 40], [44, 40]]) { x.beginPath(); x.arc(hx, hy, 4, 0, Math.PI * 2); x.fill(); x.stroke(); }   // rukavičky
      for (const fx2 of [16, 30]) { x.fillRect(fx2, 57, 9, 5); x.strokeRect(fx2 + 0.5, 57.5, 8, 4); }                           // tenisky
      return c;
    }
    if (!IMG['img/baby_bananac']) IMG['img/baby_bananac'] = babyBanana();

    // pre testy, rebríček a scény
    api.bananac = {
      id: 'bananac', isBananac: isB, ownSprites: own,
      force(f, mv, ignoreCd = false, gift = null) {   // spustí schopnosť bez komba (test, scény); gift = 'heal' | 'bomb' | 'peel'
        const F = fight(); if (!F) return false;
        if (ignoreCd) { f.cd.special = 0; bs(f).cdE = 0; bs(f).llama = false; }
        return startMove(f, F.fighters[1 - f.side], mv, gift);
      },
      tune: { BUILD_CD, WALL_LIFE, WALL_HP, WALL_H, WALL_SOLID, EMOTE_CD, EMOTE_T, EMOTE_RANGE, DANCE_T, HEAL, BOMB_DMG, PEEL_DMG },
      help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — rovnaký formát ako api.vodnik.help (OVLÁDANIE, COMBOS.md)
        ['BUILD (BANÁNÁČ)', 'T', 'O', '△', '♪'],
        ['EMOTE (BANÁNÁČ)', 'S VPRED T', '↓ VPRED O', '↓ ▶ △', 'páčka dole, vpred + ♪'],
        ['LOOT LLAMA (BANÁNÁČ)', 'VZAD VZAD T', 'VZAD VZAD O', '◀ ◀ △', 'páčka vzad 2× + ♪'],
      ],
    };
  },
});
