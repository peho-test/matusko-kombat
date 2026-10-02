// MATÚŠKO KOMBAT XII — modul combos2: nové kombá počas boja (P19, 2. 10. 2026, Peťo schválil)
//
//   ROCKY HELP ....... ↓ VZAD KIAI     všetci okrem Rockyho, raz za kolo: z kraja obrazovky za tebou pribehne pes Rocky,
//                                      hryzne súpera (malé zranenie) alebo ho olíže (~1 s sa smeje) a odbehne späť.
//                                      Labka pri živote = Rocky je pripravený. Dá sa zablokovať (blok proti smeru, odkiaľ Rocky beží).
//   HELIGÓNKA WAVE ... VPRED VPRED ♪   Matúško a jeho prefarbenia (GOLDEN): nízka vlna nôt letí cez celú obrazovku; zásah = súper
//                                      tancuje 3 s namiesto 2 s a dostane 10 namiesto 6. Dá sa preskočiť aj zablokovať.
//   HUSLE SOLO ....... VPRED VPRED ♪   Šimon a jeho prefarbenia: tlaková zvuková vlna (kruhy) z huslí, do ~200 px pred Šimonom zrazí súpera.
//                                      Vlna aj sólo potrebujú nabitý ♪ a ♪ sa potom nabíja dlhšie (10 s namiesto 7 s).
//   FLIP KICK ........ ↑ VPRED KOP     všetci so saltom (nie Rocky): vyskoč, ťukni k súperovi a kopni → salto dopredu zakončené kopom
//                                      zhora (salto a póza kopu vo vzduchu z game.js), zrazí, dá sa zablokovať. Salto so smerom + KOP
//                                      (VPRED skôr ako ↑) ostáva obyčajný kop vo vzduchu ako v MK2.
//
// Kombá platia len vo fáze boja: vo FINISH HIM sú smery pre zakončenia (finishers.js ich v game.js vyhodnotí skôr než pohyb
// bojovníka a tento modul vo FINISH HIM nič nespúšťa). Vstup len cez inp / f.ctl (held, pressed, history) a api.matchSeq.
// Sieťová hra: stav je len čisté dáta (F.c2.proj a F.c2.rocky so side, f.c2Rocky, f.c2f); hosť nesimuluje, len kreslí.
// Počítač kombá občas použije (hooks.cpu, ladenie v api.combos2.ai). TRÉNING ich odfajkne (api.combos2.rows → trening.js),
// OVLÁDANIE A ÚDERY ich ukáže na strane ŠPECIÁLNE ÚDERY (riadky sa pridajú do api.moves.help).
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'combos2',
  init(api) {
    'use strict';
    const { W, GROUND, MOVE, ATTACK_STATES, HIT_STATES, hooks, ctx } = api;
    const { rnd, chance, clamp } = api;

    // ================================================================ nastavenia (snímky pri 60 fps)
    const SEQ_GAP = 15;           // max. snímok medzi stlačeniami (ako moves.js)
    const FLIP_GAP = 18;          // ↑ VPRED KOP: o kúsok viac (skok trvá ~39 snímok, mobilný joystick)
    const MUSIC_CD = 600;         // vlna / sólo: ♪ sa potom nabíja 10 s (obyčajná heligónka a husle 7 s = 420)
    const JUMP_V = 7.4;           // z game.js
    const RK = { enter: 10, speed: 6.2, away: 7.4, reach: { bite: 40, lick: 46 }, hitT: { bite: 12, lick: 10 }, endT: { bite: 46, lick: 54 },
                 waitMax: 80, life: 260, bite: { dmg: 7, hitstun: 22, push: 2.6 }, lick: { dmg: 3, laugh: 60 }, biteShare: 0.55 };
    const WAVE = { vx: 4.4, dmg: 10, dance: 180, len: 60, hit: 28, low: 50 };   // len: dĺžka kreslenej vlny, hit: zásahová časť vpredu,
                                                                                  // low: zasiahne, keď má súper chodidlá najviac 50 px nad zemou
    const SOLO = { grow: 8, max: 200, dmg: 12, push: 5, life: 40, rings: 3, gap: 26 };
    const FLIP = { t: 16, boost: -4.4, vx: 2.6, diveVx: 4, diveVy: 5, land: 14 };
    const FREE = new Set(['idle', 'walk', 'block']);

    Object.assign(MOVE, {
      c2call: { startup: 10, active: 1, recovery: 14 },       // zavolanie Rockyho (póza KIAI, „ROCKY!“)
      c2wave: { startup: 22, active: 1, recovery: 30 },       // heligónka (sprite special)
      c2solo: { startup: 26, active: 1, recovery: 30 },       // husle (sprite special)
      // kop zhora: zásahová zóna od špičky nohy šikmo dole pred postavou (aktívna len v strmhlavom lete po salte)
      c2flip: { startup: FLIP.t, active: 60, recovery: 0, dmg: 11, x0: 8, x1: 96, y0: -92, y1: 6, hitstun: 20, push: 3, sound: 'kick', knock: true },
    });
    for (const s of ['c2call', 'c2wave', 'c2solo', 'c2flip']) ATTACK_STATES.add(s);
    HIT_STATES.add('c2flip');                       // zásah kopu zhora rieši game.js (checkAttack → applyHit, blok ako pri kope)
    api.animFallback('c2call', 'kiai');
    api.animFallback('c2wave', 'special');
    api.animFallback('c2solo', 'special');
    api.animFallback('c2flip', 'jump');             // kreslí sa ako salto / kop vo vzduchu (drawBack nižšie)
    if (!api.rocky) api.animFallback('smiech', 'hit');   // bez rocky.js (chýbajú sprity psa) rieši smiech tento modul

    // ================================================================ kto čo môže
    const isCpu = f => f.ctl instanceof api.CPU;
    const can = (f, name) => !(f.def && Array.isArray(f.def.moves)) || f.def.moves.includes(name);   // ako moves.js (def.moves)
    // nástroj: Matúško a prefarbenia (GOLDEN…) = heligónka, Šimon a prefarbenia = husle; tajné postavy a súperi z HORY majú vlastné ♪
    function instrumentOf(f) {
      const d = (f && f.def) || {};
      if ('combo2' in d) return d.combo2 || null;                          // postava si môže vybrať sama: 'wave' | 'solo' | null
      if (d.enKind || d.p7 || d.p14 || d.rocky || d.blocky || d.impostor) return null;
      if (d.special === 'heligonka' && d.specialName === 'HELIGÓNKA') return 'wave';
      if (d.special === 'husle' && d.specialName === 'HUSLE') return 'solo';
      return null;
    }
    const canRocky = f => !!(f && f.def) && !f.def.rocky && can(f, 'rockyhelp');      // Rocky nevolá sám seba
    const canFlip = f => !!(f && f.def) && !f.def.rocky && can(f, 'flipkick');        // pes skáče bez salta (rocky.js)
    const seq = (inp, s, gap = SEQ_GAP) => !!(inp && inp.history && api.matchSeq(inp, s, gap));   // počítač nemá históriu → false
    const st = F => F.c2 || (F.c2 = { proj: [], rocky: [] });
    const heightOf = f => (f.state === 'dance' ? 100 : (f.def.height || 138));
    const canHit = (F, o) => F.phase === 'fight' && o.vulnerable && o.state !== 'dizzy';
    const blockingFrom = (o, dir) => (o.state === 'block' || o.state === 'blockstun') && o.facing === -dir;
    // zásah zo smeru dir (Rocky, vlna, sólo): blok aj odhodenie podľa smeru strely, nie podľa toho, kam sa práve pozerá útočník
    function hitFrom(a, d, m, dir) {
      const keep = a.facing; a.facing = dir;
      try { api.applyHit(a, d, m); } finally { a.facing = keep; }
    }
    function dust(F, x, n, c) { for (let i = 0; i < n; i++) F.fx.push({ kind: 'spark', x: x + rnd(-14, 14), y: GROUND - rnd(0, 8), vx: rnd(-1.5, 1.5), vy: -rnd(0.4, 2), c, t: 0, life: 20 }); }
    function noteFx(F, x, y, n) { for (let i = 0; i < n; i++) F.fx.push({ kind: 'note', x: x + rnd(-16, 16), y: y + rnd(-24, 24), vy: -rnd(0.5, 1.2), t: 0, life: 36 }); }

    // ================================================================ štart kômb
    function start(f, o, name) {
      const F = api.fight; if (!F) return false;
      if (o) f.facing = o.x >= f.x ? 1 : -1;
      switch (name) {
        case 'rocky':
          if (f.c2Rocky || !canRocky(f)) return false;
          f.set('c2call', 'c2call'); f.vx = 0; f.c2Rocky = true;
          spawnRocky(F, f);
          return true;
        case 'wave': case 'solo':
          if (instrumentOf(f) !== name || f.cd.special > 0) return false;
          f.set('c2' + name, 'c2' + name); f.vx = 0; f.cd.special = MUSIC_CD;
          api.sfx('whoosh', 0.4);
          return true;
        case 'flip':                                   // počítač a testy: skok rovno hore, salto sa spustí vo vzduchu (hooks.frame)
          if (!canFlip(f) || !f.onGround) return false;
          f.set('jump'); f.vy = -JUMP_V; f.vx = 0; f.flip = 0; f.c2CpuFlip = 7;
          api.sfx('whoosh', 0.4);
          return true;
      }
      return false;
    }
    function startFlip(f, o) {                       // zo skoku (↑ VPRED KOP): salto dopredu, potom kop zhora
      f.facing = o.x >= f.x ? 1 : -1;
      f.set('c2flip', 'c2flip'); f.flip = 0; f.c2CpuFlip = 0;
      f.vy = Math.min(f.vy, FLIP.boost); f.vx = f.facing * FLIP.vx;
      f.c2f = { ph: 'flip', land: 0 };
      api.sfx('whoosh', 0.6);
    }

    // ================================================================ vstup (idle/walk/block, pred blokom v game.js)
    hooks.input.push((f, o, inp) => {
      const F = api.fight;
      if (!F || F.phase !== 'fight' || !inp || !inp.history || !f.onGround) return false;   // vo FINISH HIM nič (zakončenia)
      const p = inp.pressed || {};
      if (p.kiai && !f.c2Rocky && canRocky(f) && seq(inp, ['down', 'B', 'kiai'])) return start(f, o, 'rocky');
      if (p.special && f.cd.special === 0) {
        const ins = instrumentOf(f);
        if (ins && seq(inp, ['F', 'F', 'special'])) return start(f, o, ins);
      }
      return false;                                  // nenabitý ♪ / použitý Rocky: tlačidlo spracuje game.js ako obyčajne
    });

    // ================================================================ stavy útočníka
    function timed(f, m) { f.vx *= 0.8; if (f.t >= m.startup + m.active + m.recovery) f.set('idle'); }
    hooks.state.push((f, o) => {
      switch (f.state) {
        case 'c2call': timed(f, MOVE.c2call); return true;
        case 'c2wave': if (f.t === MOVE.c2wave.startup) spawnWave(f); timed(f, MOVE.c2wave); return true;
        case 'c2solo': if (f.t === MOVE.c2solo.startup) spawnSolo(f); timed(f, MOVE.c2solo); return true;
        case 'c2flip': stepFlip(f, o); return true;
        case 'smiech':                               // olízaný sa smeje a nemôže nič robiť (inak rieši rocky.js, ten je v poradí skôr)
          f.vx *= 0.8;
          if (--f.stun <= 0) f.set('idle');
          return true;
      }
      return false;
    });
    function stepFlip(f, o) {
      const F = api.fight, c = f.c2f || (f.c2f = { ph: f.t < FLIP.t ? 'flip' : 'dive', land: 0 });   // poistka: stav obnovený bez dát (REWIND)
      if (c.ph === 'flip') {
        f.vx = f.facing * FLIP.vx;
        if (f.onGround && f.vy >= 0 && f.t > 2) return land(F, f, c);
        if (f.t >= FLIP.t) { c.ph = 'dive'; f.vx = f.facing * FLIP.diveVx; f.vy = Math.max(f.vy, FLIP.diveVy); api.sfx('whoosh', 0.5); }
        return;
      }
      if (c.ph === 'dive') {
        if (f.hitDone && f.vx * f.facing > 0) { f.vx = -f.facing * 1.4; f.vy = Math.min(f.vy, -1.6); }   // po zásahu alebo bloku sa odrazí
        if (f.onGround && f.vy >= 0) land(F, f, c);
        return;
      }
      f.vx *= 0.7;                                   // dopad: krátke zotavenie (dá sa potrestať)
      if (f.t - c.land >= FLIP.land) f.set('idle');
    }
    function land(F, f, c) {
      c.ph = 'land'; c.land = f.t; f.vx = 0; f.vy = 0; f.hitDone = true;   // po dopade už kop nezasiahne
      if (F) dust(F, f.x, 6, '#d9d2c3');
      api.shake(2);
    }

    // ================================================================ ROCKY HELP: pes pribehne, hryzne alebo olíže a odbehne
    function spawnRocky(F, f) {
      const kind = api.combos2.force.rocky || (chance(RK.biteShare) ? 'bite' : 'lick');
      st(F).rocky.push({ side: f.side, x: f.facing > 0 ? -60 : W + 60, dir: f.facing, st: 'enter', t: 0, kind, hit: false, blocked: false, wait: 0, age: 0 });
      api.sfx('bark', 0.55);
    }
    function wallBetween(F, x0, x1) {                // stena Banánáča (BUILD) medzi Rockym a súperom
      const walls = F.p14b && F.p14b.walls; if (!Array.isArray(walls)) return null;
      return walls.find(w => w && !w.dead && typeof w.x === 'number' && (x0 - w.x) * (x1 - w.x) < 0) || null;
    }
    function rockyAway(r, bark) { r.st = 'away'; r.t = 0; r.dir = -r.dir; if (bark) api.sfx('bark', 0.6); }
    function updateRocky(F, S) {
      for (const r of S.rocky) {
        r.t++; r.age++;
        const f = F.fighters[r.side], o = F.fighters[1 - r.side];
        if (r.st === 'away') {
          r.x += r.dir * (F.phase === 'fight' || F.phase === 'roundEnd' ? RK.away : RK.away * 1.6);
          if (r.x < -90 || r.x > W + 90) r.dead = true;
          continue;
        }
        if (F.phase !== 'fight') { rockyAway(r, false); continue; }   // koniec kola, FINISH HIM: Rocky už nehryzie a uteká
        if (r.age > RK.life) { rockyAway(r, true); continue; }
        if (r.st === 'enter') { if (r.t >= RK.enter) { r.st = 'run'; r.t = 0; api.sfx('bark', 0.7); } continue; }
        if (r.st === 'run' || r.st === 'wait') {
          if ((o.x - r.x) * r.dir < -12) r.dir = -r.dir;                // súper ho preskočil → otočí sa
          const reach = RK.reach[r.kind], tx = o.x - r.dir * reach;
          const wall = wallBetween(F, r.x, o.x);
          if (wall && Math.abs(r.x + r.dir * 44 - wall.x) < 26) { rockyAway(r, true); continue; }   // stena: zašteká a odbehne
          if ((tx - r.x) * r.dir > RK.speed) { r.st = 'run'; r.x += r.dir * RK.speed; continue; }
          r.x = tx;
          if (canHit(F, o) && o.y > GROUND - 50) { r.st = r.kind; r.t = 0; continue; }
          if (r.st !== 'wait') { r.st = 'wait'; r.wait = 0; }            // súper vo vzduchu alebo na zemi: chvíľu počká
          if (++r.wait > RK.waitMax) rockyAway(r, true);
          continue;
        }
        // hryz alebo oliz
        if (r.t < RK.hitT[r.kind]) r.x += r.dir * (r.st === 'bite' ? 1.2 : 0.3);   // výpad k súperovi
        if (r.t === RK.hitT[r.kind] && !r.hit) rockyHit(F, r, f, o);
        if (r.st === 'lick' && !r.blocked && r.t % 12 === 6) api.sfx('lick', 0.6);
        if (r.t >= RK.endT[r.kind] || (r.blocked && r.t >= RK.hitT[r.kind] + 16)) rockyAway(r, !r.blocked);
      }
      S.rocky = S.rocky.filter(r => !r.dead);
    }
    function rockyHit(F, r, f, o) {
      r.hit = true;
      const ahead = (o.x - (r.x + r.dir * RK.reach[r.kind])) * r.dir;          // > 0: súper je ďalej, ako dosiahne papuľa
      if (!canHit(F, o) || o.y <= GROUND - 50 || ahead > 30 || (o.x - r.x) * r.dir < -10) return;   // medzitým uskočil / preskočil psa
      const bite = r.st === 'bite', sx = o.x - r.dir * 12;
      r.blocked = blockingFrom(o, r.dir);
      const m = bite ? { name: 'rocky_bite', dmg: RK.bite.dmg, hitstun: RK.bite.hitstun, push: RK.bite.push, sound: 'kick', sx, sy: GROUND - 56 }
                     : { name: 'rocky_lick', dmg: RK.lick.dmg, effect: 'smiech', push: 0.6, sound: 'lick', sx, sy: GROUND - 34 };
      hitFrom(f, o, m, r.dir);
      if (bite) api.sfx('bark', 0.85);
    }

    // ================================================================ HELIGÓNKA WAVE a HUSLE SOLO (strely: čisté dáta v F.c2.proj)
    // F.c2.proj má tvar strel modulov (side, x, vx / dir, len, hit), takže stenu Banánáča (BUILD) zastaví aj vlna a sólo (bananac.js).
    function spawnWave(f) {
      const F = api.fight; if (!F) return;
      st(F).proj.push({ kind: 'wave', side: f.side, x: f.x + f.facing * 30, y: GROUND - 40, vx: f.facing * WAVE.vx, dir: f.facing, t: 0, hit: false });
      api.sfx('heligonka', 1); api.shake(3);
    }
    function spawnSolo(f) {
      const F = api.fight; if (!F) return;
      const top = (f.def.height || 138) * (f.def.scale || 1);
      st(F).proj.push({ kind: 'solo', side: f.side, x: f.x + f.facing * 22, y: f.y - Math.round(top * 0.78), dir: f.facing, r: 10, len: 10, t: 0, hit: false });
      api.sfx('husle', 1); api.shake(7); F.flash = Math.max(F.flash, 4);
    }
    function waveHits(p, o) {                        // predná časť nízkej vlny (hrebeň) vs. telo súpera; chvost len doznieva
      const x0 = Math.min(p.x, p.x - p.dir * WAVE.hit), x1 = Math.max(p.x, p.x - p.dir * WAVE.hit);
      return o.x + 17 >= x0 && o.x - 17 <= x1 && o.y > GROUND - WAVE.low;
    }
    function soloHits(p, o) {                        // kruh s polomerom p.r dosiahol najbližší bod tela súpera pred huslistom
      if ((o.x - p.x) * p.dir < -24) return false;
      const y0 = o.y - heightOf(o) * ((o.def && o.def.scale) || 1), nx = clamp(p.x, o.x - 17, o.x + 17), ny = clamp(p.y, y0, o.y);
      return Math.hypot(nx - p.x, ny - p.y) <= p.r;
    }
    function updateProj(F, S) {
      if (F.phase === 'finish' || F.phase === 'finisher') { S.proj.length = 0; return; }   // FINISH HIM: strely zmiznú (ako noty a lúč)
      for (const p of S.proj) {
        p.t++;
        const f = F.fighters[p.side], o = F.fighters[1 - p.side];
        if (p.kind === 'wave') {
          p.x += p.vx;
          if (p.t % 10 === 1) api.sfx('notes', 0.35);
          if (!p.hit && canHit(F, o) && waveHits(p, o)) {
            p.hit = true;
            const blocked = blockingFrom(o, p.dir);
            hitFrom(f, o, { name: 'c2wave', dmg: WAVE.dmg, effect: 'dance', sound: 'heligonka', sx: o.x - p.dir * 12, sy: GROUND - 60 }, p.dir);
            if (blocked) { p.dead = true; noteFx(F, o.x - p.dir * 18, GROUND - 50, 6); }   // zablokovaná vlna sa rozsype
          }
          if (p.x < -90 || p.x > W + 90) p.dead = true;
        } else {
          p.r = Math.min(SOLO.max, p.r + SOLO.grow); p.len = p.r;
          if (!p.hit && canHit(F, o) && soloHits(p, o)) {
            p.hit = true;
            hitFrom(f, o, { name: 'c2solo', dmg: SOLO.dmg, knock: true, push: SOLO.push, sound: 'kick', sx: o.x - p.dir * 10, sy: o.y - 90 }, p.dir);
          }
          if (p.t >= SOLO.life) p.dead = true;
        }
      }
      S.proj = S.proj.filter(p => !p.dead);
    }

    // ================================================================ zásahy: dlhší tanec, smiech, srdiečka
    hooks.afterHit.push((a, d, m, blocked) => {
      const F = api.fight; if (!F || !m || blocked) return;
      if (m.name === 'c2wave' && d.state === 'dance') { d.stun = WAVE.dance; noteFx(F, d.x, d.y - 100, 5); }
      if (m.name === 'rocky_lick' && d.state === 'smiech') {
        d.stun = RK.lick.laugh;
        const top = d.y - heightOf(d) * 0.62;
        for (let i = 0; i < 4; i++) F.fx.push({ kind: 'heart', x: d.x + rnd(-14, 14), y: top + rnd(-10, 10), vy: -0.6, t: 0, life: 46 });
      }
      if (m.name === 'c2solo') api.shake(8);
      if (m.name === 'c2flip') api.shake(6);
    });

    // ================================================================ každý snímok (hostiteľ / offline; hosť v sieti len kreslí)
    hooks.frame.push(() => {
      const F = api.fight;
      if (F) restoreDraw(F);                         // poistka: kreslenie sa prerušilo pred vrátením stavu
      if (api.NET && api.NET.role === 'guest') return;
      if (api.scene !== 'fight' || !F || F.paused) return;
      const S = st(F);
      for (let i = 0; i < 2; i++) {
        const f = F.fighters[i], o = F.fighters[1 - i];
        // FLIP KICK: KOP vo výskoku po ↑ VPRED (pred game.js, ktorý by z KOPU urobil obyčajný kop vo vzduchu)
        if (f.state === 'jump' && F.phase === 'fight') {
          if (f.c2CpuFlip) { if (f.t >= f.c2CpuFlip) startFlip(f, o); }
          else if (!isCpu(f) && f.t >= 2 && canFlip(f) && f.ctl && f.ctl.pressed && f.ctl.pressed.kick && seq(f.ctl, ['up', 'F', 'kick'], FLIP_GAP)) startFlip(f, o);
        } else if (f.c2CpuFlip) f.c2CpuFlip = 0;
        if (F.trening && f.c2Rocky && f.state !== 'c2call' && !S.rocky.some(r => r.side === f.side)) f.c2Rocky = false;   // TRÉNING: labka sa vráti
      }
      updateRocky(F, S);
      updateProj(F, S);
    });
    hooks.matchStart.push(F => { F.c2 = { proj: [], rocky: [] }; });
    hooks.roundStart.push(F => {
      const S = st(F); S.proj.length = 0; S.rocky.length = 0;
      for (const f of F.fighters) Object.assign(f, { c2Rocky: false, c2f: null, c2CpuFlip: 0, c2Draw: null });
    });

    // ================================================================ počítač: kombá občas, s mierou (pravdepodobnosť na jedno rozhodnutie)
    const AI = {
      rocky: 0.05, rockyAfter: 180,     // ROCKY HELP: najskôr 3 s po začiatku kola, raz za kolo (zvyčajne do ~20 s)
      wave: 0.1, waveMin: 120,          // HELIGÓNKA WAVE: zďaleka (♪ inak použije game.js ako obyčajnú heligónku)
      solo: 0.12, soloMax: 185,         // HUSLE SOLO: na dosah kruhov
      flip: 0.08, flipMin: 105, flipMax: 205,   // FLIP KICK: zo strednej vzdialenosti (letiaci kop z moves.js má prednosť)
    };
    function cpuDecide(cpu, f, o) {
      const F = api.fight, d = Math.abs(o.x - f.x), lvl = clamp(cpu.level || 0.6, 0.3, 1.3), ins = instrumentOf(f);
      if (!o.vulnerable || o.state === 'dizzy') return null;
      if (!f.c2Rocky && canRocky(f) && F.t > AI.rockyAfter && o.onGround && chance(AI.rocky * (0.5 + lvl))) return 'rocky';
      if (ins === 'wave' && f.cd.special === 0 && d > AI.waveMin && o.onGround && chance(AI.wave)) return 'wave';
      if (ins === 'solo' && f.cd.special === 0 && d < AI.soloMax && chance(AI.solo)) return 'solo';
      if (canFlip(f) && d > AI.flipMin && d < AI.flipMax && o.onGround && chance(AI.flip)) return 'flip';
      return null;
    }
    hooks.cpu.push((cpu, f, o, phase) => {
      if (phase !== 'fight' || !o || !FREE.has(f.state) || !f.onGround) return null;
      if (cpu.planT > 0 || cpu.wait > 1) return null;          // nie je chvíľa rozhodnutia → ostatné háčiky a game.js (rovnaký rytmus)
      const act = cpuDecide(cpu, f, o);
      if (!act || !start(f, o, act)) return null;
      cpu.wait = Math.floor(rnd(12, 34) / (cpu.level || 0.6)); cpu.plan = null; cpu.planT = 0;
      return { held: {}, pressed: {} };
    });

    // ================================================================ kreslenie
    // FLIP KICK: počas kreslenia sa stav dočasne zmení na salto ('jump' + f.flip) a potom na kop vo vzduchu ('airkick'), takže postavu
    // kreslí game.js ako bežné salto a kop (sprite flip, póza airPose, stopy, paleta, aura) aj moduly kreslených postáv.
    // Vráti sa v drawHud (po všetkých drawFront) a pre istotu aj na začiatku ďalšieho snímku.
    function restoreDraw(F) { for (const f of F.fighters) if (f.c2Draw) { Object.assign(f, f.c2Draw); f.c2Draw = null; } }
    hooks.drawBack.unshift((stage, F) => {           // pred ostatnými modulmi (impostor.js, blocky.js kreslia salto podľa stavu)
      restoreDraw(F);
      for (const f of F.fighters) {
        if (f.state !== 'c2flip') continue;
        const ph = (f.c2f && f.c2f.ph) || (f.t < FLIP.t ? 'flip' : 'dive');
        f.c2Draw = { state: f.state, t: f.t, move: f.move, flip: f.flip };
        if (ph === 'flip') Object.assign(f, { state: 'jump', move: null, flip: f.facing, t: Math.min(38, Math.round(f.t / FLIP.t * 39)) });
        else if (ph === 'dive') Object.assign(f, { state: 'airkick', move: 'airkick', t: 10 });
        else Object.assign(f, { state: 'idle', move: null });
      }
    });
    hooks.drawHud.push(F => restoreDraw(F));
    function shout(f, str, color, size = 12) {        // nápis nad hlavou, vysoko vo vzduchu najvyššie pod HUD (ukazovatele, labka)
      const top = (f.def.height || 138) * (f.def.scale || 1);
      api.text(str, f.x, Math.max(66, f.y - top - 10), size, 'center', color);
    }
    function drawRockyHelp(r) {
      const state = r.st === 'bite' ? 'bite' : r.st === 'lick' ? 'lick' : r.st === 'wait' ? 'idle' : 'run';
      api.drawRocky({ x: r.x, y: GROUND, dir: r.dir, state, t: r.t });
      if (r.st === 'bite' && r.t >= 8 && r.t < 34 && !r.blocked) api.text('HAV!', r.x + r.dir * 30, GROUND - 78 - Math.min(6, r.t - 8), 13, 'center', '#ffcf6e');
    }
    function drawWave(p) {
      const d = p.dir, n = 7, L = WAVE.len, pts = [];
      for (let i = 0; i < n; i++) {                  // hrebeň vlny vpredu, chvost klesá k zemi
        const k = i / (n - 1);
        pts.push([p.x - d * k * L, GROUND - 14 - 42 * Math.sin(Math.PI * (0.35 + 0.65 * k)) + Math.sin((p.t + i * 5) / 4) * 3]);
      }
      ctx.save();
      const g = ctx.createLinearGradient(p.x - d * L, 0, p.x + d * 10, 0);
      g.addColorStop(0, 'rgba(255,226,58,0)'); g.addColorStop(0.55, 'rgba(255,200,80,0.26)'); g.addColorStop(1, 'rgba(255,140,220,0.4)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(p.x + d * 10, GROUND);
      ctx.quadraticCurveTo(p.x + d * 12, pts[1][1] + 2, pts[1][0], pts[1][1] + 4);   // zaoblené čelo vlny
      for (let i = 2; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1] + 5);
      ctx.lineTo(p.x - d * L, GROUND); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';   // pena na hrebeni
      ctx.beginPath(); ctx.moveTo(p.x + d * 9, pts[0][1] + 16); ctx.quadraticCurveTo(p.x + d * 10, pts[1][1] + 1, pts[1][0], pts[1][1] + 3);
      ctx.lineTo(pts[3][0], pts[3][1] + 5); ctx.stroke();
      ctx.restore();
      pts.forEach(([x, y], i) => api.text(i % 2 ? '♫' : '♪', x, y, i === 0 ? 17 : 15 - Math.floor(i / 2), 'center', ['#ffe23a', '#7dfcff', '#ff8af0'][i % 3]));
    }
    function drawSolo(p) {
      const a = Math.max(0, 1 - p.t / SOLO.life), d = p.dir, a0 = d > 0 ? -1.25 : Math.PI - 1.25;   // predná časť kruhu ±72°
      ctx.save();
      if (typeof p.p14cut === 'number') { ctx.beginPath(); if (d > 0) ctx.rect(0, 0, p.p14cut, api.H); else ctx.rect(p.p14cut, 0, W - p.p14cut, api.H); ctx.clip(); }   // stena Banánáča
      ctx.lineCap = 'round';
      for (let i = 0; i < SOLO.rings; i++) {
        const r = p.r - i * SOLO.gap; if (r < 6) continue;
        const col = ['#ffffff', '#9fe8ff', '#ffb3f0'][i], w = [4, 3, 2.5][i];
        ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(30,10,60,0.55)'; ctx.lineWidth = w + 2.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, a0, a0 + 2.5); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(p.x, p.y, r, a0, a0 + 2.5); ctx.stroke();
        ctx.globalAlpha = a * 0.28; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r, a0 + 2.5, a0 + Math.PI * 2); ctx.stroke();   // zvyšok kruhu slabo
      }
      ctx.restore();
      if (p.r > 30 && a > 0.2) {                     // noty letia s vlnou
        ctx.save(); ctx.globalAlpha = a;
        for (const ang of [-0.6, 0, 0.6]) { const q = (d > 0 ? 0 : Math.PI) + ang * d; api.text('♪', p.x + Math.cos(q) * (p.r - 8), p.y + Math.sin(q) * (p.r - 8) + 5, 13, 'center', '#ffffff'); }
        ctx.restore();
      }
    }
    function laugh(f) {                              // bez rocky.js: smiech olízaného (inak ho kreslí rocky.js)
      const k = Math.floor(f.t / 10) % 2;
      shout(f, k ? 'HA HA!' : 'HA HA HA!', '#ffe066', 11);
    }
    hooks.drawFront.push((stage, F) => {
      const S = F.c2; if (!S) return;
      for (const p of S.proj) { try { if (p.kind === 'wave') drawWave(p); else drawSolo(p); } catch (e) { /* efekt nesmie zhodiť hru */ } }
      for (const r of S.rocky) { try { drawRockyHelp(r); } catch (e) { /* efekt nesmie zhodiť hru */ } }
      for (const f of F.fighters) {
        const st0 = f.c2Draw ? f.c2Draw.state : f.state, t0 = f.c2Draw ? f.c2Draw.t : f.t;
        if (st0 === 'c2call' && t0 < 34) shout(f, 'ROCKY!', '#ffcf6e', 13);
        else if (st0 === 'c2wave' && t0 < 44) shout(f, 'HELIGÓNKA WAVE!', '#ffe23a', 11);
        else if (st0 === 'c2solo' && t0 < 48) shout(f, 'HUSLE SOLO!', '#9fe8ff', 11);
        else if (st0 === 'c2flip' && f.c2f && f.c2f.ph === 'dive') shout(f, 'FLIP KICK!', '#ffd200', 11);
        if (!api.rocky && f.state === 'smiech') laugh(f);
      }
    });
    // HUD: labka vedľa ukazovateľov = ROCKY HELP pripravený (sivá = v tomto kole už bol)
    const lastPaw = [null, null];                    // pre testy: 'ready' | 'run' | 'used' | null
    function drawPaw(x, y, mode) {
      const on = mode !== 'used', s = mode === 'run' ? 1 + 0.12 * Math.sin(api.frame / 3) : 1;
      const shapes = [[0, 2.2, 4.4, 3.6], [-4.6, -2.4, 1.9, 2.3], [-1.6, -4.8, 1.9, 2.3], [1.6, -4.8, 1.9, 2.3], [4.6, -2.4, 1.9, 2.3]];
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha = on ? 1 : 0.4;
      for (const [fill, grow] of [['#000', 1.3], [on ? '#ffcf6e' : '#8a8a8a', 0]])
        for (const [cx, cy, rx, ry] of shapes) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(cx, cy, rx + grow, ry + grow, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    hooks.drawHud.push(F => {
      lastPaw[0] = lastPaw[1] = null;
      if (F.paused || !F.c2 || (F.phase !== 'intro' && F.phase !== 'fight')) return;   // vo FINISH HIM je tu nápoveda zakončení (finishers.js)
      F.fighters.forEach((f, side) => {
        if (!canRocky(f)) return;
        const mode = !f.c2Rocky ? 'ready' : F.c2.rocky.some(r => r.side === side) ? 'run' : 'used';
        lastPaw[side] = mode;
        drawPaw(side === 0 ? 12 + 190 - 4 : W - 12 - 190 + 4, 49, mode);
      });
    });

    // ================================================================ pomoc (OVLÁDANIE A ÚDERY, TRÉNING) a API pre testy
    const HELP = [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — ako api.moves.help
      ['FLIP KICK', 'W VPRED G', '↑ VPRED L', '▲ ▶ ✕', 'páčka hore, vpred + KOP'],
      ['ROCKY HELP', 'S VZAD R', '↓ VZAD I', '↓ ◀ ○', 'páčka dole, vzad + KIAI'],
      ['HELIGÓNKA WAVE (Matúško)', 'VPRED VPRED T', 'VPRED VPRED O', '▶ ▶ △', 'páčka vpred 2× + ♪'],
      ['HUSLE SOLO (Šimon)', 'VPRED VPRED T', 'VPRED VPRED O', '▶ ▶ △', 'páčka vpred 2× + ♪'],
    ];
    if (api.moves && Array.isArray(api.moves.help)) api.moves.help.push(...HELP);   // strana ŠPECIÁLNE ÚDERY v OVLÁDANÍ
    function rows(f) {                               // riadky panela TRÉNINGU pre bojovníka f: { id, help, test(f) → podarilo sa }
      const out = [], ins = instrumentOf(f);
      if (canFlip(f)) out.push({ id: 'c2_flip', help: HELP[0], test: x => x.state === 'c2flip' });
      if (canRocky(f)) out.push({ id: 'c2_rocky', help: HELP[1], test: x => x.state === 'c2call' });
      if (ins === 'wave') out.push({ id: 'c2_wave', help: HELP[2], test: x => x.state === 'c2wave' });
      if (ins === 'solo') out.push({ id: 'c2_solo', help: HELP[3], test: x => x.state === 'c2solo' });
      return out;
    }
    api.combos2 = {
      help: HELP, rows, instrumentOf, canFlip, canRocky, ai: AI,
      cfg: { SEQ_GAP, FLIP_GAP, MUSIC_CD, RK, WAVE, SOLO, FLIP },
      force: { rocky: null },                        // testy: 'bite' | 'lick' (inak náhodne)
      start: (f, name) => { const F = api.fight; return !!F && start(f, F.fighters[1 - f.side], name); },
      get lastPaw() { return lastPaw.slice(); },
    };
  },
});
