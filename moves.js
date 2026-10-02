// MATÚŠKO KOMBAT XII — modul moves: MK2 pohyby: uppercut, podkop, letiaci kop, kombá, špeciály (P1)
//
//   UPPERCUT ...... ↓ + ÚDER          vyhodí súpera do vzduchu, zasiahne aj skákajúceho (anti-air), blokovateľný
//   PODKOP ........ ↓ + KOP           nízko pri zemi, zrazí; skokom sa mu dá vyhnúť
//   LETIACI KOP ... VPRED VPRED KOP   letí nízko k súperovi, zrazí
//   KOMBO 3 ....... ÚDER ÚDER KOP     2. úder sa napojí počas 1. (aj trochu skôr alebo neskôr), kop zrazí; namiesto kopu aj ↓+ÚDER
//   TORNÁDO ....... ↓ VPRED KOP       len Matúško: točenie, 3 zásahy, cooldown
//   TELEPORT ...... ↓ ↑               len Šimon: prepadne sa pod zem a vynorí sa za súperom, cooldown
//
// Univerzálne pre všetkých bojovníkov. Postava môže v def mať:
//   moves: ['uppercut', 'sweep', 'flykick', 'combo']  — povolené univerzálne pohyby (bez poľa = všetky)
//   moveSpecial: 'tornado' | 'teleport' | null         — vlastný pohybový špeciál (bez poľa: podľa id, potom podľa def.sprites)
// Vstup číta len cez inp / f.ctl (held, pressed, history) a api.matchSeq — funguje na klávesnici, ovládači, joysticku aj cez sieť.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'moves',
  init(api) {
    const { MOVE, ATTACK_STATES, HIT_STATES, GROUND, W } = api;
    const SEQ_GAP = 15;        // max. snímok medzi stlačeniami v sekvencii (benevolentné pre deti a joystick na mobile)
    const BUFFER = 15;         // kombo: priskoro stlačený ďalší článok si pamätáme toľkoto snímok
    const LATE = 10;           // kombo: o koľko snímok po skončení úderu sa ešte dá napojiť
    const SPECIAL_CD = 240;    // cooldown pohybového špeciálu (TORNÁDO, TELEPORT)
    const GRAV = 0.38;         // gravitácia z game.js (letiaci kop drží výšku proti nej)
    const FLY_H = 30, FLY_V = 5, FLY_LAND = 18;           // letiaci kop: výška, rýchlosť, zotavenie po dopade
    const TELE = { sink: 10, rise: 10, rec: 8, depth: 170, behind: 62 };
    const FREE = new Set(['idle', 'walk', 'block']);
    const LINKS = { punch: 9, punch2: 7 };                // článok komba → od ktorej snímky sa dá napojiť ďalší (po aktívnych snímkach)
    const SPECIAL_BY = { matusko: 'tornado', simon: 'teleport' };
    const SPECIAL_LABEL = { tornado: 'TORNADO', teleport: 'TELEPORT' };

    // ------------------------------------------------------------------ dáta útokov (x/y = zásahová zóna voči chodidlám a smeru pohľadu)
    Object.assign(MOVE, {
      uppercut: { startup: 8, active: 5, recovery: 26, dmg: 14, x0: 6, x1: 64, y0: -150, y1: -60, hitstun: 20, push: 2, sound: 'kick', launch: 8, type: 'punch' },
      sweep:    { startup: 10, active: 6, recovery: 24, dmg: 9, x0: 10, x1: 84, y0: -40, y1: 0, hitstun: 20, push: 2, sound: 'kick', knock: true, launch: 3, type: 'kick' },
      flykick:  { startup: 6, active: 24, recovery: 30, dmg: 9, x0: 4, x1: 64, y0: -112, y1: -28, hitstun: 20, push: 3.4, sound: 'kick', knock: true, type: 'kick' },
      punch2:   { startup: 4, active: 4, recovery: 14, dmg: 5, x0: 10, x1: 74, y0: -126, y1: -88, hitstun: 18, push: 2.2, sound: 'punch', type: 'punch' },
      combo3:   { startup: 7, active: 6, recovery: 20, dmg: 10, x0: 10, x1: 92, y0: -130, y1: -60, hitstun: 20, push: 3.6, sound: 'kick', knock: true, type: 'kick' },
      tornado:  { startup: 12, active: 30, recovery: 18, dmg: 4, x0: -12, x1: 60, y0: -124, y1: -40, hitstun: 22, push: 1.4, sound: 'kick', type: 'kick' },
    });
    MOVE.tornado3 = { ...MOVE.tornado, push: 3, knock: true };     // tretí zásah tornáda zrazí (rovnaké časovanie)
    for (const s of ['uppercut', 'sweep', 'flykick', 'tornado']) { ATTACK_STATES.add(s); HIT_STATES.add(s); }
    api.animFallback('uppercut', 'punch');
    api.animFallback('sweep', 'kick');
    api.animFallback('flykick', 'airkick');   // → kick (game.js); keď pribudne sprite airkick, použije sa
    api.animFallback('tornado', 'kick');
    api.animFallback('teleport', 'idle');

    // ------------------------------------------------------------------ pomôcky
    const isCpu = f => f.ctl instanceof api.CPU;
    const can = (f, name) => !(f.def && Array.isArray(f.def.moves)) || f.def.moves.includes(name);
    function specialOf(f) {
      const d = f.def || {};
      if ('moveSpecial' in d) return d.moveSpecial || null;
      return SPECIAL_BY[f.id] || SPECIAL_BY[d.sprites] || null;
    }
    const ready = f => !(f.cd && f.cd.move > 0);
    const seq = (inp, s) => !!(inp && inp.history && api.matchSeq(inp, s, SEQ_GAP));   // CPU nemá históriu → false
    const allowed = (F, f) => F.phase === 'fight' || (F.phase === 'finish' && f.side === F.winner);

    // ďalší článok komba podľa práve stlačených tlačidiel (cur = práve bežiaci alebo práve skončený článok)
    function nextLink(f, cur, p, h) {
      if (!p) return null;
      const up = !!(h && h.down) && can(f, 'uppercut');
      if (cur === 'punch' && p.punch) return up ? 'uppercut' : 'punch2';
      if (cur === 'punch2' && p.punch && up) return 'uppercut';
      if (cur === 'punch2' && p.kick) return 'combo3';
      return null;
    }

    // ------------------------------------------------------------------ štart pohybov
    function start(f, o, name) {
      if (o) f.facing = o.x >= f.x ? 1 : -1;
      f.vx = 0; f.mvCombo = null; f.mvBuf = null; f.mvPrev = null;
      switch (name) {
        case 'uppercut': f.set('uppercut', 'uppercut'); api.sfx('whoosh', 0.5); break;
        case 'sweep': f.set('sweep', 'sweep'); api.sfx('whoosh', 0.5); break;
        case 'flykick': f.set('flykick', 'flykick'); f.mvFly = { phase: 'prep', land: 0 }; api.sfx('whoosh', 0.6); break;
        case 'tornado': f.set('tornado', 'tornado'); f.cd.move = SPECIAL_CD; api.sfx('whoosh', 0.7); break;
        case 'teleport': {
          f.set('teleport'); f.cd.move = SPECIAL_CD; f.vy = 0;
          f.mvTele = { x0: f.x, x1: null };
          api.sfx('crack', 0.55); dust(f.x, 10, '#d9d2c3');
          break;
        }
        default: return false;
      }
      return true;
    }
    // napojenie článku komba: stav 'punch'/'kick' s vlastným pohybom → kreslenie, sprity aj časovanie ako pri obyčajných úderoch
    function link(f, name) {
      if (name === 'uppercut') { f.set('uppercut', 'uppercut'); f.vx = f.facing * 1.2; }
      else { f.set(name === 'combo3' ? 'kick' : 'punch', name); f.vx = f.facing * (name === 'combo3' ? 2.2 : 1.6); }   // malý výpad, aby kombo doľahlo
      f.mvBuf = null; f.mvPrev = null;
      if (f.mvCombo) f.mvCombo.links++;
      api.sfx('whoosh', 0.4);
    }
    // kombo počas úderu: priskoré stlačenia idú do frontu (aj F F G naraz) a články sa spúšťajú, keď skončia aktívne snímky
    function chainStep(f, inp) {
      const cur = f.state === 'punch' ? f.move : null;
      if (!cur || !(cur in LINKS) || !can(f, 'combo')) { f.mvBuf = null; return false; }
      let b = f.mvBuf;
      if (b && (b.cur !== cur || api.frame - b.at > BUFFER)) b = f.mvBuf = null;
      const want = nextLink(f, b && b.q.length ? b.q[b.q.length - 1] : cur, inp.pressed, inp.held);
      if (want) { if (!b) b = f.mvBuf = { cur, q: [], at: 0 }; b.q.push(want); b.at = api.frame; }
      if (!b || !b.q.length || f.t < LINKS[cur]) return false;
      const next = b.q.shift(), rest = b.q;
      link(f, next);
      if (rest.length && next in LINKS) f.mvBuf = { cur: next, q: rest, at: api.frame };
      return true;
    }
    function dust(x, n, c) { const F = api.fight; if (!F) return; for (let i = 0; i < n; i++) F.fx.push({ kind: 'spark', x: x + api.rnd(-16, 16), y: GROUND - api.rnd(0, 10), vx: api.rnd(-1.6, 1.6), vy: -api.rnd(0.5, 2.2), c, t: 0, life: 22 }); }

    // ------------------------------------------------------------------ vstup (idle/walk/block, PRED blokom)
    api.hooks.input.push((f, o, inp) => {
      const F = api.fight; if (!F || !inp || !f.onGround) return false;
      const p = inp.pressed || {}, h = inp.held || {};
      // 1) pohybové špeciály zo sekvencií — len v boji (vo FINISH HIM sú smery pre zakončenia, napr. ↓ ↑ KOP)
      if (F.phase === 'fight') {
        const sp = specialOf(f);
        if (sp === 'teleport' && p.up && ready(f) && seq(inp, ['down', 'up'])) return start(f, o, 'teleport');
        if (sp === 'tornado' && p.kick && ready(f) && seq(inp, ['down', 'F', 'kick'])) return start(f, o, 'tornado');
        if (p.kick && can(f, 'flykick') && seq(inp, ['F', 'F', 'kick'])) return start(f, o, 'flykick');
      }
      // 2) kombo: článok stlačený tesne po skončení predchádzajúceho úderu
      const pv = f.mvPrev;
      if (pv && api.frame - pv.at <= LATE && can(f, 'combo')) {
        const want = nextLink(f, pv.move, p, h);
        if (want) { link(f, want); return true; }
      }
      // 3) ↓ + tlačidlo (↓ = blok, preto sa to dá aj z bloku)
      if (h.down && p.punch && can(f, 'uppercut')) return start(f, o, 'uppercut');
      if (h.down && p.kick && can(f, 'sweep')) return start(f, o, 'sweep');
      return false;
    });

    // ------------------------------------------------------------------ vlastné stavy
    api.hooks.state.push((f, o) => {
      switch (f.state) {
        case 'flykick': stepFly(f); return true;
        case 'tornado': stepTornado(f); return true;
        case 'teleport': stepTeleport(f, o); return true;
        case 'sweep': if (f.t === MOVE.sweep.startup) dust(f.x + f.facing * 46, 8, '#c9b48a'); return false;   // časovanie rieši game.js
        default: return false;
      }
    });
    function stepFly(f) {
      const m = MOVE.flykick, t = f.t, fl = f.mvFly || (f.mvFly = { phase: 'prep', land: 0 });
      if (fl.phase === 'prep') {
        f.vx = 0;
        if (t >= m.startup) fl.phase = 'fly'; else return;
      }
      if (fl.phase === 'fly') {
        if (f.hitDone || t >= m.startup + m.active) {          // zásah, blok alebo koniec letu → zosun na zem
          fl.phase = 'drop';
          f.vx = f.hitDone ? -f.facing * 1.4 : f.facing * 1.6; f.vy = f.hitDone ? -2.2 : 0;
          return;
        }
        const k = Math.min(1, (t - m.startup + 1) / 5);
        f.y = GROUND - FLY_H * k; f.vy = -GRAV; f.vx = f.facing * FLY_V;   // výška sa drží (fyzika game.js pridá gravitáciu)
        return;
      }
      if (fl.phase === 'drop') {
        if (f.onGround && f.vy >= 0) { fl.phase = 'land'; fl.land = t; f.vx = 0; dust(f.x, 6, '#d9d2c3'); }
        return;
      }
      f.vx *= 0.7;                                               // land
      if (t - fl.land >= FLY_LAND) f.set('idle');
    }
    function stepTornado(f) {
      const m = MOVE.tornado, t = f.t, a0 = m.startup, a1 = m.startup + m.active;
      if (t < a0) { f.vx *= 0.8; return; }
      if (t < a1) {
        const k = t - a0;
        if (k % 10 === 0) { f.hitDone = false; f.move = k >= 20 ? 'tornado3' : 'tornado'; }   // 3 zásahové okná po 10 snímok
        f.vx = f.facing * 2;                                     // 60 px vpred za celé točenie
        if (k % 6 === 0) api.sfx('whoosh', 0.35);
        return;
      }
      f.vx *= 0.7;
      if (t >= a1 + m.recovery) f.set('idle');
    }
    function stepTeleport(f, o) {
      const t = f.t, T = TELE, tl = f.mvTele || (f.mvTele = { x0: f.x, x1: null });
      const ease = k => k * k * (3 - 2 * k);
      f.vx = 0; f.vy = 0;
      f.mvUnder = true;                                                    // poistka: po prerušení teleportu sa vynorí
      if (t <= T.sink) f.y = GROUND + T.depth * ease(t / T.sink);          // prepadne sa pod zem (bez zásahovej zóny nad zemou)
      if (t === T.sink) {                                                  // presun za súpera
        const side = f.x < o.x ? 1 : -1;
        f.x = api.clamp(o.x + side * T.behind, 22, W - 22);
        tl.x1 = f.x; api.sfx('whoosh', 0.6); dust(f.x, 10, '#d9d2c3');
      }
      if (t > T.sink && t <= T.sink + T.rise) f.y = GROUND + T.depth * (1 - ease((t - T.sink) / T.rise));
      if (t > T.sink) f.facing = o.x >= f.x ? 1 : -1;
      if (t >= T.sink + T.rise) f.y = GROUND;
      if (t >= T.sink + T.rise + T.rec) { f.mvUnder = false; f.set('idle'); }
    }

    // ------------------------------------------------------------------ každý snímok: kombo hráčov (počas úderu game.js háčik nevolá)
    api.hooks.frame.push(() => {
      if (api.scene !== 'fight' || (api.NET && api.NET.role === 'guest')) return;   // sieťový hosť nesimuluje
      const F = api.fight; if (!F || F.paused) return;
      for (const f of F.fighters) {
        if (f.mvFlip) { f.mvFlip = false; f.facing = -f.facing; }         // poistka ku kresleniu tornáda
        if (f.mvUnder && f.state !== 'teleport') { f.mvUnder = false; if (f.y > GROUND) { f.y = GROUND; f.vy = 0; } }   // prerušený teleport (iné moduly smú postavu ponoriť)
        if (f.cd && f.cd.move > 0) f.cd.move--;
        if (f.state === 'punch' && f.move === 'punch' && f.t === 0) f.mvCombo = { hits: 0, links: 0 };   // nový reťazec
        if (f.state === 'punch' && f.move in LINKS) f.mvPrev = { move: f.move, at: api.frame };   // pre neskoré napojenie
        if (!isCpu(f) && f.ctl && allowed(F, f)) chainStep(f, f.ctl);
      }
    });
    api.hooks.roundStart.push(F => {
      for (const f of F.fighters) { f.mvCombo = f.mvBuf = f.mvPrev = f.mvHits = f.mvFly = f.mvTele = null; f.mvFlip = f.mvUnder = f.mvCpuCombo = false; }
    });

    // ------------------------------------------------------------------ zásahy: kombo počítadlo, efekty
    const CHAIN = new Set(['punch', 'punch2', 'combo3', 'uppercut']);
    api.hooks.afterHit.push((a, d, m, blocked) => {
      if (d.mvUnder && d.state !== 'teleport') { d.mvUnder = false; if (d.y > GROUND) d.y = GROUND; }   // zásah počas teleportu (nota, lúč): vynorí sa
      if (m.name === 'uppercut' && !blocked) api.shake(7);
      // počítač pokračuje v kombe po zásahu úderom (s pravdepodobnosťou podľa úrovne)
      if (isCpu(a) && m.name === 'punch' && !blocked && a.ctl) a.mvCpuCombo = api.chance(api.clamp(AI.combo * (a.ctl.level || 0.6), 0.15, 0.6));
      const c = a.mvCombo;
      if (!c || !CHAIN.has(m.name) || (m.name === 'uppercut' && !c.links)) return;
      if (blocked) { a.mvCombo = null; return; }
      c.hits++;
      if (c.hits >= 2) a.mvHits = { n: c.hits, until: api.frame + 75 };
      if (c.hits >= 3) {
        a.mvCombo = null;
        const F = api.fight;
        if (F && F.phase === 'fight' && d.state !== 'dizzy') { api.banner('KOMBO 3!', 80, 30, 96); api.sfx('confirm', 0.5); }
      }
    });

    // ------------------------------------------------------------------ počítač: uppercut/podkop zblízka, letiaci kop zďaleka, kombo po zásahu
    // Pravdepodobnosti na jedno rozhodnutie počítača (rozhoduje sa každých ~20–56 snímok pri úrovni 0,6), lvl = cpu.level.
    // Rebrík/nepriatelia môžu ladiť: api.moves.ai.close = 0.2 …
    const AI = {
      close: 0.12, closeLvl: 0.3,   // zblízka (do 82 px): uppercut alebo podkop s p = close + closeLvl·lvl (0,30 pri 0,6)
      upShare: 0.7,                 // z toho uppercut, zvyšok podkop
      mid: 0.12,                    // 82–100 px: podkop (dosiahne ďalej než uppercut)
      antiAir: 0.1, antiAirLvl: 0.25,   // súper skáča do 95 px: uppercut
      flykick: 0.2,                 // 115–215 px: letiaci kop
      tornado: 0.06, teleport: 0.07,
      combo: 0.5, comboUp: 0.5,     // po zásahu úderom pokračuje v kombe s p = combo·lvl; koniec komba uppercutom s p = comboUp
    };
    function cpuDecide(cpu, f, o) {
      const lvl = cpu.level || 0.6, d = Math.abs(o.x - f.x), sp = specialOf(f), rd = ready(f);
      if (!o.vulnerable || o.state === 'dizzy') return null;
      const pick = (...names) => { const ok = names.filter(n => can(f, n)); return ok.length ? ok[0] : null; };
      if (!o.onGround) return d < 95 && api.chance(AI.antiAir + AI.antiAirLvl * lvl) ? pick('uppercut') : null;   // proti skoku
      if (d < 82) {
        if (sp === 'tornado' && rd && api.chance(AI.tornado)) return 'tornado';
        if (!api.chance(AI.close + AI.closeLvl * lvl)) return null;
        return api.chance(AI.upShare) ? pick('uppercut', 'sweep') : pick('sweep', 'uppercut');
      }
      if (d < 100) return api.chance(AI.mid) ? pick('sweep') : null;
      if (d > 115 && d < 215) {
        const r = Math.random();
        if (r < AI.flykick) return pick('flykick');
        if (sp === 'teleport' && rd && r < AI.flykick + AI.teleport) return 'teleport';
        return null;
      }
      if (d >= 215 && sp === 'teleport' && rd && api.chance(AI.teleport)) return 'teleport';
      return null;
    }
    api.hooks.cpu.push((cpu, f, o, phase) => {
      if (phase !== 'fight' || !o) return null;
      if (f.mvCpuCombo) {                                        // pokračovanie komba (CPU nemá históriu, články napájame priamo)
        if (f.state === 'punch' && f.move in LINKS) {
          if (f.t >= LINKS[f.move]) {
            const want = f.move === 'punch' ? 'punch2' : (api.chance(AI.comboUp) && can(f, 'uppercut') ? 'uppercut' : 'combo3');
            if (want !== 'punch2') f.mvCpuCombo = false;
            link(f, want);
          }
          return null;
        }
        f.mvCpuCombo = false;
      }
      if (!FREE.has(f.state) || !f.onGround) return null;
      if (cpu.planT > 0 || cpu.wait > 1) return null;          // nie je chvíľa rozhodnutia → pôvodná logika (rovnaký rytmus)
      const act = cpuDecide(cpu, f, o);
      if (!act) return null;
      cpu.wait = Math.floor(api.rnd(12, 34) / (cpu.level || 0.6)); cpu.plan = null; cpu.planT = 0;
      if (act === 'uppercut') return { held: { down: true }, pressed: { punch: true } };   // ide cez vstupný háčik ako u hráča
      if (act === 'sweep') return { held: { down: true }, pressed: { kick: true } };
      start(f, o, act);
      return { held: {}, pressed: {} };
    });

    // ------------------------------------------------------------------ kreslenie
    const ctx = api.ctx;
    const tornadoSpin = f => f.state === 'tornado' && f.t >= MOVE.tornado.startup && f.t < MOVE.tornado.startup + MOVE.tornado.active;
    api.hooks.drawBack.push((stage, F) => {        // točenie: pri kreslení sa postava strieda vľavo/vpravo (simulácia drží pravý smer)
      for (const f of F.fighters) if (!f.mvFlip && tornadoSpin(f) && Math.floor((f.t - MOVE.tornado.startup) / 3) % 2 === 1) { f.mvFlip = true; f.facing = -f.facing; }
    });
    api.hooks.drawFront.push((stage, F) => {
      for (const f of F.fighters) if (f.mvFlip) { f.mvFlip = false; f.facing = -f.facing; }
      for (const f of F.fighters) {
        ctx.save();
        try {
          if (f.state === 'uppercut') drawUppercut(f);
          else if (f.state === 'sweep') drawSweep(f);
          else if (f.state === 'flykick') drawFly(f);
          else if (f.state === 'tornado') drawTornado(f);
          else if (f.state === 'teleport') drawTeleport(f);
        } catch (e) { /* efekt nesmie zhodiť hru */ }
        ctx.restore();
      }
    });
    function stroke(c, w, a) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
    function drawUppercut(f) {
      const m = MOVE.uppercut, t = f.t; if (t < m.startup - 1 || t > m.startup + m.active + 6) return;
      const a = 1 - Math.max(0, t - m.startup) / (m.active + 7), x = f.x, y = f.y, s = f.facing;
      ctx.save();
      stroke('#fff6b0', 6, a * 0.9); ctx.beginPath(); ctx.moveTo(x + s * 12, y - 56); ctx.quadraticCurveTo(x + s * 66, y - 92, x + s * 34, y - 160); ctx.stroke();
      stroke('#ff9d1a', 2, a); ctx.beginPath(); ctx.moveTo(x + s * 18, y - 62); ctx.quadraticCurveTo(x + s * 58, y - 94, x + s * 33, y - 152); ctx.stroke();
      ctx.restore();
    }
    function drawSweep(f) {
      const m = MOVE.sweep, t = f.t; if (t < m.startup - 2 || t > m.startup + m.active + 6) return;
      const a = 1 - Math.max(0, t - m.startup) / (m.active + 7), x = f.x, y = f.y, s = f.facing;
      ctx.save();
      stroke('#f4ead2', 5, a * 0.85); ctx.beginPath(); ctx.moveTo(x + s * 6, y - 4); ctx.quadraticCurveTo(x + s * 48, y - 30, x + s * 90, y - 5); ctx.stroke();
      stroke('#b98a3e', 2, a); ctx.beginPath(); ctx.moveTo(x + s * 12, y - 6); ctx.quadraticCurveTo(x + s * 48, y - 24, x + s * 84, y - 7); ctx.stroke();
      ctx.restore();
    }
    function drawFly(f) {
      if (!f.mvFly || f.mvFly.phase !== 'fly') return;
      const x = f.x, y = f.y, s = f.facing;
      ctx.save();
      for (let i = 0; i < 4; i++) { stroke(i % 2 ? '#bfe9ff' : '#ffffff', 2, 0.65 - i * 0.1); ctx.beginPath(); ctx.moveTo(x - s * (22 + i * 6), y - 46 - i * 18); ctx.lineTo(x - s * (64 + i * 10 + (f.t % 4) * 3), y - 46 - i * 18); ctx.stroke(); }
      ctx.restore();
    }
    function drawTornado(f) {
      const t = f.t;
      if (t < 40) api.text('TORNADO!', f.x, f.y - 160, 12, 'center', '#b8ff6a');
      if (!tornadoSpin(f)) return;
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const ph = t * 0.55 + i * 2.1, cy = f.y - 36 - i * 30, rx = 46 - i * 6;
        stroke(i === 1 ? '#c8ffd0' : '#ffffff', 3, 0.6);
        ctx.beginPath(); ctx.ellipse(f.x, cy, rx, 8, 0, ph, ph + 3.6); ctx.stroke();
      }
      ctx.restore();
    }
    function puff(x, k) {
      if (k < 0 || k > 1) return;
      ctx.save(); ctx.globalAlpha = 0.85 * (1 - k);
      const cols = ['#e9e4dc', '#c8c2b8', '#f7f4ee'];
      for (let i = 0; i < 7; i++) {
        const ang = i / 7 * Math.PI, r = (14 + (i % 3) * 5) * (0.6 + k * 0.9);
        ctx.fillStyle = cols[i % 3]; ctx.beginPath(); ctx.arc(x + Math.cos(ang) * 26 * (0.5 + k), GROUND - 8 - Math.sin(ang) * 26 * (0.4 + k * 0.8), r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    function bolt(x, k) {
      if (k < 0 || k > 1) return;
      ctx.save();
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push([i === 8 ? x : x + ((i * 37) % 11 - 5) * 3, (GROUND - 30) * i / 8]);
      for (const [c, w] of [['rgba(120,200,255,0.6)', 7], ['#fffbe0', 2.5]]) {
        stroke(c, w, 1 - k); ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke();
      }
      ctx.restore();
    }
    function drawTeleport(f) {
      const t = f.t, tl = f.mvTele || {};
      bolt(tl.x0 ?? f.x, t / 6); puff(tl.x0 ?? f.x, t / 16);
      if (tl.x1 != null) { bolt(tl.x1, (t - TELE.sink) / 6); puff(tl.x1, (t - TELE.sink) / 16); }
    }
    api.hooks.drawHud.push(F => {
      if (F.paused) return;
      ctx.save();
      F.fighters.forEach((f, side) => {
        const right = side === 1, x = right ? W - 12 - 190 : 12;
        const sp = specialOf(f);
        if (sp && SPECIAL_LABEL[sp]) {                           // tretí ukazovateľ vedľa KIAI a nástroja
          const v = api.clamp(1 - (f.cd.move || 0) / SPECIAL_CD, 0, 1), col = '#b8ff6a';
          const mx = right ? x + 190 - 60 - 132 : x + 132, my = 27;
          ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
          ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * v), 4);
          api.text(SPECIAL_LABEL[sp], mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
        }
        const h = f.mvHits;
        if (h && api.frame < h.until) api.text(`${h.n} HITS`, right ? W - 14 : 14, 66, 11, right ? 'right' : 'left', h.n >= 3 ? '#ffd200' : '#ffffff');
      });
      ctx.restore();
    });

    // ------------------------------------------------------------------ pre ostatné moduly a Mastera (OVLÁDANIE, COMBOS.md, AI nepriateľov)
    api.moves = {
      start: (f, o, name) => start(f, o, name), specialOf, SEQ_GAP, SPECIAL_CD, ai: AI,
      free: f => FREE.has(f.state) && f.onGround,
      help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk]
        ['UPPERCUT', 'S + F', '↓ + K', 'L1 + □', 'páčka dole + ÚDER'],
        ['SWEEP', 'S + G', '↓ + L', 'L1 + ✕', 'páčka dole + KOP'],
        ['FLYING KICK', 'VPRED VPRED G', 'VPRED VPRED L', '▶ ▶ ✕', 'páčka vpred 2× + KOP'],
        ['COMBO 3', 'F F G', 'K K L', '□ □ ✕', 'ÚDER ÚDER KOP'],
        ['TORNADO (Matúško)', 'S VPRED G', '↓ VPRED L', '↓ ▶ ✕', 'páčka dole, vpred + KOP'],
        ['TELEPORT (Šimon)', 'S W', '↓ ↑', '↓ ▲', 'páčka dole, hore'],
      ],
    };
  },
});
