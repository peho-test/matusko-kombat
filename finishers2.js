// MATÚŠKO KOMBAT XII — modul finishers2 (P18, 2. 10. 2026): tri nové zakončenia FINISH HIM (Peťo).
//   TORTALITY ..... VZAD ↓ VPRED ÚDER   z neba za pískania spadne obrovská narodeninová torta priamo na porazeného; šľahačka sa
//                                       rozstrekne (kvapky, fľaky na zemi aj na obrazovke), porazený pod tortou zmizne a zamáva bielou vlajkou
//   SELFIEALITY ... ↑ ↓ ↑ ÚDER         víťaz prejde k omámenému porazenému, vytiahne z kimona mobil (sprite selfie, póza drží), malý
//                                       odpočet 3-2-1 nad hlavami, blesk a Polaroid zo snímky plátna „#GG #MATÚŠKOKOMBAT“; porazený od blesku padne
//   MUSICALITY .... ↓ VZAD ŠPECIÁL     víťaz vyjde na pódium pod reflektor a hrá falošne (sprite music, Matúško a Šimon svoj špeciál =
//                                       heligónka / husle, inak póza výhry a noty z hlavy); porazený sedí na stoličke priviazaný povrazmi,
//                                       zakrýva si uši (sprite dizzy), kýve sa a trasie, až aj so stoličkou odpadne dozadu
// Kombá, nápoveda vo FINISH HIM, ťukacie tlačidlá a KNIHA KOMB sú vo finishers.js (COMBOS / BOOK_LIST, mod: true = zakončenie
// odtiaľto, platí len keď je zaregistrované). Poradie skriptov nevadí, finishers.js sa na api.FINISHERS pýta až počas hry.
// Sieť: stav je len v F.tortality / F.selfieality / F.musicality ako čisté dáta (čísla, reťazce, bool; „náhoda“ zo seed), logika
// beží len v update (hostiteľ), hosť len kreslí zo snímky stavu. Snímku plátna pre Polaroid si robí každý klient sám pri kreslení
// (miestne plátno, mierka ctx.canvas.width / 480 = RES v game.js).
// Porazený na stoličke: game.js ho počas kreslenia postáv nakreslí mimo obrazovky (drawBack posunie x, drawHud vráti) a modul ho
// nakreslí sediaceho zo snímky spritu (horná polovica na sedadle, nohy skrátené), so stoličkou, povrazmi a kývaním.
// Assety (Master; bez nich kreslí náhradu kód): img/fin_cake, img/fin_splat, img/fin_stage, img/fin_chair (2×, kreslia sa na cieľovú
// veľkosť), sprity selfie a music (FA[sid].anims), zvuky fin_* (kým nie sú v manifeste, zahrá sa podobný existujúci), hlášky
// say_tortality / say_selfieality / say_musicality (inak syntéza reči v game.js).
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'finishers2',
  init(api) {
    'use strict';
    const { W, GROUND, FA, IMG, hooks } = api;
    const ctx = api.ctx;

    // ================================================================ pomôcky
    const isGuest = () => !!(api.NET && api.NET.role === 'guest');
    const clamp = api.clamp, clamp01 = k => Math.max(0, Math.min(1, k)), lerp = (a, b, k) => a + (b - a) * k;
    const smooth = k => k * k * (3 - 2 * k);
    const easeOut = k => 1 - (1 - k) * (1 - k) * (1 - k);
    const easeBack = k => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);   // s malým prekmitom (ako brána vo FUTBALITY)
    function hash(seed, i, k) {      // „náhodné“ číslo 0..1 z celých čísel: hostiteľ aj hosť z rovnakého seed nakreslia to isté
      let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263) ^ Math.imul(k + 7, -2048144777);
      h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }
    const rr = (seed, i, k, a, b) => a + (b - a) * hash(seed, i, k);
    const newSeed = () => 1 + Math.floor(Math.random() * 2e9);
    const img = n => IMG['img/' + n] || null;
    function bodyHeight(f) {         // výška postavy: def.height × mierka (ako drawStars v game.js), inak sprite idle × mierky
      if (f.def && f.def.height) return f.def.height * ((f.def && f.def.scale) || 1);
      const fa = FA[f.sid], a = fa && fa.anims && fa.anims.idle;
      return (a ? a.h * (a.scale || 1) : 138) * ((f.def && f.def.scale) || 1);
    }
    const hasAnim = (f, n) => { const s = FA[f.sid]; return !!(s && s.anims && s.anims[n] && IMG[f.sid + '/' + n]); };
    function animAs(f, state) {      // animácia, akú by game.js kreslil pre daný stav (náhrady, paleta, plátna BLOCKYHO a IMPOSTORA)
      const s = f.state; f.state = state;
      try { return api.animFor(f); } catch (e) { return null; } finally { f.state = s; }
    }
    function holdT(f) {              // f.t poslednej snímky animácie: game.js pri neznámom stave slučkuje (% n), zakončenie ju takto podrží
      const an = api.animFor(f), a = an && an.a;
      if (!a || !(a.frames > 1)) return 0;
      return Math.ceil((a.frames - 1) * 60 / (a.fps || 12));
    }
    function snd(name, vol, alt) {   // zvuk zo súboru; kým nie je v manifeste, podobný existujúci (sfx by zapípal), alt null = ticho
      const S = api.A && api.A.sounds;
      if (S && !S[name]) { if (alt) api.sfx(alt, vol); return; }
      api.sfx(name, vol);
    }
    const on = (F, k) => !!(F && F.finisher === k && F[k] && (F.phase === 'finisher' || F.phase === 'matchEnd'));
    const tNow = (F, m) => m.t + (F.phase === 'matchEnd' ? Math.max(0, F.t) : 0);   // čas kreslenia: na konci zápasu beží ďalej (F.t)
    function rrect(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function star4(x, y) {           // hviezdička omráčenia ako drawStars v game.js
      ctx.fillStyle = '#ffe23a'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 3, 3, 7); ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 7, 3);
    }
    function stars(x, y, t) { for (let i = 0; i < 3; i++) { const a = t / 9 + i * Math.PI * 2 / 3; star4(x + Math.cos(a) * 14, y + Math.sin(a) * 4); } }
    function walkTo(w, m, t, t0, len) {  // chôdza k cieľu (FUTBALITY: cúvanie = chôdza odzadu), na konci postoj
      if (!len || t <= t0 || t > t0 + len) return;
      w.x = lerp(m.wx0, m.wx1, smooth((t - t0) / len));
      if (w.state === 'futrun') w.t = (m.wx1 - m.wx0) * m.dir < 0 ? 6000 - t : t;
      if (t === t0 + len && w.state === 'futrun') w.set('idle');
    }
    function begin(F, w, L, dir) {   // spoločný začiatok: obaja na zemi, porazený omráčený a otočený k víťazovi
      w.vx = 0; w.vy = 0; w.y = GROUND; w.facing = dir;
      L.vx = 0; L.vy = 0; L.y = GROUND; L.facing = -dir;
      if (L.state !== 'dizzy') L.set('dizzy');
    }

    api.animFallback('futrun', 'walk');      // chôdza (ako FUTBALITY; IMPOSTOR ju kreslí krokom)
    api.animFallback('selfie', 'win');       // SELFIEALITY: sprite selfie, inak póza výhry a nakreslený mobil
    api.animFallback('music', 'win');        // MUSICALITY: sprite music (tuba, flauta, trúbka, ukulele, vytie), inak póza výhry a noty
    api.animFallback('musicsp', 'special');  // MUSICALITY Matúško / Šimon (aj prefarbení): ich špeciál = heligónka / husle

    // porazený mimo obrazovky počas kreslenia postáv (MUSICALITY: kreslí ho modul na stoličke), drawHud ho vráti
    let hid = null;
    function hide(f) { if (!hid) { hid = { f, x: f.x }; f.x = -4000; } }
    function unhide() { if (hid) { hid.f.x = hid.x; hid = null; } }
    hooks.frame.unshift(unhide);             // poistka (kreslenie ho vráti už v drawHud)
    hooks.drawHud.unshift(unhide);

    const clear = F => { if (F) { F.tortality = null; F.selfieality = null; F.musicality = null; } };
    hooks.matchStart.push(clear);
    hooks.roundStart.push(clear);            // TRÉNING po zakončení volá nextRound

    // ================================================================ TORTALITY
    const TORT = {
      CAKE_H: 180,     // výška torty (img/fin_cake 288×360 je 2×), väčšiemu porazenému sa zväčší
      ROOM: 46,        // víťaz stojí aspoň toľko od okraja torty
      WHISTLE: 2,      // pískanie padajúcej torty (fin_whistle 1,6 s)
      DROP: 46,        // posledných toľko snímok pred dopadom torta padá cez obrazovku
      HIT: 98,         // dopad (koniec pískania)
      WIN: 10,         // víťaz sa teší
      STARS: 8,        // hviezdičky nad tortou: porazený je v nej omráčený
      FLAG: 56,        // z torty vylezie ruka s bielou vlajkou
      BANNER: 30,      // TORTALITY
      HOLD: 150,       // potom koniec zakončenia
      DROPS: 46, SPLATS: 6, PUDDLES: 8, GRAV: 0.32,
    };
    api.registerFinisher('tortality', {
      start(F, w, L) {
        if (isGuest()) return;
        const dir = L.x >= w.x ? 1 : -1;
        const sc = Math.max(1, (bodyHeight(L) + 14) / TORT.CAKE_H), half = TORT.CAKE_H * 0.4 * sc;   // polovica šírky torty
        const back = Math.round(half + TORT.ROOM);
        // porazený sa dopotáca tak, aby bola torta celá na obrazovke a víťaz mal za ňou miesto
        const lo = Math.max(half + 6, dir > 0 ? 26 + back : 0), hi = Math.min(W - half - 6, dir < 0 ? W - 26 - back : W);
        const lx1 = Math.round(clamp(L.x, lo, hi));
        const wx1 = Math.abs(w.x - lx1) < back ? lx1 - dir * back : w.x;
        const move = Math.max(Math.abs(wx1 - w.x), Math.abs(lx1 - L.x));
        const cut = move > 110, walk = cut || move < 3 ? 0 : Math.round(clamp(move / 2.4, 6, 40));
        F.tortality = { t: 0, dir, seed: newSeed(), sc, cx: lx1, walk, cut,
          wx0: cut ? wx1 : w.x, wx1, lx0: cut ? lx1 : L.x, lx1, hitT: -1 };
        begin(F, w, L, dir);
        if (cut) { w.x = wx1; L.x = lx1; F.flash = 16; w.set('idle'); }
        else w.set(Math.abs(wx1 - w.x) > 3 ? 'futrun' : 'idle');
      },
      update(F, w, L) {
        const m = F.tortality;
        if (!m || isGuest()) return false;
        const t = ++m.t;
        walkTo(w, m, t, 0, m.walk);
        if (m.walk && t <= m.walk) L.x = lerp(m.lx0, m.lx1, smooth(t / m.walk));
        if (t === m.walk) { w.x = m.wx1; L.x = m.lx1; if (w.state === 'futrun') w.set('idle'); }
        w.vx = 0; L.vx = 0; w.facing = m.dir; L.facing = -m.dir;
        if (t === TORT.WHISTLE) snd('fin_whistle', 0.9, 'whoosh');
        if (t === TORT.HIT) {
          m.hitT = t; L.x = m.cx;
          snd('fin_splat', 1, 'splash'); api.shake(14); F.flash = Math.max(F.flash, 4);
        }
        if (m.hitT < 0) return false;
        const e = t - m.hitT;
        if (e === TORT.WIN) w.set('win');
        if (e === TORT.BANNER) { api.banner('TORTALITY', 170, 36); api.say('tortality'); snd('fin_crowd', 0.6, 'crowd'); }
        return e >= TORT.BANNER + TORT.HOLD || t > 900;
      },
    });

    // ---------------------------------------------------------------- TORTALITY: kreslenie (len z F.tortality)
    const CREAM = ['#fffaf0', '#fff1d8', '#ffd2df', '#ffb0c6'];
    function cakeY(m, T) {           // spodok torty: nad obrazovkou → padá so zrýchlením → dopad
      if (m.hitT >= 0) return GROUND;
      const k = (T - (TORT.HIT - TORT.DROP)) / TORT.DROP;
      return k < 0 ? null : lerp(-14, GROUND, Math.min(1, k) * Math.min(1, k));
    }
    function cakeFallback(w, h) {    // náhrada img/fin_cake: tri poschodia, poleva, jahody, posýpka, sviečky
      let y = 0;
      [[0.98, 0.34], [0.78, 0.27], [0.58, 0.23]].forEach(([tw, th]) => {
        const ww = w * tw, hh = h * th; y -= hh;
        ctx.fillStyle = '#fbf2e6'; ctx.fillRect(-ww / 2, y, ww, hh);
        ctx.fillStyle = '#ffa8c8';
        for (let x = -ww / 2; x < ww / 2 - 1; x += 8) {
          ctx.beginPath(); ctx.arc(x + 4, y + 2, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 4, y + hh - 1, 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#e8283c';
        for (let x = -ww / 2 + 9; x < ww / 2 - 4; x += 18) { ctx.beginPath(); ctx.arc(x, y - 1, 4, 0, Math.PI * 2); ctx.fill(); }
        for (let j = 0; j < 16; j++) {
          ctx.fillStyle = ['#ff5aa0', '#4fc3ff', '#ffd23a', '#7dff6a'][j % 4];
          ctx.fillRect(-ww / 2 + 4 + ((j * 37) % Math.max(8, ww - 8)), y + 8 + ((j * 13) % Math.max(4, hh - 14)), 2, 1.5);
        }
      });
      for (let i = 0; i < 8; i++) {
        const x = -w * 0.2 + w * 0.4 * i / 7;
        ctx.fillStyle = ['#ff7ab0', '#7ad0ff', '#ffe066', '#9dff8a'][i % 4]; ctx.fillRect(x - 1.5, y - 14, 3, 14);
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(x, y - 17, 2, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    function drawCake(cx, yb, sc, sx, sy, T) {
      const im = img('fin_cake'), h = TORT.CAKE_H * sc, w = im ? h * im.width / im.height : h * 0.8;
      ctx.save(); ctx.translate(Math.round(cx), Math.round(yb)); ctx.scale(sx, sy);
      if (im) ctx.drawImage(im, -w / 2, -h, w, h); else cakeFallback(w, h);
      ctx.globalCompositeOperation = 'lighter';           // plamienky sviečok jemne blikajú
      for (let i = 0; i < 8; i++) {
        const fx = -w * 0.2 + w * 0.4 * i / 7, fy = -h * 0.955, a = 0.16 + 0.12 * Math.sin(T / 3 + i * 1.7);
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 6);
        g.addColorStop(0, `rgba(255,220,120,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(255,160,40,0)');
        ctx.fillStyle = g; ctx.fillRect(fx - 6, fy - 6, 12, 12);
      }
      ctx.restore();
    }
    function drawFlag(m, L, yb, T, e) {   // porazený v torte sa vzdáva: ruka v rukáve kimona s bielou vlajkou nad sviečkami
      const h = TORT.CAKE_H * m.sc, p = easeOut(clamp01((e - TORT.FLAG) / 14)), x = Math.round(m.cx + m.dir * 5);
      const base = yb - h * 0.8, hand = base - 4 - 14 * p, top = hand - 38 * p, wave = Math.sin(T / 4) * 2.6, fx = x + wave * 0.3;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x, base + 3); ctx.lineTo(x, hand + 2); ctx.stroke();
      ctx.strokeStyle = (L && L.def && L.def.gi) || '#f2f2f2'; ctx.lineWidth = 5; ctx.stroke();    // rukáv
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x, hand + 1); ctx.lineTo(fx, top); ctx.stroke();
      ctx.strokeStyle = '#9a6a3a'; ctx.lineWidth = 1.8; ctx.stroke();                              // žrď
      ctx.beginPath(); ctx.moveTo(fx, top);                                                         // vlajka sa vlní
      ctx.quadraticCurveTo(x + 11, top - 3 + wave, x + 22 + wave, top + 1);
      ctx.lineTo(x + 21 + wave, top + 15); ctx.quadraticCurveTo(x + 11, top + 12 - wave, fx, top + 14); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#222'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#e3a97f'; ctx.beginPath(); ctx.arc(x, hand, 4, 0, Math.PI * 2); ctx.fill();     // päsť
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    function drawDrops(m, T) {       // kvapky šľahačky lietajú z torty a ostanú rozpleštené na zemi (dráha zo seed, bez stavu)
      const e = T - m.hitT, h = TORT.CAKE_H * m.sc, half = h * 0.4, G = TORT.GRAV, floor = GROUND - 1;
      ctx.save();
      for (let i = 0; i < TORT.DROPS; i++) {
        const dt = e - Math.floor(hash(m.seed, i, 7) * 4); if (dt < 0) continue;
        const side = hash(m.seed, i, 1) < 0.5 ? -1 : 1;
        const x0 = m.cx + side * half * rr(m.seed, i, 2, 0.45, 1.0), y0 = GROUND - h * rr(m.seed, i, 3, 0.06, 0.78);
        const vx = side * rr(m.seed, i, 4, 0.8, 6.2), vy = -rr(m.seed, i, 5, 1.5, 8.5), r = rr(m.seed, i, 6, 1.6, 4.4);
        ctx.fillStyle = CREAM[Math.floor(hash(m.seed, i, 8) * CREAM.length)];
        const y = y0 + vy * dt + 0.5 * G * dt * dt;
        if (y >= floor) {
          const tl = (-vy + Math.sqrt(vy * vy + 2 * G * (floor - y0))) / G;
          ctx.beginPath(); ctx.ellipse(x0 + vx * tl, floor, r * 1.5, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(x0 + vx * dt, y, r, 0, Math.PI * 2); ctx.fill(); }
      }
      const p = clamp01((e - 1) / 6);                     // mláky šľahačky pri spodku torty
      for (let i = 0; i < TORT.PUDDLES; i++) {
        const side = i % 2 ? 1 : -1, x = m.cx + side * half * rr(m.seed, i, 11, 0.55, 1.2);
        ctx.fillStyle = CREAM[i % CREAM.length];
        ctx.beginPath(); ctx.ellipse(x, GROUND, rr(m.seed, i, 12, 7, 18) * p, rr(m.seed, i, 13, 2.2, 4.2) * p, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    function tortBack(F) {           // tieň padajúcej torty rastie pod porazeným
      const m = F.tortality, T = tNow(F, m), half = TORT.CAKE_H * 0.4 * m.sc;
      const k = m.hitT >= 0 ? 1 : clamp01((T - (TORT.HIT - TORT.DROP - 30)) / (TORT.DROP + 30));
      if (k <= 0) return;
      ctx.fillStyle = `rgba(0,0,0,${(0.12 + 0.3 * k).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(m.cx, GROUND + 1, half * (0.35 + 0.7 * k), 3 + 4 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    function tortFront(F) {
      const m = F.tortality, T = tNow(F, m), yb = cakeY(m, T);
      if (yb === null) return;
      const e = m.hitT >= 0 ? T - m.hitT : -1, h = TORT.CAKE_H * m.sc;
      if (e < 0) {                                        // rýchlostné čiary nad padajúcou tortou
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
        for (let i = -2; i <= 2; i++) { const x = m.cx + i * h * 0.13; ctx.beginPath(); ctx.moveTo(x, yb - h - 8 - Math.abs(i) * 6); ctx.lineTo(x, yb - h - 40 - Math.abs(i) * 6); ctx.stroke(); }
        ctx.restore();
      }
      const sq = e >= 0 ? 0.2 * Math.exp(-e / 6) * Math.cos(e / 2.1) : 0;   // dopad: torta sa sploští a odpruží
      drawCake(m.cx, yb, m.sc, 1 + sq * 0.55, 1 - sq, T);
      if (e < 0) return;
      if (e >= TORT.STARS && e < TORT.FLAG + 6) stars(m.cx, yb - h - 8, T);
      if (e >= TORT.FLAG) drawFlag(m, F.fighters[F.loser], yb, T, e);
      drawDrops(m, T);
    }
    // fľaky šľahačky „na obrazovke“ (nad HUD), mimo stredu, kde svieti TORTALITY
    const SPOTS = [[64, 76], [418, 66], [36, 186], [446, 192], [134, 238], [350, 242], [238, 28]];
    function splatFallback(s, seed, i) {
      ctx.fillStyle = '#fffaf2';
      ctx.beginPath(); ctx.arc(0, 0, 20 * s, 0, Math.PI * 2); ctx.fill();
      for (let j = 0; j < 8; j++) {
        const a = rr(seed, i * 10 + j, 41, 0, Math.PI * 2), d = rr(seed, i * 10 + j, 42, 18, 40) * s;
        ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, rr(seed, i * 10 + j, 43, 3, 9) * s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffb3c8';
      for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.arc(rr(seed, i * 10 + j, 44, -12, 12) * s, rr(seed, i * 10 + j, 45, -12, 12) * s, 4 * s, 0, Math.PI * 2); ctx.fill(); }
    }
    function drawSplats(F) {
      const m = F.tortality; if (m.hitT < 0) return;
      const T = tNow(F, m), e = T - m.hitT, im = img('fin_splat');
      const fade = F.phase === 'matchEnd' ? clamp01(1 - (F.t - 50) / 40) : 1;
      if (fade <= 0) return;
      const idx = SPOTS.map((_, i) => i);                 // poradie miest zo seed
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(hash(m.seed, i, 21) * (i + 1)); const s = idx[i]; idx[i] = idx[j]; idx[j] = s; }
      ctx.save();
      for (let n = 0; n < TORT.SPLATS; n++) {
        const i = idx[n], dt = e - Math.floor(hash(m.seed, i, 22) * 9); if (dt < 0) continue;
        const s = rr(m.seed, i, 23, 0.42, 0.78) * (dt < 7 ? Math.max(0.05, easeBack(dt / 7)) : 1);
        const x = SPOTS[i][0] + rr(m.seed, i, 25, -14, 14), y = SPOTS[i][1] + rr(m.seed, i, 26, -8, 8) + Math.max(0, dt - 24) * 0.05;   // pomaly steká
        ctx.globalAlpha = 0.95 * fade;
        ctx.save(); ctx.translate(x, y); ctx.rotate(hash(m.seed, i, 24) * Math.PI * 2);
        if (im) { const w = 120 * s, h = w * im.height / im.width; ctx.drawImage(im, -w / 2, -h / 2, w, h); }
        else splatFallback(s, m.seed, i);
        ctx.restore();
      }
      ctx.restore();
    }

    // ================================================================ SELFIEALITY
    const SELF = {
      GAP: 58,         // víťaz a porazený vedľa seba (vzdialenosť chodidiel)
      WALK_MAX: 170,   // dlhšia cesta = strih bleskom
      CD: 22,          // odpočet 3-2-1: snímok na číslo
      POP: 16,         // fotka vyskočí po blesku
      FALL: 16,        // porazený od blesku padne
      BANNER: 34,      // SELFIEALITY
      HOLD: 150,
      AR: 1.12,        // pomer strán fotky = POL.PW / POL.PH
    };
    const POL = { PW: 132, PH: 118, B: 7, BB: 26 };   // Polaroid: fotka a biely okraj (spodný širší s popisom)
    api.registerFinisher('selfieality', {
      start(F, w, L) {
        if (isGuest()) return;
        const dir = L.x >= w.x ? 1 : -1;
        const mid = clamp((w.x + L.x) / 2, 100, W - 100);
        const wx1 = Math.round(mid - dir * SELF.GAP / 2), lx1 = Math.round(mid + dir * SELF.GAP / 2);
        const dw = Math.abs(wx1 - w.x), dl = Math.abs(lx1 - L.x);
        const cut = dw > SELF.WALK_MAX || dl > 110;
        const walk = cut || (dw < 3 && dl < 3) ? 0 : Math.round(clamp(Math.max(dw / 2.2, dl / 1.5), 8, 76));
        const top = Math.max(bodyHeight(w) * 1.2, bodyHeight(L) * 1.1) + 18;   // nad hlavami aj s mobilom hore
        const ph = Math.round(Math.min(GROUND + 10, top + 10)), pw = Math.min(W, Math.round(ph * SELF.AR));
        F.selfieality = { t: 0, dir, id: newSeed(), cut, walk, wx0: cut ? wx1 : w.x, wx1, lx0: cut ? lx1 : L.x, lx1,
          poseT: -1, hold: 0, cdT: -1, snapT: -1,
          px: Math.round(clamp(mid - pw / 2, 0, W - pw)), py: Math.max(0, GROUND + 10 - ph), pw, ph };   // výrez fotky (súradnice hry)
        begin(F, w, L, dir);
        if (cut) { w.x = wx1; L.x = lx1; F.flash = 16; w.set('idle'); }
        else w.set(dw > 3 ? 'futrun' : 'idle');
      },
      update(F, w, L) {
        const m = F.selfieality;
        if (!m || isGuest()) return false;
        const t = ++m.t;
        if (m.poseT < 0) {
          walkTo(w, m, t, 0, m.walk);
          if (m.walk && t <= m.walk) L.x = lerp(m.lx0, m.lx1, smooth(t / m.walk));
          if (t >= m.walk) {                              // na mieste: vytiahne mobil z kimona a zapózuje
            w.x = m.wx1; L.x = m.lx1; m.poseT = t;
            w.set('selfie'); m.hold = holdT(w);
            m.cdT = t + Math.max(Math.round(m.hold * 0.55), m.hold + 10 - 3 * SELF.CD);   // odpočet beží, kým pózuje
            m.snapT = m.cdT + 3 * SELF.CD;
          }
        }
        w.vx = 0; w.facing = m.dir;
        if (m.snapT < 0 || t - m.snapT < SELF.FALL) { L.vx = 0; L.facing = -m.dir; }
        if (w.state === 'selfie' && w.t > m.hold) w.t = m.hold;               // póza s mobilom hore drží
        if (m.cdT >= 0 && t >= m.cdT && t < m.snapT && (t - m.cdT) % SELF.CD === 0) snd('fin_beep', 0.7, 'select');
        if (t === m.snapT) { snd('fin_shutter', 1, 'select'); F.flash = 18; }
        if (m.snapT < 0) return t > 900;
        const e = t - m.snapT;
        if (e === SELF.FALL) { L.set('fall'); L.vy = -3.2; L.vx = m.dir * 1.6; }   // blesk ho oslepil: zvalí sa
        if (e === SELF.BANNER) { api.banner('SELFIEALITY', 170, 32, 72); api.say('selfieality'); }
        return e >= SELF.BANNER + SELF.HOLD || t > 900;
      },
    });

    // ---------------------------------------------------------------- SELFIEALITY: kreslenie
    const PHOTO = { id: null, cv: null, k: 1 };         // miestna snímka (nie v F, nejde sieťou)
    function capture(m) {            // výrez plátna, kým na ňom je len scéna (drawFront: bez HUD, nápisov a blesku)
      const src = ctx.canvas, k = src.width / W;          // RES v game.js: plátno má 480·RES × 270·RES
      const sx = Math.max(0, Math.round(m.px * k)), sy = Math.max(0, Math.round(m.py * k));
      const sw = Math.min(src.width - sx, Math.round(m.pw * k)), sh = Math.min(src.height - sy, Math.round(m.ph * k));
      PHOTO.id = m.id; PHOTO.cv = null; PHOTO.k = k;
      if (sw < 2 || sh < 2) return;
      try {
        const cv = document.createElement('canvas'); cv.width = sw; cv.height = sh;
        cv.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
        PHOTO.cv = cv;
      } catch (e) { PHOTO.cv = null; }                    // fotka bez obrázka: Polaroid ostane tmavý
    }
    function drawPhone(x, y, rot) {
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot);
      rrect(-4, -7, 8, 14, 1.8); ctx.fillStyle = '#1c1c24'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#7fd0ff'; ctx.fillRect(-2.8, -5.4, 5.6, 9.6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -6.4, 2, 0.8);
      ctx.restore();
    }
    function phoneProp(w, m, T) {    // postava bez spritu selfie: nakreslený mobil (Rocky v papuli, BLOCKY a IMPOSTOR pri ruke)
      const an = api.animFor(w);
      if (an && an.name === 'selfie') return;
      const f = w.facing || 1, h = bodyHeight(w), k = clamp01((T - m.poseT) / Math.max(12, m.hold || 30));
      let x, y, rot = -0.2 * f;
      if (w.def && w.def.rocky) { x = w.x - f * 20; y = w.y - 54; rot = f * 1.4; }   // sprite win: sediaci pes, papuľa pred kotvou dozadu
      else if (w.def && w.def.blocky) { x = w.x + f * 24; y = w.y - h * (0.62 + 0.3 * k); }
      else if (w.def && w.def.impostor) { x = w.x + f * 34; y = w.y - h * (0.5 + 0.12 * k); }
      else if (!an) { x = w.x + f * 22; y = w.y - 106; }   // kreslená postava (POSES.stand)
      else { x = w.x + f * h * 0.06; y = w.y - h * (0.85 + 0.27 * k); }   // póza výhry: mobil hore v zdvihnutej ruke
      if (w.def && w.def.impostor) {                      // IMPOSTOR nemá ruky: krátka ruka s mobilom
        ctx.save(); ctx.strokeStyle = '#000'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(w.x + f * 18, y + 10); ctx.lineTo(x - f * 3, y + 3); ctx.stroke();
        ctx.strokeStyle = (w.def && w.def.gi) || '#c51111'; ctx.lineWidth = 3.6; ctx.stroke(); ctx.restore();
      }
      drawPhone(x, y, rot);
    }
    function drawCountdown(m, T, w, L) {   // malý odpočet nad hlavami (časovač mobilu)
      const i = Math.floor((T - m.cdT) / SELF.CD); if (i < 0 || i > 2) return;
      const e = (T - m.cdT) % SELF.CD, x = Math.round((w.x + L.x) / 2);
      const y = Math.round(GROUND - Math.max(bodyHeight(w) * 1.2, bodyHeight(L) * 1.06) - 12), s = 1 + 0.5 * Math.max(0, 1 - e / 6);
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,10,24,0.78)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = '#ffd200'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - e / SELF.CD)); ctx.stroke();
      api.text(String(3 - i), 0, 4.5, 12, 'center', '#ffffff');
      ctx.restore();
    }
    function polaroidPose(F, m, T) {   // vyskočí z blesku; na konci zápasu sa odsunie do kúta (nezakryje nápis WINS)
      const e = T - m.snapT - 4, k = clamp01(e / SELF.POP);
      let x = W / 2, y = 158, s = lerp(1.45, 1, easeBack(k)), rot = lerp(0.05, -0.1, smooth(k));
      if (F.phase === 'matchEnd') {
        const q = smooth(clamp01((F.t - 30) / 26)), w = F.fighters[F.winner], right = !w || w.x < W / 2;
        x = lerp(x, right ? W - 64 : 64, q); y = lerp(y, 178, q); s = lerp(s, 0.56, q); rot = lerp(rot, right ? 0.16 : -0.16, q);
      }
      return { x, y, s, rot, dev: clamp01(1 - e / 54) };
    }
    function drawPolaroid(F, m, T) {
      const P = polaroidPose(F, m, T), fw = POL.PW + 2 * POL.B, fh = POL.PH + POL.B + POL.BB;
      const px = -fw / 2 + POL.B, py = -fh / 2 + POL.B;
      ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.rot); ctx.scale(P.s, P.s);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-fw / 2 + 3, -fh / 2 + 4, fw, fh);
      ctx.fillStyle = '#fbfaf5'; ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
      ctx.strokeStyle = '#d6d1c4'; ctx.lineWidth = 0.8; ctx.strokeRect(-fw / 2 + 0.4, -fh / 2 + 0.4, fw - 0.8, fh - 0.8);
      ctx.fillStyle = '#1b1b22'; ctx.fillRect(px, py, POL.PW, POL.PH);
      if (PHOTO.cv && PHOTO.id === m.id) ctx.drawImage(PHOTO.cv, 0, 0, PHOTO.cv.width, PHOTO.cv.height, px, py, POL.PW, POL.PH);
      ctx.fillStyle = 'rgba(255,246,226,0.12)'; ctx.fillRect(px, py, POL.PW, POL.PH);   // blesk fotku zosvetlí
      if (P.dev > 0) { ctx.fillStyle = `rgba(250,246,236,${(0.92 * P.dev).toFixed(3)})`; ctx.fillRect(px, py, POL.PW, POL.PH); }   // fotka sa vyvoláva
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.strokeRect(px, py, POL.PW, POL.PH);
      ctx.font = 'bold 10px "Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#1f3a8a';
      ctx.fillText('#GG #MATÚŠKOKOMBAT', 0, fh / 2 - 9);
      ctx.restore();
    }
    function selfieFront(F) {
      const m = F.selfieality, T = tNow(F, m), w = F.fighters[F.winner], L = F.fighters[F.loser];
      if (!w || !L) return;
      if (m.poseT >= 0 && w.state === 'selfie') phoneProp(w, m, T);
      if (m.snapT >= 0 && T >= m.snapT && PHOTO.id !== m.id) capture(m);   // každý klient si odfotí svoje plátno sám
      if (m.cdT >= 0 && T >= m.cdT && T < m.snapT) drawCountdown(m, T, w, L);
      if (m.snapT >= 0 && T >= m.snapT + 4) drawPolaroid(F, m, T);
    }

    // ================================================================ MUSICALITY
    const MUS = {
      STAGE: 22,       // pódium sa vysunie z kraja za víťazom
      WALK0: 4,        // víťaz vyrazí k pódiu, potom naň vyskočí
      CHAIR: 18,       // stolička sa prišmykne za porazeného
      SIT: 22,         // porazený si sadne (odteraz ho kreslí modul)
      ROPES: [26, 32, 38],
      LIGHT: 42,       // reflektor
      PLAY: 48,        // začne hrať
      LEN: 212,        // hrá ~3,5 s (fin_bad_* má 4 s), potom porazený odpadne
      TIP: 20,         // pád aj so stoličkou dozadu
      WIN: 34,         // víťaz sa teší (win)
      BANNER: 26,      // MUSICALITY
      HOLD: 110,
      EVERY: 8, FLY: 46,   // noty: každých 8 snímok, let 46 snímok
      STAGE_W: 150,    // šírka pódia (img/fin_stage 300×81 je 2×)
    };
    const INSTR = { matusko: 'heligonka', simon: 'husle' };   // sprite special týchto sád je nástroj (aj prefarbené postavy)
    const NOTE_AT = {   // odkiaľ letia noty: [dopredu, výška] ako časť výšky postavy
      heligonka: [0.26, 0.62], husle: [0.24, 0.8], boss: [0.02, 1.0], ninja: [0.36, 0.8], vodnik: [0.34, 0.94],
      bananac: [0.14, 0.58], rocky: [0.3, 0.98], head: [0.1, 0.92] };
    const HIP = 0.45, SEAT = 0.64, CHAIR_SEAT = 0.54;   // bedrá v 45 % výšky; sediac 64 % (stehná skrátené pohľadom); sedadlo v 54 % stoličky
    function canSeat(L) { const an = animAs(L, 'dizzy'); return !!(an && an.img && an.a); }
    function seatModel(L) {          // stolička a sediaca postava v miestnych súradniciach: chodidlá v 0, +x = k pódiu
      const h = bodyHeight(L), seatH = Math.round(h * HIP * SEAT), ch = seatH / CHAIR_SEAT, im = img('fin_chair');
      const cw = im ? ch * im.width / im.height : ch * 0.54, left = -0.12 * h - 0.2 * cw;   // operadlo za chrbtom
      return { h, seatH, ch, cw, left, pivot: left + 0.08 * cw };                         // pivot = spodok zadnej nohy
    }
    api.registerFinisher('musicality', {
      start(F, w, L) {
        if (isGuest()) return;
        const dir = L.x >= w.x ? 1 : -1, X = u => (dir > 0 ? u : W - u), U = x => (dir > 0 ? x : W - x);
        const ss = clamp(bodyHeight(w) / 145, 1, 1.25);                     // väčšiemu víťazovi väčšie pódium
        const uS = Math.round(clamp(U(w.x), MUS.STAGE_W * ss / 2 + 6, 120));   // pódium pri kraji za víťazom
        // stolička ďalej od pódia; porazený po páde dozadu leží až ~0,97 výšky za stoličkou → musí sa zmestiť na obrazovku
        const uL = Math.round(clamp(U(L.x), uS + 150, W - 8 - 0.97 * bodyHeight(L)));
        const wx1 = X(uS), lx1 = X(uL), dw = Math.abs(wx1 - w.x), dl = Math.abs(lx1 - L.x);
        const cut = dw > 160 || dl > 130, walk = cut || dw < 3 ? 0 : Math.round(clamp(dw / 2.2, 10, 40));
        const music = hasAnim(w, 'music'), instr = !music && INSTR[w.sid] && hasAnim(w, 'special') ? INSTR[w.sid] : null;
        const at = NOTE_AT[music ? (w.def && w.def.rocky ? 'rocky' : w.sid) : instr || 'head'] || NOTE_AT.head;
        F.musicality = { t: 0, dir, seed: newSeed(), cut, walk, ss,
          wx0: cut ? wx1 : w.x, wx1, lx0: cut ? lx1 : L.x, lx1, sx0: X(-MUS.STAGE_W * ss / 2 - 12), sx: wx1,
          st: instr ? 'musicsp' : 'music', snd: instr ? 'fin_bad_' + instr : 'fin_bad_generic', alt: instr || 'notes',
          bark: !!(w.def && w.def.rocky), ox: at[0], oy: at[1], hw: Math.round(bodyHeight(w)), seat: canSeat(L), tipT: -1 };
        begin(F, w, L, dir);
        if (cut) { w.x = wx1; L.x = lx1; F.flash = 16; w.set('idle'); }
        else w.set(dw > 3 ? 'futrun' : 'idle');
      },
      update(F, w, L) {
        const m = F.musicality;
        if (!m || isGuest()) return false;
        const t = ++m.t, feet = stageFeet(m);
        walkTo(w, m, t, MUS.WALK0, m.walk);                                    // k pódiu, potom výskok naň
        const hop0 = Math.max(MUS.STAGE, MUS.WALK0 + m.walk), hk = clamp01((t - hop0) / 10);
        if (t === hop0) { w.x = m.wx1; if (w.state === 'futrun') w.set('idle'); }
        w.y = GROUND - feet * smooth(hk) - (hk > 0 && hk < 1 ? 12 * Math.sin(Math.PI * hk) : 0);
        w.vy = 0; w.vx = 0; w.facing = m.dir;
        if (m.seat || m.tipT < 0) {                                           // porazený sa dopotáca k stoličke a sedí na nej
          L.x = t <= MUS.CHAIR ? lerp(m.lx0, m.lx1, smooth(t / MUS.CHAIR)) : m.lx1;
          L.vx = 0; L.vy = 0; L.y = GROUND; L.facing = -m.dir;
          if (L.state !== 'dizzy') L.set('dizzy');
        }
        if (t === MUS.CHAIR - 10) api.sfx('whoosh', 0.45);
        if (t === MUS.SIT) api.sfx('block', 0.5);                             // žuch na stoličku
        if (MUS.ROPES.includes(t)) snd('rope', 0.55, 'whoosh');
        if (t === MUS.LIGHT) api.sfx('select', 0.5);                          // cvak reflektora
        if (t === MUS.PLAY) { w.set(m.st); snd(m.snd, 0.9, m.alt); if (m.bark) api.sfx('bark', 0.8); }
        const e = t - MUS.PLAY;
        if (e > 0 && e < MUS.LEN) {
          if (m.bark && e % 56 === 28) api.sfx('bark', 0.55);
          if (e === 70 || e === 150) snd('fin_groan', 0.8, null);
        }
        if (e === MUS.LEN) { m.tipT = t; if (!m.seat) { L.set('fall'); L.vy = -2.5; L.vx = m.dir * 1.2; } }
        if (m.tipT < 0) return t > 900;
        const d = t - m.tipT;
        if (d === MUS.TIP) { api.sfx('fall', 0.7); api.shake(6); }
        if (d === MUS.TIP + 4) snd('fin_crowd', 0.7, 'crowd');
        if (d === MUS.WIN) w.set('win');
        if (d === MUS.BANNER) { api.banner('MUSICALITY', 170, 36); api.say('musicality'); }
        return d >= MUS.BANNER + MUS.HOLD || t > 900;
      },
    });

    // ---------------------------------------------------------------- MUSICALITY: pódium, reflektor
    function stageDims(m) {
      const im = img('fin_stage'), sw = MUS.STAGE_W * m.ss;
      return { sw, sh: im ? sw * im.height / im.width : sw * 0.27 };
    }
    // obrázok pódia: horná plocha 4–38 % výšky, predná stena po 89 %, schodíky po 94 % → chodidlá v strede hornej plochy
    function stageFeet(m) { return Math.round(stageDims(m).sh * 0.73) - 1; }
    const stageX = (m, T) => lerp(m.sx0, m.sx, easeBack(clamp01(T / MUS.STAGE)));
    function drawStage(m, T) {
      const { sw, sh } = stageDims(m), x = Math.round(stageX(m, T) - sw / 2), top = Math.round(GROUND + 1 - 0.94 * sh), im = img('fin_stage');
      if (im) { ctx.drawImage(im, x, top, Math.round(sw), Math.round(sh)); return; }
      ctx.fillStyle = '#c98a52';                          // náhrada: horná plocha, predná stena s doskami, schodíky
      ctx.beginPath(); ctx.moveTo(x + 8, top + sh * 0.04); ctx.lineTo(x + sw - 8, top + sh * 0.04); ctx.lineTo(x + sw, top + sh * 0.38); ctx.lineTo(x, top + sh * 0.38); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a4420'; ctx.fillRect(x, top + sh * 0.38, sw, sh * 0.52);
      ctx.strokeStyle = 'rgba(40,20,5,0.6)'; ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) { const yy = top + sh * (0.38 + 0.13 * i); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + sw, yy); ctx.stroke(); }
      ctx.fillStyle = '#a5683a'; ctx.fillRect(x + sw * 0.34, top + sh * 0.62, sw * 0.32, sh * 0.14); ctx.fillRect(x + sw * 0.3, top + sh * 0.78, sw * 0.4, sh * 0.16);
    }
    function drawSpot(m, T) {        // kužeľ reflektora zhora na pódium (zosvetlí víťaza)
      const lit = clamp01((T - MUS.LIGHT) / 6), x = stageX(m, T), y = GROUND - stageFeet(m), wob = Math.sin(T / 23) * 3;
      if (lit <= 0) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, 0, y + 6);
      g.addColorStop(0, `rgba(255,236,170,${(0.04 * lit).toFixed(3)})`); g.addColorStop(1, `rgba(255,236,170,${(0.26 * lit).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - 9 + wob, -4); ctx.lineTo(x + 9 + wob, -4); ctx.lineTo(x + 74, y + 6); ctx.lineTo(x - 74, y + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,240,190,${(0.2 * lit).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(x, y + 2, 66, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // ---------------------------------------------------------------- MUSICALITY: stolička, sediaci porazený, povrazy
    function drawChairLocal(S) {     // stolička z boku (operadlo vzadu, sedadlo k pódiu), spodok na zemi
      const im = img('fin_chair');
      if (im) { ctx.drawImage(im, S.left, -S.ch, S.cw, S.ch); return; }
      const l = S.left, cw = S.cw, ch = S.ch, seat = -S.seatH;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#6b3d1c';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(l + 0.16 * cw, seat); ctx.lineTo(l + 0.06 * cw, -ch); ctx.stroke();        // operadlo
      ctx.beginPath(); ctx.moveTo(l + 0.16 * cw, seat); ctx.lineTo(l + 0.08 * cw, 0); ctx.stroke();          // zadná noha
      ctx.beginPath(); ctx.moveTo(l + 0.9 * cw, seat); ctx.lineTo(l + 0.93 * cw, 0); ctx.stroke();           // predná noha
      ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(l + 0.1 * cw, seat); ctx.lineTo(l + 0.97 * cw, seat); ctx.stroke();   // sedadlo
      ctx.lineWidth = 2.5;
      for (const k of [0.62, 0.8]) { ctx.beginPath(); ctx.moveTo(l + 0.04 * cw, -ch * k - 4); ctx.lineTo(l + 0.22 * cw, -ch * k); ctx.stroke(); }
      ctx.restore();
    }
    const HI2 = {};
    const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
    function stripOf(f, an) {        // 2× pás (sprites.json src2) na veľkom displeji ako drawStrip v game.js, inak 1×
      const a = an.a;
      if (ctx.canvas.width > W && !coarse && a.src2 && an.name) {
        const key = f.sid + '/' + an.name;
        let im = HI2[key];
        if (!im) { im = HI2[key] = new Image(); im.src = a.src2; }
        if (im.complete && im.naturalWidth === a.w * a.frames * 2 && im.naturalHeight === a.h * 2) return { img: api.paletteStrip(f, an.name + '@2', im), k: 2 };
      }
      return { img: an.img, k: 1 };
    }
    function drawSitting(L, an, S, T, flinch) {   // postava zo snímky spritu: horná časť na sedadle, nohy skrátené k zemi
      const a = an.a, sc = (a.scale || 1) * ((L.def && L.def.scale) || 1), n = a.frames || 1;
      const fr = flinch ? Math.min(n - 1, 2) : Math.floor(T * (a.fps || 12) / 60) % n;
      const st = stripOf(L, an), k = st.k, sx = fr * a.w;
      if (L.def && L.def.rocky) {                         // pes stojí na sedadle
        ctx.drawImage(st.img, sx * k, 0, a.w * k, a.h * k, -a.ax * sc, -S.seatH - a.ay * sc, a.w * sc, a.h * sc);
        return;
      }
      const hipRow = clamp(Math.round(a.ay - S.h * HIP / sc), 2, a.h - 2);  // riadok bedier v snímke
      const q = S.seatH / Math.max(1, (a.ay - hipRow) * sc), leg = a.h - hipRow;
      ctx.drawImage(st.img, sx * k, hipRow * k, a.w * k, leg * k, -a.ax * sc, -S.seatH, a.w * sc, leg * sc * q);
      ctx.drawImage(st.img, sx * k, 0, a.w * k, (hipRow + 1) * k, -a.ax * sc, -S.seatH - hipRow * sc, a.w * sc, (hipRow + 1) * sc);
    }
    function rope(x0, y0, x1, y1, p) {   // povraz cez telo k operadlu: tmavý obrys, pradená struna, uzol
      if (p <= 0) return;
      const xe = lerp(x0, x1, p), ye = lerp(y0, y1, p), cx = (x0 + xe) / 2, cy = (y0 + ye) / 2 + 2.4;
      const path = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, xe, ye); };
      ctx.lineCap = 'round';
      path(); ctx.strokeStyle = '#3b2610'; ctx.lineWidth = 4.6; ctx.stroke();
      path(); ctx.strokeStyle = '#cfa468'; ctx.lineWidth = 2.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(92,60,24,0.85)'; ctx.lineWidth = 0.9;
      for (let s = 0.06; s < 0.97; s += 0.08) {
        const x = (1 - s) * (1 - s) * x0 + 2 * (1 - s) * s * cx + s * s * xe, y = (1 - s) * (1 - s) * y0 + 2 * (1 - s) * s * cy + s * s * ye;
        ctx.beginPath(); ctx.moveTo(x - 1, y + 1.2); ctx.lineTo(x + 1, y - 1.2); ctx.stroke();
      }
      if (p < 1) return;
      ctx.strokeStyle = '#3b2610'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + 2.5, y1 + 6); ctx.moveTo(x1, y1); ctx.lineTo(x1 + 5, y1 + 4.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(x1, y1, 2.6, 0, Math.PI * 2); ctx.fillStyle = '#cfa468'; ctx.fill(); ctx.strokeStyle = '#3b2610'; ctx.lineWidth = 1; ctx.stroke();
    }
    function drawRopes(S, T, standing) {
      const h = S.h, base = standing ? -h * HIP : -S.seatH, back = S.left + 0.02 * S.cw, front = 0.16 * h;
      const p = i => clamp01((T - MUS.ROPES[i]) / 5);
      rope(back, base - 0.11 * h, front, base - 0.11 * h + 1, p(0));
      rope(back, base - 0.24 * h, front, base - 0.24 * h + 1, p(1));
      const ly = standing ? -h * 0.18 : -S.seatH * 0.42;
      rope(-0.15 * h, ly, 0.17 * h, ly + 1, p(2));          // nohy k prednej nohe stoličky
    }
    function rockAngle(T) {          // kýva sa dozadu na zadných nohách stoličky, čím dlhšie hrá, tým viac
      const e = T - MUS.PLAY; if (e <= 0) return 0;
      const k = clamp01(e / MUS.LEN);
      return -(0.03 + 0.15 * k * k) * (0.5 - 0.5 * Math.cos(e * (0.2 + 0.1 * k)));
    }
    function chairAngle(m, T) {
      if (m.tipT < 0 || T < m.tipT) return rockAngle(T);
      const d = T - m.tipT, k = clamp01(d / MUS.TIP);
      if (k < 1) return lerp(rockAngle(m.tipT), -Math.PI / 2, k * k);
      const b = d - MUS.TIP;
      return -Math.PI / 2 + 0.09 * Math.exp(-b / 5) * Math.abs(Math.sin(b / 1.6));   // odrazí sa od zeme
    }
    function flinchAt(m, T) {        // blesk z noty doletel: porazený trhne sebou (sprite hit)
      if (m.tipT >= 0 && T >= m.tipT) return false;
      const N = Math.floor(MUS.LEN / MUS.EVERY);
      for (let i = 0; i < N; i++) {
        if (Math.floor(hash(m.seed, i, 31) * 4) !== 3) continue;
        const d = T - (MUS.PLAY + i * MUS.EVERY + MUS.FLY);
        if (d >= 0 && d < 8) return true;
      }
      return false;
    }
    function chairBehind(F, m, T) {  // pred sadnutím: stolička sa prišmykne zozadu (kreslí sa za porazeného)
      const L = F.fighters[F.loser]; if (!L) return;
      const S = seatModel(L), k = easeOut(clamp01((T - (MUS.CHAIR - 12)) / 12)), f = -m.dir;
      if (k <= 0) return;
      const x = lerp(m.dir > 0 ? W + 70 : -70, m.lx1, k);
      ctx.save(); ctx.translate(Math.round(x), GROUND); if (f < 0) ctx.scale(-1, 1);
      drawChairLocal(S); ctx.restore();
    }
    function drawSeated(F, m, T, L) {   // sediaci porazený (game.js ho práve nakreslil mimo obrazovky): stolička, postava, povrazy
      const S = seatModel(L), f = -m.dir;
      const playing = T >= MUS.PLAY && (m.tipT < 0 || T < m.tipT), ks = clamp01((T - MUS.PLAY) / MUS.LEN);
      const th = chairAngle(m, T), dx = playing ? Math.sin(T * 2.7) * 1.4 * ks : 0;   // kýve sa a trasie
      const flinch = flinchAt(m, T), an = animAs(L, flinch ? 'hit' : 'dizzy');        // dizzy = ruky na ušiach
      ctx.save();
      ctx.translate(Math.round(m.lx1 + dx), GROUND); if (f < 0) ctx.scale(-1, 1);
      ctx.translate(S.pivot, 0); ctx.rotate(th); ctx.translate(-S.pivot, 0);
      drawChairLocal(S);
      if (an && an.img) { try { drawSitting(L, an, S, T, flinch); } catch (e) { /* snímka sa nepodarila: ostane stolička s povrazmi */ } }
      drawRopes(S, T, false);
      ctx.restore();
      // hlava v súradniciach obrazovky (hviezdičky po páde, ÍÍÍ! počas hrania)
      const hy = -S.seatH - S.h * (1 - HIP) * 0.9, c = Math.cos(th), s = Math.sin(th);
      const rx = S.pivot + (0 - S.pivot) * c - hy * s, ry = (0 - S.pivot) * s + hy * c;
      const X = m.lx1 + dx + f * rx, Y = GROUND + ry;
      if (playing && ks > 0.5 && T % 30 < 18) api.text('ÍÍÍ!', X - f * 4, Y - 16, 10, 'center', '#ff7070');
      if (m.tipT >= 0 && T >= m.tipT + MUS.TIP) stars(X, Y - 6, T);
    }

    // ---------------------------------------------------------------- MUSICALITY: falošné noty
    const NOTE_COL = ['#b6ff3a', '#ff7af0', '#7fe8ff', '#ffb84d'];
    function badNote(kind, x, y, rot, size, col) {
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(rot);
      if (kind === 3) {                                   // blesk namiesto noty
        ctx.beginPath(); ctx.moveTo(-2, -size * 0.7); ctx.lineTo(4, -size * 0.7); ctx.lineTo(0.5, -size * 0.12); ctx.lineTo(4.5, -size * 0.12);
        ctx.lineTo(-3, size * 0.7); ctx.lineTo(-0.5, size * 0.06); ctx.lineTo(-4, size * 0.06); ctx.closePath();
        ctx.fillStyle = '#ffe23a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4; ctx.stroke();
      } else {
        api.text(kind === 0 ? '♪' : '♫', 0, size * 0.35, size, 'center', col);
        if (kind === 2) {                                 // prečiarknutá (falošná) nota
          ctx.strokeStyle = '#000'; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-size * 0.32, -size * 0.42); ctx.lineTo(size * 0.32, size * 0.22); ctx.stroke();
          ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
      ctx.restore();
    }
    function drawNotes(F, m, T) {
      const L = F.fighters[F.loser]; if (!L) return;
      const S = seatModel(L), f = m.dir, N = Math.floor(MUS.LEN / MUS.EVERY);
      const ox = m.wx1 + f * m.ox * m.hw, oy = GROUND - stageFeet(m) - m.oy * m.hw;
      const tx = m.lx1 - f * 4, ty = GROUND - S.seatH - S.h * (1 - HIP) * 0.8;
      for (let i = 0; i < N; i++) {
        const age = T - (MUS.PLAY + i * MUS.EVERY); if (age < 0 || age >= MUS.FLY + 6) continue;
        if (age >= MUS.FLY) {                             // doletela: malý výbuch pri hlave
          const r = 4 + (age - MUS.FLY) * 2.2; ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.4;
          for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3 + i; ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * r * 0.5, ty + Math.sin(a) * r * 0.5); ctx.lineTo(tx + Math.cos(a) * r, ty + Math.sin(a) * r); ctx.stroke(); }
          ctx.restore(); continue;
        }
        const p = age / MUS.FLY, kind = Math.floor(hash(m.seed, i, 31) * 4);
        const x = lerp(ox, tx, p) + Math.sin(p * 11 + i * 1.7) * 5 * (1 - p * 0.5);   // krivé, roztrasené
        const y = lerp(oy, ty, p) - Math.sin(Math.PI * p) * rr(m.seed, i, 32, 10, 34) + Math.sin(p * 17 + i) * 3;
        badNote(kind, x, y, Math.sin(age / 3 + i) * 0.55, rr(m.seed, i, 33, 13, 18), NOTE_COL[Math.floor(hash(m.seed, i, 34) * NOTE_COL.length)]);
      }
    }
    function musBack(F) {
      const m = F.musicality, T = tNow(F, m), lit = clamp01((T - MUS.LIGHT) / 6);
      if (lit > 0) { ctx.fillStyle = `rgba(4,4,16,${(0.42 * lit).toFixed(3)})`; ctx.fillRect(-30, -30, W + 60, api.H + 60); }   // tma okolo reflektora
      drawStage(m, T);
      const L = F.fighters[F.loser];
      if (T < MUS.SIT || !L) { chairBehind(F, m, T); return; }
      if (canSeat(L) && !(m.tipT >= 0 && !m.seat)) hide(L);   // game.js ho nakreslí mimo obrazovky, modul sediaceho (drawFront)
      else { const S = seatModel(L); ctx.save(); ctx.translate(Math.round(m.lx1), GROUND); if (m.dir > 0) ctx.scale(-1, 1); drawChairLocal(S); ctx.restore(); }
    }
    function musFront(F) {
      const m = F.musicality, T = tNow(F, m);
      if (T >= MUS.SIT) {
        const L = F.fighters[F.loser], seated = !!(hid && L && hid.f === L);
        if (seated) drawSeated(F, m, T, L);
        else if (L && !(m.tipT >= 0 && T >= m.tipT)) {    // kreslená postava bez spritu stojí pri stoličke: len povrazy
          const S = seatModel(L); ctx.save(); ctx.translate(Math.round(m.lx1), GROUND); if (m.dir > 0) ctx.scale(-1, 1);
          drawRopes(S, T, true); ctx.restore();
        }
      }
      drawSpot(m, T);
      if (T >= MUS.PLAY) drawNotes(F, m, T);
    }

    // ================================================================ háčiky kreslenia
    hooks.drawBack.push((stage, F) => {
      if (on(F, 'tortality')) tortBack(F);
      if (on(F, 'musicality')) musBack(F);
    });
    hooks.drawFront.push((stage, F) => {
      if (on(F, 'tortality')) tortFront(F);
      if (on(F, 'selfieality')) selfieFront(F);
      if (on(F, 'musicality')) musFront(F);
    });
    hooks.drawHud.push(F => { if (on(F, 'tortality')) drawSplats(F); });

    // pre testy a ostatné moduly
    api.finishers2 = {
      TORT, SELF, MUS, POL, INSTR, seatModel, canSeat, stageFeet, chairAngle, cakeY,
      get photo() { return PHOTO.cv ? { id: PHOTO.id, w: PHOTO.cv.width, h: PHOTO.cv.height, k: PHOTO.k } : (PHOTO.id ? { id: PHOTO.id, w: 0, h: 0, k: PHOTO.k } : null); },
      resetPhoto() { PHOTO.id = null; PHOTO.cv = null; },
      get hidden() { return hid ? { id: hid.f.id, x: hid.x } : null; },
    };
  },
});
