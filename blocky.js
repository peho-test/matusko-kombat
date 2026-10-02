// MATÚŠKO KOMBAT XII — modul blocky: BLOCKY, kockatý baník v pixelovom štýle (TNT, ARROW, PICKAXE) (P15)
//
//   TNT ........ ♪                 hodí blok TNT pred súpera; ~1,5 s bliká a syčí, potom vybuchne (okruh, zrazí).
//                                  Dá sa preskočiť (výskok) alebo zablokovať (menšie poškodenie). Nabíja sa ako ♪.
//   ARROW ...... ↓ VPRED ♪         z výpadu vystrelí šíp z pixelového luku (rýchla strela, nízko) — blok aj preskok; ukazovateľ ARROW
//   PICKAXE .... VZAD VPRED ♪      tri rýchle údery krompáčom, posledný zrazí; blokovateľné
//   + univerzálne pohyby z moves.js (uppercut, podkop, letiaci kop, kombo 3) a KIAI ako chlapci; moveSpecial: null.
//   Pri víťazstve bublina „GG!“.
//
// Kreslený kódom, žiadne sprity: mriežka 4 px „texelov“, 2–3 odtiene na plochu, pohľad 3/4 (predná a bočná stena kociek),
// končatiny sa otáčajú na mriežke texelov (najbližší texel), takže všetko ostáva ostré a kockaté aj v pohybe.
// game.js kreslí bojovníkov zo spritov: modul mu dá vlastný „pás snímok“ — jedno plátno na stranu (FA.blocky, FA['blocky~1'],
// bojovník má f.mimic = kľúč plátna), ktoré pred kreslením postáv (hooks.drawBack) prekreslí podľa stavu. Tieň, otočenie,
// mierka, záblesk zásahu aj poradie (útočník navrchu) tak ostávajú z game.js. Auru Super Saiyan kreslí modul (game.js by
// mal v cache starú siluetu). Postavy kreslené mimo zápasu (rebrík: api.drawFighter) prekreslí obal api.drawFighter.
// Vstup len cez inp (held / pressed / history) a api.matchSeq; počítač cez hooks.cpu + zámer v inp.blkIntent (ako rocky.js).
// Sieťová hra: stav je len čisté dáta (F.blk.proj/fx so side, f.blkArrow, f.blkPick, f.mimic); hosť nič nesimuluje, len kreslí.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'blocky',
  init(api) {
    'use strict';
    const { W, GROUND, MOVE, FA, IMG, hooks, ctx, NET } = api;
    const { rnd, chance, clamp } = api;
    const ID = 'blocky';

    // ================================================================ nastavenia (Master môže doladiť)
    const TNT_CD = 420;                          // = SPECIAL_CD v game.js (ukazovateľ ♪ v HUD)
    const ARROW_CD = 110, PICK_CD = 120;         // ARROW 1,8 s (vlastný ukazovateľ), PICKAXE 2 s
    const SEQ_GAP = 22;                          // max. snímok medzi stlačeniami v kombe (deti, joystick na mobile)
    const TNT = { fly: 28, grav: 0.42, fuse: 90, radius: 62, clear: 34, dmg: 12, push: 4.4, min: 54, front: 30 };
    const ARROW = { v: 7.5, y: 66, clear: 40, dmg: 7, push: 2.6, hitstun: 16 };
    const PICK = { at2: 12, at3: 25, end: 52 };

    // ================================================================ bojovník
    const DEF = {
      name: 'BLOCKY', short: 'BLOCKY', blocky: true,
      gi: '#2bb3b1', giDark: '#3c55b8', belt: '#5b3a1f', hair: '#b5521f',   // farby kreslených náhrad (vyhodenie, výsledky)
      special: 'tnt', specialName: 'TNT', finisher: 'creeperality',
      moveSpecial: null,                         // moves.js: bez tornáda a teleportu (uppercut, podkop, letiaci kop a kombo ostávajú)
      height: 135,
      blurb: ['Kockatý baník.', 'TNT, ARROW z luku', 'a PICKAXE. GG!'],
    };
    api.registerFighter(ID, DEF, false);         // nevoliteľný: odomyká ho rebrík (iný modul)
    const mine = f => !!(f && f.def && f.def.blocky);

    Object.assign(MOVE, {
      blk_tnt:   { startup: 14, active: 1, recovery: 18 },
      blk_bow:   { startup: 12, active: 1, recovery: 16 },
      // PICKAXE: jeden stav, f.move sa prepína pick1 → pick2 → pick3 (štart je od začiatku stavu, spolu 52 snímok)
      blk_pick1: { startup: 6, active: 3, recovery: 43, dmg: 4, x0: 8, x1: 76, y0: -132, y1: -48, hitstun: 20, push: 1.2, sound: 'punch' },
      blk_pick2: { startup: 17, active: 3, recovery: 32, dmg: 4, x0: 8, x1: 76, y0: -132, y1: -48, hitstun: 20, push: 1.2, sound: 'punch' },
      blk_pick3: { startup: 30, active: 4, recovery: 18, dmg: 8, x0: 8, x1: 84, y0: -144, y1: -40, hitstun: 22, push: 4.6, sound: 'kick', knock: true },
    });
    for (const s of ['blk_tnt', 'blk_bow', 'blk_pick']) api.ATTACK_STATES.add(s);
    api.HIT_STATES.add('blk_pick');              // zásahy krompáča rieši game.js (checkAttack podľa MOVE[f.move])
    api.animFallback('blk_tnt', 'special');
    api.animFallback('blk_bow', 'kiai');
    api.animFallback('blk_pick', 'punch');

    // ================================================================ kreslenie postavy: texely, otáčanie na mriežke
    const TX = 4;                                // px na texel
    const CWt = 84, CHt = 66, AXt = 42, AYt = 61;   // plátno a kotva (chodidlá) v texeloch
    const SIDS = ['blocky', 'blocky~1'];         // plátno pre stranu 0 / 1 (BLOCKY proti BLOCKYMU)
    const ANIM_NAMES = ['idle', 'walk', 'jump', 'flip', 'airkick', 'block', 'punch', 'kick', 'kiai', 'special', 'hit', 'fall',
                        'dizzy', 'deaf', 'dance', 'win', 'kroj'];   // 'kroj' = FOLKLORITY funguje; 'baby' kreslí game.js z img/baby_blocky
    const CANVAS = {};
    function ensureSprites() {                   // volá sa až po štarte (loadImages už prešiel FA, nebude hľadať súbory)
      for (const sid of SIDS) {
        if (CANVAS[sid] && FA[sid]) continue;
        const cv = CANVAS[sid] || document.createElement('canvas'); cv.width = CWt * TX; cv.height = CHt * TX;
        const desc = { frames: 1, w: CWt * TX, h: CHt * TX, ax: AXt * TX, ay: AYt * TX, fps: 12, scale: 1, peak: [0, 0], tuck: 0 };
        const anims = {};
        for (const n of ANIM_NAMES) { anims[n] = desc; IMG[sid + '/' + n] = cv; }
        FA[sid] = { anims, blocky: true };
        CANVAS[sid] = cv;
      }
    }
    // afinná transformácia [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (pokojové súradnice → plátno, v texeloch)
    function rotAt(deg, px, py) {                // kladný uhol = proti smeru hodín: visiaca ruka ide dopredu, stojace telo dozadu
      const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return [c, -s, s, c, px - (c * px + s * py), py - (-s * px + c * py)];
    }
    const tr = (dx, dy) => [1, 0, 0, 1, dx, dy];
    function mul(A, B) {
      return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
              A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
    }
    function inv(M) {
      const [a, b, c, d, e, f] = M, k = a * d - b * c, ia = d / k, ib = -b / k, ic = -c / k, id = a / k;
      return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
    }
    const R = { X: null, s: TX, ox: AXt, oy: AYt, tint: null };   // aktuálny cieľ kreslenia
    function put(tx, ty, col) { R.X.fillStyle = R.tint ? R.tint(col) : col; R.X.fillRect((R.ox + tx) * R.s, (R.oy + ty) * R.s, R.s, R.s); }
    // obdĺžnik [x0, x1) × [y0, y1) v pokojových súradniciach cez transformáciu M; tex(u, v) → farba alebo null
    function box(M, x0, y0, x1, y1, tex) {
      const Mi = inv(M);
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const wx = M[0] * x + M[2] * y + M[4], wy = M[1] * x + M[3] * y + M[5];
        if (wx < minx) minx = wx; if (wx > maxx) maxx = wx; if (wy < miny) miny = wy; if (wy > maxy) maxy = wy;
      }
      const tx0 = Math.floor(minx + 1e-6), tx1 = Math.ceil(maxx - 1e-6), ty0 = Math.floor(miny + 1e-6), ty1 = Math.ceil(maxy - 1e-6);
      for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++) {
        const cx = tx + 0.5, cy = ty + 0.5;
        const lx = Mi[0] * cx + Mi[2] * cy + Mi[4], ly = Mi[1] * cx + Mi[3] * cy + Mi[5];
        if (lx < x0 || lx >= x1 || ly < y0 || ly >= y1) continue;
        const col = tex(Math.floor(lx - x0), Math.floor(ly - y0));
        if (col) put(tx, ty, col);
      }
    }
    // farby: [základ, tmavší, svetlejší]; vzor odtieňov je pravidelný (ako creeper v game.js), nie náhodný šum
    const sh = (p, u, v, k = 0) => { const h = (u * 7 + v * 13 + u * v * 3 + k * 5) % 9; return h === 0 ? p[2] : (h === 4 || h === 7) ? p[1] : p[0]; };
    const MIX = new Map();
    function mix(col, to, k) {                   // '#rrggbb' → zmes s farbou to v pomere k (cache)
      const key = col + to + k; let r = MIX.get(key); if (r) return r;
      const a = parseInt(col.slice(1), 16), b = parseInt(to.slice(1), 16);
      const ch = sh2 => Math.round(((a >> sh2) & 255) * (1 - k) + ((b >> sh2) & 255) * k);
      r = '#' + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
      MIX.set(key, r); return r;
    }
    const dim = c => mix(c, '#000000', 0.22);    // vzdialenejšia ruka / noha
    const edge = c => mix(c, '#000000', 0.14);   // zadná hrana končatiny
    const redTint = c => mix(c, '#ff2a2a', 0.45);   // zásah: postava sčervenie ako v Minecrafte
    const LOOK = {
      normal: {
        skin: ['#e2a97e', '#d29a70', '#ecb88f'], skinS: ['#c58c62', '#b57d55', '#cf956b'], ear: '#a8714b',
        hair: ['#b5521f', '#9c4419', '#c8642a'], hairS: ['#9a4318', '#873a15', '#a84b1b'],
        eyeW: '#f4f4f4', iris: '#2d7a3e', lash: '#5a2d1c', nose: '#c98a60', freckle: '#cf8a5c', mouth: '#5e2a1e', tongue: '#d9636b',
        shirt: ['#2bb3b1', '#229c9a', '#3cc6c3'], shirtS: ['#1f8a88', '#1a7674', '#25999a'], collar: '#1d8583', sleeve: 4,
        pants: ['#3c55b8', '#334aa0', '#4a64c9'], pantsS: ['#2e4290', '#283a80', '#34499c'],
        belt: ['#5b3a1f', '#4a2f18', '#6b4625'], buckle: '#e8b83a', glove: ['#6e4524', '#5a381c', '#80532c'],
        boot: ['#4b3b2d', '#3b2e23', '#5c4a3a'], hat: 'helmet',
      },
    };
    LOOK.kroj = Object.assign({}, LOOK.normal, {     // FOLKLORITY: biela košeľa, čierna vesta, čierne nohavice, klobúk
      shirt: ['#f2f2f2', '#dcdcdc', '#ffffff'], shirtS: ['#cfcfcf', '#bdbdbd', '#d9d9d9'], collar: '#d0d0d0', sleeve: 10, vest: true,
      pants: ['#1e1e1e', '#161616', '#2a2a2a'], pantsS: ['#141414', '#0e0e0e', '#1b1b1b'],
      belt: ['#c0392b', '#a93226', '#d24636'], buckle: '#f2c230', glove: ['#e2a97e', '#d29a70', '#ecb88f'],
      boot: ['#1b1b1b', '#121212', '#262626'], hat: 'kroj',
    });
    const PICK_C = { head: ['#cfd3d9', '#a1a7b0', '#6b717a'], stick: ['#8b5a2b', '#6e4520', '#a26b36'] };

    function headFront(L, u, v, face, t) {       // 8 × 8; u = 0 pri bočnej stene, u = 7 vpredu (k súperovi)
      if (v === 0 || (v === 1 && (u === 0 || u === 7))) return sh(L.hair, u, v, 13);
      if (v === 2 && face === 'angry' && (u === 2 || u === 3 || u === 5 || u === 6)) return L.hair[1];
      if (v === 3 && (u === 2 || u === 3 || u === 5 || u === 6)) {
        if (face === 'blink' || face === 'happy' || face === 'hit') return L.lash;
        const front = face === 'dizzy' ? Math.floor(t / 7) % 2 === 0 : true;   // omámený: zrenice behajú sem a tam
        return ((u === 3 || u === 6) === front) ? L.iris : L.eyeW;
      }
      if (v === 4 && u === 4) return L.nose;
      if (v === 4 && (u === 1 || u === 7)) return L.freckle;
      if (face === 'hit' || face === 'dizzy') { if ((v === 5 || v === 6) && (u === 3 || u === 4)) return L.mouth; }
      else if (face === 'happy') {
        if (v === 5 && u >= 2 && u <= 6) return L.mouth;
        if (v === 6 && u >= 3 && u <= 5) return u === 4 ? L.tongue : L.mouth;
      } else {
        if (v === 5 && (u === 2 || u === 6)) return L.mouth;
        if (v === 6 && u >= 3 && u <= 5) return L.mouth;
      }
      return sh(L.skin, u, v, 14);
    }
    function headSide(L, u, v) {                 // 3 × 8, u = 0 zadná hrana hlavy
      if (v <= 1 || u === 0 || (v === 2 && u === 1)) return sh(L.hairS, u, v, 11);
      if ((v === 4 || v === 5) && u === 1) return L.ear;
      return sh(L.skinS, u, v, 12);
    }
    function torsoFront(L, u, v) {               // 8 × 12
      if (v === 10) return (u === 5 || u === 6) ? L.buckle : sh(L.belt, u, v, 3);
      if (v === 11) return sh(L.pants, u, v, 4);
      if (L.vest && (u <= 1 || u >= 6)) return v === 0 ? '#2a2a2a' : sh(['#1e1e1e', '#151515', '#2b2b2b'], u, v, 5);
      if (L.vest && (u + v) % 4 === 0 && v > 1 && v < 9) return '#c0392b';       // vyšívanie na košeli
      if (v === 0 && (u === 3 || u === 4)) return L.collar;
      if (v === 9) return L.shirt[1];
      return sh(L.shirt, u, v, 2);
    }
    function torsoSide(L, u, v) {                // 2 × 12
      if (v === 10) return mix(L.belt[0], '#000000', 0.25);
      if (v === 11) return sh(L.pantsS, u, v, 6);
      if (L.vest) return '#121212';
      return sh(L.shirtS, u, v, 7);
    }
    function armTex(L, u, v, far) {              // 4 × 12: rukáv, predlaktie, rukavica
      let c = v >= 10 ? sh(L.glove, u, v, 8) : v < L.sleeve ? sh(L.shirt, u, v, 9) : sh(L.skin, u, v, 10);
      if (v === L.sleeve - 1 && v < 10) c = L.shirt[1];
      if (u === 0) c = edge(edge(c)); else if (u === 3) c = edge(c);   // hrany ruky: oddelí sa od trupu
      return far ? dim(c) : c;
    }
    function legTex(L, u, v, far, side) {        // 4 × 12 (bližšia noha má navyše bočný stĺpec u = 0)
      let c = v >= 9 ? (v === 11 ? L.boot[1] : sh(L.boot, u, v, 11)) : sh(L.pants, u, v, 12);
      if (side && u === 0) c = mix(c, '#000000', 0.26);
      return far ? dim(c) : c;
    }
    function hat(M, L) {
      if (L.hat === 'kroj') {
        box(M, -7, -33, 7, -32, (u) => u === 0 || u === 13 ? '#2a2a2a' : '#151515');                       // strieška klobúka
        box(M, -5, -36, 4, -33, (u, v) => v === 2 ? '#c0392b' : (u <= 1 ? '#0c0c0c' : '#1d1d1d'));          // klobúk s červenou stuhou
        return;
      }
      const Y = ['#f2c230', '#dca71e', '#ffd75a'], YS = ['#d6a21c', '#c28f15', '#e3b02a'];
      box(M, -5, -34, 4, -33, (u) => { const x = u - 5; if (x === 1 || x === 2) return '#5f636b'; return x < -3 ? YS[0] : (x === 3 ? Y[1] : Y[2]); });
      box(M, -6, -33, 6, -32, (u) => { const x = u - 6; if (x === 1) return '#fff6b8'; if (x === 2) return '#ffffff'; if (x === 5) return Y[1]; return x < -3 ? sh(YS, u, 1) : sh(Y, u, 1, 3); });
    }
    function pickTex(u, v) {                     // 9 × 14: rúčka zvislo (u = 4), hlava krompáča dole, hroty zahnuté k ruke
      const x = Math.abs(u - 4), H = PICK_C.head;
      if (x === 0 && v <= 10) return v % 4 === 1 ? PICK_C.stick[1] : v % 4 === 3 ? PICK_C.stick[2] : PICK_C.stick[0];
      if (x <= 2 && (v === 11 || v === 12)) return v === 11 ? H[0] : H[1];
      if (x === 3 && (v === 10 || v === 11)) return v === 10 ? H[0] : H[1];
      if (x === 4 && (v === 9 || v === 10)) return v === 9 ? H[2] : H[1];
      return null;
    }
    const BOW_Y = [1, 1, 0, 0, -1, -2, -3];
    function bowTex(u, v, pull) {                // 15 × 12 okolo ruky: luk naprieč rukou, tetiva, šíp pri napínaní
      const x = u - 7, y = v - 7, ax = Math.abs(x);
      if (ax <= 6 && (y === BOW_Y[ax] || (ax <= 1 && y === BOW_Y[ax] + 1))) return ax >= 5 ? '#6e4520' : (ax <= 1 ? '#5a381c' : '#9a6634');
      if (ax <= 6) { const sy = Math.round(-3 - pull * (1 - ax / 6)); if (y === sy) return '#e8e8e8'; }
      if (pull > 0 && x === 0) { const n = Math.round(-3 - pull); if (y >= n && y <= 5) return y >= 4 ? '#cfd3d9' : (y <= n + 1 ? '#f2f2f2' : '#8b5a2b'); }
      return null;
    }
    function tntTex(u, v) {                      // 6 × 6 TNT v ruke
      if (v === 2 || v === 3) return (u >= 1 && u <= 4 && (u + v) % 2 === 0) ? '#1e1e1e' : '#f1f1f1';
      return (u % 3 === 2) ? '#a8221c' : (v === 5 ? '#b82720' : '#d8312a');
    }
    function cakeTex(u, v) {                     // 8 × 4 torta (FRIENDSHIP)
      if (v === 0) return (u === 1 || u === 4 || u === 6) ? '#d8312a' : '#fbfbfb';
      if (v === 1) return (u === 0 || u === 3 || u === 7) ? '#fbfbfb' : '#c98a4b';
      return sh(['#c98a4b', '#a86d36', '#d89a5c'], u, v, 4);
    }
    // celá postava: pose = uhly kĺbov a telo; X = 2d kontext, s = px na texel, (ox, oy) = kotva v texeloch
    function paint(X, pose, s, ox, oy, tint) {
      Object.assign(R, { X, s, ox, oy, tint });
      const L = LOOK[pose.look] || LOOK.normal;
      const B = mul(tr(pose.dx, pose.dy), rotAt(pose.body, pose.bpx, pose.bpy));
      const Up = mul(B, tr(0, pose.bob));
      const AF = mul(Up, rotAt(pose.aF, 6, -22));
      box(AF, 4, -24, 8, -12, (u, v) => armTex(L, u, v, true));
      box(mul(B, rotAt(pose.lF, 3, -12)), 1, -12, 5, 0, (u, v) => legTex(L, u, v, true, false));
      box(mul(B, rotAt(pose.lN, -1.5, -12)), -4, -12, 1, 0, (u, v) => legTex(L, u, v, false, true));
      box(Up, -5, -24, -3, -12, (u, v) => torsoSide(L, u, v));
      box(Up, -3, -24, 5, -12, (u, v) => torsoFront(L, u, v));
      box(Up, -6, -32, -3, -24, (u, v) => headSide(L, u, v));
      box(Up, -3, -32, 5, -24, (u, v) => headFront(L, u, v, pose.face, pose.t));
      hat(Up, L);
      const AN = mul(Up, rotAt(pose.aN, -4, -22));
      box(AN, -6, -24, -2, -12, (u, v) => armTex(L, u, v, false));
      const it = pose.item;
      if (it === 'pick') box(mul(AN, rotAt(pose.grip, -4, -13)), -8, -16, 1, -2, pickTex);
      else if (it === 'bow') box(AN, -11, -20, 4, -7, (u, v) => bowTex(u, v, pose.pull));
      else if (it === 'tnt') box(mul(AN, rotAt(-pose.aN - pose.body, -4, -12)), -7, -12, -1, -6, tntTex);
      else if (it === 'cake') box(mul(AN, rotAt(-pose.aN - pose.body, -4, -12)), -8, -12, 0, -8, cakeTex);
    }

    // ================================================================ pózy podľa stavu
    const ease = k => k * k * (3 - 2 * k);
    const lerp = (a, b, k) => a + (b - a) * clamp(k, 0, 1);
    function phase(t, m) {                       // 0..1 rozbeh, 1..2 aktívne snímky, 2..3 zotavenie
      if (!m) return 3;
      if (t < m.startup) return t / Math.max(1, m.startup);
      if (t < m.startup + m.active) return 1 + (t - m.startup) / Math.max(1, m.active);
      return 2 + Math.min(1, (t - m.startup - m.active) / Math.max(1, m.recovery));
    }
    const sw = (ph, a0, a1, a2, a3) => ph < 1 ? lerp(a0, a1, ease(ph)) : ph < 2 ? lerp(a1, a2, (ph - 1) * 2) : lerp(a2, a3, ease(ph - 2));   // úder dorazí v polovici aktívnych snímok
    function keys(t, list) {                     // [[t, hodnota], ...] → plynulý prechod medzi kľúčmi
      if (t <= list[0][0]) return list[0][1];
      for (let i = 1; i < list.length; i++) if (t <= list[i][0]) { const [t0, a] = list[i - 1], [t1, b] = list[i]; return lerp(a, b, ease((t - t0) / (t1 - t0))); }
      return list[list.length - 1][1];
    }
    const KNOWN = new Set(['idle', 'walk', 'jump', 'airkick', 'flykick', 'block', 'blockstun', 'punch', 'kick', 'uppercut', 'sweep', 'kiai',
      'hit', 'fall', 'down', 'getup', 'dizzy', 'deaf', 'dance', 'kroj', 'win', 'friendship', 'blk_tnt', 'blk_bow', 'blk_pick']);
    function stateOf(f) {                        // neznámy stav (zmrazenie, smiech, lano…) → náhradná animácia z api.animFallback
      let s = f.state, n = 0;
      while (s && !KNOWN.has(s) && n++ < 4) s = api.ANIM_FALLBACK[s];
      return KNOWN.has(s) ? s : 'idle';
    }
    function poseOf(f) {
      const t = f.t || 0, st = stateOf(f);
      const p = { body: 0, bpx: 0, bpy: 0, dx: 0, dy: 0, bob: 0, aN: 6, aF: -4, lN: 0, lF: 0, item: 'pick', grip: 32, pull: 0,
                  face: (t % 170) >= 163 ? 'blink' : 'normal', look: 'normal', t };
      const m = MOVE[f.move];
      switch (st) {
        case 'idle': {
          const k = Math.sin(t / 28);
          p.aN = 6 + 3 * k; p.aF = -4 - 3 * k; p.bob = Math.sin(t / 26) < -0.25 ? 1 : 0;   // jemné dýchanie
          break;
        }
        case 'walk': {
          const k = Math.sin(t * 0.21);
          p.lN = 32 * k; p.lF = -32 * k; p.aN = 4 - 28 * k; p.aF = 28 * k; p.grip = 28;
          break;
        }
        case 'jump':
          if (f.flip) {                          // salto po kockách: otočenie po 90° (ostro, bez rozmazania)
            const k = Math.round(Math.min(1, t / 39) * 4) % 4, fwd = Math.sign(f.vx || f.flip) === f.facing ? 1 : -1;
            p.body = -90 * k * fwd; p.bpy = -17; p.aN = 165; p.aF = 160; p.grip = 0;
          } else { p.lN = 18; p.lF = -12; p.aN = 35; p.aF = -25; p.grip = 20; }
          break;
        case 'airkick': case 'flykick':
          p.body = st === 'flykick' ? 26 : 12; p.bpy = -12; p.lN = 72; p.lF = -18; p.aN = -45; p.aF = 55; p.face = 'angry';
          break;
        case 'block': case 'blockstun':
          p.body = 4; p.aN = 70; p.aF = 66; p.grip = 110;   // krompáč zvislo pred telom, hlavou hore p.face = st === 'blockstun' ? 'hit' : 'angry';
          if (st === 'blockstun') p.dx = -1;
          break;
        case 'punch': {
          const ph = phase(t, m); p.face = 'angry';
          if (f.move === 'punch2') { p.aF = sw(ph, -4, -25, 95, -4); p.aN = sw(ph, 6, 20, -10, 6); }   // druhý úder: druhá ruka
          else { p.aN = sw(ph, 6, 205, 78, 6); p.grip = sw(ph, 32, 10, 18, 32); p.aF = sw(ph, -4, 20, -25, -4); }   // švih krompáčom
          break;
        }
        case 'kick': {
          const ph = phase(t, m); p.face = 'angry';
          p.lN = sw(ph, 0, 45, 100, 0); p.lF = sw(ph, 0, -8, -14, 0); p.body = sw(ph, 0, 8, 16, 0); p.bpy = -12;
          p.aN = sw(ph, 6, -20, -38, 6); p.aF = sw(ph, -4, 30, 48, -4);
          break;
        }
        case 'uppercut': {
          const ph = phase(t, m); p.face = 'angry';
          p.aN = sw(ph, 6, -45, 195, 20); p.grip = sw(ph, 32, 40, 0, 32); p.bob = ph < 1 ? 1 : 0;
          p.aF = sw(ph, -4, 25, -30, -4); p.lN = sw(ph, 0, 10, 0, 0);
          break;
        }
        case 'sweep': {                          // podkop ako sklz: zakloní sa a vystrčí nohu nízko pri zemi
          const ph = phase(t, m); p.face = 'angry';
          p.body = sw(ph, 0, 40, 50, 0); p.dy = sw(ph, 0, 4, 5, 0); p.lN = sw(ph, 0, 30, 38, 0); p.lF = sw(ph, 0, -5, -12, 0);
          p.aN = sw(ph, 6, -40, -50, 6); p.aF = sw(ph, -4, 50, 60, -4);
          break;
        }
        case 'kiai': {
          const k = MOVE.kiai ? t >= MOVE.kiai.startup - 4 : true; p.face = 'angry';
          p.aN = k ? 90 : -35; p.aF = k ? 90 : -35; p.grip = k ? 60 : 32; p.lN = 10; p.lF = -10;
          break;
        }
        case 'hit':
          p.body = 12; p.aN = -30; p.aF = 40; p.lN = -8; p.lF = 12; p.face = 'hit';
          break;
        case 'fall': case 'down': case 'getup': {
          const a = st === 'fall' ? Math.min(90, t * 7) : st === 'down' ? 90 : Math.max(0, 90 - t * 4.2);
          p.body = a; p.bpx = -5; p.face = st === 'down' ? 'dizzy' : 'hit';
          const k = a / 90; p.aN = lerp(6, 165, k); p.aF = lerp(-4, 145, k); p.lN = 10 * k; p.lF = -6 * k;
          break;
        }
        case 'dizzy': case 'deaf': {
          const k = Math.sin(t / 9);
          p.body = 5 * k; p.aN = 12 + 9 * Math.sin(t / 7); p.aF = -12 - 9 * Math.sin(t / 7); p.face = 'dizzy';
          break;
        }
        case 'dance': case 'kroj': {
          const k = Math.floor(t / 9) % 2;
          p.lN = k ? 58 : -6; p.lF = k ? -6 : 58; p.aN = k ? 168 : 132; p.aF = k ? 132 : 168; p.bob = k; p.face = 'happy'; p.grip = 0;
          if (st === 'kroj') { p.look = 'kroj'; p.item = null; }
          break;
        }
        case 'win': {
          const k = Math.floor(t / 14) % 2;
          p.aN = 172; p.grip = 0; p.aF = k ? 160 : 20; p.dy = k ? -2 : 0; p.face = 'happy';   // krompáč nad hlavou, poskakuje
          break;
        }
        case 'friendship':
          p.aN = 84; p.aF = 84; p.item = 'cake'; p.face = 'happy';
          break;
        case 'blk_tnt': {
          const mm = MOVE.blk_tnt, ph = phase(t, mm); p.face = 'angry';
          p.aN = sw(ph, 6, -70, 150, 6); p.aF = sw(ph, -4, 40, -30, -4); p.body = sw(ph, 0, 6, -8, 0); p.bpy = -12;
          p.item = t < mm.startup ? 'tnt' : (ph > 2.6 ? 'pick' : null);
          break;
        }
        case 'blk_bow': {                        // výpad s lukom: nízko, aby sa šíp dal preskočiť
          const mm = MOVE.blk_bow, ph = phase(t, mm), low = ph < 2 ? 1 : 1 - (ph - 2);
          p.face = 'angry'; p.item = ph > 2.7 ? 'pick' : 'bow';
          p.dy = Math.round(5 * ease(Math.min(1, low * 1.4))); p.lN = 60 * low; p.lF = -75 * low;
          p.aN = 6 + 82 * Math.min(1, ph * 1.6) * (ph < 2.4 ? 1 : low * 1.6); p.aF = 20;
          p.pull = ph < 1 ? 3 * ph : 0;
          break;
        }
        case 'blk_pick': {
          p.face = 'angry';
          p.aN = keys(t, [[0, 6], [4, 205], [8, 75], [12, 40], [15, 205], [19, 75], [25, 40], [29, 215], [33, 60], [40, 60], [52, 6]]);
          p.grip = keys(t, [[0, 32], [4, 10], [8, 18], [12, 10], [15, 10], [19, 18], [25, 10], [29, 5], [33, 20], [52, 32]]);
          p.body = keys(t, [[0, 0], [28, 4], [33, -8], [42, -8], [52, 0]]); p.bpy = -12;
          p.dy = (t >= 26 && t < 31) ? -2 : 0;
          p.aF = keys(t, [[0, -4], [8, 25], [19, 25], [33, -30], [52, -4]]);
          break;
        }
      }
      return p;
    }
    function renderTo(cv, f) {
      const X = cv.getContext('2d');
      X.clearRect(0, 0, cv.width, cv.height);
      paint(X, poseOf(f), TX, AXt, AYt, f.flash > 0 ? redTint : null);
    }
    const sidOf = f => (f.mimic && CANVAS[f.mimic]) ? f.mimic : (CANVAS[f.sid] ? f.sid : SIDS[0]);
    function renderFighter(f) { ensureSprites(); renderTo(CANVAS[sidOf(f)], f); }

    // aura Super Saiyan z aktuálnej siluety (game.js by použil siluetu z cache = stará póza)
    const AURA = {};
    function drawAura(f) {
      const cv = CANVAS[sidOf(f)]; if (!cv) return;
      const a = AURA[sidOf(f)] || (AURA[sidOf(f)] = document.createElement('canvas'));
      a.width = cv.width; a.height = cv.height;
      const x = a.getContext('2d'); x.drawImage(cv, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffd23a'; x.fillRect(0, 0, a.width, a.height);
      const F = api.fight;
      if (F && Math.random() < 0.5) F.fx.push({ kind: 'spark', x: f.x + rnd(-24, 24), y: f.y - rnd(10, 140), vx: 0, vy: -rnd(0.8, 1.8), c: chance(0.5) ? '#fff3a0' : '#ffc21a', t: 0, life: 18 });
      ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y)); if (f.facing < 0) ctx.scale(-1, 1);
      ctx.globalAlpha = 0.28 + 0.12 * Math.sin(performance.now() / 70);
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -4], [-2, -3], [2, -3], [0, 2]]) ctx.drawImage(a, -AXt * TX + dx, -AYt * TX + dy);
      ctx.restore();
    }

    // ================================================================ vstup (♪ vždy zachytí modul — game.js by spustil husle)
    const seq = (inp, s) => !!(inp && inp.history && api.matchSeq(inp, s, SEQ_GAP));
    const ST = F => F.blk || (F.blk = { proj: [], fx: [], used: [{}, {}], phase: null });
    function use(f, mv) { const F = api.fight; if (!F) return; const u = ST(F).used[f.side] || (ST(F).used[f.side] = {}); u[mv] = (u[mv] || 0) + 1; }
    function start(f, o, mv) {
      if (!f.onGround) return false;
      if (o) f.facing = o.x >= f.x ? 1 : -1;
      if (mv === 'tnt') {
        if (f.cd.special > 0) return false;
        f.set('blk_tnt', 'blk_tnt'); f.cd.special = TNT_CD; f.vx = 0; api.sfx('whoosh', 0.35);
      } else if (mv === 'arrow') {
        if (f.blkArrow > 0) return false;
        f.set('blk_bow', 'blk_bow'); f.blkArrow = ARROW_CD; f.vx = 0;
      } else if (mv === 'pickaxe') {
        if (f.blkPick > 0) return false;
        f.set('blk_pick', 'blk_pick1'); f.blkPick = PICK_CD; f.vx = f.facing * 1.4; api.sfx('whoosh', 0.5);
      } else return false;
      use(f, mv);
      return true;
    }
    hooks.input.push((f, o, inp) => {
      if (!mine(f) || !inp) return false;
      const F = api.fight; if (!F) return false;
      const p = inp.pressed || {};
      let mv = null;
      if (inp instanceof api.CPU) { const it = inp.blkIntent; inp.blkIntent = null; if (it && it.frame === api.frame) mv = it.move; }
      if (!mv && p.special) {
        if (F.phase !== 'fight') return true;                // FINISH HIM: ♪ nič nehádže (zakončenia rieši finishers.js)
        mv = seq(inp, ['B', 'F', 'special']) ? 'pickaxe' : seq(inp, ['down', 'F', 'special']) ? 'arrow' : 'tnt';
      }
      if (!mv) return false;
      return start(f, o, mv) || !!p.special;                 // nenabité: ♪ prehltne (inak by game.js spustil cudzí špeciál)
    });

    // ================================================================ stavy
    hooks.state.push((f, o) => {
      if (!mine(f)) return false;
      switch (f.state) {
        case 'blk_tnt': {
          const m = MOVE.blk_tnt; f.vx *= 0.7;
          if (f.t === m.startup) throwTnt(f, o);
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'blk_bow': {
          const m = MOVE.blk_bow; f.vx *= 0.7;
          if (f.t === m.startup) shootArrow(f);
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'blk_pick':
          if (f.t === PICK.at2) { f.move = 'blk_pick2'; f.hitDone = false; f.vx = f.facing * 1.6; api.sfx('whoosh', 0.45); }
          if (f.t === PICK.at3) { f.move = 'blk_pick3'; f.hitDone = false; f.vx = f.facing * 2.2; api.sfx('whoosh', 0.6); }
          f.vx *= 0.85;
          if (f.t >= PICK.end) f.set('idle');
          return true;
      }
      return false;
    });

    // ================================================================ strely: TNT a šíp (čisté dáta v F.blk, strelec = side)
    function throwTnt(f, o) {
      const F = api.fight; if (!F) return;
      const dir = f.facing, x0 = f.x + dir * 6, y0 = f.y - 126;
      let tx = o ? o.x - dir * TNT.front : f.x + dir * 120;
      if ((tx - f.x) * dir < TNT.min) tx = f.x + dir * TNT.min;
      tx = clamp(tx, 30, W - 30);
      const n = TNT.fly, y1 = GROUND - 13;
      ST(F).proj.push({ kind: 'tnt', side: f.side, x: x0, y: y0, vx: (tx - x0) / n, vy: (y1 - y0 - 0.5 * TNT.grav * n * n) / n, t: 0, st: 'fly', fuse: 0, bt: 0 });
      api.sfx('whoosh', 0.55);
    }
    function shootArrow(f) {
      const F = api.fight; if (!F) return;
      ST(F).proj.push({ kind: 'arrow', side: f.side, x: f.x + f.facing * 40, y: f.y - ARROW.y, vx: f.facing * ARROW.v, vy: 0, t: 0, st: 'fly', rot: 0 });
      api.sfx('whoosh', 0.7);
    }
    function hurtbox(o) { return { x0: o.x - 17, x1: o.x + 17, y0: o.y - (o.def.height || 138), y1: o.y }; }   // ako game.js
    const canHit = (F, o) => F.phase === 'fight' && o.vulnerable && o.state !== 'dizzy';
    function explode(F, p) {
      p.st = 'boom'; p.bt = 0;
      const f = F.fighters[p.side], o = F.fighters[1 - p.side], B = ST(F);
      api.sfx('boom', 0.9); api.sfx('crack', 0.45); api.shake(12); F.flash = Math.max(F.flash || 0, 5);
      B.fx.push({ k: 'ring', x: p.x, y: p.y, t: 0, life: 12 });
      for (let i = 0; i < 16; i++) {
        const a = rnd(0, Math.PI * 2), r = rnd(4, 46);
        B.fx.push({ k: 'puff', x: p.x + Math.cos(a) * r, y: p.y - 10 + Math.sin(a) * r * 0.7, vx: Math.cos(a) * 0.4, vy: -rnd(0.2, 0.9), s0: rnd(8, 14), s1: rnd(18, 30), c: Math.floor(rnd(0, 3)), t: 0, life: Math.round(rnd(24, 44)) });
      }
      const DEB = ['#d8312a', '#f1f1f1', '#8a8a8a', '#6b4a2b', '#3fae3f', '#a8221c'];
      for (let i = 0; i < 26; i++) F.fx.push({ kind: 'block', x: p.x + rnd(-10, 10), y: p.y - rnd(0, 16), vx: rnd(-4.2, 4.2), vy: rnd(-7, -1.5), c: DEB[i % DEB.length], t: 0, life: 70 });
      if (f && o && canHit(F, o) && Math.abs(o.x - p.x) < TNT.radius + 17 && o.y > GROUND - TNT.clear) {
        const s = Math.sign(o.x - p.x) || f.facing;
        api.applyHit(f, o, { name: 'tnt', dmg: TNT.dmg, knock: true, push: TNT.push, sound: 'kick', sx: o.x - s * 10, sy: o.y - 56 });
        p.hit = 1 - p.side;
      }
    }
    function updateProjectiles(F) {
      const B = ST(F);
      if ((F.phase === 'finish' || F.phase === 'finisher') && B.phase !== F.phase) B.proj.length = 0;   // FINISH HIM: strely zmiznú
      B.phase = F.phase;
      for (const p of B.proj) {
        p.t++;
        const f = F.fighters[p.side], o = F.fighters[1 - p.side];
        if (p.kind === 'tnt') {
          if (p.st === 'fly') {
            p.x += p.vx; p.vy += TNT.grav; p.y += p.vy;
            if (p.t >= TNT.fly || p.y >= GROUND - 13) {
              p.y = GROUND - 13; p.st = 'fuse'; p.fuse = 0; api.sfx('hiss', 0.7); api.shake(2);
              for (let i = 0; i < 6; i++) F.fx.push({ kind: 'spark', x: p.x + rnd(-14, 14), y: GROUND - rnd(0, 6), vx: rnd(-1.2, 1.2), vy: -rnd(0.4, 1.6), c: '#bfb4a2', t: 0, life: 18 });
            }
          } else if (p.st === 'fuse') {
            if (++p.fuse >= TNT.fuse) explode(F, p);
          } else if (++p.bt > 40) p.dead = true;
        } else if (p.st === 'fly') {
          const xa = Math.min(p.x, p.x + p.vx), xb = Math.max(p.x, p.x + p.vx);
          p.x += p.vx;
          const h = hurtbox(o);
          if (f && canHit(F, o) && xb + 10 > h.x0 && xa - 10 < h.x1 && o.y > GROUND - ARROW.clear) {
            const blocked = (o.state === 'block' || o.state === 'blockstun') && o.facing === -Math.sign(p.vx);
            api.applyHit(f, o, { name: 'arrow', dmg: ARROW.dmg, push: ARROW.push, hitstun: ARROW.hitstun, sound: 'punch', sx: o.x - Math.sign(p.vx) * 12, sy: p.y });
            if (blocked) { p.st = 'drop'; p.vx = -p.vx * 0.25; p.vy = -3; } else p.dead = true;   // zablokovaný šíp odpadne
          } else if (p.x < -30 || p.x > W + 30) p.dead = true;
        } else {
          p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.rot += 0.35;
          if (p.y >= GROUND - 2 || p.t > 90) p.dead = true;
        }
      }
      B.proj = B.proj.filter(p => !p.dead);
      for (const q of B.fx) { q.t++; if (q.vx) q.x += q.vx; if (q.vy) q.y += q.vy; }
      B.fx = B.fx.filter(q => q.t < q.life);
    }

    // ================================================================ každý snímok (len hostiteľ / hra na jednom zariadení)
    function restoreDraw(F) { for (const f of F.fighters) if (f.blkSsj) { f.ssj = true; f.blkSsj = false; } }
    let portraitDone = false;
    hooks.frame.push(() => {
      ensureSprites();
      if (!portraitDone && api.scene !== 'loading') { portraitDone = true; makeImages(); }
      if (NET && NET.role === 'guest') return;          // hosť v sieťovej hre nič nesimuluje, len kreslí stav od hostiteľa
      if (api.scene !== 'fight') return;
      const F = api.fight; if (!F) return;
      restoreDraw(F);
      if (F.paused) return;
      for (const f of F.fighters) {
        if (!mine(f)) continue;
        if (f.blkArrow > 0) f.blkArrow--;
        if (f.blkPick > 0) f.blkPick--;
        if (f.state === 'win' && f.t === 10) api.sfx('confirm', 0.5);
      }
      updateProjectiles(F);
    });
    function claim(F) {                                  // plátno pre stranu; GLITCH proti BLOCKYMU = Matúško (plátno sa mení každý snímok)
      for (const f of F.fighters) {
        if (mine(f)) f.mimic = SIDS[f.side];
        else if (f.mimic && CANVAS[f.mimic]) f.mimic = 'matusko';
      }
    }
    hooks.matchStart.push(F => { ensureSprites(); F.blk = { proj: [], fx: [], used: [{}, {}], phase: null }; claim(F); });
    hooks.roundStart.push(F => {
      const B = ST(F); B.proj.length = 0; B.fx.length = 0;
      for (const f of F.fighters) if (mine(f)) Object.assign(f, { blkArrow: 0, blkPick: 0, blkAi: null, blkSsj: false });
      claim(F);
    });

    // ================================================================ počítač: TNT a šíp zďaleka, krompáč zblízka, strieda ich
    hooks.cpu.unshift((c, f, o, phase) => {
      if (!mine(f) || phase !== 'fight' || !o) return null;
      const ai = f.blkAi || (f.blkAi = { next: 40, last: null });
      if (ai.next > 0) { ai.next--; return null; }
      const free = (f.state === 'idle' || f.state === 'walk' || f.state === 'block') && f.onGround;
      if (!free || !o.vulnerable || o.state === 'dizzy') return null;
      const lv = clamp(c.level || 0.6, 0.3, 1.3), d = Math.abs(o.x - f.x);
      ai.next = Math.round(rnd(24, 56) / lv);
      const opts = [];
      if (!(f.blkPick > 0) && d < 96 && o.onGround && !o.attacking) opts.push(['pickaxe', 0.6]);
      if (f.cd.special === 0 && d >= 110) opts.push(['tnt', 0.5]);
      if (!(f.blkArrow > 0) && d >= 120 && o.onGround) opts.push(['arrow', 0.5]);
      if (opts.length > 1 && chance(0.5)) opts.reverse();
      for (const [mv, pr] of opts) {
        if (chance(pr * lv * (mv === ai.last ? 0.35 : 1))) {
          ai.last = mv; c.blkIntent = { move: mv, frame: api.frame }; c.plan = null; c.planT = 0;
          return { held: {}, pressed: {} };
        }
      }
      return null;                                       // inak moves.js a základná logika game.js
    });

    // ================================================================ kreslenie: postava, strely, výbuch, GG!
    hooks.drawBack.push((stage, F) => {
      ensureSprites();
      for (const f of F.fighters) {
        if (!mine(f)) continue;
        f.mimic = SIDS[f.side];
        try { renderFighter(f); } catch (e) { console.warn('blocky kreslenie', e); }
        if (f.ssj && f.state !== 'baby') { drawAura(f); f.ssj = false; f.blkSsj = true; }
      }
      for (const p of (F.blk && F.blk.proj) || []) if (p.kind === 'tnt' && p.st === 'fuse') drawTnt(p);   // TNT leží na zemi za postavami
    });
    const TNT_ROWS = ['rrdrrdrrdrrd', 'rrdrrdrrdrrd', 'rrdrrdrrdrrd', 'wwwwwwwwwwww', 'kkkwkwkwkkkw', 'wkwwkkkwwkww', 'wkwwkkkwwkww',
                      'wkwwkwkwwkww', 'wkwwkwkwwkww', 'wwwwwwwwwwww', 'rrdrrdrrdrrd', 'rrdrrdrrdrrd', 'dddddddddddd'];
    const TNT_COL = { r: '#d8312a', d: '#a8221c', w: '#f1f1f1', k: '#1e1e1e' };
    function drawTnt(p) {
      const fl = p.st === 'fuse' ? p.fuse : 0, sc = p.st === 'fuse' && fl > TNT.fuse - 20 ? 1 + (fl - (TNT.fuse - 20)) / 100 : 1;
      const s = 2 * sc, x0 = Math.round(p.x - 6 * s), y0 = Math.round(p.y + 13 - 13 * s);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(Math.round(p.x - 13), GROUND - 1, 26, 3);
      for (let r = 0; r < 13; r++) for (let c = 0; c < 12; c++) { ctx.fillStyle = TNT_COL[TNT_ROWS[r][c]]; ctx.fillRect(x0 + Math.round(c * s), y0 + Math.round(r * s), Math.ceil(s), Math.ceil(s)); }
      ctx.fillStyle = '#4a4a4a'; ctx.fillRect(Math.round(p.x) - 1, y0 - 4, 2, 4);                           // knôt
      const fast = fl > TNT.fuse - 30, blink = p.st === 'fuse' && (fast ? fl % 6 < 3 : fl % 16 < 6);
      if (p.st === 'fuse') { ctx.fillStyle = fl % 4 < 2 ? '#ffd23a' : '#ff7a1a'; ctx.fillRect(Math.round(p.x) - 2 + (fl % 3) - 1, y0 - 7, 3, 3); }
      if (blink) { ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0, Math.round(12 * s), Math.round(13 * s)); ctx.restore(); }
    }
    function drawArrow(p) {
      const d = Math.sign(p.vx) || 1;
      ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); if (p.st === 'drop') ctx.rotate(p.rot * d); ctx.scale(d, 1);
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-18, -1, 16, 2);                                              // drevo
      ctx.fillStyle = '#c9cdd3'; ctx.fillRect(-2, -3, 2, 6); ctx.fillRect(0, -2, 2, 4); ctx.fillRect(2, -1, 2, 2);   // hrot
      ctx.fillStyle = '#6b717a'; ctx.fillRect(-2, 1, 2, 2);
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-22, -3, 6, 2); ctx.fillStyle = '#d8312a'; ctx.fillRect(-22, 1, 6, 2);   // pierka
      ctx.restore();
      if (p.st === 'fly') { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(Math.round(p.x - d * 40), Math.round(p.y), 14, 1); ctx.fillRect(Math.round(p.x - d * 34), Math.round(p.y) - 3, 8, 1); }
    }
    const PUFF = ['#ffffff', '#d9d9d9', '#a6a6a6'];
    function drawFx(B) {
      for (const q of B.fx) {
        const k = q.t / q.life;
        if (q.k === 'ring') {                  // tlaková vlna: rozširujúci sa štvorec po pixeloch
          const r = Math.round(10 + k * 70), y = Math.round(q.y - 8);
          ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = k < 0.4 ? '#fff3a0' : '#ff9a1a';
          ctx.fillRect(Math.round(q.x - r), y - r, r * 2, 4); ctx.fillRect(Math.round(q.x - r), y + r - 4, r * 2, 4);
          ctx.fillRect(Math.round(q.x - r), y - r, 4, r * 2); ctx.fillRect(Math.round(q.x + r - 4), y - r, 4, r * 2);
          ctx.restore();
        } else if (q.k === 'puff') {           // dym výbuchu: kocky, ktoré rastú a blednú
          const s = Math.round((q.s0 + (q.s1 - q.s0) * k) / 2) * 2;
          ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k * k);
          ctx.fillStyle = k < 0.15 ? '#fff3a0' : PUFF[Math.min(2, q.c + Math.floor(k * 2))];
          ctx.fillRect(Math.round(q.x - s / 2), Math.round(q.y - s / 2), s, s);
          ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(Math.round(q.x - s / 2), Math.round(q.y + s / 2) - 2, s, 2);
          ctx.restore();
        }
      }
    }
    const GLYPH = { G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'], '!': ['#', '#', '#', '#', '#', '.', '#'] };
    function drawGG(f) {
      const s = 3, word = 'GG!', ws = [...word].map(ch => GLYPH[ch][0].length);
      const tw = ws.reduce((a, b) => a + b, 0) * s + (word.length - 1) * s;
      // bublina pri tvári smerom dopredu: nad hlavou je krompáč a vyššie nápis WINS
      const bw = tw + 16, bh = 7 * s + 12, H0 = (f.def.height || 135) * ((f.def && f.def.scale) || 1);
      let d = f.facing || 1;
      const fits = k => { const c = f.x + k * (28 + bw / 2); return c >= bw / 2 + 4 && c <= W - bw / 2 - 4; };
      if (!fits(d) && fits(-d)) d = -d;                                           // pri okraji obrazovky na druhú stranu
      const cx = clamp(f.x + d * (28 + bw / 2), bw / 2 + 4, W - bw / 2 - 4);
      const bx = Math.round(cx - bw / 2), by = Math.round(f.y - H0 + 6);
      const tx = Math.round(d > 0 ? bx : bx + bw), ty = by + bh - 10;                 // chvostík k ústam
      ctx.fillStyle = '#111'; ctx.fillRect(bx - 2, by, bw + 4, bh); ctx.fillRect(bx, by - 2, bw, bh + 4);
      ctx.fillRect(tx - (d > 0 ? 8 : 0), ty, 8, 6); ctx.fillRect(tx - (d > 0 ? 12 : -8), ty + 4, 4, 4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, bw, bh); ctx.fillRect(tx - (d > 0 ? 6 : 0), ty + 1, 6, 4);
      let x = bx + 8;
      for (let i = 0; i < word.length; i++) {
        const g = GLYPH[word[i]];
        for (let r = 0; r < 7; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') {
          ctx.fillStyle = '#1d5e1d'; ctx.fillRect(x + c * s + 1, by + 6 + r * s + 1, s, s);
          ctx.fillStyle = '#3fbf3f'; ctx.fillRect(x + c * s, by + 6 + r * s, s, s);
        }
        x += ws[i] * s + s;
      }
    }
    hooks.drawFront.push((stage, F) => {
      restoreDraw(F);
      const B = F.blk;
      if (B) {
        for (const p of B.proj) { try { if (p.kind === 'tnt') { if (p.st === 'fly') drawTnt(p); } else drawArrow(p); } catch (e) { /* efekt nesmie zhodiť hru */ } }
        drawFx(B);
      }
      for (const f of F.fighters) if (mine(f) && f.state === 'win') drawGG(f);
    });
    hooks.drawHud.push(F => {
      if (F.paused) return;
      F.fighters.forEach((f, side) => {
        if (!mine(f)) return;
        const right = side === 1, x = right ? W - 12 - 190 : 12;
        const v = clamp(1 - (f.blkArrow || 0) / ARROW_CD, 0, 1), col = '#f2c230';
        const mx = right ? x + 190 - 60 - 132 : x + 132, my = 27;          // tretí ukazovateľ vedľa KIAI a TNT (ako OLIZ pri Rockym)
        ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
        ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * v), 4);
        api.text('ARROW', mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
        if (F.round === 1 && (F.phase === 'intro' || (F.phase === 'fight' && F.t < 240)) && !['cpu', 'remote'].includes(api.inputKind(side))) {
          const k = (b, word) => api.keyHint(side, b).trim() || word;
          api.text(`TNT = ${k('special', '♪')} · ARROW = ${k('down', '↓')} VPRED ${k('special', '♪')} · PICKAXE = VZAD VPRED ${k('special', '♪')}`,
            side === 0 ? 8 : W - 30, 254, 7, side === 0 ? 'left' : 'right', '#ffe08a');
        }
      });
    });

    // postavy mimo zápasu (rebrík: úvod tajného súboja, koncovka) kreslia moduly cez api.drawFighter → najprv prekresliť plátno
    const baseDrawFighter = api.drawFighter;
    api.drawFighter = function (f) {
      try { if (mine(f)) renderFighter(f); } catch (e) { console.warn('blocky kreslenie', e); }
      return baseDrawFighter.apply(this, arguments);
    };

    // ================================================================ portrét a bábätko (kreslené, kým Master nedodá obrázky)
    function makeImages() {
      if (!IMG['img/portrait_' + ID]) {
        const c = document.createElement('canvas'); c.width = 96; c.height = 120;
        const x = c.getContext('2d');
        const S = ['#7d7d7d', '#8f8f8f', '#6e6e6e', '#868686'];                // kamenná stena bane s rudou
        for (let gy = 0; gy < 20; gy++) for (let gx = 0; gx < 16; gx++) { x.fillStyle = S[(gx * 7 + gy * 13 + gx * gy) % 4]; x.fillRect(gx * 6, gy * 6, 6, 6); }
        for (const [gx, gy, col] of [[1, 2, '#4ee6e0'], [2, 2, '#2fb7c4'], [13, 4, '#f2c94c'], [14, 5, '#d9a22c'], [2, 15, '#2a2a2a'], [3, 16, '#3a3a3a'], [13, 17, '#4ee6e0'], [14, 13, '#2a2a2a']]) {
          x.fillStyle = col; x.fillRect(gx * 6, gy * 6, 6, 6);
        }
        const g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
        x.fillStyle = g; x.fillRect(0, 0, 96, 120);
        const pose = { body: 0, bpx: 0, bpy: 0, dx: 0, dy: 0, bob: 0, aN: 0, aF: 0, lN: 0, lF: 0, item: null, grip: 0, pull: 0, face: 'normal', look: 'normal', t: 1 };
        x.save(); x.translate(3, 0); paint(x, pose, 6, 8, 36, null); x.restore();
        IMG['img/portrait_' + ID] = c;
      }
      if (!IMG['img/baby_' + ID]) IMG['img/baby_' + ID] = baby();
    }
    function baby() {                                    // BABALITY: malý BLOCKY s veľkou hlavou a cumlíkom (drawBaby ho hojdá)
      const c = document.createElement('canvas'); c.width = 48; c.height = 66;
      const x = c.getContext('2d'), L = LOOK.normal;
      Object.assign(R, { X: x, s: 3, ox: 8, oy: 22, tint: null });
      const I = [1, 0, 0, 1, 0, 0];
      box(I, -3, -2, 0, 0, (u, v) => legTex(L, u, v + 9, false, false)); box(I, 1, -2, 4, 0, (u, v) => legTex(L, u, v + 9, true, false));
      box(I, -2, -9, 3, -2, (u, v) => v === 6 ? L.buckle : sh(L.shirt, u, v, 2));
      box(I, -4, -9, -2, -4, (u, v) => v >= 3 ? L.skin[0] : L.shirt[0]); box(I, 3, -9, 5, -4, (u, v) => v >= 3 ? L.skin[1] : L.shirt[1]);
      box(I, -6, -19, -3, -9, (u, v) => headSide(L, u, Math.min(7, Math.floor(v * 0.8))));
      box(I, -3, -19, 6, -9, (u, v) => {
        const uu = Math.min(7, Math.floor(u * 8 / 9)), vv = Math.min(7, Math.floor(v * 0.8));
        if ((v === 8 || v === 9) && (u === 4 || u === 5)) return v === 8 ? '#5fb4ff' : '#d8f0ff';     // cumlík
        if (v === 4 && (u === 2 || u === 6)) return '#ffffff';
        return headFront(L, uu, vv, 'normal', 1);
      });
      box(I, -6, -21, 6, -19, (u, v) => v === 0 && (u === 0 || u === 11) ? null : (u === 7 || u === 8) ? (v ? '#fff6b8' : '#5f636b') : (v ? '#f2c230' : '#ffd75a'));
      return c;
    }

    // pre testy a ostatné moduly
    api.blocky = {
      def: DEF, start: (f, mv) => { const F = api.fight; return !!F && start(f, F.fighters[1 - f.side], mv); },
      pose: f => poseOf(f), sprites: SIDS, render: (f) => renderFighter(f),
      cfg: { TNT_CD, ARROW_CD, PICK_CD, SEQ_GAP, TNT, ARROW, PICK },
      help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — ako api.moves.help (OVLÁDANIE)
        ['TNT (BLOCKY)', 'T', 'O', '△', '♪'],
        ['ARROW (BLOCKY)', 'S VPRED T', '↓ VPRED O', '↓ ▶ △', 'dole, vpred + ♪'],
        ['PICKAXE (BLOCKY)', 'VZAD VPRED T', 'VZAD VPRED O', '◀ ▶ △', 'vzad, vpred + ♪'],
      ],
    };
  },
});
