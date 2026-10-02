// MATÚŠKO KOMBAT XII — modul ladder: rebrík HORA, tajomstvá, odomykanie, Toasty (P4, P12)
// - HORA (1 hráč): BATTLE PLAN ako v MK2 (stĺpec portrétov, hráč stúpa vedľa), CONTINUE?, koncovka: príbeh, blahoželanie,
//   titulky (scéna credits z credits.js) a záverečná obrazovka s víťazmi. Blahoželanie s tortou len okolo narodenín
//   (api.birthday() z game.js), bez hlasu.
// - Prefarbená postava: GOLDEN MATÚŠKO (id zlaty, 2× flawless). Tajný súboj je proti IMPOSTOROVI (registruje iný modul).
//   Vyradené (Peťo 2. 10.): ČERVENÝ ŠIMON, ORANŽOVÝ MATÚŠKO, TIEŇ, TIEŇ XXL, KAI — nie sú v HORE, nedajú sa odomknúť ani vybrať.
// - Odomykanie v localStorage 'mk12_unlocks', kódy tlačidlami na výbere postavy, Toasty po uppercute a tajný súboj.
// Vstup číta len cez api.ctls (held / pressed / history) a api.matchSeq, nikdy nie klávesnicu priamo.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'ladder',
  init(api) {
    'use strict';
    const { W, H, ROSTER, ORDER, STAGES, IMG, FA, game, hooks } = api;
    const ctx = api.ctx, text = api.text, bigText = api.bigText;

    // ================================================================= nastavenia rebríka (Master môže upraviť)
    // Tri veže ako v MK (Peťo 2. 10.): NOVICE (4 + boss), WARRIOR (6 + boss), MASTER (všetci + boss). Súperi zdola nahor,
    // obťažnosť CPU stúpa. Čo nie je v ROSTER (alebo je to sám hráč), sa preskočí. Brat (Šimon pre Matúška a naopak)
    // je vždy veľký rival tesne pred bossom, aby nebol „prvý najľahší“. Za MASTER STORMA (hráč = boss) je vrcholom brat.
    // BANÁNÁČ (bananac), BLOCKY (blocky) a IMPOSTOR (impostor) registrujú iné moduly. Súper môže mať v ROSTER ladderStage.
    const has = id => () => (ROSTER[id] ? id : null);
    const STEP = {                             // aréna a výber súpera pre každý krok veže
      ninja_fire:   { stage: 'tabor',   pick: has('ninja_fire') },
      rocky:        { stage: 'zahrada', pick: () => (rockyReady() ? 'rocky' : null) },
      ninja_ice:    { stage: 'more',    pick: has('ninja_ice') },
      vodnik:       { stage: 'potok',   pick: has('vodnik') },          // doma pri potoku je silnejší
      bananac:      { stage: 'zahrada', pick: has('bananac') },
      ninja_shadow: { stage: 'most',    pick: has('ninja_shadow') },
      blocky:       { stage: 'potok',   pick: has('blocky') },
      glitch:       { stage: 'tabor',   pick: has('glitch') },
      brat:         { stage: 'dojo',    rival: true, pick: p => brother(p) },
      boss:         { stage: 'hora',    boss: true, pick: p => (ROSTER.boss && p !== 'boss' ? 'boss' : null) },
    };
    const TOWERS = [                           // [krok, obťažnosť CPU]; bossDmg = silnejšie údery bossa
      { key: 'novice', name: 'NOVICE', color: '#7dff6a', bossDmg: 1.0,
        steps: [['ninja_fire', 0.45], ['rocky', 0.53], ['ninja_ice', 0.61], ['brat', 0.70], ['boss', 0.80]] },
      { key: 'warrior', name: 'WARRIOR', color: '#ffd200', bossDmg: 1.1,
        steps: [['ninja_fire', 0.55], ['rocky', 0.60], ['ninja_ice', 0.66], ['vodnik', 0.72], ['bananac', 0.78], ['brat', 0.88], ['boss', 1.00]] },
      { key: 'master', name: 'MASTER', color: '#ff5a3c', bossDmg: 1.2,
        steps: [['ninja_fire', 0.65], ['rocky', 0.70], ['ninja_ice', 0.75], ['vodnik', 0.80], ['bananac', 0.85], ['ninja_shadow', 0.90],
                ['blocky', 0.94], ['glitch', 0.98], ['brat', 1.05], ['boss', 1.15]] },
    ];
    const towerOf = key => TOWERS.find(t => t.key === key) || TOWERS[TOWERS.length - 1];
    const LADDER = towerOf('master').steps.map(([key, level]) => Object.assign({ key, level }, STEP[key]));   // celá veža (pre testy a moduly)
    const BOSS_HP = 130;
    const SECRET_ID = 'impostor';              // súper tajného súboja (Among Us astronaut z iného modulu); bez neho sa tajný súboj nespustí
    const TOASTY_CHANCE = 0.25, TOASTY_LIFE = 66, SECRET_GRACE = 30;
    const CODE_GAP = 45;                       // max. snímok medzi stlačeniami kódu na výbere postavy
    const WALK_F = 1.7, WALK_B = 1.3;          // rovnaké ako v game.js (rýchlejšie postavy, napr. Rocky, ich násobia def.speed)

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
    // ČERVENÝ ŠIMON a ORANŽOVÝ MATÚŠKO (vyradení, pozri reg nižšie): palety ostávajú pre staré záznamy a test_stats.js
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
    // GOLDEN MATÚŠKO (zlaty): hnedé vlasy → zlaté (hustota 5×5 odfiltruje tmavé tiene na chodidlách), vrch vlasov pre kreslené špice
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
    function goldGi(d, w, h) {                // biele kimono → kovové zlato (tiene bronz, svetlá bledé zlato); koža, pás a vlasy ostanú
      for (let i = 0; i < w * h * 4; i += 4) {
        if (d[i + 3] < 100) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), chroma = mx - Math.min(r, g, b), l = (mx + Math.min(r, g, b)) / 510;
        if (chroma > 46 || l < 0.3) continue;      // pestrosť (nie HSL sýtosť): pri takmer bielej je HSL sýtosť zavádzajúca
        const hi = Math.max(0, l - 0.85) / 0.15, o = hsl2rgb(42, 0.95 - 0.2 * hi, Math.min(0.68, 0.08 + 0.6 * l));
        d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
      }
    }
    api.hooks.drawFront.push((stage, F) => {  // GOLDEN MATÚŠKO: pár trblietok okolo postavy (len vizuál)
      if (!F || !F.fighters) return;
      const ctx = api.ctx, fr = api.frame;
      for (const f of F.fighters) {
        if (!f || f.id !== 'zlaty' || f.state === 'baby' || f.state === 'fall' || f.state === 'down') continue;
        for (let k = 0; k < 4; k++) {
          const ph = (fr + k * 23) % 92, a = ph < 46 ? ph / 46 : (92 - ph) / 46;      // každá trblietka sa rozsvieti a zhasne
          const seed = Math.floor((fr + k * 23) / 92) * 7 + k * 13;
          const sx = f.x + ((seed * 37) % 70) - 35, sy = f.y - 30 - ((seed * 53) % 110), r = 2 + a * 3;
          ctx.save(); ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#fff6c4'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy); ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r); ctx.stroke();
          ctx.fillStyle = '#ffd23a'; ctx.fillRect(sx - 1, sy - 1, 2, 2); ctx.restore();
        }
      }
    });
    api.registerPalette('zlaty', (x, w, h) => {
      const ok = pixels(x, w, h, (d, ww, hh) => { goldHair(d, ww, hh, x.canvas); goldGi(d, ww, hh); });
      if (!ok) filterTint(x, w, h, 'sepia(1) saturate(3.2) hue-rotate(-10deg) brightness(1.12)', 'color', '#ffc21a');   // celý zlatý
    });

    // ================================================================= prefarbené postavy (mená po anglicky, Peťo 2. 10.; id ostávajú kvôli uloženým odomknutiam)
    const S0 = ROSTER.simon || {}, M0 = ROSTER.matusko || {};
    function reg(id, def) { if (!ROSTER[id]) api.registerFighter(id, def, false); }
    // Vyradené postavy (Peťo 2. 10.: „nedávajme postavu červený Šimon“, KAI a TIEŇ sú len prefarbené kópie): nie sú v HORE,
    // nedajú sa odomknúť a nikdy nie sú na výbere, ani keď ich má niekto uložené v mk12_unlocks (Peťo má CERVENY).
    // ČERVENÝ a ORANŽOVÝ ostávajú zaregistrovaní (nevoliteľní) len pre staré záznamy v SIENI SLÁVY a test_stats.js.
    const RETIRED_IDS = ['cerveny', 'oranzovy', 'tien', 'tien_xxl', 'kai'], RETIRED_KEYS = ['CERVENY', 'TIEN', 'KAI', 'BEAT_KAI'];
    reg('cerveny', { name: 'ČERVENÝ ŠIMON', short: 'ČERVENÝ', sprites: 'simon', palette: 'cerveny',
      gi: '#c62828', giDark: '#8e1c1c', belt: S0.belt || '#27ae60', hair: S0.hair || '#4a2f17', special: 'husle', specialName: 'HUSLE', finisher: 'babality',
      blurb: ['Šimon v červenom kimone.', 'Husle má rovnaké,', 'sólo ešte horúcejšie.'] });
    reg('oranzovy', { name: 'ORANŽOVÝ MATÚŠKO', short: 'ORANŽOVÝ', sprites: 'matusko', palette: 'oranzovy',
      gi: '#f39a3c', giDark: '#c8741f', belt: '#1b1b1b', hair: M0.hair || '#5b3a1e', special: 'heligonka', specialName: 'HELIGÓNKA', finisher: 'folklority',
      blurb: ['Matúško v oranžovom', 'kimone s čiernym pásom.', 'Heligónka hrá rovnako.'] });
    reg('zlaty', { name: 'GOLDEN MATÚŠKO', short: 'GOLDEN', sprites: 'matusko', palette: 'zlaty', alwaysSsj: true, spikes: true,
      gi: M0.gi || '#f2f2f2', giDark: M0.giDark || '#c9c9c9', belt: M0.belt || '#e67e22', hair: '#ffd23a', special: 'heligonka', specialName: 'HELIGÓNKA', finisher: 'folklority',
      blurb: ['Odomknutý za FLAWLESS:', 'dve kolá zápasu bez zásahu.', 'Navždy Super Saiyan.'] });
    function rockyReady() {
      const d = ROSTER.rocky; if (!d) return false;
      const sid = d.sprites || 'rocky';
      return !!(FA[sid] && FA[sid].anims && FA[sid].anims.idle && IMG[sid + '/idle']);
    }
    const baseOf = id => (ROSTER[id] && ROSTER[id].sprites) || id;
    function brother(p) { const b = baseOf(p); return b === 'simon' ? 'matusko' : 'simon'; }
    const nameOf = id => (ROSTER[id] ? ROSTER[id].name : id);
    const FULL = {};                                              // plné mená postáv (fitSelectNames ich na výbere skracuje)
    const fullName = id => FULL[id] || nameOf(id);                // na výbere môže byť def.name dočasne krátke meno (fitSelectNames)
    const pretty = str => String(str).split(' ').map(w => (/^X+L?$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(' ');   // MAJSTER MRAK → Majster Mrak
    const isHuman = f => !(f.ctl instanceof api.CPU);
    const touchUI = () => api.inputKind(0) === 'touch';          // mobil bez klávesnice: nápovedy „ťukni“

    // ================================================================= odomykanie (localStorage 'mk12_unlocks')
    const UKEY = 'mk12_unlocks';
    const unlocked = new Set();
    try { const raw = localStorage.getItem(UKEY); if (raw) for (const k of JSON.parse(raw)) unlocked.add(String(k)); } catch (e) { /* bez úložiska len v pamäti */ }
    for (const k of RETIRED_KEYS) unlocked.delete(k);      // staré CERVENY (Peťo ho má uložené) sa ignoruje, pri ďalšom uložení zmizne
    const UNLOCKS = {
      ZLATY: { id: () => 'zlaty', label: () => fullName('zlaty'), why: 'za FLAWLESS: dve kolá zápasu bez jediného zásahu' },
      BOSS: { id: () => (ROSTER.boss ? 'boss' : null), label: () => fullName('boss'), why: 'za zdolanie HORY' },
      ROCKY: { id: () => (ROSTER.rocky ? 'rocky' : null), label: () => 'ROCKY', why: 'tajný kód alebo porazený v HORE' },
      IMPOSTOR: { id: () => (ROSTER[SECRET_ID] ? SECRET_ID : null), label: () => 'IMPOSTOR', why: 'za výhru v tajnom súboji' },
    };
    // porazený súper z HORY sa stane hrateľným; mená berie z ROSTER (enemies.js a ďalšie moduly ich môžu premenovať)
    const BEAT_UNLOCK = ['ninja_fire', 'ninja_ice', 'ninja_shadow', 'vodnik', 'bananac', 'blocky', 'glitch', 'rocky'];
    for (const id of BEAT_UNLOCK) if (id !== 'rocky') UNLOCKS['BEAT_' + id.toUpperCase()] = { id: () => (ROSTER[id] ? id : null), label: () => fullName(id) };
    function unlockBeaten(id) {             // v HORE bez toastu: obrazovka HORA ukáže „NOVÁ POSTAVA!“ pri prečiarknutom portréte
      if (!BEAT_UNLOCK.includes(id) || !ROSTER[id]) return false;
      return unlock(id === 'rocky' ? 'ROCKY' : 'BEAT_' + id.toUpperCase(), true);
    }
    function saveUnlocks() { try { localStorage.setItem(UKEY, JSON.stringify([...unlocked])); } catch (e) { /* nevadí */ } }
    function applyUnlocks() {
      for (const k of unlocked) { const u = UNLOCKS[k], id = u && u.id(); if (id && ROSTER[id] && !ORDER.includes(id)) ORDER.push(id); }
      if (!(api.NET && api.NET.role === 'guest'))           // poistka: vyradené postavy nikdy na výbere (hosťovi poradie posiela hostiteľ)
        for (const id of RETIRED_IDS) { const i = ORDER.indexOf(id); if (i >= 0) ORDER.splice(i, 1); }
    }
    function unlock(k, quiet) {
      if (!UNLOCKS[k] || unlocked.has(k)) return false;
      unlocked.add(k); saveUnlocks(); applyUnlocks();
      if (!quiet) queueToast('NOVÁ POSTAVA: ' + UNLOCKS[k].label() + '!' + (UNLOCKS[k].why ? '\n' + UNLOCKS[k].why : ''));   // 2. riadok: prečo (Peťo)
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
    function portraitOf(id) {
      const key = 'img/portrait_' + id;
      if (IMG[key]) return IMG[key];
      const def = ROSTER[id]; if (!def) return null;
      let out = null;
      try {
        if (id === 'zlaty' && IMG['img/portrait_ssj_matusko']) out = IMG['img/portrait_ssj_matusko'];
        const b = def.sprites, bim = b && IMG['img/portrait_' + b];
        if (!out && bim) out = def.palette ? api.paletteStrip(fake(id), 'portrait', bim) : bim;
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
    const L = { pending: false, active: false, player: null, tower: 'warrior', steps: [], idx: 0, lostRounds: 0, continues: 0, climbFrom: -1, freshIdx: -1, newUnlocks: [], done: false };
    const TS = { sel: 1, cols: null };          // výber veže: posledná vybraná (predvolene WARRIOR), stĺpce pre obrazovku
    const S = { armed: false, codeSecret: false, ssj: [false, false], opp: SECRET_ID, player: null };   // tajomstvá
    const T = { on: false, t: 0, life: TOASTY_LIFE, count: 0, wink: 0 };                         // Toasty
    let M = null;               // aktuálny zápas: druh, kolá, flawless
    let pendingKind = null;     // 'ladder' | 'secret' pre najbližší startMatch
    let savedLevel = null;      // obťažnosť CPU pred rebríkom / tajným súbojom
    function setLevel(v) { if (savedLevel === null) savedLevel = api.cpu.level; api.cpu.level = v; }
    function restoreLevel() { if (savedLevel !== null) { api.cpu.level = savedLevel; savedLevel = null; } }
    function resolveStage(id) {
      if (id && STAGES.some(s => s.id === id)) return id;
      return STAGES.length ? STAGES[Math.floor(Math.random() * STAGES.length)].id : id;
    }
    const stageName = id => { const s = STAGES.find(x => x.id === id); return s ? s.name : String(id || '').toUpperCase(); };

    function buildLadder(player, towerKey = 'master') {
      const tw = towerOf(towerKey), used = new Set([player]), steps = [];
      for (const [key, level] of tw.steps) {
        const s = STEP[key];
        let id = null;
        try { id = s.pick(player); } catch (e) { id = null; }
        if (!id || !ROSTER[id] || used.has(id)) continue;         // bez bossa (alebo za bossa) je vrcholom brat
        used.add(id);
        const def = ROSTER[id];
        const prefer = typeof def.ladderStage === 'string' ? def.ladderStage : typeof def.stage === 'string' ? def.stage : s.stage;
        const st = { key, id, stage: resolveStage(prefer), level, boss: !!s.boss, rival: !!s.rival, tower: tw.key };
        const prev = steps[steps.length - 1];
        if (prev && st.level <= prev.level) st.level = Math.round((prev.level + 0.03) * 100) / 100;   // smerom hore vždy ťažšie
        if (s.boss) {
          st.hp = def.hp || BOSS_HP;
          if (id === 'boss' && !def.dmgMul && tw.bossDmg > 1) st.dmgMul = tw.bossDmg;   // ak boss nemá vlastné dmgMul (enemies.js), pridá ho veža
        }
        steps.push(st);
      }
      return steps;
    }
    function startHoraSelect() { L.pending = true; L.active = false; S.codeSecret = false; game.mode = 1; api.setScene('select'); }
    function goTowerSelect(player) { L.player = player; TS.cols = null; api.setScene('hora_veza'); }    // po výbere postavy výber veže
    function beginLadder(player, towerKey = TOWERS[TS.sel].key) {
      Object.assign(L, { pending: false, active: true, player, tower: towerOf(towerKey).key, steps: buildLadder(player, towerKey), idx: 0, lostRounds: 0, continues: 0,
        climbFrom: -1, freshIdx: -1, newUnlocks: [], done: false, startedAt: Date.now() });
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
      if (api.stats) api.stats.hora(L.player, L.startedAt ? Date.now() - L.startedAt : 0, towerOf(L.tower).name);   // SIEŇ SLÁVY: hora, čas, veža
      // zdolaná HORA = porazený boss → MASTER STORM na výbere (podmienka „bez prehratého kola“ zrušená, Peťo 2. 10.)
      if (L.steps.some(s => s.boss) && unlock('BOSS', true)) L.newUnlocks.push(UNLOCKS.BOSS.label());
      restoreLevel();
    }
    function endLadder() {
      L.active = false; L.pending = false; L.done = false; pendingKind = null; S.armed = false;
      restoreLevel();
    }
    // tajný súboj: IMPOSTOR (iný modul); bez neho sa nespustí, za IMPOSTORA tiež nie (zrkadlový zápas game.js nerobí)
    const secretOk = player => !!ROSTER[SECRET_ID] && player !== SECRET_ID;
    function goSecret() {
      const player = L.active ? L.player : game.picks[0];
      if (!secretOk(player)) return false;
      S.player = player; S.opp = SECRET_ID;
      prewarm([player, S.opp]);
      api.setScene('tajny');
      return true;
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

    // GOLDEN MATÚŠKO: kreslené špice nad vrchom vlasov (len keď sa dali prečítať pixely)
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

    // ================================================================= sledovanie zápasu (kolá, flawless, Toasty)
    function roundDecided(F, w) {
      if (w < 0) return;
      M.roundsWon[w]++;
      const f = F.fighters[w];
      if (!isHuman(f)) return;
      if (f.damageTaken === 0 && ++M.flawless[w] >= 2) unlock('ZLATY');
      // „kolo len kopmi“ už nič neodomyká (ČERVENÝ ŠIMON vyradený, Peťo 2. 10.)
    }
    function trackFight(F) {
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
        // tajomstvo: Toasty v TÁBORE V NOCI + ↓ a START naraz (len 1 hráč, len keď IMPOSTOR existuje)
        if (T.on && game.mode === 1 && F.stage && F.stage.id === 'tabor' && M.kind !== 'secret' && !S.armed && secretOk(F.fighters[0].id)) {
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
      { name: 'IMPOSTOR', seq: ['up', 'up', 'down', 'down'], run: codeSecret },      // tajný súboj s IMPOSTOROM
      { name: 'SSJ', seq: ['up', 'up', 'up', 'kiai'], run: codeSsj },                // začať zápas premenený
      { name: 'ROCKY', seq: ['down', 'down', 'down', 'special'], run: codeRocky },   // odomkne Rockyho (ak je), inak „trénuje“
    ];
    const codeLog = [];
    function codeSecret() {
      if (game.mode !== 1) { queueToast('TAJNÝ SÚBOJ JE LEN PRE 1 HRÁČA'); return; }
      if (!ROSTER[SECRET_ID]) { queueToast('IMPOSTOR SA EŠTE SKRÝVA…'); return; }
      if (L.pending) { queueToast('IMPOSTOR SA SKRÝVA V TÁBORE V NOCI…'); return; }     // v HORE cez Toasty v tábore
      S.codeSecret = true; api.sfx('crack', 0.6); queueToast('TAJNÝ SÚBOJ: IMPOSTOR!');
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
      if (L.pending && game.mode === 1) { lockAt = -1; goTowerSelect(game.picks[0]); }
      else if (S.codeSecret && game.mode === 1) { lockAt = -1; S.codeSecret = false; if (!goSecret()) queueToast('IMPOSTOR SI TY!'); }
    }

    // výber postavy kreslí game.js; pri 6+ bojovníkoch sa dlhé mená prekrývajú → kým je výber na obrazovke, krátke meno (def.short)
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
      else if (toastQ.length) { const t = toastQ.shift(), long = t.includes('\n'); api.showToast(t, long ? 200 : 100); api.sfx('confirm'); toastWait = long ? 215 : 115; }
      if (sc === 'title' && entered) {
        if (L.active || L.pending) endLadder();
        restoreLevel();
        S.codeSecret = false; S.ssj = [false, false]; S.armed = false;
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
    // rýchlejšia chôdza (def.speed, napr. Rocky): len čistý pohyb, útoky a blok rieši game.js / moves.js
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
        // silnejší boss: dorovnanie zranenia po zásahu (nikdy nezabije, K.O. rieši game.js)
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
            roundsWon: [0, 0], flawless: [0, 0], ssj: S.ssj.slice(), dmgMul: 0 };
      if (M.step) M.dmgMul = M.step.dmgMul || 0;
      S.ssj = [false, false];
      T.on = false;
    });
    hooks.roundStart.push(F => {
      if (!M || M.F !== F) return;
      F.fighters.forEach((f, i) => { if (M.ssj[i] || (f.def && f.def.alwaysSsj)) f.ssj = true; });
      if (M.step && M.step.hp) { const o = F.fighters[1]; o.maxHp = o.hp = o.shownHp = M.step.hp; }
    });
    hooks.matchEnd.push(F => {
      if (!M || M.F !== F) return false;
      const won = F.winner === 0;
      if (M.kind === 'secret') {
        S.armed = false;
        if (won) unlock('IMPOSTOR');
        if (L.active) { continueLadder(); return true; }
        restoreLevel(); return false;                                   // mimo rebríka bežný koniec (vyhodenie, výsledok)
      }
      if (M.kind === 'ladder' && L.active) {
        L.lostRounds += Math.max(M.roundsWon[1], won ? 0 : 1);
        if (!won) { S.armed = false; api.setScene('hora_cont'); return true; }
        L.freshIdx = unlockBeaten(L.steps[L.idx].id) ? L.idx : -1;
        L.idx++; L.climbFrom = L.idx - 1;
        if (S.armed) { S.armed = false; if (goSecret()) return true; }
        continueLadder(); return true;
      }
      if (S.armed && game.mode === 1 && won) { S.armed = false; if (goSecret()) return true; }
      S.armed = false;
      return false;
    });
    hooks.drawFront.push((stage, F) => { for (const f of F.fighters) if (f.def && f.def.spikes) drawSpikes(f); });
    hooks.drawHud.push(F => {
      if (M && M.F === F && M.kind === 'ladder' && L.active) text('HORA ' + towerOf(L.tower).name + ' ' + Math.min(L.idx + 1, L.steps.length) + '/' + L.steps.length, W / 2, 38, 7, 'center', '#ffd28a');
      if (M && M.F === F && M.kind === 'secret') text('TAJNÝ SÚBOJ', W / 2, 38, 7, 'center', '#c9b8ff');
      if (T.on && T.t < T.life) drawToasty();
    });

    // ================================================================= scéna HORA: BATTLE PLAN ako v MK2 (Peťo 2. 10.)
    // V strede zvislý stĺpec malých portrétov: prvý súper dole, boss hore ako vrchol. Porazení sú stmavení a prečiarknutí,
    // aktuálny súper má pulzujúci rámik. Hráčov portrét stojí vedľa stĺpca a po výhre plynulo vystúpi o úroveň vyššie (~1 s).
    // Na 480×270 sa zmestí 10 súperov v jednom stĺpci (portréty 22 px), od 11 súperov dva stĺpce cik-cak (portréty až 28 px).
    function poly(pts, color) { ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
    function drawMountain(t, sky) {          // hora za úsvitu (koncovka)
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
    }
    function stars(level) { const k = api.clamp(Math.round(level * 4.5), 1, 5); return '★'.repeat(k) + '☆'.repeat(5 - k); }

    const COL = { top: 6, bot: 250, gap: 2, minH: 22, maxH: 28, aspect: 1.2, bossK: 1.25 };
    const CLIMB0 = 14, CLIMB_LEN = 60, CLIMB_END = CLIMB0 + CLIMB_LEN;   // po výhre: prečiarknutie, potom výstup ~1 s
    function towerLayout(n) {                // obdĺžniky súperov zdola nahor (posledný = boss), x0/x1 = okraje stĺpca
      const cx = W / 2, avail = COL.bot - COL.top, g = COL.gap, slots = [];
      if (n <= 0) return { slots, cols: 1, h: 0, x0: cx, x1: cx };
      let cols = 1, h = Math.floor((avail - (n - 1) * g) / (n - 1 + COL.bossK));
      if (h < COL.minH && n > 2) { cols = 2; h = Math.floor((avail - g - (n - 2) * g / 2) / ((n - 2) / 2 + 1 + COL.bossK)); }
      h = Math.max(12, Math.min(COL.maxH, h));
      const w = Math.round(h * COL.aspect), hb = n > 1 ? Math.round(h * COL.bossK) : h, wb = Math.round(hb * COL.aspect);
      const step = cols === 1 ? h + g : (h + g) / 2;
      const total = n > 1 ? (n - 2) * step + h + g + hb : hb;
      const base = COL.bot - Math.max(0, Math.floor((avail - total) / 2));     // kratší stĺpec je v strede výšky
      for (let i = 0; i < n - 1; i++) {
        const x = cols === 1 ? cx - w / 2 : (i % 2 ? cx + 1 : cx - w - 1);
        slots.push({ x: Math.round(x), y: Math.round(base - h - i * step), w, h });
      }
      const topY = n > 1 ? slots[n - 2].y - g - hb : base - hb;
      slots.push({ x: Math.round(cx - wb / 2), y: Math.round(topY), w: wb, h: hb, boss: true });
      return { slots, cols, h, x0: Math.min(...slots.map(r => r.x)), x1: Math.max(...slots.map(r => r.x + r.w)) };
    }
    function markerRect(lay, i) {            // hráčov portrét vľavo vedľa stĺpca, na výške súpera i
      const r = lay.slots[api.clamp(i, 0, lay.slots.length - 1)];
      const mh = Math.min(32, lay.h + 6), mw = Math.round(mh * COL.aspect);
      return { x: lay.x0 - 10 - mw, y: Math.round(r.y + r.h / 2 - mh / 2), w: mw, h: mh };
    }
    const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    function markerAt(t) {                   // poloha hráča v čase t scény HORA (k = 1 → stojí pri aktuálnom súperovi)
      const lay = towerLayout(L.steps.length), to = markerRect(lay, L.idx);
      if (L.climbFrom < 0 || !L.steps.length) return Object.assign(to, { k: 1 });
      const from = markerRect(lay, L.climbFrom), k = ease(api.clamp((t - CLIMB0) / CLIMB_LEN, 0, 1));
      return { x: to.x, y: Math.round(from.y + (to.y - from.y) * k), w: to.w, h: to.h, k, fromY: from.y };
    }
    function mini(id, x, y, w, h) {          // malý portrét: výrez hlavy a pliec, aby bola tvár čitateľná aj na 22 px
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#2c2342'); g.addColorStop(1, '#0d0a16');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      const im = portraitOf(id);
      if (im) {
        const sw = im.width * 0.84, sh = Math.min(im.height, sw * h / w);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(im, im.width * 0.08, im.height * 0.02, sw, sh, x, y, w, h);
      } else if (ROSTER[id]) {
        const ph = h * 120 / 68;             // ako výrez z portrétu 96×120
        api.drawFigure(x + w / 2, y + ph + 46 * ph / 120, 1, api.POSES.stand, ROSTER[id], { scale: 1.25 * ph / 120 });
      }
      ctx.restore();
    }
    function drawX(r, k = 1) {               // červené prečiarknutie porazeného (k > 1 = práve dopadá ako pečiatka)
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = (r.w / 2 - 2) * k, dy = (r.h / 2 - 2) * k;
      ctx.save(); ctx.lineCap = 'round';
      for (const [lw, c] of [[5, '#000'], [2.5, '#e8231b']]) {
        ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.moveTo(cx + dx, cy - dy); ctx.lineTo(cx - dx, cy + dy); ctx.stroke();
      }
      ctx.restore();
    }
    function bolt(x, y0, y1, seed) {         // blesk MAJSTRA MRAKA nad vrcholom
      ctx.save(); ctx.strokeStyle = '#fff6a8'; ctx.lineWidth = 2; ctx.shadowColor = '#ffe14a'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(x, y0);
      for (let y = y0, i = 0; y < y1; i++) { y = Math.min(y1, y + 6); ctx.lineTo(x + (((seed + i * 7) % 5) - 2) * 3, y); }
      ctx.stroke(); ctx.restore();
    }
    function drawBattleBg(t, lay) {          // tmavé pozadie ako v MK2: čierno-fialová noc, červený žiar dole, kamenná veža
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#040208'); g.addColorStop(0.55, '#0c0614'); g.addColorStop(1, '#2a0808');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 40; i++) if ((i + Math.floor(t / 30)) % 7) ctx.fillRect((i * 97 + 13) % W, (i * 41) % 150, 1, 1);
      poly([[0, 270], [0, 214], [60, 186], [118, 222], [170, 198], [208, 230], [272, 230], [312, 194], [368, 228], [420, 182], [480, 208], [480, 270]], '#130c1b');
      ctx.fillStyle = 'rgba(170,130,220,0.045)';
      for (let i = 0; i < 3; i++) { const cx = ((i * 190 + t * (0.2 + i * 0.07)) % (W + 200)) - 100; ctx.beginPath(); ctx.ellipse(cx, 70 + i * 62, 90, 8, 0, 0, Math.PI * 2); ctx.fill(); }
      if (lay && lay.slots.length) drawPillar(lay.x0 - 6, lay.x1 + 6, lay.slots[lay.slots.length - 1].y + 10);
    }
    function drawPillar(x0, x1, top, bot = H) {   // kamenná veža za portrétmi
      const pg = ctx.createLinearGradient(x0, 0, x1, 0);
      pg.addColorStop(0, '#2c2535'); pg.addColorStop(0.45, '#3a3245'); pg.addColorStop(1, '#1a1522');
      ctx.fillStyle = pg; ctx.fillRect(x0, top, x1 - x0, bot - top);
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      for (let y = top + 7, row = 0; y < bot; y += 8, row++) {
        ctx.fillRect(x0, y, x1 - x0, 1);
        for (let x = x0 + (row % 2 ? 5 : 11); x < x1; x += 12) ctx.fillRect(x, y - 7, 1, 7);
      }
      ctx.fillStyle = '#51475f'; ctx.fillRect(x0, top, 1, bot - top);
      ctx.fillStyle = '#0d0a12'; ctx.fillRect(x1 - 1, top, 1, bot - top);
    }
    const V = { layout: null, marker: null, t: 0, drawn: 0 };     // čo sa naposledy nakreslilo (pre testy)
    function drawHora() {
      const t = api.sceneT, n = L.steps.length, lay = towerLayout(n);
      drawBattleBg(t, lay);
      if (!n) return;
      const intro = L.idx === 0 && L.climbFrom < 0;                // prvé zobrazenie: veža narastie zdola nahor
      const climbing = L.climbFrom >= 0, arrived = !climbing || t >= CLIMB_END - 4;
      // vrchol: žiara a blesky
      const b = lay.slots[n - 1], bx = b.x + b.w / 2, by = b.y + b.h / 2;
      const rg = ctx.createRadialGradient(bx, by, 4, bx, by, 52);
      rg.addColorStop(0, 'rgba(255,96,40,0.38)'); rg.addColorStop(1, 'rgba(255,96,40,0)');
      ctx.fillStyle = rg; ctx.fillRect(bx - 56, by - 56, 112, 112);
      if (t % 160 < 6) { bolt(b.x - 12, 0, by, 3); bolt(b.x + b.w + 12, 0, by - 4, 8); }
      // súperi zdola nahor
      for (let i = 0; i < n; i++) {
        if (intro && t < i * 3) continue;
        const r = lay.slots[i], st = L.steps[i], done = i < L.idx, cur = i === L.idx;
        ctx.fillStyle = '#000'; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
        mini(st.id, r.x, r.y, r.w, r.h);
        if (done) {
          ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(r.x, r.y, r.w, r.h);
          const stamp = climbing && i === L.climbFrom;
          if (!stamp || t >= 3) drawX(r, stamp && t < 12 ? 1 + (12 - t) / 12 * 0.7 : 1);
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = done ? '#2a2436' : st.boss ? '#d4a52a' : st.rival ? '#c0393f' : '#5a4f72';
        ctx.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
        if (cur && arrived) {
          const p = 0.5 + 0.5 * Math.sin(t / 5);
          ctx.strokeStyle = `rgba(255,210,0,${(0.15 + 0.35 * p).toFixed(2)})`; ctx.lineWidth = 3; ctx.strokeRect(r.x - 4.5, r.y - 4.5, r.w + 9, r.h + 9);
          ctx.strokeStyle = `rgb(255,${Math.round(90 + 120 * p)},0)`; ctx.lineWidth = 2; ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
        }
        if (st.boss || st.rival) text(st.boss ? 'BOSS' : 'RIVAL', lay.x1 + 9, r.y + r.h / 2 + 3, 7, 'left', done ? '#5a4f6a' : st.boss ? '#ffcf4a' : '#ff6b6b');
        else if (i === L.freshIdx && done && t >= 12 && (t < 60 || t % 30 < 22)) text('NOVÁ POSTAVA!', lay.x1 + 9, r.y + r.h / 2 + 3, 7, 'left', '#7dff6a');
      }
      // hráč vedľa stĺpca (po výhre vystúpi o úroveň vyššie)
      const m = markerAt(t);
      const mx = intro ? Math.round(m.x - Math.max(0, 1 - t / 24) * (m.x + m.w + 12)) : m.x;
      if (climbing && m.k < 1) { ctx.fillStyle = 'rgba(63,169,255,0.22)'; ctx.fillRect(mx + m.w / 2 - 1, m.y + m.h, 2, Math.max(0, m.fromY - m.y)); }
      ctx.fillStyle = '#000'; ctx.fillRect(mx - 2, m.y - 2, m.w + 4, m.h + 4);
      mini(L.player, mx, m.y, m.w, m.h);
      ctx.strokeStyle = '#3fa9ff'; ctx.lineWidth = 2; ctx.strokeRect(mx - 1, m.y - 1, m.w + 2, m.h + 2);
      const ay = m.y + m.h / 2;
      ctx.fillStyle = '#3fa9ff'; ctx.beginPath(); ctx.moveTo(mx + m.w + 3, ay - 4); ctx.lineTo(mx + m.w + 8, ay); ctx.lineTo(mx + m.w + 3, ay + 4); ctx.closePath(); ctx.fill();
      text('1P', mx - 4, ay + 3, 8, 'right', '#3fa9ff');
      Object.assign(V, { layout: lay, marker: { x: mx, y: m.y, w: m.w, h: m.h, k: m.k }, t, drawn: V.drawn + 1 });
      // ľavá strana: hlavička, veža a hráč
      const tw = towerOf(L.tower);
      bigText('HORA', 74, 38, 30);
      text('BATTLE PLAN', 74, 51, 9, 'center', '#ff5a3c');
      text('VEŽA ' + tw.name, 74, 63, 8, 'center', tw.color);
      face(L.player, 50, 68, 48, 60, '#3fa9ff');
      text(nameOf(L.player), 74, 142, nameOf(L.player).length > 12 ? 8 : 10, 'center', '#3fa9ff');
      text('Pokračovania: ' + L.continues, 74, 157, 8, 'center', '#ccc');
      text(L.lostRounds ? 'Prehraté kolá: ' + L.lostRounds : 'Zatiaľ bez prehratého kola', 74, 170, 7, 'center', L.lostRounds ? '#ccc' : '#7dff6a');
      // pravá strana: aktuálny súper
      const ci = Math.min(L.idx, n - 1), st = L.steps[ci], rx = W - 74;
      text('SÚPER ' + (ci + 1) + ' / ' + n, rx, 30, 9, 'center', '#ffd28a');
      face(st.id, rx - 24, 38, 48, 60, st.boss ? '#d4a52a' : st.rival ? '#e0453c' : '#ffd200');
      text(nameOf(st.id), rx, 114, nameOf(st.id).length > 12 ? 8 : 10, 'center', '#ffd200');
      let y = 128;
      if (st.boss || st.rival) { text(st.boss ? 'STRÁŽCA VRCHOLU' : 'VEĽKÝ RIVAL', rx, y, 8, 'center', st.boss ? '#ffcf4a' : '#ff6b6b'); y += 13; }
      text('ARÉNA: ' + stageName(st.stage), rx, y, 8, 'center', '#fff'); y += 15;
      text(stars(st.level), rx, y, 10, 'center', '#ffb300'); y += 13;
      if (st.hp && st.hp !== 100) text('ŽIVOT ' + st.hp, rx, y, 7, 'center', '#ff9f9f');
      const ready = climbing ? t > CLIMB_END : t > 25;
      if (ready && t % 60 < 42) text(touchUI() ? 'ťukni = do boja' : 'ÚDER / ENTER = do boja      ESC = menu', W / 2, 265, 8, 'center', '#fff');
    }
    api.registerScene('hora', {
      update() {
        const t = api.sceneT, menu = api.menu, climbing = L.climbFrom >= 0;
        if (t === 1) api.music('title');
        if (menu.back) { endLadder(); api.setScene('title'); api.music('title'); return; }
        if (climbing) {
          if (t === 3) api.sfx('punch', 0.5);             // pečiatka na porazenom
          if (t === CLIMB0) api.sfx('whoosh', 0.7);
          if (t === CLIMB_END) api.sfx('confirm');
        }
        const ready = climbing ? t > CLIMB_END : t > 25;     // výstup sa nepreskočí, ani keď sa po výhre ďalej mláti do tlačidiel
        if ((menu.ok && ready) || t > 240) { L.climbFrom = -1; L.freshIdx = -1; goLadderFight(); }   // ťuk na mobile = menu.ok
      },
      draw: drawHora,
    });

    // ================================================================= VÝBER VEŽE (ako v MK: NOVICE / WARRIOR / MASTER)
    // Tri veže s malými portrétmi súperov (zdola nahor, boss hore), názov a počet súperov. ← → a ÚDER/ENTER, alebo ťuk na vežu.
    const TCX = [110, 240, 370], TBOT = 226;
    function towerColumns() {
      return TOWERS.map((tw, k) => {
        const steps = buildLadder(L.player, tw.key), slots = [], h = 16, hb = 21;
        let y = TBOT;
        steps.forEach((st, i) => {
          const hh = i === steps.length - 1 ? hb : h, ww = Math.round(hh * COL.aspect);
          y -= hh; slots.push({ x: Math.round(TCX[k] - ww / 2), y, w: ww, h: hh }); y -= 2;
        });
        const x0 = Math.min(...slots.map(r => r.x)), x1 = Math.max(...slots.map(r => r.x + r.w));
        return { tw, steps, slots, x0, x1, top: slots.length ? slots[slots.length - 1].y : TBOT, foes: steps.filter(st => !st.boss).length, boss: steps.some(st => st.boss) };
      });
    }
    const foesText = n => n + (n === 1 ? ' SÚPER' : n <= 4 ? ' SÚPERI' : ' SÚPEROV');
    function towerAt(pos) {                  // ťuk: ktorá veža je pod prstom (-1 = žiadna)
      const k = TCX.findIndex(cx => Math.abs(pos.x - cx) < 60);
      return k >= 0 && pos.y > 30 && pos.y < 262 ? k : -1;
    }
    api.registerScene('hora_veza', {
      update() {
        const t = api.sceneT, menu = api.menu;
        if (menu.back) { startHoraSelect(); return; }                       // späť na výber postavy
        if (menu.left || menu.right) { TS.sel = (TS.sel + (menu.right ? 1 : TOWERS.length - 1)) % TOWERS.length; api.sfx('select'); }
        if (menu.tapPos) { const k = towerAt(menu.tapPos); if (k < 0) return; TS.sel = k; }   // ťuk mimo veží nič nepotvrdí
        if (menu.ok && t > 30) { api.sfx('confirm'); beginLadder(L.player, TOWERS[TS.sel].key); }   // pol sekundy: mlátenie ÚDERU z výberu postavy vežu nevyberie
      },
      draw() {
        const t = api.sceneT, cols = TS.cols || (TS.cols = towerColumns());
        drawBattleBg(t, null);
        bigText('VYBER SI VEŽU', W / 2, 30, 24);
        cols.forEach((c, k) => {
          const sel = k === TS.sel;
          if (c.slots.length) { drawPillar(c.x0 - 5, c.x1 + 5, c.top + 8, TBOT + 6); ctx.fillStyle = '#1a1522'; ctx.fillRect(c.x0 - 8, TBOT + 4, c.x1 - c.x0 + 16, 4); }
          c.slots.forEach((r, i) => {
            ctx.fillStyle = '#000'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
            mini(c.steps[i].id, r.x, r.y, r.w, r.h);
            const st = c.steps[i];
            ctx.strokeStyle = st.boss ? '#d4a52a' : st.rival ? '#c0393f' : '#5a4f72'; ctx.lineWidth = 1; ctx.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
            if (!sel) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4); }
          });
          if (sel && c.slots.length) {                                     // vybraná veža: pulzujúci rám a hráč pri jej spodku
            const p = 0.5 + 0.5 * Math.sin(t / 5), b = c.slots[0];
            ctx.strokeStyle = `rgb(255,${Math.round(90 + 120 * p)},0)`; ctx.lineWidth = 2;
            ctx.strokeRect(c.x0 - 9, c.top - 5, c.x1 - c.x0 + 18, TBOT - c.top + 10);
            const mw = 22, mh = 18, mx = c.x0 - 14 - mw, my = Math.round(b.y + b.h / 2 - mh / 2);
            ctx.fillStyle = '#000'; ctx.fillRect(mx - 2, my - 2, mw + 4, mh + 4);
            mini(L.player, mx, my, mw, mh);
            ctx.strokeStyle = '#3fa9ff'; ctx.lineWidth = 2; ctx.strokeRect(mx - 1, my - 1, mw + 2, mh + 2);
            ctx.fillStyle = '#3fa9ff'; ctx.beginPath(); ctx.moveTo(mx + mw + 3, my + mh / 2 - 4); ctx.lineTo(mx + mw + 8, my + mh / 2); ctx.lineTo(mx + mw + 3, my + mh / 2 + 4); ctx.closePath(); ctx.fill();
          }
          text(c.tw.name, TCX[k], 245, sel ? 14 : 12, 'center', sel ? c.tw.color : '#8a8098');
          text(foesText(c.foes) + (c.boss ? ' + BOSS' : ''), TCX[k], 257, 8, 'center', sel ? '#fff' : '#6f6680');
        });
        if (t % 60 < 42) text(touchUI() ? 'ťukni na vežu' : '← → výber   ÚDER / ENTER = do boja   ESC = späť', W / 2, 268, 7, 'center', '#bbb');
      },
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
        for (const [i, lb, cx] of [[0, 'ÁNO, ZNOVA!', W / 2 - 60], [1, 'NIE', W / 2 + 80]]) {   // šípka pred textom, text sa neposúva
          text(lb, cx, 212, 14, 'center', C.sel === i ? '#ffd200' : '#999');
          if (C.sel === i) { api.ctx.font = 'bold 14px "Trebuchet MS", "Arial Black", Arial, sans-serif'; text('▶', cx - api.ctx.measureText(lb).width / 2 - 6, 212, 14, 'right', '#ffd200'); }
        }
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
        text(fullName(S.opp) + ' ŤA VYZÝVA…', W / 2, 70, 12, 'center', '#c9b8ff');
        text(unlocked.has('IMPOSTOR') ? 'Ukáž mu, kto je tu majster!' : 'Ak vyhráš, IMPOSTOR bude tvoj.', W / 2, 262, 9, 'center', '#aaa');
      },
    });

    // ================================================================= KONCOVKA (príbeh, blahoželanie, titulky z credits.js, záver)
    const STORY = {
      matusko: b => ['Matúško vyšiel až na vrchol hory.', b + ' sa uklonil a povedal:', '„Tvoje KIAI je silnejšie ako hrom.“', 'A Šimon uznal, že mladší brat je majster.', 'Aspoň do večera.'],
      zlaty: b => ['Golden Matúško svietil na vrchole', 'hory ako slnko.', b + ' si musel zakryť oči', 'a uznal: „Toto je skutočný', 'Super Saiyan.“'],
      simon: b => ['Šimon vyšiel až na vrchol hory', 'a zahral také husľové sólo,', 'že sa rozostúpili aj mraky.', b + ' tlieskal. Matúško tiež…', '…a hneď chcel odvetu.'],
      impostor: b => ['Impostor vyliezol až na vrchol hory', 'a nikto si nič nevšimol.', b + ' sa uklonil…', '…a vtom niekto zakričal:', '„Emergency meeting!“'],
      boss: (b, me) => [me + ' zdolal vlastnú horu.', 'Na vrchole bolo ticho a prázdno.', 'Pochopil, že najsilnejší', 'je ten, kto má brata,', 's ktorým sa dá pobiť aj zasmiať.'],
      other: (b, me) => [me + ' zdolal horu!', 'Všetci súperi sa uklonili', 'a ' + b + ' odovzdal vrchol.', 'Rocky dostal najväčšiu kosť', 'na svete.'],
    };
    function storyLines() {
      const me = L.player, last = L.steps[L.steps.length - 1], nice = last ? pretty(nameOf(last.id)) : 'Strážca vrcholu';
      const key = me === 'zlaty' ? 'zlaty' : me === 'boss' ? 'boss' : me === SECRET_ID ? 'impostor' : me === 'matusko' || me === 'simon' ? me : 'other';
      return STORY[key](nice, pretty(nameOf(me)));
    }
    const E = { stage: 0, t: 0, lines: null, confetti: [], bday: null, resume: false };
    const E_DUR = [480, 380, 0, 360];      // príbeh, blahoželanie (len okolo narodenín), titulky (scéna credits), záver
    function endingDone() { endLadder(); api.setScene('title'); api.music('title'); }
    // titulky = scéna credits (credits.js) s porazenými súpermi; ÚDER / ENTER alebo koniec → záverečná obrazovka, Esc → menu.
    // Bez modulu credits koncovka titulky preskočí.
    function rollCredits() {
      E.stage = 2; E.t = 0;
      if (!api.credits) { E.stage = 3; return; }
      api.credits.start(how => {
        if (how === 'back') return endingDone();
        E.stage = 3; E.t = 0; E.resume = true; api.setScene('hora_koniec');
      }, { foes: [...new Set(L.steps.map(s => s.id))].map(fullName), finale: false });
    }
    // blahoželanie len okolo narodenín: game.js dá api.birthday() → { age, name } (1.–10. októbra), inak null
    function birthday() {
      try { const b = typeof api.birthday === 'function' ? api.birthday() : null; return b && typeof b === 'object' && b.age > 0 ? b : null; }
      catch (e) { return null; }
    }
    function drawCake(x, y, age) {          // kreslená torta s vekom na stolíku (obrázok img/cake_simon má sviečky „12“)
      ctx.fillStyle = '#4a2c18'; ctx.fillRect(x - 34, y - 4, 68, 4); ctx.fillRect(x - 28, y, 4, 14); ctx.fillRect(x + 24, y, 4, 14);
      ctx.fillStyle = '#5a3a24'; ctx.fillRect(x - 26, y - 26, 52, 22);
      ctx.fillStyle = '#7a4e30'; ctx.fillRect(x - 18, y - 40, 36, 14);
      ctx.fillStyle = '#ffe9f2'; ctx.fillRect(x - 26, y - 28, 52, 3); ctx.fillRect(x - 18, y - 42, 36, 3);
      ctx.fillStyle = '#ff4d6d';
      for (let i = -22; i <= 22; i += 11) { ctx.beginPath(); ctx.arc(x + i, y - 27, 2, 0, Math.PI * 2); ctx.fill(); }
      const digits = String(age), dw = 11;
      [...digits].forEach((d, i) => {
        const cx = x + (i - (digits.length - 1) / 2) * dw;
        text(d, cx, y - 44, 15, 'center', '#ffd84a');
        ctx.fillStyle = (api.sceneT + i * 5) % 12 < 6 ? '#ffb02e' : '#ffe14a';
        ctx.beginPath(); ctx.ellipse(cx, y - 63, 2, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      });
    }
    api.registerScene('hora_koniec', {
      update() {
        const menu = api.menu;
        if (api.sceneT === 1) {
          if (E.resume) E.resume = false;                              // návrat z titulkov (credits.js): záverečná obrazovka
          else { Object.assign(E, { stage: 0, t: 0, lines: storyLines(), confetti: [], bday: birthday() }); api.music('result'); api.sfx('confirm'); }
        }
        E.t++;                                                       // hlas „birthday“ nie (Peťo: „nech hlas nič nepovie“)
        if (E.stage >= 1 && E.t % 4 === 0) E.confetti.push({ x: api.rnd(0, W), y: -5, vy: api.rnd(0.8, 2), vx: api.rnd(-0.5, 0.5), c: ['#ff4d4d', '#ffd200', '#4dd2ff', '#7dff6a', '#ff7ae0'][Math.floor(api.rnd(0, 5))] });
        for (const c of E.confetti) { c.x += c.vx; c.y += c.vy; }
        while (E.confetti.length && E.confetti[0].y > H + 10) E.confetti.shift();
        if (menu.back) return endingDone();
        if (E.t >= E_DUR[E.stage] || (menu.ok && E.t > 40)) {
          E.stage++; E.t = 0;
          if (E.stage === 1 && !E.bday) E.stage = 2;                // mimo narodenín bez blahoželania rovno titulky
          if (E.stage === 2) rollCredits();
          else if (E.stage > 3) endingDone();
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
          // Šimon nesie Matúškovi tortu „12“ (img/cake_simon; nezrkadliť, číslo by bolo naopak), Matúško sa teší.
          // Obrázok má sviečky 12 → v inom roku Šimon bez torty a kreslená torta s vekom z api.birthday().
          const bd = E.bday || { age: 12, name: 'MATÚŠKO' }, im = bd.age === 12 && IMG['img/cake_simon'];
          if (im) ctx.drawImage(im, Math.round(84 - im.width / 2), 262 - im.height);
          else {
            if (ROSTER.simon) { const f = fake('simon', 'idle'); f.x = 84; f.y = 262; f.t = t; api.drawFighter(f); }
            drawCake(W / 2, 248, bd.age);
          }
          if (ROSTER.matusko) { const f = fake('matusko', 'win'); f.x = 396; f.y = 262; f.t = t; f.facing = -1; api.drawFighter(f); }
          for (const c of E.confetti) { ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x), Math.round(c.y), 3, 4); }
          bigText('VŠETKO NAJLEPŠIE', W / 2, 58, 34);
          const wish = 'K ' + bd.age + '. NARODENINÁM, ' + String(bd.name || 'MATÚŠKO').toUpperCase() + '!';
          ctx.font = 'bold 24px Impact, "Arial Black", "Trebuchet MS", sans-serif';
          const ww = ctx.measureText(wish).width;
          bigText(wish, W / 2, 94, ww > W - 24 ? Math.floor(24 * (W - 24) / ww) : 24);
          if (t > 60) text('Nech ti KIAI vydrží celý rok!', W / 2, 122, 12, 'center', '#ffd28a');
        } else {                                                     // záver po titulkoch (Peťo 2. 10.: bez nápisu SLÁVNA TROJKA)
          ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
          for (const c of E.confetti) { ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x), Math.round(c.y), 3, 4); }
          if (api.drawLogoTitle) { api.drawLogoTitle(W / 2, 46, 30, api.sceneT); bigText('XII', W / 2, 72, 20, true); }
          else bigText('MATÚŠKO KOMBAT XII', W / 2, 54, 30);
          text('ĎAKUJEME ZA HRANIE!', W / 2, 94, 12, 'center', '#ffd28a');
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
      towerLayout, markerAt, view: V, CLIMB: { start: CLIMB0, len: CLIMB_LEN, end: CLIMB_END }, RETIRED_IDS,
      TOWERS, towers: TS, towerColumns, beginLadder,
    };
  },
});
