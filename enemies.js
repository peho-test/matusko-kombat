// MATÚŠKO KOMBAT XII — modul enemies: súperi so schopnosťami ako v MK2 (ninjovia, boss) (P6)
// OHNIVÝ NINJA (lano „GET OVER HERE!“, ohnivý kop) · ĽADOVÝ NINJA (ľadová guľa, šmyk) · TIEŇOVÝ NINJA (neviditeľnosť)
// · MAJSTER MRAK (blesk, teleport, torpédo). Postavy sa len registrujú (selectable = false); výber a odomykanie rieši ladder.js.
// Schopnosti sa viažu na def.enKind ('fire' | 'ice' | 'shadow' | 'boss'), takže kópia s inou paletou
// (napr. KAI = { ...ROSTER.boss, name: 'KAI', palette: 'hue:200' }) ich zdedí bez ďalšieho kódu.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'enemies',
  init(api) {
    const { W, GROUND, MOVE, FA, IMG, hooks, ctx } = api;
    const { rnd, chance, clamp } = api;

    // ================================================================ sprity: náhrada, kým Master nedodá sady ninja / boss
    // Bez sád: ninjovia = Šimonove sprity prefarbené kompozitnými paletami (hue-rotate by zafarbil aj pleť na modro),
    // boss = Matúškove sprity s paletou „tmavé gi, biele vlasy“. So sadou ninja: jeden ninja, farby paletou (tieň = 'shadow').
    const hasSet = id => !!(FA[id] && FA[id].anims && FA[id].anims.idle);
    function pickSprites() {
      const ninja = hasSet('ninja'), boss = hasSet('boss');
      const n = ninja ? 'ninja' : 'simon';
      return {
        hasNinja: ninja, hasBoss: boss,
        ninja_fire:   ninja ? { sprites: n } : { sprites: n, palette: 'en_fire' },     // sada ninja je natočená v žltom = ohnivý
        ninja_ice:    { sprites: n, palette: 'en_ice' },
        ninja_shadow: { sprites: n, palette: ninja ? 'en_dark' : 'en_gray' },
        boss:         boss ? { sprites: 'boss', scale: 1.15 } : { sprites: 'matusko', palette: 'en_boss', scale: 1.15 },
      };
    }
    // palety len z kompozitných režimov (fungujú aj tam, kde canvas nepozná ctx.filter); x = plátno s pôvodným pásom snímok
    function blend(steps) {
      return (x, w, h) => {
        const src = document.createElement('canvas'); src.width = w; src.height = h;
        src.getContext('2d').drawImage(x.canvas, 0, 0);
        for (const [mode, fill] of steps) {
          x.globalCompositeOperation = mode;
          if (fill === 'SRC') x.drawImage(src, 0, 0); else { x.fillStyle = fill; x.fillRect(0, 0, w, h); }
        }
        x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);   // pôvodný obrys (priehľadnosť)
        x.globalCompositeOperation = 'source-over';
      };
    }
    api.registerPalette('en_fire', blend([['hue', '#ff9d00'], ['screen', '#704000'], ['saturation', '#ff8000']]));   // žlto-oranžový
    api.registerPalette('en_ice', blend([['screen', '#2a6a9a'], ['hue', '#20b8ff']]));                               // ľadovo modrý
    api.registerPalette('en_gray', blend([['saturation', '#808080'], ['multiply', '#8a8f9a']]));                     // sivo-čierny
    api.registerPalette('en_dark', blend([['saturation', '#808080'], ['multiply', '#4a4e58']]));                     // tmavý tieň so zachovanými detailmi (žltý ninja)
    api.registerPalette('en_boss', blend([['difference', '#e6e6e6'], ['hue', 'SRC'], ['screen', '#101830']]));       // tmavé gi, biele vlasy
    api.registerPalette('en_hide', (x, w, h) => x.clearRect(0, 0, w, h));     // game.js nekreslí nič, kreslí tento modul (drawFront)

    const SP = pickSprites();
    // ♪ nepriateľov zachytáva tento modul (husle sú len poistka); moveSpecial: null = bez Šimonovho teleportu / Matúškovho tornáda z moves.js
    const COMMON = { special: 'husle', finisher: 'babality', moveSpecial: null };
    const DEFS = {
      ninja_fire: { ...COMMON, ...SP.ninja_fire, enKind: 'fire', name: 'FIRE NINJA', specialName: 'ROPE',
        gi: '#f2a516', giDark: '#b5680c', belt: '#2b1a0a', hair: '#1e1408',
        blurb: ['ROPE: vzad, vpred, úder', '„GET OVER HERE!“ FIRE KICK:', '↓, vpred, kop.'] },
      ninja_ice: { ...COMMON, ...SP.ninja_ice, enKind: 'ice', name: 'ICE NINJA', specialName: 'ICE BALL',
        gi: '#47b8ff', giDark: '#1f6fae', belt: '#e8f6ff', hair: '#10202e',
        blurb: ['ICE BALL: ↓, vpred, úder', 'zmrazí súpera.', 'SLIDE: vzad + úder + kop.'] },
      ninja_shadow: { ...COMMON, ...SP.ninja_shadow, enKind: 'shadow', name: 'SHADOW NINJA', specialName: 'VANISH',
        gi: '#4b4f5a', giDark: '#25272d', belt: '#111111', hair: '#111111',
        blurb: ['INVISIBILITY:', '↑, ↑, ↓ + KIAI.', 'Kde je? Tam je!'] },
      boss: { ...COMMON, ...SP.boss, enKind: 'boss', name: 'MASTER STORM', specialName: 'LIGHTNING', hp: 130, height: 158,
        gi: '#1d2a4a', giDark: '#111a30', belt: '#e67e22', hair: '#f4f4f4',
        blurb: ['LIGHTNING: ↓, vpred, úder', 'TELEPORT: ↓, ↑', 'TORPEDO: vzad, vzad, vpred'] },
    };
    for (const [id, def] of Object.entries(DEFS)) api.registerFighter(id, def, false);

    // ================================================================ pohyby (60 fps; časovanie si riadi háčik state)
    Object.assign(MOVE, {
      rope:      { startup: 10, active: 40, recovery: 12 },
      firekick:  { startup: 8, active: 20, recovery: 18, dmg: 11, x0: 4, x1: 72, y0: -120, y1: -50, hitstun: 20, push: 5, knock: true, sound: 'kick' },
      iceball:   { startup: 14, active: 1, recovery: 20 },
      iceslide:  { startup: 5, active: 24, recovery: 16, dmg: 10, x0: -6, x1: 66, y0: -46, y1: 0, hitstun: 18, push: 4, knock: true, sound: 'kick' },
      vanish:    { startup: 10, active: 1, recovery: 14 },
      lightning: { startup: 14, active: 1, recovery: 22 },
      warp:      { startup: 9, active: 8, recovery: 10 },
      torpedo:   { startup: 12, active: 60, recovery: 16, dmg: 12, x0: -16, x1: 58, y0: -40, y1: 14, hitstun: 22, push: 6, knock: true, sound: 'kick' },
    });
    for (const s of ['rope', 'firekick', 'iceball', 'iceslide', 'lightning', 'torpedo']) api.ATTACK_STATES.add(s);
    for (const s of ['firekick', 'iceslide', 'torpedo']) api.HIT_STATES.add(s);    // zásah rieši game.js podľa MOVE
    const bossSpecial = SP.hasBoss && FA.boss.anims.special ? 'special' : 'kiai';     // blesk z dlaní, ak ho sada bossa má
    const ANIMS = { rope: SP.hasNinja && FA.ninja.anims.special ? 'special' : 'kiai', iceball: 'kiai', vanish: 'kiai', lightning: bossSpecial, warp: 'idle', torpedo: 'kiai',
                    firekick: 'kick', iceslide: 'kick', roped: 'hit', frozen: 'hit', dazed: 'dizzy', shocked: 'hit' };
    for (const [s, a] of Object.entries(ANIMS)) api.animFallback(s, a);

    const SIG = { fire: 'rope', ice: 'iceball', shadow: 'vanish', boss: 'lightning' };   // hlavná schopnosť = aj tlačidlo ♪, cooldown v metri ŠPECIÁL
    const CD = { rope: 240, iceball: 240, vanish: 420, lightning: 180, firekick: 90, iceslide: 60, warp: 110, torpedo: 150 };
    const AI_CD = { rope: 300, iceball: 300, vanish: 560, lightning: 220, firekick: 180, iceslide: 160, warp: 240, torpedo: 300 };   // počítač navyše
    const DAZE = 40, FREEZE = 90, SHOCK = 45, INVIS = 180, GAP = 24;
    const HELD = new Set(['roped', 'frozen', 'dazed', 'shocked']);

    // ================================================================ zvuky (Master dodá rope, freeze, thunder, teleport, fireball, say_podsem)
    const has = n => !!(api.A && api.A.sounds && api.A.sounds[n]);
    const SFX_ALT = { rope: [['whoosh', 0.7], ['block', 0.35]], freeze: [['hiss', 0.45], ['block', 0.6]], thunder: [['crack', 0.8], ['boom', 0.45]],
                      teleport: [['whoosh', 0.6], ['confirm', 0.3]], fireball: [['whoosh', 0.6], ['kiai', 0.45]] };
    function snd(name, vol = 0.8) {
      if (has(name)) api.sfx(name, vol);
      else for (const [n, v] of SFX_ALT[name] || [[name, 0.8]]) api.sfx(n, v * vol / 0.8);
    }
    function shout(key, txt) { if (has('say_' + key)) api.say(key); else api.say(txt); }

    // ================================================================ pomôcky
    const mine = f => !!(f && f.def && f.def.enKind);
    const S = f => (f.def && f.def.scale) || 1;
    const hand = f => ({ x: f.x + f.facing * 52 * S(f), y: f.y - 108 * S(f) });
    const ST = F => F.en || (F.en = { proj: [], fx: [], texts: [] });
    const fight = () => api.fight;
    const projOf = (f, kind) => { const F = fight(); return F && F.en ? F.en.proj.find(p => p.owner === f && p.kind === kind && !p.dead) : null; };
    const spriteOk = f => !!(FA[f.sid] && FA[f.sid].anims && FA[f.sid].anims.idle && IMG[f.sid + '/idle']);
    function ensureOwn(f) {             // vlastná kópia def pre bojovníka (paleta sa mení počas boja, ROSTER ostane čistý)
      if (f.def.__enOwn) return;
      f.enBase = f.def.palette;
      f.def = Object.assign({}, f.def, { __enOwn: true });
    }
    const baseVuln = Object.getOwnPropertyDescriptor(api.Fighter.prototype, 'vulnerable');
    function patchVuln(f) {             // počas teleportu (keď je preč) sa nedá zasiahnuť; game.js na to nemá háčik
      if (!baseVuln || !baseVuln.get || Object.prototype.hasOwnProperty.call(f, 'vulnerable')) return;
      Object.defineProperty(f, 'vulnerable', { configurable: true,
        get() { return !(this.state === 'warp' && this.t >= 4 && this.t < 14) && baseVuln.get.call(this); } });
    }
    function burst(F, x, y, k, n) {
      const en = ST(F);
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2), v = rnd(0.6, 2.6);
        en.fx.push({ k, x: x + rnd(-8, 8), y: y + rnd(-30, 30), vx: Math.cos(a) * v, vy: Math.sin(a) * v - (k === 'smoke' ? 0.6 : 0.4),
                     t: 0, life: k === 'smoke' ? rnd(26, 40) : k === 'zap' ? rnd(6, 10) : rnd(18, 30), r: rnd(3, 7) });
      }
    }

    // ================================================================ vstup človeka (história + api.matchSeq; VZAD/VPRED relatívne k súperovi)
    function slideInput(f, c) {          // ŠMYK: VZAD + ÚDER + KOP naraz (do 8 snímok), VZAD držaný alebo tesne pred tým
      const h = c.history; if (!h || !h.length) return false;
      const last = h[h.length - 1], now = api.frame;
      if (now - last.frame > 1 || (last.btn !== 'punch' && last.btn !== 'kick')) return false;
      const other = last.btn === 'punch' ? 'kick' : 'punch';
      let both = false, back = !!(c.held && c.held[f.facing > 0 ? 'left' : 'right']);
      for (let i = h.length - 2; i >= 0 && now - h[i].frame <= GAP; i--) {
        if (h[i].btn === other && last.frame - h[i].frame <= 8) both = true;
        if (h[i].rel === 'B') back = true;
      }
      return both && back;
    }
    function detect(f, c) {
      const p = c.pressed || {}, seq = (s, g = GAP) => api.matchSeq(c, s, g);
      switch (f.def.enKind) {
        case 'fire':   if (p.special || seq(['B', 'F', 'punch'])) return 'rope'; if (seq(['down', 'F', 'kick'])) return 'firekick'; break;
        case 'ice':    if (p.special || seq(['down', 'F', 'punch'])) return 'iceball'; if (slideInput(f, c)) return 'iceslide'; break;
        case 'shadow': if (p.special || seq(['up', 'up', 'down', 'kiai'], 30)) return 'vanish'; break;
        case 'boss':
          if (p.special || seq(['down', 'F', 'punch'])) return 'lightning';
          if (seq(['down', 'up'], 16)) return 'warp';
          if (seq(['B', 'B', 'F'])) return 'torpedo';
          break;
      }
      return null;
    }
    function ready(f, mv) { return SIG[f.def.enKind] === mv ? f.cd.special === 0 : !((f.enCd || {})[mv] > 0); }
    function startMove(f, o, mv) {
      const F = fight(); if (!F || F.phase !== 'fight' || !mine(f) || !ready(f, mv)) return false;
      f.enCd = f.enCd || {};
      switch (mv) {
        case 'rope':
          if (projOf(f, 'rope')) return false;
          f.set('rope', 'rope'); f.vx = 0; snd('rope', 0.7); shout('podsem', 'Get over here!');
          ST(F).texts.push({ owner: f, txt: 'GET OVER HERE!', t: 0, life: 52, c: '#ffb21a' });
          break;
        case 'firekick': if (!f.onGround) return false; f.set('firekick', 'firekick'); f.vx = 0; break;
        case 'iceball': if (projOf(f, 'ice')) return false; f.set('iceball', 'iceball'); f.vx = 0; break;
        case 'iceslide': if (!f.onGround) return false; f.set('iceslide', 'iceslide'); f.vx = 0; break;
        case 'vanish':
          if (f.enInvis > 0) return false;
          if (f.onGround) { f.set('vanish', 'vanish'); f.vx = 0; } else becomeInvisible(f);   // vo výskoku (↑ je skok) hneď
          break;
        case 'lightning': if (projOf(f, 'bolt')) return false; f.set('lightning', 'lightning'); f.vx = 0; break;
        case 'warp': if (!f.onGround) return false; f.set('warp', 'warp'); f.vx = 0; break;
        case 'torpedo': if (!f.onGround) return false; f.set('torpedo', 'torpedo'); f.vx = 0; f.enFly = false; f.enFlyEnd = null; break;
        default: return false;
      }
      if (SIG[f.def.enKind] === mv) f.cd.special = CD[mv]; else f.enCd[mv] = CD[mv];
      return true;
    }
    // idle/walk/block: najprv kombá nepriateľov (pred moves.js, aby ↓ VPRED + ÚDER nebol uppercut)
    hooks.input.unshift((f, o, inp) => {
      if (!mine(f)) return false;
      const F = fight(); if (!F || F.phase !== 'fight' || !inp || !inp.pressed) return false;
      let mv = null;
      if (inp instanceof api.CPU) { const it = inp.enIntent; if (it && it.frame === api.frame) mv = it.move; inp.enIntent = null; }
      else mv = detect(f, inp);
      if (mv && startMove(f, o, mv)) return true;
      return !!inp.pressed.special;      // ♪ nepriateľa nikdy nespustí husle (počítač ♪ používa len cez enIntent)
    });

    // ================================================================ stavy (útočník aj zasiahnutý súper)
    function becomeInvisible(f) { f.enInvis = INVIS; const F = fight(); if (F) burst(F, f.x, f.y - 70 * S(f), 'smoke', 18); snd('teleport', 0.5); }
    function spawnRope(f) { const h = hand(f); ST(fight()).proj.push({ kind: 'rope', owner: f, x: h.x, y: h.y, hx: h.x, hy: h.y, dir: f.facing, st: 'out', t: 0 }); }
    function spawnBall(f, kind) {
      const h = hand(f);
      ST(fight()).proj.push({ kind, owner: f, x: h.x, y: h.y, vx: f.facing * (kind === 'ice' ? 4.6 : 9.5), dir: f.facing, r: kind === 'ice' ? 9 : 7, t: 0 });
      if (kind === 'ice') snd('freeze', 0.45); else snd('thunder', 0.7);
    }
    hooks.state.push((f, o) => {
      const F = fight(); if (!F) return false;
      const m = MOVE[f.state];
      switch (f.state) {
        case 'rope': {                   // stojí s napriahnutou rukou, kým lano letí / ťahá
          f.vx *= 0.7;
          const end = m.startup + m.active;
          if (f.t === m.startup) spawnRope(f);
          if (f.t > m.startup && f.t < end) { if (projOf(f, 'rope')) f.t = Math.min(f.t, end - 2); else f.t = end; }
          if (f.t >= end + m.recovery) f.set('idle');
          return true;
        }
        case 'iceball': case 'lightning': case 'vanish': {
          f.vx *= 0.7;
          if (f.t === m.startup) { if (f.state === 'iceball') spawnBall(f, 'ice'); else if (f.state === 'lightning') spawnBall(f, 'bolt'); else becomeInvisible(f); }
          if (f.state === 'lightning' && f.t < m.startup && f.t % 3 === 0) { const h = hand(f); burst(F, h.x, h.y + 30, 'zap', 2); }
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'firekick': {               // krátky skok s horiacou nohou
          const a1 = m.startup + m.active;
          if (f.t === m.startup) { f.vx = f.facing * 5.6; f.vy = -2.6; snd('fireball', 0.7); }
          if (f.t >= m.startup && f.t < a1) {
            if (f.hitDone) f.vx *= 0.6;
            const ex = ST(F).fx;
            for (let i = 0; i < 2; i++) ex.push({ k: 'flame', x: f.x + f.facing * rnd(34, 64) * S(f), y: f.y - rnd(95, 150) * S(f), vx: -f.facing * rnd(0.8, 2), vy: -rnd(0.3, 1.2), t: 0, life: rnd(14, 24), r: rnd(3, 6) });
          }
          if (f.t >= a1) f.vx *= 0.8;
          if (f.t >= a1 + m.recovery && f.onGround) { f.set('idle'); f.vx = 0; }
          return true;
        }
        case 'iceslide': {               // nízko po zemi, nohami napred
          const a1 = m.startup + m.active;
          if (f.t === m.startup) { f.vx = f.facing * 6.5; api.sfx('whoosh', 0.5); }
          if (f.t > m.startup && f.t < a1) {
            if (f.hitDone) f.vx *= 0.6;
            if (f.t % 2 === 0) ST(F).fx.push({ k: 'frost', x: f.x - f.facing * rnd(0, 20), y: GROUND - rnd(1, 8), vx: -f.facing * 0.4, vy: -rnd(0.1, 0.6), t: 0, life: 24 });
          }
          if (f.t >= a1) f.vx *= 0.75;
          if (f.t >= a1 + m.recovery) { f.set('idle'); f.vx = 0; }
          return true;
        }
        case 'warp': {                   // zmizne v blesku a objaví sa za chrbtom súpera
          f.vx = 0;
          if (f.t === 1) { snd('teleport'); burst(F, f.x, f.y - 70 * S(f), 'zap', 12); }
          if (f.t === m.startup) {
            const dir = Math.sign(o.x - f.x) || f.facing;
            f.x = clamp(o.x + dir * 58, 24, W - 24); f.y = GROUND; f.vy = 0;
            f.facing = o.x >= f.x ? 1 : -1;
            burst(F, f.x, f.y - 70 * S(f), 'zap', 12);
          }
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'torpedo': {                // nabitie, potom let vodorovne nízko nad zemou, kým nezasiahne alebo nenarazí do kraja
          const a1 = m.startup + m.active;
          if (f.t < m.startup) { f.vx = 0; if (f.t % 2 === 0) burst(F, f.x + f.facing * 20, f.y - rnd(40, 120) * S(f), 'zap', 1); }
          if (f.t === m.startup) { f.enFly = true; f.enFlyEnd = null; snd('thunder', 0.6); }
          if (f.enFly) {
            const wall = (f.facing > 0 && f.x >= W - 24) || (f.facing < 0 && f.x <= 24);
            if (f.enFlyEnd || wall || f.t >= a1 - 1) {
              f.enFly = false; f.t = Math.max(f.t, a1);
              f.vx = f.enFlyEnd === 'blocked' ? -f.facing * 2.5 : f.enFlyEnd === 'hit' ? -f.facing * 0.6 : 0; f.vy = -1.5;
            } else {
              f.y = GROUND - 14; f.vy = 0; f.vx = f.facing * 8;
              if (f.t % 2 === 0) ST(F).fx.push({ k: 'zap', x: f.x - f.facing * rnd(20, 60), y: GROUND - rnd(20, 50), vx: 0, vy: 0, t: 0, life: 8, r: 6 });
            }
          }
          if (f.t >= a1) f.vx *= 0.9;
          if (f.t >= a1 + m.recovery && f.onGround) { f.set('idle'); f.vx = 0; }
          return true;
        }
        // ---- zasiahnutý súper (akákoľvek postava)
        case 'roped': {                  // lano ho ťahá k ninjovi, potom je omráčený
          const by = f.enBy;
          if (!by || by.state !== 'rope') { f.set('idle'); return true; }
          const tx = clamp(by.x + by.facing * 62, 22, W - 22), dx = tx - f.x;
          f.vx = Math.sign(dx) * Math.min(Math.abs(dx), 10);
          if (Math.abs(dx) <= 10 && f.onGround) { f.set('dazed'); f.stun = DAZE; f.enBy = by; f.enStamp = api.frame; }
          return true;
        }
        case 'dazed': f.vx *= 0.6; if (--f.stun <= 0) f.set('idle'); return true;
        case 'shocked': f.vx *= 0.8; if (--f.stun <= 0) f.set('idle'); return true;
        case 'frozen':
          f.vx *= 0.9; f.t = 10;         // socha: animácia zásahu stojí na jednej snímke
          if (--f.stun <= 0) { f.set('idle'); burst(F, f.x, f.y - 70 * S(f), 'shard', 14); api.sfx('block', 0.5); }
          return true;
      }
      return false;
    });

    hooks.afterHit.push((a, d, m, blocked) => {
      const F = fight(); if (!F || !m) return;
      switch (m.name) {
        case 'rope': {
          const p = projOf(a, 'rope');
          if (blocked || d.hp <= 0 || F.phase !== 'fight' || d.state === 'dizzy') { if (p) p.st = 'back'; return; }
          d.set('roped'); d.enBy = a; d.vx = 0; d.vy = 0; d.stun = 0;    // aj zo vzduchu (bez vyhodenia hore)
          if (p) { p.st = 'pull'; p.victim = d; }
          break;
        }
        case 'iceball':
          if (!blocked && d.state === 'frozen') { d.stun = FREEZE; d.vx = a.facing * 0.6; d.enBy = a; d.enStamp = api.frame; snd('freeze'); burst(F, d.x, d.y - 80 * S(d), 'shard', 12); }
          break;
        case 'lightning':
          if (!blocked && d.state === 'shocked') { d.stun = SHOCK; d.enBy = a; d.enStamp = api.frame; F.flash = Math.max(F.flash, 4); api.shake(5); }
          break;
        case 'torpedo': a.enFlyEnd = blocked ? 'blocked' : 'hit'; break;
        case 'firekick': case 'iceslide': a.vx = blocked ? -a.facing * 1.5 : a.vx * 0.2; break;
      }
    });

    // ================================================================ strely, časovače, vstupy, ktoré game.js háčiku input nepošle
    function hitsBody(o, x, r) {         // ako noty a lúč KIAI v game.js: vodorovne pri tele, súper nie je vysoko vo výskoku
      return o.vulnerable && o.state !== 'dizzy' && Math.abs(o.x - x) < 17 + r && o.y > GROUND - 58;
    }
    function updateRope(F, p, f, o) {
      const h = hand(f); p.hx = h.x; p.hy = h.y;
      if (f.state !== 'rope') { p.dead = true; if (p.victim && p.victim.state === 'roped') p.victim.set('idle'); return; }
      if (p.st === 'out') {
        p.x += p.dir * 12; p.y = h.y;
        if (F.phase === 'fight' && hitsBody(o, p.x, 6)) {
          api.applyHit(f, o, { name: 'rope', dmg: 5, effect: 'roped', sound: 'punch', push: 0, sx: p.x, sy: p.y });
          if (p.st === 'out') p.st = 'back';               // blok alebo K.O. → lano sa vráti
        } else if (Math.abs(p.x - h.x) > 330 || p.x < 4 || p.x > W - 4) p.st = 'back';
      } else if (p.st === 'back') {
        const dx = h.x - p.x; p.x += Math.sign(dx) * Math.min(Math.abs(dx), 18); p.y = h.y;
        if (Math.abs(dx) < 2) p.dead = true;
      } else {
        const v = p.victim;
        if (!v || v.state !== 'roped') p.dead = true;
        else { p.x = v.x - p.dir * 6; p.y = v.y - 96 * S(v); }
      }
    }
    hooks.frame.push(() => {
      if (api.NET && api.NET.role === 'guest') return;            // sieťový hosť len kreslí stav od hostiteľa
      const F = fight(); if (!F || api.scene !== 'fight' || F.paused) return;
      const en = ST(F);
      for (const f of F.fighters) {
        for (const cd of [f.enCd, f.enAiCd]) if (cd) for (const k in cd) if (cd[k] > 0) cd[k]--;
        if (f.enInvis > 0) f.enInvis--;
      }
      if (F.phase === 'fight') for (let i = 0; i < 2; i++) {          // človek: ↑↑↓+KIAI vo výskoku, ÚDER+KOP tesne po sebe (prvé tlačidlo už začalo útok)
        const f = F.fighters[i], o = F.fighters[1 - i], c = f.ctl;
        if (!mine(f) || !c || c instanceof api.CPU || !c.history) continue;
        if (f.def.enKind === 'shadow' && f.state === 'jump' && api.matchSeq(c, ['up', 'up', 'down', 'kiai'], 30)) startMove(f, o, 'vanish');
        if (f.def.enKind === 'ice' && (f.state === 'punch' || f.state === 'kick') && f.t <= 6 && !f.hitDone && slideInput(f, c)) startMove(f, o, 'iceslide');
      }
      if (F.phase !== 'fight' && F.phase !== 'roundEnd') en.proj.length = 0;   // FINISH HIM a zakončenia: strely zmiznú
      for (const p of en.proj) {
        p.t++;
        const f = p.owner, o = F.fighters[1 - f.side];
        if (p.kind === 'rope') { updateRope(F, p, f, o); continue; }
        p.x += p.vx;
        if (p.kind === 'ice' && p.t % 2 === 0) en.fx.push({ k: 'frost', x: p.x - p.vx * 2, y: p.y + rnd(-6, 6), vx: -p.vx * 0.1, vy: rnd(-0.4, 0.4), t: 0, life: 22 });
        if (F.phase === 'fight' && hitsBody(o, p.x, p.r)) {
          p.dead = true;
          if (p.kind === 'ice') {
            if (o.state === 'frozen') burst(F, p.x, p.y, 'shard', 8);       // druhá guľa na zmrazeného sa len roztriešti
            else api.applyHit(f, o, { name: 'iceball', dmg: 7, effect: 'frozen', sound: 'block', push: 1, sx: p.x, sy: p.y });
          } else api.applyHit(f, o, { name: 'lightning', dmg: 9, effect: 'shocked', sound: 'punch', push: 2, sx: p.x, sy: p.y });
        }
        if (p.x < -40 || p.x > W + 40) p.dead = true;
      }
      en.proj = en.proj.filter(p => !p.dead);
      for (const q of en.fx) { q.t++; q.x += q.vx; q.y += q.vy; if (q.k === 'shard') q.vy += 0.2; if (q.k === 'flame') q.vy -= 0.03; }
      en.fx = en.fx.filter(q => q.t < q.life);
      for (const tx of en.texts) tx.t++;
      en.texts = en.texts.filter(tx => tx.t < tx.life);
    });

    hooks.matchStart.push(F => {
      F.en = { proj: [], fx: [], texts: [] };
      for (const f of F.fighters) if (mine(f)) { ensureOwn(f); patchVuln(f); }
    });
    hooks.roundStart.push(F => {
      const en = ST(F); en.proj.length = 0; en.fx.length = 0; en.texts.length = 0;
      for (const f of F.fighters) {
        Object.assign(f, { enInvis: 0, enCd: {}, enAiCd: {}, enAi: null, enBy: null, enFly: false, enFlyEnd: null, enMode: null });
        if (mine(f)) { ensureOwn(f); f.def.palette = f.enBase; }
      }
    });

    // ================================================================ počítač: schopnosti s rozvahou (cooldowny, náhoda podľa úrovne)
    function intent(c, f, mv) { c.enIntent = { move: mv, frame: api.frame }; f.enAiCd[mv] = AI_CD[mv]; return { held: {}, pressed: {} }; }
    function choose(f, o, d, lv) {
      const ok = mv => ready(f, mv) && !(f.enAiCd[mv] > 0);
      const busy = HELD.has(o.state) || !o.vulnerable || o.state === 'dizzy';
      switch (f.def.enKind) {
        case 'fire':
          if (!busy && ok('rope') && d >= 110 && d <= 320 && chance(0.55 * lv)) return 'rope';
          if (!busy && ok('firekick') && d >= 60 && d <= 150 && o.onGround && chance(0.4 * lv)) return 'firekick';
          break;
        case 'ice':
          if (!busy && ok('iceball') && d >= 100 && chance(0.5 * lv)) return 'iceball';
          if (!busy && ok('iceslide') && d >= 70 && d <= 170 && o.onGround && chance(0.4 * lv)) return 'iceslide';
          break;
        case 'shadow':
          if (ok('vanish') && !(f.enInvis > 0) && d >= 80 && chance(0.45 * lv)) return 'vanish';
          break;
        case 'boss':
          // nové pohyby z moves.js (letiaci kop, kombá) ťahajú počítač k súperovi → schopnosti bossa aj na kratšiu vzdialenosť
          if (!busy && ok('lightning') && d >= 70 && chance(0.75 * lv)) return 'lightning';
          if (!busy && ok('torpedo') && d >= 90 && d <= 330 && o.onGround && !o.attacking && chance(0.5 * lv)) return 'torpedo';
          if (ok('warp') && (d >= 130 || (d < 60 && chance(0.25))) && chance(0.3 * lv)) return 'warp';
          break;
      }
      return null;
    }
    hooks.cpu.unshift((c, f, o, phase) => {
      if (!mine(f) || phase !== 'fight') return null;
      const ai = f.enAi || (f.enAi = { next: 60, key: null, go: false });
      f.enAiCd = f.enAiCd || {};
      const lv = clamp(c.level || 0.6, 0.3, 1.3);
      const d = Math.abs(o.x - f.x), toward = o.x > f.x ? 'right' : 'left';
      const free = f.state === 'idle' || f.state === 'walk' || f.state === 'block';
      // súper je mnou omráčený / zmrazený / v elektrine → dobehni a udri (rozhodne sa raz, nie vždy)
      if (HELD.has(o.state) && o.state !== 'roped' && o.enBy === f) {
        const key = o.state + o.enStamp;
        if (ai.key !== key) { ai.key = key; ai.go = chance(0.45 + 0.35 * lv); }
        if (!ai.go) return null;
        if (!free) return { held: {}, pressed: {} };
        if (d > 74) return { held: { [toward]: true }, pressed: {} };
        if (MOVE.uppercut && api.ATTACK_STATES.has('uppercut') && chance(0.6)) return { held: { down: true }, pressed: { punch: true } };
        return { held: {}, pressed: chance(0.6) ? { kick: true } : { punch: true } };
      }
      // MAJSTER MRAK občas uhne teleportom pred skokom alebo KIAI súpera (raz za udalosť)
      if (f.def.enKind === 'boss' && free && o.t === 3 && ['jump', 'kiai', 'special'].includes(o.state) && d > 70 && ready(f, 'warp') && !(f.enAiCd.warp > 0)
          && chance(0.2 + 0.2 * lv)) return intent(c, f, 'warp');
      if (ai.next > 0) { ai.next--; return null; }
      if (!free) return null;
      ai.next = Math.round(rnd(34, 80) / lv);
      const mv = choose(f, o, d, lv);
      return mv ? intent(c, f, mv) : null;
    });

    // ================================================================ kreslenie
    function baseStrip(f, name) {        // pás snímok v pôvodnej palete bojovníka (game.js práve kreslí skrytú)
      const raw = IMG[f.sid + '/' + name]; if (!raw) return null;
      return f.enBase ? api.paletteStrip({ def: { palette: f.enBase }, sid: f.sid }, name, raw) : raw;
    }
    function drawMode(f) {               // null = kreslí game.js; inak tento modul (priehľadnosť, otočenie, iná snímka)
      const st = f.state, m = MOVE[st];
      if (st === 'warp') return { alpha: f.t < m.startup ? 1 - f.t / m.startup : f.t < m.startup + m.active ? (f.t - m.startup) / m.active : 1 };
      if (st === 'torpedo' && f.enFly && !FA[f.sid].anims.torpedo) {     // vlastná animácia 'torpedo' v sade má prednosť
        const set = FA[f.sid].anims, an = set.win ? 'win' : 'punch';
        return { anim: an, frame: Math.round((set[an].frames - 1) * (an === 'win' ? 0.33 : 0.4)), rot: Math.PI / 2, cy: GROUND - 34 };
      }
      if (st === 'iceslide' && f.t >= m.startup && f.t < m.startup + m.active && !FA[f.sid].anims.iceslide) {
        const set = FA[f.sid].anims;
        if (set.fall) return { anim: 'fall', frame: Math.round((set.fall.frames - 1) * 0.385), rot: 0.3, cy: GROUND - 47 };
      }
      if (f.enInvis > 0 && api.fight && api.fight.phase === 'fight') {   // po kole (WINS, FINISH HIM) je vidieť
        const blink = f.flash > 0 || f.enInvis % 55 < 4 || (f.enInvis < 16 && f.enInvis % 4 < 2);
        return { alpha: blink ? 0.6 : 0.07 };
      }
      return null;
    }
    hooks.drawBack.push((stage, F) => {   // pred kreslením postáv: nepriateľ v špeciálnom režime je pre game.js priehľadný
      for (const f of F.fighters) {
        if (!mine(f)) continue;
        ensureOwn(f);
        const md = spriteOk(f) ? drawMode(f) : null;
        f.def.palette = md ? 'en_hide' : f.enBase;
        f.enMode = md;
      }
    });
    function drawSelf(f, md) {
      const set = FA[f.sid] && FA[f.sid].anims;
      let an, fr;
      if (md.anim && set && set[md.anim] && IMG[f.sid + '/' + md.anim]) { an = { name: md.anim, a: set[md.anim] }; fr = md.frame || 0; }
      else { an = api.animFor(f); if (!an) return; fr = api.frameOf(f, an); }
      const img = baseStrip(f, an.name); if (!img) return;
      const a = an.a, sc = a.scale || 1, s = S(f);
      ctx.save();
      ctx.globalAlpha = md.alpha == null ? 1 : clamp(md.alpha, 0, 1);
      if (md.rot) {                      // otočenie okolo stredu postavy (torpédo naležato, šmyk v záklone)
        const half = a.h * sc * s * 0.5;
        ctx.translate(Math.round(f.x), Math.round(md.cy != null ? md.cy : f.y - half));
        ctx.rotate(md.rot * f.facing); ctx.translate(0, half);
      } else ctx.translate(Math.round(f.x), Math.round(f.y));
      if (f.facing < 0) ctx.scale(-1, 1);
      if (s !== 1) ctx.scale(s, s);
      ctx.drawImage(img, fr * a.w, 0, a.w, a.h, Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc));
      ctx.restore();
    }
    const TINT = new WeakMap();          // zafarbené snímky (ľad, elektrina) podľa pásu a snímky
    function tinted(img, a, fr, col) {
      let mp = TINT.get(img); if (!mp) TINT.set(img, (mp = new Map()));
      const key = col + '|' + fr; let c = mp.get(key);
      if (!c) {
        c = document.createElement('canvas'); c.width = a.w; c.height = a.h;
        const x = c.getContext('2d');
        x.drawImage(img, fr * a.w, 0, a.w, a.h, 0, 0, a.w, a.h);
        x.globalCompositeOperation = 'source-atop'; x.fillStyle = col; x.fillRect(0, 0, a.w, a.h);
        mp.set(key, c);
      }
      return c;
    }
    function drawTint(f, col, alpha) {
      const an = api.animFor(f); if (!an || !an.img) return false;
      const a = an.a, fr = api.frameOf(f, an), sc = a.scale || 1, s = S(f);
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(Math.round(f.x), Math.round(f.y));
      if (f.facing < 0) ctx.scale(-1, 1);
      if (s !== 1) ctx.scale(s, s);
      ctx.drawImage(tinted(an.img, a, fr, col), Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc));
      ctx.restore(); return true;
    }
    function crystal(x, y, r, a) {
      ctx.globalAlpha = 0.45 + 0.55 * a; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.45, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.45, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#bfefff'; ctx.fillRect(Math.round(x - r), Math.round(y), Math.round(r * 2), 1);
    }
    function zig(x0, y0, x1, y1, n, amp) {
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let i = 1; i < n; i++) { const k = i / n; ctx.lineTo(x0 + (x1 - x0) * k + rnd(-amp, amp), y0 + (y1 - y0) * k + rnd(-amp, amp)); }
      ctx.lineTo(x1, y1);
    }
    function bolt(x0, y0, x1, y1, n, amp, wide) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      zig(x0, y0, x1, y1, n, amp);
      ctx.strokeStyle = 'rgba(110,170,255,0.45)'; ctx.lineWidth = wide; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.2, wide / 4); ctx.stroke();
    }
    function drawFrozen(f) {
      const s = S(f), h = (f.def.height || 138) * s;
      if (!drawTint(f, 'rgba(140,215,255,0.62)', 0.95)) { ctx.fillStyle = 'rgba(160,220,255,0.45)'; ctx.fillRect(f.x - 22, f.y - h, 44, h); }
      ctx.save();
      for (let i = 0; i < 10; i++) {    // kryštáliky na pevných miestach, blikajú
        const ang = i * 2.39996, x = f.x + Math.cos(ang) * (12 + (i * 7) % 14), y = f.y - 12 - ((i * 41) % 100) / 100 * (h - 20);
        crystal(x, y, 3 + 2 * ((Math.sin(api.frame / 5 + i * 1.7) + 1) / 2), (Math.sin(api.frame / 7 + i) + 1) / 2);
      }
      ctx.restore();
    }
    function drawShocked(f) {
      const s = S(f), h = (f.def.height || 138) * s;
      if (Math.floor(f.t / 3) % 2 === 0) drawTint(f, 'rgba(255,250,170,0.7)', 0.9);
      ctx.save();
      for (let k = 0; k < 3; k++) { const y = f.y - rnd(15, h - 10); bolt(f.x - rnd(14, 26), y, f.x + rnd(14, 26), y + rnd(-18, 18), 4, 5, 4); }
      ctx.restore();
    }
    function drawProj(en) {
      for (const p of en.proj) {
        ctx.save();
        if (p.kind === 'rope') {         // lano s hrotom (kunai)
          const x0 = p.hx, y0 = p.hy, x1 = p.x, y1 = p.y;
          ctx.lineCap = 'round';
          ctx.strokeStyle = '#2a1a0c'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          ctx.strokeStyle = '#d9a35a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          ctx.strokeStyle = '#8a5a26'; ctx.lineWidth = 2; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
          const d = p.dir;
          ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.moveTo(x1 + d * 12, y1); ctx.lineTo(x1 - d * 3, y1 - 6); ctx.lineTo(x1 - d * 3, y1 + 6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.moveTo(x1 + d * 10, y1); ctx.lineTo(x1 - d * 1, y1 - 4); ctx.lineTo(x1 - d * 1, y1 + 4); ctx.closePath(); ctx.fill();
        } else if (p.kind === 'ice') {   // ľadová guľa
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
          g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(160,225,255,0.95)'); g.addColorStop(1, 'rgba(60,150,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 4; i++) { const a = p.t / 5 + i * Math.PI / 2; crystal(p.x + Math.cos(a) * p.r * 1.3, p.y + Math.sin(a) * p.r * 1.3, 3, 1); }
        } else {                         // blesk
          const tail = p.x - p.dir * 64;
          bolt(tail, p.y + rnd(-4, 4), p.x, p.y, 6, 7, 7);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
          g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(150,200,255,0.8)'); g.addColorStop(1, 'rgba(60,120,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }
    function drawFx(en) {
      ctx.save();
      for (const q of en.fx) {
        const k = q.t / q.life, a = 1 - k;
        if (q.k === 'flame') {
          ctx.globalAlpha = a; ctx.fillStyle = k < 0.15 ? '#fff3a0' : k < 0.45 ? '#ffb21a' : '#ff4a12';
          ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, q.r * (1 - k * 0.7)), 0, Math.PI * 2); ctx.fill();
        } else if (q.k === 'frost') { ctx.globalAlpha = a; ctx.fillStyle = '#dff6ff'; ctx.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
        else if (q.k === 'shard') { ctx.globalAlpha = a; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 2, 3, 4); }
        else if (q.k === 'smoke') { ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#5a5d66'; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 + k * 2), 0, Math.PI * 2); ctx.fill(); }
        else if (q.k === 'zap') { ctx.globalAlpha = a; bolt(q.x - q.r, q.y + rnd(-q.r, q.r), q.x + q.r, q.y + rnd(-q.r, q.r), 3, 3, 3); }
      }
      ctx.restore();
    }
    hooks.drawFront.push((stage, F) => {
      const en = ST(F);
      for (const f of F.fighters) {
        if (f.enMode) drawSelf(f, f.enMode);
        if (f.state === 'frozen') drawFrozen(f);
        else if (f.state === 'shocked') drawShocked(f);
        else if (f.state === 'dazed') api.drawStars(f);
        if (f.state === 'firekick' && f.t >= MOVE.firekick.startup && f.t < MOVE.firekick.startup + MOVE.firekick.active) {
          const x = f.x + f.facing * 58 * S(f), y = f.y - 132 * S(f), r = 13 + Math.sin(f.t) * 2;   // chodidlo vysokého kopu
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(0.4, 'rgba(255,170,30,0.9)'); g.addColorStop(1, 'rgba(255,60,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        if (f.state === 'torpedo' && f.enFly) { ctx.save(); for (let i = 0; i < 2; i++) bolt(f.x - f.facing * rnd(30, 80), GROUND - rnd(24, 44), f.x + f.facing * 20, GROUND - rnd(26, 40), 5, 6, 4); ctx.restore(); }
      }
      drawProj(en); drawFx(en);
      for (const tx of en.texts) {
        const o = tx.owner, a = tx.t > tx.life - 10 ? (tx.life - tx.t) / 10 : 1;
        ctx.save(); ctx.globalAlpha = a; api.text(tx.txt, o.x, o.y - 150 * S(o) - tx.t * 0.15, 12, 'center', tx.c); ctx.restore();
      }
    });
    const MOVES_TXT = { fire: 'ROPE: VZAD VPRED ÚDER · FIRE KICK: ↓ VPRED KOP', ice: 'ICE BALL: ↓ VPRED ÚDER · SLIDE: VZAD + ÚDER + KOP',   // mená po anglicky (Peťo)
                        shadow: 'INVISIBILITY: ↑ ↑ ↓ + KIAI', boss: 'LIGHTNING: ↓ VPRED ÚDER · TELEPORT: ↓ ↑ · TORPEDO: VZAD VZAD VPRED' };
    hooks.drawHud.push(F => {            // nápoveda kombá v 1. kole pre človeka, ktorý hrá za nepriateľa
      if (F.round !== 1 || !(F.phase === 'intro' || (F.phase === 'fight' && F.t < 240))) return;
      F.fighters.forEach((f, i) => {
        if (!mine(f) || api.inputKind(i) === 'cpu') return;
        api.text(MOVES_TXT[f.def.enKind], i === 0 ? 8 : W - 30, 254, 7, i === 0 ? 'left' : 'right', '#ffe08a');   // vpravo mimo tlačidla hudby
      });
    });

    // pre ladder.js a testy
    api.enemies = {
      ids: Object.keys(DEFS), sprites: SP, moves: Object.keys(CD),
      help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — ako api.moves.help (OVLÁDANIE, COMBOS.md)
        ['ROPE (FIRE NINJA)', 'VZAD VPRED F', 'VZAD VPRED K', '◀ ▶ □', 'vzad, vpred + ÚDER'],
        ['FIRE KICK', 'S VPRED G', '↓ VPRED L', '↓ ▶ ✕', 'dole, vpred + KOP'],
        ['ICE BALL (ICE NINJA)', 'S VPRED F', '↓ VPRED K', '↓ ▶ □', 'dole, vpred + ÚDER'],
        ['SLIDE (ICE NINJA)', 'VZAD + F + G', 'VZAD + K + L', '◀ + □ + ✕', 'vzad + ÚDER + KOP'],
        ['INVISIBILITY (SHADOW)', 'W W S R', '↑ ↑ ↓ I', '▲ ▲ ▼ ○', 'hore, hore, dole + KIAI'],
        ['LIGHTNING (MASTER STORM)', 'S VPRED F', '↓ VPRED K', '↓ ▶ □', 'dole, vpred + ÚDER'],
        ['TELEPORT (STORM)', 'S W', '↓ ↑', '▼ ▲', 'dole, hore'],
        ['TORPEDO (STORM)', 'VZAD VZAD VPRED', 'VZAD VZAD VPRED', '◀ ◀ ▶', 'vzad, vzad, vpred'],
      ],
      force(f, mv, ignoreCd = false) {   // spustí schopnosť (test, scény); bez cooldownu, ak ignoreCd
        const F = fight(); if (!F) return false;
        if (ignoreCd) { f.cd.special = 0; f.enCd = {}; }
        return startMove(f, F.fighters[1 - f.side], mv);
      },
    };
  },
});
