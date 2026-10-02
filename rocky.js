// MATÚŠKO KOMBAT XII — modul rocky: ROCKY, zlatý retríver ako hrateľný bojovník (HAV!, KOSŤ, OLIZ) (P8)
//
//   HAV! ......... KIAI               hnedá tlaková vlna od papule (ako KIAI lúč chlapcov), zrazí; nabíja sa ako KIAI
//   KOSŤ ......... ♪                  hodí kosť (letí ako noty heligónky), malé poškodenie, kosť sa odrazí; nabíja sa 2× rýchlejšie
//   OLIZ ......... ↓ VPRED + ÚDER     olízne súpera zblízka: ~1 s sa smeje (HA HA) a nemôže nič robiť; vlastný ukazovateľ OLIZ
//   + univerzálne pohyby z moves.js ako hryzy (animácia bite): ↓+ÚDER = skok do výšky s hryzom (uppercut), ↓+KOP = nízky hryz
//     (podkop), VPRED VPRED KOP = skok na súpera (letiaci kop), ÚDER ÚDER KOP = kombo 3. Bez tornáda a teleportu (moveSpecial: null).
//
// Rocky je nízky (~80 px, chlapci ~140 px). game.js berie zásahovú zónu z def.height: Rocky má 100 („chlpatý“), takže ho trafia
// všetky bežné údery a kopy (MOVE y −126…−88 a nižšie). Jeho hryzy majú zóny chlapcov, ktoré človeka (138 px) trafia vždy.
// Iskry zásahov sa posúvajú na Rockyho telo / k jeho papuli (afterHit), aby zásah nevyzeral ako netrafený úder nad hlavou.
// Sprity sú v manifeste v A.rocky (cameo ROCKYALITY, Toasty); modul ich sprístupní bojovníkovi ako FA.rocky.
// Vstup len cez inp (held / pressed / history) a api.matchSeq; počítač cez hooks.cpu + zámer v inp.rkIntent (ako enemies.js).
// Sieťová hra: stav schopností je len čisté dáta (F.rk.proj so side, f.rkOliz, f.rkBy = side, F.rkAlity…); hosť nesimuluje (frame), len kreslí.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'rocky',
  init(api) {
    'use strict';
    const { W, GROUND, MOVE, FA, IMG, A, hooks, ctx, NET } = api;
    const { rnd, chance, clamp } = api;
    const ID = 'rocky';
    const ANIMS = (FA[ID] && FA[ID].anims) || (A && A.rocky && A.rocky.anims) || null;
    if (!ANIMS || !ANIMS.idle) return;     // bez spritov ostáva Rocky len cameo a kód na výbere hlási „trénuje“

    // ================================================================ nastavenia (Master môže doladiť)
    const KIAI_CD = 300, SPECIAL_CD = 420;      // rovnaké ako v game.js (ukazovatele KIAI a ♪ v HUD)
    const KOST_FAST = 1;                        // KOSŤ: navyše −1 za snímku → nabije sa za 3,5 s (heligónka 7 s)
    const OLIZ_CD = 180;                        // OLIZ: 3 s
    const LAUGH = 60;                           // súper sa po OLIZE smeje ~1 s
    const SEQ_GAP = 20;                         // max. snímok medzi stlačeniami ↓ VPRED ÚDER (deti, joystick na mobile)
    const WAVE = { grow: 18, len: 220, hitT: 24, life: 34, dmg: 8, push: 4.6 };
    const BONE = { vx: 4.4, dmg: 5, push: 2.4, hitstun: 14, fade: 55 };
    const HOP = -4.4;                           // uppercut: Rocky vyskočí (vzduch ~23 snímok, pohyb trvá 39)

    // ================================================================ bojovník
    if (!FA[ID]) FA[ID] = { anims: Object.assign({}, ANIMS) };    // game.js hľadá sprity bojovníkov vo FA (A.fighters)
    const SET = FA[ID].anims;
    const DEF = {
      name: 'ROCKY', short: 'ROCKY', rocky: true,
      gi: '#d9a441', giDark: '#a86f24', belt: '#c0392b', hair: '#b07a26',   // farby kreslených náhrad (vyhodenie, portrét)
      special: 'kost', specialName: 'BONE', kiaiName: 'WOOF!', finisher: 'rockyality',   // kiaiName: nápis ukazovateľa v HUD
      moveSpecial: null,                        // moves.js: bez tornáda a teleportu (uppercut, podkop, letiaci kop a kombo ostávajú ako hryzy)
      hp: 85, height: 100, speed: 1.3,          // menej života, chlpatá zásahová zóna, rýchlejší beh (speed rieši ladder.js)
      blurb: ['Zlatý retríver.', 'HAV!, KOSŤ a OLIZ:', 'súper sa musí smiať.'],
    };
    api.registerFighter(ID, DEF, false);        // nevoliteľný: odomyká ho ladder.js (kód ↓↓↓ + ♪, rebrík HORA)
    const mine = f => !!(f && f.def && f.def.rocky);

    Object.assign(MOVE, {
      hav:  { startup: 12, active: 1, recovery: 22 },
      kost: { startup: 10, active: 1, recovery: 18 },
      oliz: { startup: 9, active: 7, recovery: 22, dmg: 3, x0: 4, x1: 66, y0: -96, y1: -6, hitstun: 0, push: 0.6, sound: 'lick', effect: 'smiech' },
    });
    for (const s of ['hav', 'kost', 'oliz']) api.ATTACK_STATES.add(s);
    api.HIT_STATES.add('oliz');                 // zásah OLIZU rieši game.js (checkAttack → applyHit → effect 'smiech')
    api.animFallback('hav', 'kiai');            // Rocky: kiai → bite (otvorená papuľa)
    api.animFallback('kost', 'special');        // Rocky: special → bite (hodí kosť hlavou)
    api.animFallback('oliz', 'lick');
    api.animFallback('smiech', 'hit');          // olizovaný sa smeje: animácia zásahu v slučke
    api.animFallback('rk_dizzy', 'dizzy');      // len pri kreslení (hviezdičky nižšie nad Rockyho hlavou)
    api.animFallback('rk_deaf', 'deaf');
    api.animFallback('rk_dazed', 'dazed');

    // ================================================================ vstup (pred moves.js: ↓ VPRED ÚDER nesmie byť uppercut)
    function start(f, o, mv) {
      if (o) f.facing = o.x >= f.x ? 1 : -1;
      switch (mv) {
        case 'hav':
          if (f.cd.kiai > 0) return false;
          f.set('hav', 'hav'); f.cd.kiai = KIAI_CD; f.vx = 0; return true;
        case 'kost':
          if (f.cd.special > 0) return false;
          f.set('kost', 'kost'); f.cd.special = SPECIAL_CD; f.vx = 0; api.sfx('whoosh', 0.4); return true;
        case 'oliz':
          if (f.rkOliz > 0 || !f.onGround) return false;
          f.set('oliz', 'oliz'); f.rkOliz = OLIZ_CD; api.sfx('whoosh', 0.35); return true;
      }
      return false;
    }
    hooks.input.unshift((f, o, inp) => {
      if (!mine(f) || !inp) return false;
      const F = api.fight; if (!F) return false;
      const p = inp.pressed || {}, h = inp.held || {};
      let mv = null;
      if (inp instanceof api.CPU) { const it = inp.rkIntent; inp.rkIntent = null; if (it && it.frame === api.frame) mv = it.move; }
      if (!mv && p.punch && F.phase === 'fight' && inp.history && api.matchSeq(inp, ['down', 'F', 'punch'], SEQ_GAP) && !(f.rkOliz > 0)) mv = 'oliz';
      if (!mv && p.kiai && !h.down) mv = 'hav';           // ↓ drží blok ako u chlapcov
      if (!mv && p.special && !h.down) mv = 'kost';
      return mv ? start(f, o, mv) : false;               // nenabité HAV/KOSŤ: game.js ich tiež nespustí (cooldown)
    });

    // ================================================================ stavy
    hooks.state.push((f) => {
      switch (f.state) {
        case 'hav': {
          const m = MOVE.hav; f.vx *= 0.7;
          if (f.t === m.startup) spawnWave(f);
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'kost': {
          const m = MOVE.kost; f.vx *= 0.7;
          if (f.t === m.startup) spawnBone(f);
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'oliz': {
          const m = MOVE.oliz;
          if (f.t === 1) f.vx = f.facing * 2.4; else f.vx *= 0.8;     // malý výpad k súperovi
          if (f.hitDone) f.vx *= 0.5;
          if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
          return true;
        }
        case 'smiech':                                              // ktokoľvek po OLIZE: nemôže nič robiť
          f.vx *= 0.8;
          if (--f.stun <= 0) f.set('idle');
          return true;
      }
      return false;
    });

    // ================================================================ strely: HAV (vlna) a KOSŤ
    // Len čisté dáta v F.rk (sieťová hra: hostiteľ ich posiela hosťovi ako JSON), strelec = side, nie odkaz na bojovníka.
    const ST = F => F.rk || (F.rk = { proj: [], phase: null });
    function spawnWave(f) {
      const F = api.fight; if (!F) return;
      ST(F).proj.push({ kind: 'wave', side: f.side, x: f.x + f.facing * 30, y: f.y - 52, dir: f.facing, len: 0, t: 0, hit: false });
      api.sfx('bark', 0.95); api.shake(4);
    }
    function spawnBone(f) {
      const F = api.fight; if (!F) return;
      ST(F).proj.push({ kind: 'bone', side: f.side, x: f.x + f.facing * 32, y: f.y - 46, vx: f.facing * BONE.vx, vy: 0, rot: 0, t: 0, st: 'fly', bt: 0 });
    }
    function hurtbox(o) {                       // rovnako ako hurtbox() v game.js
      const top = o.state === 'dance' ? 100 : (o.def.height || 138);
      return { x0: o.x - 17, x1: o.x + 17, y0: o.y - top, y1: o.y };
    }
    const canHit = (F, o) => F.phase === 'fight' && o.vulnerable && o.state !== 'dizzy';
    function updateProjectiles(F) {
      const R = ST(F);
      if ((F.phase === 'finish' || F.phase === 'finisher') && R.phase !== F.phase) R.proj.length = 0;   // FINISH HIM: strely zmiznú (ako noty a lúč)
      R.phase = F.phase;
      for (const p of R.proj) {
        p.t++;
        const f = F.fighters[p.side], o = F.fighters[1 - p.side];
        if (p.kind === 'wave') {
          p.len = Math.min(WAVE.len, p.len + WAVE.grow);
          const d = (o.x - p.x) * p.dir;
          if (!p.hit && p.t < WAVE.hitT && canHit(F, o) && d > -16 && d < p.len + 16 && o.y > GROUND - 50) {
            p.hit = true;
            api.applyHit(f, o, { name: 'hav', dmg: WAVE.dmg, knock: true, push: WAVE.push, sound: 'kick', sx: o.x - p.dir * 10, sy: p.y });
          }
          if (p.t >= WAVE.life) p.dead = true;
        } else if (p.st === 'fly') {
          p.x += p.vx; p.rot += 0.38 * Math.sign(p.vx);
          const h = hurtbox(o);
          if (canHit(F, o) && p.x + 9 > h.x0 && p.x - 9 < h.x1 && p.y + 6 > h.y0 && p.y - 6 < h.y1) {
            api.applyHit(f, o, { name: 'kost', dmg: BONE.dmg, push: BONE.push, hitstun: BONE.hitstun, sound: 'pop', sx: p.x, sy: p.y });
            p.st = 'bounce'; p.vx = -p.vx * 0.35; p.vy = -4.2;     // kosť sa odrazí od súpera a dopadne na zem
          } else if (p.x < -24 || p.x > W + 24) p.dead = true;
        } else {
          p.bt++; p.vy += 0.3; p.x += p.vx; p.y += p.vy; p.rot += 0.5 * Math.sign(p.vx || 1);
          if (p.y >= GROUND - 4) { p.y = GROUND - 4; p.vy = Math.abs(p.vy) > 1.2 ? -p.vy * 0.4 : 0; p.vx *= 0.6; }
          if (p.bt > BONE.fade || p.x < -24 || p.x > W + 24) p.dead = true;
        }
      }
      R.proj = R.proj.filter(p => !p.dead);
    }

    // ================================================================ zásahy: iskry na správnom mieste, OLIZ = smiech
    function moveSparks(F, a, d, m) {
      const sx = m.sx ?? d.x, sy = m.sy ?? d.y - 90;
      let ny = sy;
      if (mine(a)) ny = clamp(ny, a.y - 92, a.y - 10);      // Rockyho hryz: iskra pri papuli (vzpína sa najviac do ~90 px)
      if (mine(d)) ny = clamp(ny, d.y - 74, d.y - 14);      // zásah Rockyho: iskra na jeho tele, nie nad hlavou
      const pink = m.name === 'oliz';
      if (ny === sy && !pink) return;
      for (let i = F.fx.length - 1, n = 0; i >= 0 && n < 24; i--, n++) {
        const q = F.fx[i];
        if (q.kind === 'spark' && q.t === 0 && q.x === sx && q.y === sy) { q.y = ny; if (pink) q.c = '#ff8fc0'; }
      }
    }
    hooks.afterHit.push((a, d, m, blocked) => {
      const F = api.fight; if (!F || !m) return;
      if (mine(a) || mine(d) || m.name === 'oliz') moveSparks(F, a, d, m);
      if (m.name === 'oliz' && !blocked && d.state === 'smiech') {
        d.stun = LAUGH; d.rkBy = a.side; d.rkLaugh = api.frame;
        const top = d.y - (d.def.height || 138) * 0.62;
        for (let i = 0; i < 3; i++) F.fx.push({ kind: 'heart', x: d.x + rnd(-14, 14), y: top + rnd(-10, 10), vy: -0.6, t: 0, life: 46 });
      }
    });

    // ================================================================ každý snímok
    let leapReady = false, portraitDone = false;
    const HIDE_Y = -400;                       // ROCKYALITY s Rockym víťazom: bojovník je nad obrazovkou (pozri rockyality)
    const hiding = F => F.rkAlity && F.rocky && F.phase === 'finisher' && mine(F.fighters[F.winner]);
    function afterLoad() {                     // po načítaní obrázkov (game.js prepne z 'loading' na 'title')
      if (api.scene === 'loading') return;
      if (!leapReady) {                        // skok: bežiaci pes vo vzduchu namiesto stojaceho (manifest má jump → idle)
        leapReady = true;
        if (SET.run && IMG[ID + '/run']) { SET.jump = Object.assign({}, SET.run, { alias: 'run' }); IMG[ID + '/jump'] = IMG[ID + '/run']; }
      }
      if (!portraitDone) { portraitDone = true; makePortrait(); }
    }
    function restoreDraw(f) {                  // stav upravený len na kreslenie (drawBack) sa vráti
      if (f.rkDraw) { f.state = f.rkDraw; f.rkDraw = null; }
      if (f.rkFlip) { f.rkFlip = false; f.facing = -f.facing; }
      if (f.rkDy) { f.y -= f.rkDy; f.rkDy = 0; }
    }
    hooks.frame.push(() => {
      afterLoad();                                            // len miestne obrázky (skok, portrét), nie stav zápasu
      if (NET && NET.role === 'guest') return;               // hosť v sieťovej hre nič nesimuluje, len kreslí stav od hostiteľa
      if (api.scene !== 'fight') return;
      const F = api.fight; if (!F) return;
      for (const f of F.fighters) restoreDraw(f);
      if (F.paused) return;
      for (const f of F.fighters) {
        if (f.rkOliz > 0) f.rkOliz--;
        if (!mine(f)) continue;
        if (f.cd.special > 0) f.cd.special = Math.max(0, f.cd.special - KOST_FAST);
        if (f.state === 'jump') {
          if (f.flip) f.flip = 0;                              // pes skáče rovno, bez salta
          if (!f.rkLeap) { f.rkLeap = true; f.vx *= 1.3; }      // rýchlejší pes doskočí ďalej
        } else f.rkLeap = false;
        if (f.state === 'uppercut' && f.t === 3 && f.onGround) f.vy = HOP;     // skok do výšky s hryzom
        if (f.state === 'win' && (f.t === 8 || f.t === 30)) api.sfx('bark', 0.7);
      }
      updateProjectiles(F);
      rockyality(F);
    });
    // ROCKYALITY, keď vyhral Rocky: nepribehne druhý pes, olizuje sám (cameo game.js vybehne z jeho miesta, bojovník je skrytý
    // nad obrazovkou — vo vzduchu ho separate() v game.js neberie do úvahy, takže neodtláča súpera pred cameom)
    function rockyality(F) {
      const w = F.fighters[F.winner];
      if (F.phase === 'finisher' && F.finisher === 'rockyality' && F.rocky && mine(w)) {
        if (!F.rkAlity) {
          F.rkAlity = true;
          const L = F.fighters[F.loser];
          F.rocky.x = w.x; F.rocky.dir = L.x >= w.x ? 1 : -1;
        }
        w.y = HIDE_Y; w.vy = 0; w.x = clamp(F.rocky.x, 22, W - 22);          // tieň ide s cameom
      } else if (F.rkAlity && F.phase !== 'finisher') {
        F.rkAlity = false;
        if (w) { w.y = GROUND; w.vy = 0; if (F.rocky) { w.x = clamp(F.rocky.x, 22, W - 22); w.facing = F.rocky.dir; } }
        F.rocky = null;
      }
    }
    hooks.matchStart.push(F => { F.rk = { proj: [], phase: null }; F.rkAlity = false; });
    hooks.roundStart.push(F => {
      ST(F).proj.length = 0;
      for (const f of F.fighters) Object.assign(f, { rkOliz: 0, rkAi: null, rkLeap: false, rkDraw: null, rkFlip: false, rkDy: 0, rkBy: -1, rkLaugh: 0 });
    });

    // ================================================================ počítač: HAV zďaleka, KOSŤ na diaľku, OLIZ zblízka, po OLIZE hryz
    function intent(c, mv) { c.rkIntent = { move: mv, frame: api.frame }; return { held: {}, pressed: {} }; }
    hooks.cpu.unshift((c, f, o, phase) => {
      if (!mine(f) || phase !== 'fight' || !o) return null;
      const ai = f.rkAi || (f.rkAi = { next: 45, key: null, go: false });
      const lv = clamp(c.level || 0.6, 0.3, 1.3);
      const d = Math.abs(o.x - f.x), toward = o.x > f.x ? 'right' : 'left';
      const free = (f.state === 'idle' || f.state === 'walk' || f.state === 'block') && f.onGround;
      if (o.state === 'smiech' && o.rkBy === f.side) {        // súper sa smeje → dobehni a hryzni (rozhodne sa raz za OLIZ)
        if (ai.key !== o.rkLaugh) { ai.key = o.rkLaugh; ai.go = chance(0.5 + 0.4 * lv); }
        if (ai.go) {
          if (!free) return { held: {}, pressed: {} };
          if (d > 72) return { held: { [toward]: true }, pressed: {} };
          return chance(0.5) ? { held: { down: true }, pressed: { punch: true } } : { held: {}, pressed: { punch: true } };
        }
      }
      if (ai.next > 0) { ai.next--; return null; }
      if (!free || !o.vulnerable || o.state === 'dizzy') return null;
      ai.next = Math.round(rnd(30, 70) / lv);
      if (f.cd.special === 0 && d >= 140 && chance(0.5 * lv)) return intent(c, 'kost');
      if (f.cd.kiai === 0 && d >= 80 && d <= 240 && o.onGround && chance(0.4 * lv)) return intent(c, 'hav');
      if (!(f.rkOliz > 0) && d < 88 && o.onGround && !o.attacking && chance(0.6 * lv)) return intent(c, 'oliz');
      return null;                                            // inak moves.js (hryzy, skoky) a základná logika game.js
    });

    // ================================================================ kreslenie
    hooks.drawBack.push((stage, F) => {        // pred postavami: game.js kreslí hviezdičky 146 px nad zemou → pri Rockym ich kreslí modul nižšie
      if (hiding(F)) F.fighters[F.winner].x = clamp(F.rocky.x, 22, W - 22);    // ROCKYALITY: tieň presne pod cameom
      for (const f of F.fighters) {
        if (!mine(f)) continue;
        const sw = { dizzy: 'rk_dizzy', deaf: 'rk_deaf', dazed: 'rk_dazed' }[f.state];
        if (sw) { f.rkDraw = f.state; f.state = sw; }
        if (f.state === 'dance') {             // tanec po heligónke: poskakuje a otáča sa
          if (Math.floor(f.t / 12) % 2) { f.rkFlip = true; f.facing = -f.facing; }
          f.rkDy = -Math.round(Math.abs(Math.sin(f.t / 6)) * 8); f.y += f.rkDy;
        }
      }
    });
    function stars(f) {
      const cx = f.x + f.facing * 24, cy = f.y - 86;
      for (let i = 0; i < 3; i++) {
        const a = f.t / 9 + i * Math.PI * 2 / 3, x = Math.round(cx + Math.cos(a) * 14), y = Math.round(cy + Math.sin(a) * 4);
        ctx.fillStyle = '#ffe23a'; ctx.fillRect(x - 1, y - 3, 3, 7); ctx.fillRect(x - 3, y - 1, 7, 3);
      }
    }
    function laugh(f) {
      const top = f.y - (f.def.height || 138) * (f.def.scale || 1) - 8, k = Math.floor(f.t / 10) % 2;
      api.text(k ? 'HA HA!' : 'HA HA HA!', f.x + (k ? -8 : 8), top - (f.t % 10 < 5 ? 0 : 3), 11, 'center', '#ffe066');
    }
    function drawWave(p, f) {
      const a = p.t < 22 ? 1 : Math.max(0, 1 - (p.t - 22) / 12), x0 = p.x, d = p.dir;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(150,95,40,0.26)';
      ctx.beginPath(); ctx.moveTo(x0, p.y - 6); ctx.lineTo(x0 + d * p.len, p.y - 28); ctx.lineTo(x0 + d * p.len, p.y + 28); ctx.lineTo(x0, p.y + 6); ctx.closePath(); ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {            // zvukové oblúky ))) sa valia od papule
        const dist = p.len - i * 26 - (p.t * 4) % 26; if (dist < 10) continue;
        const r = 9 + dist * 0.1, cx = x0 + d * (dist - r), a0 = d > 0 ? -0.85 : Math.PI - 0.85, a1 = a0 + 1.7;
        ctx.strokeStyle = '#5a3412'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, p.y, r, a0, a1); ctx.stroke();
        ctx.strokeStyle = '#e6ac5c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, p.y, r, a0, a1); ctx.stroke();
      }
      ctx.restore();
      if (p.t < 26 && f) api.text('HAV!', f.x + d * 8, f.y - 94 - Math.min(6, p.t), 15, 'center', '#ffcf6e');
    }
    function drawBone(p) {
      const a = p.st === 'fly' ? 1 : clamp((BONE.fade - p.bt) / 15, 0, 1);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.rect(-9, -2.5, 18, 5);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.moveTo(sx * 10 + 3.8, sy * 3); ctx.arc(sx * 10, sy * 3, 3.8, 0, Math.PI * 2); }
      ctx.strokeStyle = '#5b4a2e'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#f6eedb'; ctx.fill();
      ctx.restore();
    }
    hooks.drawFront.push((stage, F) => {
      for (const f of F.fighters) {
        const was = f.rkDraw; restoreDraw(f);
        if (!mine(f)) { if (f.state === 'smiech') laugh(f); continue; }
        if (was === 'dizzy' || was === 'deaf' || was === 'dazed') stars(f);
        if (was === 'deaf' && f.t % 30 < 15) api.text('ÍÍÍÍ!', f.x, f.y - 104, 10, 'center', '#ff7070');
        if (f.state === 'smiech') laugh(f);
        if (f.state === 'hav' && f.t < MOVE.hav.startup) {      // nádych pred štekotom
          const r = 2 + f.t * 0.6, x = f.x + f.facing * 32, y = f.y - 52;
          ctx.save(); ctx.globalAlpha = 0.7; ctx.strokeStyle = '#e6ac5c'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        }
      }
      for (const p of (F.rk && F.rk.proj) || []) { try { if (p.kind === 'wave') drawWave(p, F.fighters[p.side]); else drawBone(p); } catch (e) { /* efekt nesmie zhodiť hru */ } }
    });
    hooks.drawHud.push(F => {
      if (F.paused) return;
      F.fighters.forEach((f, side) => {
        if (!mine(f)) return;
        const right = side === 1, x = right ? W - 12 - 190 : 12;
        const v = clamp(1 - (f.rkOliz || 0) / OLIZ_CD, 0, 1), col = '#ff8fc0';
        const mx = right ? x + 190 - 60 - 132 : x + 132, my = 27;     // tretí ukazovateľ vedľa KIAI a KOSTI (ako TORNÁDO v moves.js)
        ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
        ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * v), 4);
        api.text('OLIZ', mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
        if (F.round === 1 && (F.phase === 'intro' || (F.phase === 'fight' && F.t < 240)) && api.inputKind(side) !== 'cpu') {
          const k = (b, word) => api.keyHint(side, b).trim() || word;      // klávesa / tlačidlo ovládača, na dotyku slová
          api.text(`HAV! = ${k('kiai', 'KIAI')} · KOSŤ = ${k('special', '♪')} · OLIZ = ${k('down', '↓')} VPRED ${k('punch', 'ÚDER')}`,
            side === 0 ? 8 : W - 30, 254, 7, side === 0 ? 'left' : 'right', '#ffe08a');
        }
      });
    });

    // ================================================================ portrét a bábätko (náhrady, kým Master nedodá img/portrait_rocky, img/baby_rocky)
    function makePortrait() {
      if (IMG['img/portrait_' + ID]) return;
      const im = IMG[ID + '/idle'], a = SET.idle; if (!im || !a) return;
      const c = document.createElement('canvas'); c.width = 96; c.height = 120;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#4f8a3c'); g.addColorStop(0.6, '#2d5a26'); g.addColorStop(1, '#16300f');
      x.fillStyle = g; x.fillRect(0, 0, 96, 120);
      x.imageSmoothingEnabled = false;
      const sw = 48, sh = 60, sx = clamp(a.w - sw - 2, 0, a.w - sw);    // hlava a hruď z prvej snímky postoja (pes hľadí doprava)
      x.drawImage(im, sx, 0, sw, sh, 0, 2, 96, 120);
      IMG['img/portrait_' + ID] = c;
    }
    function puppy() {                          // BABALITY: šteniatko s cumlíkom (drawBaby v game.js ho kreslí a poskakuje)
      const c = document.createElement('canvas'); c.width = 60; c.height = 58;
      const x = c.getContext('2d');
      x.scale(1.3, 1.3);                        // kreslené v mriežke 46 × 44
      const el = (cx, cy, rx, ry, col, rot = 0) => { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); x.fill(); };
      x.strokeStyle = '#c48f2f'; x.lineWidth = 3; x.lineCap = 'round';
      x.beginPath(); x.moveTo(34, 34); x.quadraticCurveTo(43, 30, 41, 22); x.stroke();     // chvostík
      el(23, 33, 13, 9, '#e0b04f');                                                       // telo
      el(16, 41, 4, 3, '#f1d189'); el(30, 41, 4, 3, '#f1d189');                           // labky
      el(23, 17, 12, 11, '#e8bd62');                                                      // hlava
      el(11, 18, 4.5, 8.5, '#b07a26', 0.35); el(35, 18, 4.5, 8.5, '#b07a26', -0.35);      // uši
      el(23, 22, 6.5, 4.5, '#f1d189');                                                    // ňufák
      el(23, 19.5, 2.6, 2, '#1b1b1b');                                                    // nos
      el(18, 14, 2.6, 2.8, '#1b1b1b'); el(28, 14, 2.6, 2.8, '#1b1b1b');                   // veľké oči
      x.fillStyle = '#fff'; x.fillRect(18, 12, 1.5, 1.5); x.fillRect(28, 12, 1.5, 1.5);
      el(23, 27, 3, 3, '#5fb4ff'); el(23, 27, 1.4, 1.4, '#d8f0ff');                       // cumlík
      return c;
    }
    if (!IMG['img/baby_' + ID]) IMG['img/baby_' + ID] = puppy();     // dodaný obrázok baby_rocky ho pri načítaní prepíše

    // pre testy a ostatné moduly
    api.rocky = { def: DEF, start: (f, mv) => { const F = api.fight; return !!F && start(f, F.fighters[1 - f.side], mv); },
                  cfg: { KIAI_CD, SPECIAL_CD, OLIZ_CD, LAUGH, SEQ_GAP, WAVE, BONE, HOP },
                  help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — ako api.moves.help (OVLÁDANIE)
                    ['WOOF! (ROCKY)', 'R', 'I', '○', 'KIAI'],
                    ['BONE (ROCKY)', 'T', 'O', '△', '♪'],
                    ['LICK (ROCKY)', 'S VPRED F', '↓ VPRED K', '↓ ▶ □', 'páčka dole, vpred + ÚDER'],
                  ] };
  },
});
