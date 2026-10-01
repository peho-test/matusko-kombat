// MATÚŠKO KOMBAT XII — modul ladder: rebrík HORA, tajomstvá, odomykanie, Toasty (P4)
// - HORA (1 hráč): veža súperov ako v MK2, CONTINUE?, koncovka s blahoželaním a titulkami SLÁVNA TROJKA.
// - Prefarbené postavy: TIEŇ, ČERVENÝ ŠIMON, ZLATÝ MATÚŠKO (+ ORANŽOVÝ MATÚŠKO, TIEŇ XXL, KAI len ako súperi).
// - Odomykanie v localStorage 'mk12_unlocks', kódy tlačidlami na výbere postavy, Toasty po uppercute a tajný súboj.
// Vstup číta len cez api.ctls (held / pressed / history) a api.matchSeq, nikdy nie klávesnicu priamo.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'ladder',
  init(api) {
    'use strict';
    const { W, H, ROSTER, ORDER, STAGES, IMG, FA, game, hooks } = api;
    const ctx = api.ctx, text = api.text, bigText = api.bigText;

    // ================================================================= nastavenia rebríka (Master môže upraviť)
    // Poradie súperov zdola nahor. pick(hráč) vráti id súpera; čo nie je v ROSTER (alebo je to sám hráč), sa preskočí.
    // Súper môže mať v ROSTER vlastné ladderStage / ladderLevel (napr. z enemies.js), tie majú prednosť.
    const LADDER = [
      { key: 'brat',         stage: 'potok',   level: 0.55, pick: p => brother(p) },
      { key: 'farba',        stage: 'dojo',    level: 0.62, pick: p => recolorOf(brother(p)) },
      { key: 'rocky',        stage: 'zahrada', level: 0.68, pick: () => (rockyReady() ? 'rocky' : null) },
      { key: 'ninja_fire',   stage: 'tabor',   level: 0.72, pick: () => 'ninja_fire' },
      { key: 'ninja_ice',    stage: 'more',    level: 0.76, pick: () => 'ninja_ice' },
      { key: 'vodnik',       stage: 'potok',   level: 0.78, pick: () => (ROSTER.vodnik ? 'vodnik' : null) },    // doma pri potoku je silnejší
      { key: 'ninja_shadow', stage: 'dojo',    level: 0.80, pick: () => 'ninja_shadow' },
      { key: 'kai',          stage: 'most',    level: 0.85, pick: () => (ensureKai() ? 'kai' : null) },
      { key: 'glitch',       stage: 'zahrada', level: 0.90, pick: () => (ROSTER.glitch ? 'glitch' : null) },
      { key: 'tien',         stage: 'tabor',   level: 0.95, pick: () => 'tien' },
      { key: 'boss',         stage: 'hora',    level: 1.10, boss: true, pick: p => (ROSTER.boss && p !== 'boss' ? 'boss' : 'tien_xxl') },
    ];
    const BOSS_HP = 130, XXL_HP = 150, BOSS_DMG = 1.2;
    const TOASTY_CHANCE = 0.25, TOASTY_LIFE = 66, SECRET_GRACE = 30;
    const CODE_GAP = 45;                       // max. snímok medzi stlačeniami kódu na výbere postavy
    const WALK_F = 1.7, WALK_B = 1.3;          // rovnaké ako v game.js (rýchlejší TIEŇ ich násobí def.speed)

    // ================================================================= farby: prefarbenie spritov a portrétov
    function rgb2hsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      if (mx === mn) return [0, 0, l];
      const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [h * 60, s, l];
    }
    function hsl2rgb(h, s, l) {
      h = (((h % 360) + 360) % 360) / 360; s = api.clamp(s, 0, 1); l = api.clamp(l, 0, 1);
      if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
    }
    function copyCanvas(src, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0); return c; }
    function solid(src, w, h, color) {
      const c = copyCanvas(src, w, h), x = c.getContext('2d');
      x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, w, h);
      return c;
    }
    // náhrada bez čítania pixelov: zmes farby cez celý sprite, priehľadnosť ostane pôvodná
    function blendTint(x, w, h, mode, color) {
      const keep = copyCanvas(x.canvas, w, h);
      x.save(); x.globalCompositeOperation = mode; x.fillStyle = color; x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(keep, 0, 0); x.restore();
    }
    function filterTint(x, w, h, filter, fbMode, fbColor) {
      if (!('filter' in x)) return blendTint(x, w, h, fbMode, fbColor);    // Safari bez ctx.filter
      const keep = copyCanvas(x.canvas, w, h);
      x.save(); x.clearRect(0, 0, w, h); x.filter = filter; x.drawImage(keep, 0, 0); x.restore();
    }
    // čítanie pixelov: na file:// s obrázkami zo súborov hodí getImageData SecurityError → false a použije sa náhrada
    function pixels(x, w, h, fn) {
      let img;
      try { img = x.getImageData(0, 0, w, h); } catch (e) { return false; }
      fn(img.data, w, h);
      x.putImageData(img, 0, 0);
      return true;
    }
    const chroma = (s, l) => s * (1 - Math.abs(2 * l - 1));    // pri svetlosti blízko 1 je HSL sýtosť nestabilná (254,255,255 → s = 1)
    function recolor(map) {                    // map(h, s, l) → [h, s, l] alebo null; sprity majú málo farieb → cache
      return d => {
        const memo = new Map();
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 10) continue;
          const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
          let o = memo.get(k);
          if (o === undefined) { const hsl = rgb2hsl(d[i], d[i + 1], d[i + 2]), m = map(hsl[0], hsl[1], hsl[2]); o = m ? hsl2rgb(m[0], m[1], m[2]) : null; memo.set(k, o); }
          if (o) { d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; }
        }
      };
    }
    // TIEŇ: čierna silueta s fialovým okrajom (čistá 'shadow' by v TÁBORE V NOCI a na tmavom výbere zanikla)
    api.registerPalette('tien', (x, w, h) => {
      const src = copyCanvas(x.canvas, w, h), rim = solid(src, w, h, '#8a72ec'), body = solid(src, w, h, '#0d0b14');
      x.save(); x.clearRect(0, 0, w, h); x.globalAlpha = 0.9;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.drawImage(rim, dx, dy);
      x.globalAlpha = 1; x.drawImage(body, 0, 0); x.restore();
    });
    // ČERVENÝ ŠIMON: modré kimono → červené, pleť ostáva; náhrada = odtieň celej postavy do červena
    api.registerPalette('cerveny', (x, w, h) => {
      const ok = pixels(x, w, h, recolor((hh, s, l) => (hh >= 188 && hh <= 262 && s >= 0.3 && chroma(s, l) >= 0.08 && l >= 0.06 && l <= 0.9
        ? [358 + (hh - 222) * 0.25, Math.min(1, s * 1.05), Math.min(0.62, l * 1.1)] : null)));
      if (!ok) blendTint(x, w, h, 'hue', '#d42020');
    });
    // ORANŽOVÝ MATÚŠKO: biele kimono → oranžové, oranžový pás → čierny
    api.registerPalette('oranzovy', (x, w, h) => {
      const ok = pixels(x, w, h, recolor((hh, s, l) => {
        if (l > 0.6 && (s < 0.22 || chroma(s, l) < 0.12 || (hh > 70 && hh < 300 && s < 0.6))) return [27, 0.92, 0.3 + l * 0.38];   // biele kimono aj okraje po kľúčovaní
        if (hh >= 8 && hh <= 36 && s >= 0.75 && l >= 0.28 && l <= 0.64) return [0, 0, 0.08 + (l - 0.28) * 0.3];
        return null;
      }));
      if (!ok) blendTint(x, w, h, 'multiply', '#ffad5c');
    });
    // ZLATÝ MATÚŠKO: hnedé vlasy → zlaté (hustota 5×5 odfiltruje tmavé tiene na chodidlách), vrch vlasov pre kreslené špice
    function goldHair(d, w, h, canvas) {
      const n = w * h, m = new Uint8Array(n);
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        if (d[i + 3] < 100) continue;
        const [hh, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
        if (hh >= 8 && hh <= 46 && l < 0.4 && s > 0.12 && s < 0.78) m[p] = 1;
      }
      const sw = w + 1, S = new Uint32Array(sw * (h + 1));
      for (let y = 0; y < h; y++) { let acc = 0; for (let xx = 0; xx < w; xx++) { acc += m[y * w + xx]; S[(y + 1) * sw + xx + 1] = S[y * sw + xx + 1] + acc; } }
      const hair = new Uint8Array(n);
      for (let p = 0; p < n; p++) {
        if (!m[p]) continue;
        const cx = p % w, cy = (p - cx) / w;
        const x0 = Math.max(0, cx - 2), y0 = Math.max(0, cy - 2), x1 = Math.min(w, cx + 3), y1 = Math.min(h, cy + 3);
        if (S[y1 * sw + x1] - S[y0 * sw + x1] - S[y1 * sw + x0] + S[y0 * sw + x0] >= 12) hair[p] = 1;
      }
      for (let p = 0; p < n; p++) {
        if (!hair[p]) continue;
        const i = p * 4, l = rgb2hsl(d[i], d[i + 1], d[i + 2])[2], o = hsl2rgb(47, 0.95, Math.min(0.86, 0.47 + l * 0.75));
        d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
      }
      const top = new Int16Array(w).fill(-1);
      for (let xx = 0; xx < w; xx++) for (let y = 0; y < h; y++) { const p = y * w + xx; if (d[p * 4 + 3] >= 100) { if (hair[p]) top[xx] = y; break; } }
      canvas.__hairTop = top;
    }
    api.registerPalette('zlaty', (x, w, h) => {
      const ok = pixels(x, w, h, (d, ww, hh) => goldHair(d, ww, hh, x.canvas));
      if (!ok) filterTint(x, w, h, 'sepia(1) saturate(3.2) hue-rotate(-10deg) brightness(1.12)', 'color', '#ffc21a');   // celý zlatý
    });
    // KAI (anime súper z bossa): biele vlasy → modré, farby oblečenia otočené, pleť ostáva
    api.registerPalette('kai', (x, w, h) => {
      const ok = pixels(x, w, h, recolor((hh, s, l) => {
        if (l > 0.72 && (s < 0.3 || chroma(s, l) < 0.12)) return [204, 0.85, 0.42 + (l - 0.72) * 1.1];
        if (s > 0.3 && chroma(s, l) >= 0.12 && !(hh >= 5 && hh <= 50 && l > 0.3)) return [hh + 180, s, l];
        return null;
      }));
      if (!ok) filterTint(x, w, h, 'hue-rotate(180deg)', 'hue', '#3a7bff');
    });

    // ================================================================= prefarbené postavy
    const S0 = ROSTER.simon || {}, M0 = ROSTER.matusko || {};
    function reg(id, def) { if (!ROSTER[id]) api.registerFighter(id, def, false); }
    reg('tien', { name: 'TIEŇ', short: 'TIEŇ', sprites: 'simon', palette: 'tien', speed: 1.2,
      gi: '#1a1626', giDark: '#0c0a12', belt: '#3a2f5a', hair: '#050407', special: 'husle', specialName: 'HUSLE', finisher: 'babality',
      blurb: ['Tichý ako noc', 'a o kúsok rýchlejší.', 'Kto sa skrýva v tieni?'] });
    reg('tien_xxl', { name: 'TIEŇ XXL', short: 'XXL', sprites: 'simon', palette: 'tien', scale: 1.25, hp: XXL_HP, height: 172, ladderDmg: BOSS_DMG,
      gi: '#1a1626', giDark: '#0c0a12', belt: '#3a2f5a', hair: '#050407', special: 'husle', specialName: 'HUSLE', finisher: 'babality',
      blurb: ['Obrovský tieň', 'stráži vrchol hory.', 'Má viac života.'] });
    reg('cerveny', { name: 'ČERVENÝ ŠIMON', short: 'ČERVENÝ', sprites: 'simon', palette: 'cerveny',
      gi: '#c62828', giDark: '#8e1c1c', belt: S0.belt || '#27ae60', hair: S0.hair || '#4a2f17', special: 'husle', specialName: 'HUSLE', finisher: 'babality',
      blurb: ['Šimon v červenom kimone.', 'Husle má rovnaké,', 'sólo ešte horúcejšie.'] });
    reg('oranzovy', { name: 'ORANŽOVÝ MATÚŠKO', short: 'ORANŽOVÝ', sprites: 'matusko', palette: 'oranzovy',
      gi: '#f39a3c', giDark: '#c8741f', belt: '#1b1b1b', hair: M0.hair || '#5b3a1e', special: 'heligonka', specialName: 'HELIGÓNKA', finisher: 'folklority',
      blurb: ['Matúško v oranžovom', 'kimone s čiernym pásom.', 'Heligónka hrá rovnako.'] });
    reg('zlaty', { name: 'ZLATÝ MATÚŠKO', short: 'ZLATÝ', sprites: 'matusko', palette: 'zlaty', alwaysSsj: true, spikes: true,
      gi: M0.gi || '#f2f2f2', giDark: M0.giDark || '#c9c9c9', belt: M0.belt || '#e67e22', hair: '#ffd23a', special: 'heligonka', specialName: 'HELIGÓNKA', finisher: 'folklority',
      blurb: ['Super Saiyan navždy:', 'zlaté vlasy, zlatá aura', 'a silnejšie údery.'] });
    // KAI vznikne z bossa (enemies.js), až keď boss existuje
    function ensureKai() {
      if (ROSTER.kai) return true;
      const b = ROSTER.boss; if (!b) return false;
      const def = Object.assign({}, b, { name: 'KAI', short: 'KAI', palette: 'kai', gi: '#1f3f8f', giDark: '#152c66', belt: '#e8e8e8', hair: '#4fc3ff',
        specialName: b.specialName || 'BLESK', blurb: ['Anime bojovník', 'z Dračieho mosta.', 'Modré vlasy, rýchle päste.'] });
      for (const k of ['hp', 'scale', 'height', 'dmgMul', 'ladderDmg', 'ladderStage', 'ladderLevel']) delete def[k];
      api.registerFighter('kai', def, false);
      return true;
    }
    function rockyReady() {
      const d = ROSTER.rocky; if (!d) return false;
      const sid = d.sprites || 'rocky';
      return !!(FA[sid] && FA[sid].anims && FA[sid].anims.idle && IMG[sid + '/idle']);
    }
    const baseOf = id => (ROSTER[id] && ROSTER[id].sprites) || id;
    function brother(p) { const b = baseOf(p); return b === 'simon' ? 'matusko' : 'simon'; }
    function recolorOf(id) { return id === 'simon' ? 'cerveny' : id === 'matusko' ? 'oranzovy' : null; }
    const nameOf = id => (ROSTER[id] ? ROSTER[id].name : id);
    const pretty = str => String(str).split(' ').map(w => (/^X+L?$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');   // MAJSTER MRAK → Majster Mrak
    const isHuman = f => !(f.ctl instanceof api.CPU);
    const touchUI = () => api.inputKind(0) === 'touch';          // mobil bez klávesnice: nápovedy „ťukni“
    const isKick = n => /kick|kop|sweep|tornado|roundhouse/i.test(String(n || ''));

    // ================================================================= odomykanie (localStorage 'mk12_unlocks')
    const UKEY = 'mk12_unlocks';
    const unlocked = new Set();
    try { const raw = localStorage.getItem(UKEY); if (raw) for (const k of JSON.parse(raw)) unlocked.add(String(k)); } catch (e) { /* bez úložiska len v pamäti */ }
    const UNLOCKS = {
      TIEN: { id: () => 'tien', label: () => 'TIEŇ' },
      CERVENY: { id: () => 'cerveny', label: () => 'ČERVENÝ ŠIMON' },
      ZLATY: { id: () => 'zlaty', label: () => 'ZLATÝ MATÚŠKO' },
      BOSS: { id: () => (ROSTER.boss ? 'boss' : 'tien_xxl'), label: () => nameOf(ROSTER.boss ? 'boss' : 'tien_xxl') },
      ROCKY: { id: () => (ROSTER.rocky ? 'rocky' : null), label: () => 'ROCKY' },
    };
    // porazený súper z HORY sa stane hrateľným (boss ostáva odmena za horu bez prehratého kola)
    const BEAT_UNLOCK = { ninja_fire: 'OHNIVÝ NINJA', ninja_ice: 'ĽADOVÝ NINJA', ninja_shadow: 'TIEŇOVÝ NINJA', kai: 'KAI', vodnik: 'VODNÍK', glitch: 'GLITCH', rocky: 'ROCKY' };
    for (const [id, label] of Object.entries(BEAT_UNLOCK)) if (id !== 'rocky') UNLOCKS['BEAT_' + id.toUpperCase()] = { id: () => (ROSTER[id] ? id : null), label: () => label };
    function unlockBeaten(id) {
      if (!BEAT_UNLOCK[id] || !ROSTER[id]) return;
      if (id === 'rocky') unlock('ROCKY'); else unlock('BEAT_' + id.toUpperCase());
    }
    function saveUnlocks() { try { localStorage.setItem(UKEY, JSON.stringify([...unlocked])); } catch (e) { /* nevadí */ } }
    function applyUnlocks() {
      for (const k of unlocked) { const u = UNLOCKS[k], id = u && u.id(); if (id && ROSTER[id] && !ORDER.includes(id)) ORDER.push(id); }
    }
    function unlock(k, quiet) {
      if (!UNLOCKS[k] || unlocked.has(k)) return false;
      unlocked.add(k); saveUnlocks(); applyUnlocks();
      if (!quiet) queueToast('NOVÁ POSTAVA: ' + UNLOCKS[k].label() + '!');
      return true;
    }
    const toastQ = []; let toastWait = 0;
    function queueToast(t) { toastQ.push(t); }

    // ================================================================= portréty (aj pre výber postavy a VS v game.js)
    function fake(id, state = 'idle') {
      return { id, def: ROSTER[id], state, t: 0, x: 0, y: 0, vx: 0, vy: 0, facing: 1, flip: 0, flash: 0, ssj: false, move: null,
               cd: { kiai: 0, special: 0 }, get sid() { return this.def.sprites || this.id; } };
    }
    function spritePortrait(id) {                // výrez hlavy a pliec z prvej snímky postoja
      const def = ROSTER[id]; if (!def) return null;
      const sid = def.sprites || id;
      if (!(FA[sid] && FA[sid].anims && FA[sid].anims.idle && IMG[sid + '/idle'])) return null;
      const an = api.animFor(fake(id)); if (!an || !an.img) return null;
      const a = an.a, ch = a.h * 0.56, cw = ch * 0.8, sx = a.ax - cw / 2;
      const c = document.createElement('canvas'); c.width = 96; c.height = 120;
      const x = c.getContext('2d'), k = 96 / cw, x0 = Math.max(0, sx), x1 = Math.min(a.w, sx + cw);
      if (x1 <= x0) return null;
      x.imageSmoothingEnabled = false;
      x.drawImage(an.img, x0, 0, x1 - x0, ch, (x0 - sx) * k, 0, (x1 - x0) * k, 120);
      return c;
    }
    function shadowPortrait(bim) {            // TIEŇ: čierna silueta na fialovej žiare (na tmavom výbere by inak zanikla)
      const w = bim.width, h = bim.height, c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'), g = x.createRadialGradient(w / 2, h * 0.42, 4, w / 2, h * 0.42, h * 0.75);
      g.addColorStop(0, '#6b4fc0'); g.addColorStop(0.55, '#2a1c4f'); g.addColorStop(1, '#0d0918');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      const rim = solid(bim, w, h, '#b9a6ff'), body = solid(bim, w, h, '#0d0b14');
      x.globalAlpha = 0.85;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) x.drawImage(rim, dx, dy);
      x.globalAlpha = 1; x.drawImage(body, 0, 0);
      return c;
    }
    function portraitOf(id) {
      const key = 'img/portrait_' + id;
      if (IMG[key]) return IMG[key];
      const def = ROSTER[id]; if (!def) return null;
      let out = null;
      try {
        if (id === 'zlaty' && IMG['img/portrait_ssj_matusko']) out = IMG['img/portrait_ssj_matusko'];
        const b = def.sprites, bim = b && IMG['img/portrait_' + b];
        if (!out && bim) out = def.palette === 'tien' ? shadowPortrait(bim) : def.palette ? api.paletteStrip(fake(id), 'portrait', bim) : bim;
        if (!out) out = spritePortrait(id);
      } catch (e) { console.warn('portrét', id, e); out = null; }
      if (out) IMG[key] = out;               // game.js ho potom použije na výbere aj vo VS
      return out;
    }
    function face(id, x, y, w, h, border, dim) {
      ctx.save();
      ctx.fillStyle = '#120f1c'; ctx.fillRect(x, y, w, h);
      const im = portraitOf(id);
      if (im) {
        if (im.width > w * 1.4) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }   // malé ikonky bez „bodkovania“
        ctx.drawImage(im, x, y, w, h);
      }
      else if (ROSTER[id]) {
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        api.drawFigure(x + w / 2, y + h + 46 * h / 120, 1, api.POSES.stand, ROSTER[id], { scale: 1.25 * h / 120 });
      }
      ctx.restore();
      if (dim) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, w, h); }
      if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); }
    }
    // prefarbenie všetkých animácií vopred, po kúskoch mimo boja (aby sa prvý kop v zápase nezasekol)
    const warmQ = [];
    function prewarm(ids) {
      for (const id of ids) {
        const def = ROSTER[id]; if (!def || !def.palette) continue;
        const sid = def.sprites || id, anims = FA[sid] && FA[sid].anims; if (!anims) continue;
        for (const name of Object.keys(anims)) if (IMG[sid + '/' + name]) warmQ.push([id, sid, name]);
      }
    }

    // ================================================================= stav
    const L = { pending: false, active: false, player: null, steps: [], idx: 0, lostRounds: 0, continues: 0, climbFrom: -1, newUnlocks: [], done: false };
    const S = { armed: false, codeTien: false, ssj: [false, false], opp: 'tien', player: null };   // tajomstvá
    const T = { on: false, t: 0, life: TOASTY_LIFE, count: 0, wink: 0 };                         // Toasty
    let M = null;               // aktuálny zápas: druh, kolá, flawless, kopy
    let pendingKind = null;     // 'ladder' | 'secret' pre najbližší startMatch
    let savedLevel = null;      // obťažnosť CPU pred rebríkom / tajným súbojom
    function setLevel(v) { if (savedLevel === null) savedLevel = api.cpu.level; api.cpu.level = v; }
    function restoreLevel() { if (savedLevel !== null) { api.cpu.level = savedLevel; savedLevel = null; } }
    function resolveStage(id) {
      if (id && STAGES.some(s => s.id === id)) return id;
      return STAGES.length ? STAGES[Math.floor(Math.random() * STAGES.length)].id : id;
    }
    const stageName = id => { const s = STAGES.find(x => x.id === id); return s ? s.name : String(id || '').toUpperCase(); };

    function buildLadder(player) {
      const used = new Set([player]), steps = [];
      for (const s of LADDER) {
        let id = null;
        try { id = s.pick(player); } catch (e) { id = null; }
        if (!id || !ROSTER[id] || used.has(id)) {
          if (!s.boss) continue;
          id = ['boss', 'tien_xxl', 'tien'].find(x => ROSTER[x] && x !== player) || 'tien_xxl';   // vrchol musí mať strážcu
        }
        used.add(id);
        const def = ROSTER[id];
        const prefer = typeof def.ladderStage === 'string' ? def.ladderStage : typeof def.stage === 'string' ? def.stage : s.stage;
        const st = { key: s.key, id, stage: resolveStage(prefer), level: typeof def.ladderLevel === 'number' ? def.ladderLevel : s.level, boss: !!s.boss };
        if (s.boss) {
          st.hp = def.hp || (id === 'tien_xxl' ? XXL_HP : BOSS_HP);
          if (id === 'boss' && !def.dmgMul) st.dmgMul = BOSS_DMG;      // ak boss nemá vlastné dmgMul (enemies.js), pridá ho rebrík
        }
        steps.push(st);
      }
      return steps;
    }
    function startHoraSelect() { L.pending = true; L.active = false; S.codeTien = false; game.mode = 1; api.setScene('select'); }
    function beginLadder(player) {
      Object.assign(L, { pending: false, active: true, player, steps: buildLadder(player), idx: 0, lostRounds: 0, continues: 0, climbFrom: -1, newUnlocks: [], done: false });
      prewarm([player, ...L.steps.map(s => s.id)]);
      api.setScene('hora');
    }
    function goLadderFight() {                // nastaví zápas a pustí VS z game.js (portréty, aréna); zápas spustí VS
      const st = L.steps[L.idx];
      game.mode = 1; game.picks = [L.player, st.id]; game.locked = [true, true];
      game.forceStage = st.stage; setLevel(st.level);
      pendingKind = 'ladder';
      api.setScene('vs');
    }
    function continueLadder() {
      if (L.idx >= L.steps.length) { finishLadder(); api.setScene('hora_koniec'); }
      else api.setScene('hora');
    }
    function finishLadder() {
      L.newUnlocks = []; L.done = true;
      if (unlock('TIEN', true)) L.newUnlocks.push(UNLOCKS.TIEN.label());
      if (L.lostRounds === 0 && L.continues === 0 && unlock('BOSS', true)) L.newUnlocks.push(UNLOCKS.BOSS.label());
      restoreLevel();
    }
    function endLadder() {
      L.active = false; L.pending = false; L.done = false; pendingKind = null; S.armed = false;
      restoreLevel();
    }
    function goSecret(lastOpp) {
      const player = L.active ? L.player : game.picks[0];
      S.player = player;
      S.opp = (player === 'tien' || lastOpp === 'tien') ? 'tien_xxl' : 'tien';
      prewarm([player, S.opp]);
      api.setScene('tajny');
    }
    function startSecretMatch() {
      game.mode = 1; game.picks = [S.player, S.opp]; game.locked = [true, true];
      game.forceStage = resolveStage('hora'); setLevel(1.0);
      pendingKind = 'secret';
      api.startMatch();
    }

    // ================================================================= Toasty
    function showToasty(force) {
      if (T.on) return false;
      if (!force && T.count > 0 && !api.chance(TOASTY_CHANCE)) return false;   // prvýkrát vždy, potom 25 %
      T.on = true; T.t = 0; T.count++; T.wink = 0;
      api.say('toasty');
      return true;
    }
    function drawDogHead(s, wink) {           // Rockyho hlava (kreslená náhrada za img/toasty), stred (0, 0)
      ctx.save(); ctx.scale(s, s);
      ctx.fillStyle = '#a86f24';
      ctx.beginPath(); ctx.ellipse(-21, 2, 9, 19, 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(21, 2, 9, 19, -0.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9a441'; ctx.beginPath(); ctx.ellipse(0, -4, 22, 21, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8bd62'; ctx.beginPath(); ctx.ellipse(0, -15, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f1d189'; ctx.beginPath(); ctx.ellipse(0, 9, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6f9c'; ctx.beginPath(); ctx.ellipse(1, 21, 5.5, 8, 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d94a7a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 15); ctx.lineTo(1.5, 26); ctx.stroke();
      ctx.strokeStyle = '#5a3a14'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-8, 12); ctx.quadraticCurveTo(0, 17, 8, 12); ctx.stroke();
      ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(0, 3, 5.5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, 1, 2, 1.5);
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath(); ctx.arc(-9, -7, 3.2, 0, Math.PI * 2); ctx.fill();
      if (wink) { ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(5, -7); ctx.lineTo(13, -6); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(9, -7, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(8, -9, 1.5, 1.5); }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-10, -9, 1.5, 1.5);
      ctx.restore();
    }
    function drawToasty() {
      const t = T.t, life = T.life;
      const k = t < 9 ? t / 9 : t > life - 9 ? Math.max(0, (life - t) / 9) : 1, e = 1 - (1 - k) * (1 - k);
      const im = IMG['img/toasty'];
      ctx.save();
      if (im) {
        const h = 86, w = im.width * h / im.height;
        ctx.drawImage(im, W - w + (1 - e) * (w + 10), H - h + (1 - e) * (h + 10), w, h);
      } else {
        ctx.translate(W - 44 + (1 - e) * 72, H - 40 + (1 - e) * 72); ctx.rotate(-0.28);
        drawDogHead(1.25, T.wink > 0);
      }
      ctx.restore();
      if (e > 0.6) { ctx.save(); ctx.globalAlpha = Math.min(1, (e - 0.6) / 0.3); bigText('ROCKY!', W - 116, H - 72, 18); ctx.restore(); }
      if (T.wink > 0) text('!!!', W - 36, H - 96, 14, 'center', '#ffe23a');
    }

    // ZLATÝ MATÚŠKO: kreslené špice nad vrchom vlasov (len keď sa dali prečítať pixely)
    function drawSpikes(f) {
      const anim = api.animFor(f);
      if (!anim || !anim.img || !anim.img.__hairTop) return;
      if (f.state === 'jump' && f.flip && anim.name !== 'flip') return;      // točiaca sa snímka salta
      const a = anim.a, fr = api.frameOf(f, anim), sc = (a.scale || 1) * (f.def.scale || 1), top = anim.img.__hairTop, x0 = fr * a.w;
      const P = (cx, cy) => [f.x + f.facing * (cx - a.ax) * sc, f.y + (cy - a.ay) * sc];
      ctx.save(); ctx.fillStyle = '#ffd83a'; ctx.strokeStyle = '#b07c00'; ctx.lineWidth = 1; ctx.lineJoin = 'miter';
      let run = [];
      const flush = () => {
        if (run.length >= 4) {
          const n = Math.max(2, Math.round(run.length / 6));
          for (let k = 0; k < n; k++) {
            const i0 = Math.floor(k * run.length / n), i1 = Math.max(i0, Math.floor((k + 1) * run.length / n) - 1), im = (i0 + i1) >> 1;
            const yTop = Math.min(run[i0][1], run[i1][1], run[im][1]), hgt = 6 + ((k * 3 + fr) % 4);
            const p0 = P(run[i0][0], run[i0][1] + 2), p1 = P(run[i1][0] + 1, run[i1][1] + 2), pt = P(run[im][0] - 3, yTop - hgt);
            ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(pt[0], pt[1]); ctx.lineTo(p1[0], p1[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
          }
        }
        run = [];
      };
      for (let c = 0; c < a.w; c++) { const y = top[x0 + c]; if (y >= 0) run.push([c, y]); else flush(); }
      flush();
      ctx.restore();
    }

    // ================================================================= sledovanie zápasu (kolá, flawless, kolo len kopmi)
    function roundDecided(F, w) {
      if (w < 0) return;
      M.roundsWon[w]++;
      const f = F.fighters[w];
      if (!isHuman(f)) return;
      if (f.damageTaken === 0 && ++M.flawless[w] >= 2) unlock('ZLATY');
      if (M.hits[w] > 0 && !M.nonKick[w]) unlock('CERVENY');
    }
    function trackFight(F) {
      if (F.phase === 'fight') F.fighters.forEach((f, i) => {           // aj netrafený úder sa počíta (nie len zásahy)
        if (isHuman(f) && api.ATTACK_STATES.has(f.state) && !isKick(f.move || f.state)) M.nonKick[i] = true;
      });
      if (F.phase !== M.lastPhase) {
        const prev = M.lastPhase; M.lastPhase = F.phase;
        // posledné kolo ide cez FINISH HIM (bez roundEnd), preto sa kolo vyhodnocuje pri odchode z fázy boja
        if (prev === 'fight' && (F.phase === 'roundEnd' || F.phase === 'finish') && M.evaluated < F.round) {
          M.evaluated = F.round;
          roundDecided(F, F.phase === 'finish' ? F.winner : F.roundWinner);
        }
      }
      if (T.on) {
        T.t++; if (T.wink > 0) T.wink--;
        if (T.t >= T.life + SECRET_GRACE) T.on = false;
        // tajomstvo: Toasty v TÁBORE V NOCI + ↓ a START naraz (len 1 hráč)
        if (T.on && game.mode === 1 && F.stage && F.stage.id === 'tabor' && M.kind !== 'secret' && !S.armed) {
          const c = api.ctls[0];
          if ((c.held.down && c.pressed.start) || (c.pressed.down && c.held.start)) {
            S.armed = true; T.wink = 50; api.sfx('bark');
            c.pressed.start = false;            // START z ovládača/dotyku by inak zapol pauzu
          }
        }
      }
    }

    // ================================================================= kódy na výbere postavy (tlačidlami, nie písmenami)
    const CODES = [
      { name: 'TIEN', seq: ['up', 'up', 'down', 'down'], run: codeTien },            // tajný súboj s TIEŇOM
      { name: 'SSJ', seq: ['up', 'up', 'up', 'kiai'], run: codeSsj },                // začať zápas premenený
      { name: 'ROCKY', seq: ['down', 'down', 'down', 'special'], run: codeRocky },   // odomkne Rockyho (ak je), inak „trénuje“
    ];
    const codeLog = [];
    function codeTien() {
      if (game.mode !== 1) { queueToast('TAJNÝ SÚBOJ JE LEN PRE 1 HRÁČA'); return; }
      if (L.pending) { queueToast('TIEŇ ŤA ČAKÁ HORE NA HORE…'); return; }
      S.codeTien = true; api.sfx('crack', 0.6); queueToast('TAJNÝ SÚBOJ: TIEŇ!');
    }
    function codeSsj(p) { S.ssj[p] = true; api.sfx('kiai'); queueToast('SUPER SAIYAN' + (game.mode === 2 ? ' (HRÁČ ' + (p + 1) + ')' : '') + '!'); }
    function codeRocky() {
      if (ROSTER.rocky) { if (!unlock('ROCKY')) queueToast('ROCKY UŽ ČAKÁ NA VÝBERE!'); api.sfx('bark'); }
      else { game.rockyMsg = 120; api.sfx('bark'); }
    }
    let lockAt = -1;
    const codeDone = [null, null];             // matchSeq platí aj snímku po stlačení → ten istý kód len raz
    function onSelect() {
      for (let p = 0; p < 2; p++) {
        if ((p === 1 && game.mode === 1) || game.locked[p]) continue;   // v 1P má ovládač 1 obe sady kláves
        const c = api.ctls[p], last = c.history[c.history.length - 1];
        if (!last || last === codeDone[p]) continue;
        for (const code of CODES) if (api.matchSeq(c, code.seq, CODE_GAP)) { codeDone[p] = last; codeLog.push(code.name); code.run(p); break; }
      }
      if (!game.locked[0]) { lockAt = -1; return; }
      if (lockAt < 0) lockAt = api.sceneT;
      if (api.sceneT - lockAt < 18) return;                          // game.js prepne na VS až po 30 snímkach
      if (L.pending && game.mode === 1) { lockAt = -1; beginLadder(game.picks[0]); }
      else if (S.codeTien && game.mode === 1) { lockAt = -1; S.codeTien = false; goSecret(null); }
    }

    // výber postavy kreslí game.js; pri 6+ bojovníkoch sa dlhé mená prekrývajú → kým je výber na obrazovke, krátke meno (def.short)
    const FULL = {};
    function fitSelectNames(on) {
      const n = ORDER.length + 1, gap = n > 3 ? 10 : 24, pw = Math.min(96, Math.floor((W - 24 - (n - 1) * gap) / n));
      ctx.save(); ctx.font = `bold ${pw < 80 ? 9 : 12}px "Trebuchet MS", "Arial Black", Arial, sans-serif`;
      for (const id of Object.keys(ROSTER)) {
        const d = ROSTER[id]; if (!d || !d.short) continue;
        if (!(id in FULL)) FULL[id] = d.name;
        d.name = on && ctx.measureText(FULL[id]).width > pw + gap - 6 ? d.short : FULL[id];
      }
      ctx.restore();
    }

    // ================================================================= háčiky
    let prevScene = null, portraitsDone = false;
    hooks.frame.push(() => {
      const sc = api.scene, entered = sc !== prevScene;
      prevScene = sc;
      if (sc === 'select' || entered) fitSelectNames(sc === 'select');
      if (toastWait > 0) toastWait--;
      else if (toastQ.length) { api.showToast(toastQ.shift()); api.sfx('confirm'); toastWait = 115; }
      if (sc === 'title' && entered) {
        if (L.active || L.pending) endLadder();
        restoreLevel();
        S.codeTien = false; S.ssj = [false, false]; S.armed = false;
        if (!portraitsDone) {
          portraitsDone = true;
          for (const id of Object.keys(ROSTER)) portraitOf(id);
          const one = api.MENU.findIndex(it => it.label === '1 HRÁČ'); if (one >= 0) game.menuIdx = one;
        }
        applyUnlocks();
      }
      if (sc === 'select' && !(api.NET && api.NET.role)) onSelect();          // kódy a HORA len pre hru na jednom zariadení
      if (sc === 'vs' && pendingKind && game.forceStage) {            // VS ukazuje arénu súpera, nie náhodnú
        const i = STAGES.findIndex(s => s.id === game.forceStage); if (i >= 0) game.stageSel = i;
      }
      if (sc !== 'fight' && warmQ.length) {
        const [id, sid, name] = warmQ.shift();            // jedna animácia na snímku (zlaté vlasy ~20 ms)
        try { api.paletteStrip(fake(id), name, IMG[sid + '/' + name]); } catch (e) { /* nevadí, prefarbí sa pri kreslení */ }
      }
      const F = api.fight;
      if (sc === 'fight' && F && M && M.F === F && !F.paused) trackFight(F);
    });
    // rýchlejšia chôdza (TIEŇ): len čistý pohyb, útoky a blok rieši game.js / moves.js
    hooks.input.push((f, o, inp) => {
      const sp = f.def && f.def.speed; if (!sp || sp === 1) return false;
      const h = inp.held || {}, p = inp.pressed || {};
      if (h.down || p.punch || p.kick || p.kiai || p.special || p.up) return false;
      const dir = (h.right ? 1 : 0) - (h.left ? 1 : 0); if (!dir) return false;
      f.vx = dir * (dir === f.facing ? WALK_F : WALK_B) * sp;
      if (f.state !== 'walk') f.set('walk');
      return true;
    });
    hooks.afterHit.push((a, d, m, blocked) => {
      const F = api.fight;
      if (M && F && M.F === F) {
        if (F.phase === 'fight') { M.hits[a.side]++; if (!isKick(m && m.name)) M.nonKick[a.side] = true; }
        // silnejší boss / TIEŇ XXL: dorovnanie zranenia po zásahu (nikdy nezabije, K.O. rieši game.js)
        const mul = (a.side === 1 && M.dmgMul) || (a.def && a.def.ladderDmg) || 1;
        if (mul > 1 && !blocked && m && m.dmg > 0 && d.hp > 0 && F.phase === 'fight') {
          const extra = Math.round(m.dmg * (a.ssj ? 1.3 : 1) * (mul - 1));
          if (extra > 0) { d.hp = Math.max(1, d.hp - extra); d.damageTaken += extra; }
        }
      }
      if (m && m.name === 'uppercut' && !blocked) showToasty(false);
    });
    hooks.matchStart.push(F => {
      const kind = pendingKind; pendingKind = null;
      M = { F, kind: kind || 'normal', step: kind === 'ladder' ? L.steps[L.idx] : null, lastPhase: F.phase, evaluated: 0,
            roundsWon: [0, 0], flawless: [0, 0], hits: [0, 0], nonKick: [false, false], ssj: S.ssj.slice(), dmgMul: 0 };
      if (M.step) M.dmgMul = M.step.dmgMul || 0;
      S.ssj = [false, false];
      T.on = false;
    });
    hooks.roundStart.push(F => {
      if (!M || M.F !== F) return;
      M.hits = [0, 0]; M.nonKick = [false, false];
      F.fighters.forEach((f, i) => { if (M.ssj[i] || (f.def && f.def.alwaysSsj)) f.ssj = true; });
      if (M.step && M.step.hp) { const o = F.fighters[1]; o.maxHp = o.hp = o.shownHp = M.step.hp; }
    });
    hooks.matchEnd.push(F => {
      if (!M || M.F !== F) return false;
      const won = F.winner === 0;
      if (M.kind === 'secret') {
        S.armed = false;
        if (won) unlock('TIEN');
        if (L.active) { continueLadder(); return true; }
        restoreLevel(); return false;                                   // mimo rebríka bežný koniec (vyhodenie, výsledok)
      }
      if (M.kind === 'ladder' && L.active) {
        L.lostRounds += Math.max(M.roundsWon[1], won ? 0 : 1);
        if (!won) { S.armed = false; api.setScene('hora_cont'); return true; }
        unlockBeaten(L.steps[L.idx].id);
        L.idx++; L.climbFrom = L.idx - 1;
        if (S.armed) { S.armed = false; goSecret(F.fighters[1].id); return true; }
        continueLadder(); return true;
      }
      if (S.armed && game.mode === 1 && won) { S.armed = false; goSecret(F.fighters[1].id); return true; }
      S.armed = false;
      return false;
    });
    hooks.drawFront.push((stage, F) => { for (const f of F.fighters) if (f.def && f.def.spikes) drawSpikes(f); });
    hooks.drawHud.push(F => {
      if (M && M.F === F && M.kind === 'ladder' && L.active) text('HORA ' + Math.min(L.idx + 1, L.steps.length) + '/' + L.steps.length, W / 2, 38, 7, 'center', '#ffd28a');
      if (M && M.F === F && M.kind === 'secret') text('TAJNÝ SÚBOJ', W / 2, 38, 7, 'center', '#c9b8ff');
      if (T.on && T.t < T.life) drawToasty();
    });

    // ================================================================= scéna HORA (veža súperov)
    function nodePos(i, n) {
      if (i === n - 1) return { x: 240, y: 38, w: 38, h: 46 };
      const t = n > 1 ? i / (n - 1) : 0, side = i % 2 ? 1 : -1;
      return { x: Math.round(240 + side * (46 - t * 20)), y: Math.round(222 - t * 152), w: 28, h: 34 };
    }
    function poly(pts, color) { ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
    function drawMountain(t, sky) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (sky === 'dawn') { g.addColorStop(0, '#2b3a78'); g.addColorStop(0.5, '#c86b6b'); g.addColorStop(1, '#ffc26a'); }
      else { g.addColorStop(0, '#0a0f2c'); g.addColorStop(0.55, '#3a2650'); g.addColorStop(1, '#a8536a'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 46; i++) if ((i + Math.floor(t / 25)) % 9) ctx.fillRect((i * 97 + 13) % W, (i * 37) % 120, 1, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (let i = 0; i < 4; i++) { const cx = ((i * 140 + t * (0.15 + i * 0.05)) % (W + 160)) - 80; ctx.beginPath(); ctx.ellipse(cx, 60 + i * 34, 60, 9, 0, 0, Math.PI * 2); ctx.fill(); }
      poly([[0, 270], [0, 196], [44, 168], [96, 204], [150, 160], [196, 200], [284, 196], [330, 158], [384, 202], [430, 166], [480, 190], [480, 270]], '#2a1f3d');
      poly([[56, 270], [240, 16], [424, 270]], '#4b3d63');
      poly([[56, 270], [240, 16], [252, 270]], '#5c4d78');
      poly([[240, 16], [212, 56], [224, 50], [234, 62], [246, 52], [256, 60], [268, 56]], '#e9eef8');
      if (sky !== 'dawn' && t % 200 < 7) {                               // blesk nad vrcholom (MAJSTER MRAK)
        ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(262, 0); ctx.lineTo(254, 8); ctx.lineTo(262, 12); ctx.lineTo(250, 22); ctx.stroke();
      }
    }
    function stars(level) { const k = api.clamp(Math.round(level * 4.5), 1, 5); return '★'.repeat(k) + '☆'.repeat(5 - k); }
    function drawHora() {
      const t = api.sceneT, n = L.steps.length;
      drawMountain(t);
      if (!n) return;
      // chodník
      ctx.save(); ctx.strokeStyle = 'rgba(255,230,170,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); for (let i = 0; i < n; i++) { const p = nodePos(i, n); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); ctx.restore();
      // súperi zdola nahor
      for (let i = 0; i < n; i++) {
        const p = nodePos(i, n), cur = i === L.idx, done = i < L.idx;
        const hl = cur ? (Math.floor(t / 8) % 2 ? '#ffd200' : '#ff8a00') : done ? '#4a8a3a' : '#2b2440';
        face(L.steps[i].id, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, hl, done);
        if (done) text('✔', p.x, p.y + 6, 14, 'center', '#7dff6a');
      }
      // hráč: pri príchode po výhre vyšplhá z predošlého súpera
      const climbK = L.climbFrom >= 0 ? Math.min(1, t / 50) : 1;
      const a = nodePos(Math.max(0, L.climbFrom >= 0 ? L.climbFrom : L.idx), n), b = nodePos(Math.min(L.idx, n - 1), n);
      const side = q => (q.x < 240 ? -1 : q.x > 240 ? 1 : -1);
      const ax = a.x + side(a) * (a.w / 2 + 15), bx = b.x + side(b) * (b.w / 2 + 15);
      const mx = ax + (bx - ax) * climbK, my = a.y + (b.y - a.y) * climbK - Math.sin(Math.PI * climbK) * 10;
      face(L.player, Math.round(mx - 10), Math.round(my - 12), 20, 24, '#3fa9ff');
      // ľavý panel: hráč
      const st = L.steps[Math.min(L.idx, n - 1)];
      ctx.fillStyle = 'rgba(8,6,16,0.72)'; ctx.fillRect(6, 10, 132, 190); ctx.fillRect(W - 146, 10, 140, 190);
      bigText('HORA', 72, 42, 30);
      text('výstup na vrchol', 72, 56, 8, 'center', '#ffd28a');
      face(L.player, 42, 66, 60, 75, '#3fa9ff');
      text(nameOf(L.player), 72, 156, nameOf(L.player).length > 12 ? 8 : 10, 'center', '#3fa9ff');
      text('Pokračovania: ' + L.continues, 72, 172, 8, 'center', '#ccc');
      text(L.lostRounds ? 'Prehraté kolá: ' + L.lostRounds : 'Zatiaľ bez prehratého kola', 72, 186, 7, 'center', L.lostRounds ? '#ccc' : '#7dff6a');
      // pravý panel: súper
      const rx = W - 76;
      text('SÚPER ' + (Math.min(L.idx, n - 1) + 1) + ' / ' + n, rx, 28, 9, 'center', '#ffd28a');
      face(st.id, rx - 30, 36, 60, 75, '#ffd200');
      text(nameOf(st.id), rx, 128, nameOf(st.id).length > 12 ? 8 : 11, 'center', '#ffd200');
      text(st.boss ? 'STRÁŽCA VRCHOLU' : 'ARÉNA', rx, 146, 7, 'center', '#aaa');
      text(stageName(st.stage), rx, 158, 9, 'center', '#fff');
      text(stars(st.level), rx, 176, 10, 'center', '#ffb300');
      if (st.hp && st.hp !== 100) text('ŽIVOT ' + st.hp, rx, 190, 7, 'center', '#ff9f9f');
      if (t % 60 < 42) text(touchUI() ? 'ťukni = do boja' : 'ÚDER / ENTER = do boja      ESC = menu', W / 2, 262, 9, 'center', '#fff');
    }
    api.registerScene('hora', {
      update() {
        const t = api.sceneT, menu = api.menu;
        if (t === 1) api.music('title');
        if (menu.back) { endLadder(); api.setScene('title'); api.music('title'); return; }
        if (L.climbFrom >= 0 && t === 50) { api.sfx('confirm'); }
        if ((menu.ok && t > 25) || t > 230) { L.climbFrom = -1; goLadderFight(); }
      },
      draw: drawHora,
    });

    // ================================================================= CONTINUE?
    const C = { sel: 0 };
    api.registerScene('hora_cont', {
      update() {
        const t = api.sceneT, menu = api.menu;
        if (t === 1) { C.sel = 0; api.music(null); }
        if (t % 60 === 1) api.sfx('select', 0.5);
        if (menu.left || menu.right || menu.up || menu.down) { C.sel = 1 - C.sel; api.sfx('select'); }
        if (menu.tapPos) C.sel = menu.tapPos.x < W / 2 ? 0 : 1;
        const yes = () => { L.continues++; api.sfx('confirm'); goLadderFight(); };
        const no = () => { endLadder(); api.setScene('title'); api.music('title'); };
        if (menu.back || t >= 600) return no();
        if (menu.ok && t > 20) { if (C.sel === 0) yes(); else no(); }
      },
      draw() {
        const t = api.sceneT, st = L.steps[Math.min(L.idx, L.steps.length - 1)];
        const g = ctx.createRadialGradient(W / 2, 120, 10, W / 2, 120, 300); g.addColorStop(0, '#4a0b0b'); g.addColorStop(1, '#070000');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        bigText('CONTINUE?', W / 2, 54, 40);
        bigText(String(Math.max(0, 9 - Math.floor(t / 60))), W / 2, 150, 64, true);
        face(L.player, 56, 70, 72, 90, '#3fa9ff', true);
        text(nameOf(L.player), 92, 176, 10, 'center', '#3fa9ff');
        if (st) { face(st.id, W - 128, 70, 72, 90, '#ffd200'); text(nameOf(st.id) + ' VYHRAL', W - 92, 176, 9, 'center', '#ffd200'); }
        text((C.sel === 0 ? '▶ ' : '   ') + 'ÁNO, ZNOVA!', W / 2 - 60, 212, 14, 'center', C.sel === 0 ? '#ffd200' : '#999');
        text((C.sel === 1 ? '▶ ' : '   ') + 'NIE', W / 2 + 80, 212, 14, 'center', C.sel === 1 ? '#ffd200' : '#999');
        text('Pokračovať môžeš koľkokrát chceš. Súper ostáva ten istý.', W / 2, 238, 8, 'center', '#ccc');
        if (t % 60 < 42) text(touchUI() ? 'ťukni na ÁNO alebo NIE' : 'ÚDER / ENTER = potvrdiť     ← → = výber', W / 2, 260, 8, 'center', '#888');
      },
    });

    // ================================================================= TAJNÝ SÚBOJ (úvod)
    api.registerScene('tajny', {
      update() {
        const t = api.sceneT, menu = api.menu;
        if (t === 1) { api.music(null); api.sfx('crack', 0.8); }
        if (t % 90 === 45) api.sfx('crack', 0.4);
        if ((menu.ok && t > 40) || t > 170) startSecretMatch();
      },
      draw() {
        const t = api.sceneT;
        const g = ctx.createRadialGradient(W / 2, 150, 10, W / 2, 150, 280); g.addColorStop(0, '#2a1a4a'); g.addColorStop(1, '#000000');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        if (t % 90 < 5) { ctx.fillStyle = 'rgba(200,190,255,0.35)'; ctx.fillRect(0, 0, W, H); }
        const f = fake(S.opp, 'idle'); f.x = W / 2; f.y = 238; f.t = t;
        if (ROSTER[S.opp]) api.drawFighter(f);
        bigText('TAJNÝ SÚBOJ', W / 2, 46, 34);
        text(nameOf(S.opp) + ' ŤA VYZÝVA…', W / 2, 70, 12, 'center', '#c9b8ff');
        text(unlocked.has('TIEN') ? 'Ukáž mu, kto je tu majster!' : 'Ak vyhráš, TIEŇ bude tvoj.', W / 2, 262, 9, 'center', '#aaa');
      },
    });

    // ================================================================= KONCOVKA (príbeh, blahoželanie, titulky)
    const STORY = {
      matusko: b => ['Matúško vyšiel až na vrchol hory.', b + ' sa uklonil a povedal:', '„Tvoje KIAI je silnejšie ako hrom.“', 'A Šimon uznal, že mladší brat je majster.', 'Aspoň do večera.'],
      zlaty: b => ['Zlatý Matúško svietil na vrchole', 'hory ako slnko.', b + ' si musel zakryť oči', 'a uznal: „Toto je skutočný', 'Super Saiyan.“'],
      simon: b => ['Šimon vyšiel až na vrchol hory', 'a zahral také husľové sólo,', 'že sa rozostúpili aj mraky.', b + ' tlieskal. Matúško tiež…', '…a hneď chcel odvetu.'],
      tien: b => ['Tieň vystúpil z tmy', 'a zdolal celú horu.', 'Nikto nevie, kto sa pod ním skrýva…', '…ale Rocky ho podľa čuchu', 'spoznal hneď.'],
      boss: (b, me) => [me + ' porazil všetkých,', 'aj sám seba.', 'Na vrchole pochopil, že najsilnejší', 'je ten, kto má brata,', 's ktorým sa dá pobiť aj zasmiať.'],
      other: (b, me) => [me + ' zdolal horu!', 'Všetci súperi sa uklonili', 'a ' + b + ' odovzdal vrchol.', 'Rocky dostal najväčšiu kosť', 'na svete.'],
    };
    function storyLines() {
      const me = L.player, last = L.steps[L.steps.length - 1], nice = last ? pretty(nameOf(last.id)) : 'Strážca vrcholu';
      const key = me === 'zlaty' ? 'zlaty' : me === 'tien' || me === 'tien_xxl' ? 'tien' : me === 'boss' ? 'boss' : baseOf(me) === 'matusko' ? 'matusko' : baseOf(me) === 'simon' ? 'simon' : 'other';
      return STORY[key](nice, pretty(nameOf(me)));
    }
    function creditLines() {
      const out = [];
      const add = (s, size, color) => out.push({ s, size, color });
      const chunk = (arr, k) => { for (let i = 0; i < arr.length; i += k) add(arr.slice(i, i + k).join(' · '), 9, '#ddd'); };
      add('SLÁVNA TROJKA', 26, 'big'); add('', 10);
      add('MATÚŠKO', 15, '#ffd200'); add('karate · heligónka · KIAI', 9, '#ddd'); add('', 8);
      add('ŠIMON', 15, '#ffd200'); add('karate · husle · KIAI', 9, '#ddd'); add('', 8);
      add('ROCKY', 15, '#ffd200'); add('zlatý retríver · majster olizovania', 9, '#ddd'); add('', 18);
      const guests = [...new Set(L.steps.map(s => s.id).filter(id => !['matusko', 'simon'].includes(id)))].map(nameOf);
      if (guests.length) { add('V ÚLOHE SÚPEROV', 11, '#9fd8ff'); chunk(guests, 3); add('', 18); }
      add('ARÉNY', 11, '#9fd8ff'); chunk(STAGES.map(s => s.name), 3); add('', 18);
      add('HUDBA', 11, '#9fd8ff'); add('13Up · Okinawa song', 9, '#ddd'); add('', 18);
      for (const [head, line] of CREDITS_EXTRA) { add(head, 11, '#9fd8ff'); add(line, 9, '#ddd'); add('', 18); }
      add('MATÚŠKO KOMBAT XII', 22, 'big'); add('k 12. narodeninám · 3. 10. 2026', 9, '#ffb3b3'); add('', 26);
      add('ĎAKUJEME ZA HRU!', 18, 'big');
      return out;
    }
    const CREDITS_EXTRA = [];   // Master môže doplniť napr. ['NÁPAD A RÉŽIA', '…'] — nič nevymýšľame
    const E = { stage: 0, t: 0, lines: null, credits: null, confetti: [] };
    const E_DUR = [480, 380, 0, 360];      // príbeh, blahoželanie, titulky (podľa dĺžky), záver
    function endingDone() { endLadder(); api.setScene('title'); api.music('title'); }
    api.registerScene('hora_koniec', {
      update() {
        const menu = api.menu;
        if (api.sceneT === 1) { Object.assign(E, { stage: 0, t: 0, lines: storyLines(), credits: creditLines(), confetti: [] }); api.music('result'); api.sfx('confirm'); }
        E.t++;
        if (E.stage === 1 && E.t === 20) api.say('birthday');
        if (E.stage >= 1 && E.t % 4 === 0) E.confetti.push({ x: api.rnd(0, W), y: -5, vy: api.rnd(0.8, 2), vx: api.rnd(-0.5, 0.5), c: ['#ff4d4d', '#ffd200', '#4dd2ff', '#7dff6a', '#ff7ae0'][Math.floor(api.rnd(0, 5))] });
        for (const c of E.confetti) { c.x += c.vx; c.y += c.vy; }
        while (E.confetti.length && E.confetti[0].y > H + 10) E.confetti.shift();
        if (menu.back) return endingDone();
        const creditsH = E.credits.reduce((s, l) => s + l.size + 6, 0);
        const dur = E.stage === 2 ? Math.ceil((creditsH + H + 20) / 0.6) : E_DUR[E.stage];
        if (E.t >= dur || (menu.ok && E.t > 40)) {
          E.stage++; E.t = 0;
          if (E.stage > 3) endingDone();
        }
      },
      draw() {
        const t = E.t;
        if (E.stage === 0) {
          drawMountain(api.sceneT, 'dawn');
          ctx.fillStyle = '#3d3050'; ctx.beginPath(); ctx.ellipse(110, 246, 70, 12, 0, 0, Math.PI * 2); ctx.fill();
          if (ROSTER[L.player]) {
            const f = fake(L.player, 'win'); f.x = 110; f.y = 246; f.t = t; f.ssj = !!f.def.alwaysSsj;
            api.drawFighter(f); if (f.def.spikes) drawSpikes(f);
          }
          ctx.fillStyle = 'rgba(8,6,16,0.7)'; ctx.fillRect(200, 62, 270, 150);
          bigText('VÍŤAZ HORY', 335, 44, 28);
          (E.lines || []).forEach((l, i) => { if (t > 20 + i * 45) text(l, 335, 86 + i * 20, 10, 'center', '#ffffff'); });
          if (L.newUnlocks.length && t > 260) {
            text('NOVÉ POSTAVY NA VÝBERE:', 335, 232, 9, 'center', '#7dff6a');
            text(L.newUnlocks.join(' · '), 335, 248, 11, 'center', '#ffd200');
          }
        } else if (E.stage === 1) {
          const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b0b2e'); g.addColorStop(1, '#3b0d0d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          // Šimon nesie Matúškovi tortu „12“ (img/cake_simon; nezrkadliť, číslo by bolo naopak), Matúško sa teší
          const im = IMG['img/cake_simon'];
          if (im) ctx.drawImage(im, Math.round(84 - im.width / 2), 262 - im.height);
          else if (ROSTER.simon) { const f = fake('simon', 'idle'); f.x = 84; f.y = 262; f.t = t; api.drawFighter(f); }
          if (ROSTER.matusko) { const f = fake('matusko', 'win'); f.x = 396; f.y = 262; f.t = t; f.facing = -1; api.drawFighter(f); }
          for (const c of E.confetti) { ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x), Math.round(c.y), 3, 4); }
          bigText('VŠETKO NAJLEPŠIE', W / 2, 58, 34);
          bigText('K 12. NARODENINÁM, MATÚŠKO!', W / 2, 94, 24);
          if (t > 60) text('Nech ti KIAI vydrží celý rok!', W / 2, 122, 12, 'center', '#ffd28a');
        } else if (E.stage === 2) {
          ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
          for (const c of E.confetti) { ctx.fillStyle = c.c; ctx.globalAlpha = 0.5; ctx.fillRect(Math.round(c.x), Math.round(c.y), 3, 4); ctx.globalAlpha = 1; }
          let y = H + 20 - t * 0.6;
          for (const l of E.credits) {
            y += l.size + 6;
            if (y < -30 || y > H + 30 || !l.s) continue;
            if (l.color === 'big') bigText(l.s, W / 2, y, l.size); else text(l.s, W / 2, y, l.size, 'center', l.color);
          }
        } else {
          ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
          for (const c of E.confetti) { ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x), Math.round(c.y), 3, 4); }
          bigText('SLÁVNA TROJKA', W / 2, 54, 30);
          text('MATÚŠKO · ŠIMON · ROCKY', W / 2, 78, 14, 'center', '#ffd28a');
          ctx.fillStyle = '#1a1626'; ctx.beginPath(); ctx.ellipse(W / 2, 250, 190, 10, 0, 0, Math.PI * 2); ctx.fill();
          for (const [id, x, dir] of [['matusko', 140, 1], ['simon', 340, -1]]) if (ROSTER[id]) {
            const f = fake(id, 'win'); f.x = x; f.y = 248; f.t = t; f.facing = dir; api.drawFighter(f);
          }
          api.drawRocky({ x: W / 2, y: 250, dir: 1, state: IMG['rocky/lick'] ? 'lick' : 'run', t });
          if (t % 60 < 42) text(touchUI() ? 'ťukni = menu' : 'ÚDER / ENTER = menu', W / 2, 266, 9, 'center', '#ccc');
        }
      },
    });

    // ================================================================= menu a export pre testy / ostatné moduly
    api.addMenuItem({ label: 'HORA (1 HRÁČ)', act() { startHoraSelect(); } }, 0);
    // predvolený kurzor ostáva na „1 HRÁČ“: zvyk z v6 (↓ + ENTER = 2 hráči) a testy shot.js / test_mobile.js
    const one = api.MENU.findIndex(it => it.label === '1 HRÁČ');
    if (one >= 0) game.menuIdx = one;
    applyUnlocks();

    api.toasty = () => showToasty(true);
    api.ladder = {
      LADDER, CODES, codeLog, state: L, secret: S, toastyState: T, ending: E, get match() { return M; },
      unlocked: () => [...unlocked], unlock, start: startHoraSelect, buildLadder, showToasty, portraitOf, endLadder,
    };
  },
});
