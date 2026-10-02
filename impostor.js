// MATÚŠKO KOMBAT XII — modul impostor: IMPOSTOR, tajná postava z Among Us (VENT, SABOTAGE, EMERGENCY MEETING, SUS!) (P13)
//
//   VENT ................ ♪               skočí do šachty v zemi (poklop), zmizne a vyskočí zo šachty za súperovým chrbtom (BAF!)
//   SABOTAGE ............ ↓ VPRED ♪       „vypne svetlá“ na 3 s: tma, súper vidí len kruh okolo seba a je pomalší
//   EMERGENCY MEETING ... VZAD VZAD ♪     nápis a zvonček, súper ~1,5 s „hlasuje“ (zamrzne, nad ním hlasovací lístok); raz za kolo
//   SUS! ................ pasívne         pri výhre nad ním bublina SUS!
//   + univerzálne pohyby z moves.js (uppercut = výskok s päsťou, podkop nôžkou, letiaci kop, kombo 3 s hlavičkou telom),
//     bez tornáda a teleportu (moveSpecial: null).
//
// Kreslený len kódom, bez spritov. game.js dostane „živý sprite“: FA.impostor má pre všetky animácie jednu snímku — plátno,
// ktoré modul každý snímok prekreslí podľa stavu bojovníka (drawBack). game.js ho potom kreslí ako každý sprite: tieň,
// otočenie, mierka (def.scale), poradie postáv, blikanie pri zásahu aj kreslenie u sieťového hosťa ostávajú ako pri ostatných.
// FA.impostor je nevymenovateľná vlastnosť, aby ju loadImages v game.js nehľadal ako súbor. Dvaja IMPOSTORI v jednom zápase:
// druhý má f.mimic = 'impostor_b' (vlastné plátno). Mimo boja (napr. úvod tajného súboja v ladder.js) je na plátne postoj.
// Salto, aura Super Saiyana a skrytie v šachte: modul počas kreslenia dočasne upraví f.flip / f.ssj / f.x (drawBack) a hneď
// po kreslení postáv ich vráti (prvý háčik drawFront; poistka v hooks.frame) — rovnaký postup ako tornádo v moves.js.
// Vstup len cez inp (held / pressed / history) a api.matchSeq; počítač cez hooks.cpu + zámer v inp.impIntent (ako glitch.js).
// Sieťová hra: stav len ako čisté dáta v F.imp (poklopy, tma, porada, nápisy, počítadlá; bojovníci cez side) a vo bojovníkoch
// (f.impV = poklopy VENTU, f.impMeet, f.mimic); logika beží len u hostiteľa, hosť iba kreslí.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'impostor',
  init(api) {
    'use strict';
    const { W, GROUND, MOVE, FA, IMG, hooks, ctx } = api;
    const { rnd, chance, clamp } = api;
    const ID = 'impostor', ID_B = 'impostor_b';

    // ================================================================ ladenie (snímky pri 60 fps)
    const SPECIAL_CD = 420;                     // ukazovateľ ♪ v HUD game.js počíta s 420
    const VENT_FAST = 6;                        // VENT: navyše −1 každú 6. snímku → nabije sa za 6 s
    const VENT = { open: 10, dive: 13, sink: 22, safe: 16, exitShow: 40, out: 56, behind: 48, hatchLife: 38 };
    const SAB_CD = 720, SAB_T = 180, SAB_CAST = 14, SAB_SLOW = 0.35, SAB_R = 74;   // 12 s cooldown, 3 s tma
    const MEET_CAST = 14, MEET_FREEZE = 90, MEET_PEND = 60;                        // 1,5 s hlasovanie
    const SEQ_GAP = 30;                         // max. snímok medzi stlačeniami v kombe (benevolentné pre deti)

    // ================================================================ farby a rozmery (postava kreslená doprava, chodidlá v 0,0)
    const C0 = { base: '#d42129', dark: '#7f0c1d', light: '#ff7a6c', ink: '#16101a',
                 visor: '#a9dcef', visorDark: '#4f86a6', glint: '#ffffff', metal: '#8e98a6', metalDark: '#3c434e' };
    const C = Object.assign({}, C0);            // farby práve kresleného kozmonauta (def.impColors ich môže zmeniť)
    const LEG = 26;                             // dĺžka nôh (bok tela 104 + nohy 26 = výška ~130 px ako chlapci)
    const OUT = 2.6;                            // hrúbka čierneho obrysu
    const CW = 260, CH = 236, AX = 140, AY = 206;   // živé plátno: kotva (chodidlá) v AX, AY; AX ≈ dĺžka ležiacej postavy (FUTBALITY)

    // ================================================================ postava
    const DEF = {
      impostor: true, name: 'IMPOSTOR', short: 'IMPOSTOR',
      gi: C.base, giDark: C.dark, belt: C.visor, hair: C.dark,       // farby kreslených náhrad (vyhodenie: červený kozmonaut)
      special: 'husle', specialName: 'VENT', finisher: 'babality',   // ♪ vždy zachytí tento modul (husle sú len poistka)
      moveSpecial: null, height: 130,
      blurb: ['Niekto z posádky je SUS.', 'VENT, SABOTAGE', 'a EMERGENCY MEETING.'],
    };
    api.registerFighter(ID, DEF, false);       // nevoliteľný: odomyká ho výhra tajného súboja (ladder.js)
    const mine = f => !!(f && f.def && f.def.impostor);

    Object.assign(MOVE, {
      imp_vent: { startup: VENT.out, active: 1, recovery: 1 },
      imp_pop:  { startup: 3, active: 12, recovery: 16, dmg: 7, x0: -6, x1: 58, y0: -150, y1: -30, hitstun: 22, push: 3.2, sound: 'kick' },
      imp_sab:  { startup: SAB_CAST, active: 1, recovery: 22 },
      imp_meet: { startup: MEET_CAST, active: 1, recovery: 30 },
    });
    for (const s of ['imp_vent', 'imp_pop', 'imp_sab', 'imp_meet']) api.ATTACK_STATES.add(s);
    api.HIT_STATES.add('imp_pop');              // zásah výskoku zo šachty rieši game.js (checkAttack → applyHit)
    api.animFallback('imp_vote', 'idle');       // súper počas porady stojí a „hlasuje“ (jeho vlastný sprite postoja)

    // ================================================================ živý sprite: plátno pre každú animáciu
    const NAMES = ['idle', 'walk', 'jump', 'airkick', 'block', 'punch', 'kick', 'kiai', 'special', 'hit', 'fall', 'dizzy', 'deaf',
                   'dance', 'win', 'kroj'];     // bez 'baby' (BABALITY kreslí game.js z img/baby_impostor) a 'flip' (salto kreslí modul)
    const LIVE = {};
    function liveSet(key) {
      const c = document.createElement('canvas'); c.width = CW; c.height = CH;
      const a = { frames: 1, w: CW, h: CH, ax: AX, ay: AY, fps: 1, scale: 1, tuck: 0, live: true };
      const anims = {};
      for (const n of NAMES) { anims[n] = a; IMG[key + '/' + n] = c; }
      Object.defineProperty(FA, key, { value: { anims, live: true }, enumerable: false, configurable: true, writable: true });
      const gold = document.createElement('canvas'); gold.width = CW; gold.height = CH;
      LIVE[key] = { c, g: c.getContext('2d'), gold, gg: gold.getContext('2d') };
    }
    liveSet(ID); liveSet(ID_B);
    const liveOf = f => LIVE[f.sid] || LIVE[ID];

    // ================================================================ zvuky (Master môže dodať imp_vent, imp_alarm, imp_meeting; dovtedy náhrada)
    const has = n => !!(api.A && api.A.sounds && api.A.sounds[n]);
    const ALT = { imp_vent: [['block', 0.55], ['whoosh', 0.45]], imp_pop: [['pop', 0.8], ['whoosh', 0.5]],
                  imp_alarm: [['thunder', 0.45], ['confirm', 0.5]], imp_beep: [['confirm', 0.4]],
                  imp_meeting: [['menu', 0.95], ['confirm', 0.55]], imp_sus: [['pop', 0.5]] };
    function snd(n, v = 0.8) { if (has(n)) api.sfx(n, Math.min(1, v)); else for (const [k, w] of ALT[n] || [[n, v]]) api.sfx(k, Math.min(1, w * v / 0.8)); }

    // ================================================================ pomôcky
    const fight = () => api.fight;
    const host = () => !(api.NET && api.NET.role === 'guest');
    const live = F => !!(F && api.scene === 'fight' && !F.paused);
    const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
    const seq = (inp, s) => !!(inp && inp.history && api.matchSeq(inp, s, SEQ_GAP));
    const HEIGHT = f => ((f.def && f.def.height) || 138) * ((f.def && f.def.scale) || 1);
    const newUse = () => ({ vent: 0, ventHit: 0, sab: 0, meet: 0, vote: 0 });
    function st(F) {
      if (!F.imp) F.imp = { hatches: [], texts: [], sab: null, meet: null, used: [newUse(), newUse()] };
      return F.imp;
    }
    function say(F, txt, x, y, c, life = 50, size = 13) { st(F).texts.push({ txt, x, y, c, t: 0, life, size }); }
    const baseVuln = Object.getOwnPropertyDescriptor(api.Fighter.prototype, 'vulnerable');
    function patchVuln(f) {                     // v šachte sa nedá zasiahnuť (údery, noty, lúče, strely modulov); game.js háčik nemá
      if (!baseVuln || !baseVuln.get || Object.prototype.hasOwnProperty.call(f, 'vulnerable')) return;
      Object.defineProperty(f, 'vulnerable', { configurable: true,
        get() { return !(this.state === 'imp_vent' && this.t >= VENT.safe) && baseVuln.get.call(this); } });
    }
    const hiddenNow = f => f.state === 'imp_vent' && f.t >= VENT.sink;

    // ================================================================ schopnosti
    function start(f, o, mv, ignoreCd) {
      const F = fight(); if (!F || F.phase !== 'fight' || !mine(f) || !f.onGround) return false;
      const S = st(F);
      if (o) f.facing = o.x >= f.x ? 1 : -1;
      switch (mv) {
        case 'vent':
          if (f.cd.special > 0 && !ignoreCd) return false;
          f.set('imp_vent', 'imp_vent'); f.vx = 0; f.cd.special = SPECIAL_CD;
          f.impV = { x0: Math.round(f.x), x1: null };
          S.hatches.push({ x: Math.round(f.x), t: 0, life: VENT.hatchLife, side: f.side });
          snd('imp_vent'); S.used[f.side].vent++;
          return true;
        case 'sabotage':
          if (((f.cd.sab || 0) > 0 || S.sab) && !ignoreCd) return false;
          f.set('imp_sab', 'imp_sab'); f.vx = 0;
          return true;
        case 'meeting':
          if ((f.impMeet || S.meet) && !ignoreCd) return false;
          f.set('imp_meet', 'imp_meet'); f.vx = 0;
          return true;
      }
      return false;
    }
    function castSabotage(F, f) {
      const S = st(F);
      S.sab = { side: f.side, t: 0, T: SAB_T };
      f.cd.sab = SAB_CD; S.used[f.side].sab++;
      api.banner('SABOTAGE!', 70, 30, 96);
      snd('imp_alarm', 0.8); api.shake(4);
    }
    function castMeeting(F, f) {
      const S = st(F);
      S.meet = { side: f.side, t: 0, pend: MEET_PEND, frozen: false };
      f.impMeet = true; S.used[f.side].meet++;
      api.banner('EMERGENCY MEETING', 100, 26, 156);
      snd('imp_meeting', 0.9); F.flash = Math.max(F.flash, 6);
    }
    const FREEZE_NO = new Set(['dizzy', 'imp_vote', 'kroj', 'baby', 'win', 'friendship', 'imp_vent']);
    function tryFreeze(F, v) {
      if (F.phase !== 'fight' || !v.vulnerable || !v.onGround || v.hp <= 0 || FREEZE_NO.has(v.state) || v.y > GROUND + 4) return false;
      v.set('imp_vote'); v.stun = MEET_FREEZE; v.vx = 0;
      st(F).used[1 - v.side].vote++;
      return true;
    }

    // ================================================================ vstup (idle/walk/block, pred moves.js: unshift)
    hooks.input.unshift((f, o, inp) => {
      if (!mine(f)) return false;
      const F = fight(); if (!F || !inp || !inp.pressed) return false;
      const p = inp.pressed;
      if (F.phase !== 'fight' || !f.onGround) return !!p.special;       // ♪ IMPOSTORA nikdy nespustí husle (ani vo FINISH HIM)
      let mv = null;
      if (inp instanceof api.CPU) {
        const it = inp.impIntent; inp.impIntent = null;
        if (it && it.frame === api.frame) mv = it.mv;
        else if (p.special) mv = 'vent';
      } else if (p.special) {
        if (seq(inp, ['B', 'B', 'special'])) mv = 'meeting';
        else if (seq(inp, ['down', 'F', 'special'])) mv = 'sabotage';
        else mv = 'vent';
      }
      if (mv && start(f, o, mv)) return true;
      return !!p.special;                                               // nepripravené: ♪ nič neurobí
    });

    // ================================================================ vlastné stavy
    hooks.state.push((f, o) => {
      const F = fight(); if (!F) return false;
      switch (f.state) {
        case 'imp_vent': {
          f.vx = 0; f.vy = 0; f.y = GROUND;
          const v = f.impV || (f.impV = { x0: Math.round(f.x), x1: null });
          if (F.phase !== 'fight' && f.t >= VENT.sink) { popOut(F, f, o, false); return true; }   // koniec kola v šachte: vyliezť
          if (f.t === VENT.dive) api.sfx('whoosh', 0.5);
          if (f.t === VENT.exitShow || (f.t > VENT.exitShow && v.x1 == null)) {   // druhý poklop za súperovým chrbtom (varovanie)
            let x1 = o.x - (o.facing || 1) * VENT.behind;
            if (x1 < 30 || x1 > W - 30) x1 = o.x + (o.facing || 1) * VENT.behind;     // za chrbtom je stena → z druhej strany
            v.x1 = Math.round(clamp(x1, 30, W - 30));
            st(F).hatches.push({ x: v.x1, t: 0, life: VENT.hatchLife, side: f.side });
            api.sfx('block', 0.4);
          }
          if (f.t >= VENT.out) popOut(F, f, o, true);
          return true;
        }
        case 'imp_pop': {
          const m = MOVE.imp_pop;
          if (f.t === 1) { f.vy = -5.4; f.vx = f.facing * 0.8; }
          if (f.onGround && f.t > 6) f.vx *= 0.7;
          if (f.t >= m.startup + m.active + m.recovery && f.onGround) f.set('idle');
          return true;
        }
        case 'imp_sab':
          f.vx *= 0.7;
          if (f.t === SAB_CAST && F.phase === 'fight') castSabotage(F, f);
          if (f.t === 2) api.sfx('select', 0.5);
          if (f.t >= MOVE.imp_sab.startup + MOVE.imp_sab.active + MOVE.imp_sab.recovery) f.set('idle');
          return true;
        case 'imp_meet':
          f.vx *= 0.7;
          if (f.t === MEET_CAST && F.phase === 'fight') castMeeting(F, f);
          if (f.t >= MOVE.imp_meet.startup + MOVE.imp_meet.active + MOVE.imp_meet.recovery) f.set('idle');
          return true;
        case 'imp_vote':                                                 // ktokoľvek na porade: hlasuje, nemôže nič robiť
          f.vx = 0;
          if (--f.stun <= 0 || F.phase !== 'fight') f.set('idle');
          return true;
      }
      return false;
    });
    function popOut(F, f, o, attack) {
      const v = f.impV || {};
      const x1 = v.x1 != null ? v.x1 : clamp(o.x - (o.facing || 1) * VENT.behind, 30, W - 30);
      f.x = x1; f.y = GROUND; f.vy = 0; f.vx = 0;
      f.facing = o.x >= f.x ? 1 : -1;
      if (attack && F.phase === 'fight') { f.set('imp_pop', 'imp_pop'); snd('imp_pop'); say(F, 'BAF!', f.x, f.y - 150, '#ffe066', 40, 15); }
      else f.set('idle');
      for (let i = 0; i < 10; i++) F.fx.push({ kind: 'spark', x: f.x + rnd(-22, 22), y: GROUND - rnd(0, 8), vx: rnd(-1.5, 1.5), vy: -rnd(0.6, 2.4), c: chance(0.5) ? '#c9d0da' : '#6f7884', t: 0, life: 24 });
    }

    // ================================================================ zásahy
    hooks.afterHit.push((a, d, m, blocked) => {
      const F = fight(); if (!F || !m) return;
      if (m.name === 'imp_pop' && !blocked && mine(a)) st(F).used[a.side].ventHit++;
    });

    // ================================================================ každý snímok
    let idleT = 0;
    hooks.frame.push(() => {
      const F = fight();
      restoreDraw(F);                                                   // poistka ku kresleniu (salto, aura, šachta)
      if (api.scene !== 'fight') {                                      // mimo boja (úvod tajného súboja, výber…): postoj na plátne
        idleT++;
        renderInto(LIVE[ID].g, null, { state: 'idle', t: idleT, facing: 1 });
        return;
      }
      if (!host() || !live(F)) return;                                  // hosť v sieťovej hre nič nesimuluje, len kreslí stav
      const S = st(F);
      for (const f of F.fighters) {
        if (!mine(f)) continue;
        patchVuln(f);
        if (f.cd.special > 0 && api.frame % VENT_FAST === 0) f.cd.special--;
        if (f.cd.sab > 0) f.cd.sab--;
        if (f.state !== 'imp_vent' && f.y < GROUND - 300) { f.y = GROUND; f.vy = 0; }
        if (f.state === 'win' && f.t === 10) { snd('imp_sus'); }
      }
      // tma (SABOTAGE): súper je pomalší; po čase svetlá naskočia
      if (S.sab) {
        const s = S.sab; s.t++;
        const v = F.fighters[1 - s.side];
        if (F.phase === 'fight' && v && ['walk', 'jump', 'airkick', 'futrun'].includes(v.state)) v.x = clamp(v.x - v.vx * SAB_SLOW, 22, W - 22);
        if (s.t === 18 || s.t === 36) snd('imp_beep', 0.6);
        if (s.t >= s.T || F.phase === 'finish' || F.phase === 'finisher') S.sab = null;
      }
      // porada: súper zamrzne hneď, alebo keď dopadne / vstane (najviac 1 s)
      if (S.meet) {
        const mt = S.meet; mt.t++;
        const v = F.fighters[1 - mt.side];
        if (!mt.frozen && mt.pend > 0) { mt.pend--; if (v && tryFreeze(F, v)) mt.frozen = true; }
        if (mt.t === 8) api.sfx('confirm', 0.5);
        if ((mt.frozen && v && v.state !== 'imp_vote' && mt.t > 4) || (!mt.frozen && mt.pend <= 0) || mt.t > MEET_FREEZE + MEET_PEND + 30) S.meet = null;
      }
      for (const h of S.hatches) h.t++;
      S.hatches = S.hatches.filter(h => h.t < h.life);
      for (const t of S.texts) t.t++;
      S.texts = S.texts.filter(t => t.t < t.life);
    });
    hooks.matchStart.push(F => {
      F.imp = null; st(F);
      const [a, b] = F.fighters;
      if (mine(a) && mine(b)) b.mimic = ID_B;                           // dvaja IMPOSTORI: každý má svoje plátno
      for (const f of F.fighters) {                                     // GLITCH nekopíruje IMPOSTORA (živé plátno nemá paletu)
        if (f.def && f.def.p7 === 'glitch' && (f.mimic === ID || f.mimic === ID_B)) f.mimic = 'matusko';
        if (mine(f)) patchVuln(f);
      }
    });
    hooks.roundStart.push(F => {
      const S = st(F); S.hatches.length = 0; S.texts.length = 0; S.sab = null; S.meet = null;
      for (const f of F.fighters) {
        f.impMeet = false; f.impV = null; f.impAi = null; f.impGrope = null;
        if (mine(f)) f.cd.sab = Math.round(SAB_CD / 3);                // SABOTAGE nie hneď na začiatku kola
      }
    });

    // ================================================================ počítač
    const FREE = new Set(['idle', 'walk', 'block']);
    function intent(c, mv) { c.impIntent = { mv, frame: api.frame }; c.plan = null; c.planT = 0; return { held: {}, pressed: {} }; }
    hooks.cpu.unshift((c, f, o, phase) => {
      if (phase !== 'fight' || !o) return null;
      const F = fight(); if (!F) return null;
      const S = st(F), lv = clamp(c.level || 0.6, 0.3, 1.3);
      const d = Math.abs(o.x - f.x), toward = o.x > f.x ? 'right' : 'left';
      const free = FREE.has(f.state) && f.onGround;
      // počítač je obeťou tmy: tápe naslepo (zblízka „nahmatá“ súpera a bojuje normálne)
      if (S.sab && S.sab.side !== f.side && !mine(f) && d > 70) {
        const g = f.impGrope || (f.impGrope = { dir: 0, until: 0 });
        if (api.frame >= g.until) { g.dir = [-1, 0, 1, 1][Math.floor(rnd(0, 4))]; g.until = api.frame + Math.round(rnd(24, 50)); }
        const held = {}; if (g.dir) held[g.dir > 0 ? 'right' : 'left'] = true;
        return { held, pressed: chance(0.03) ? { [chance(0.5) ? 'punch' : 'kick']: true } : {} };
      }
      if (!mine(f)) return null;
      const g = f.impAi || (f.impAi = { next: 50, last: null, n: {} });
      // súper hlasuje alebo je v tme: dobehni a útoč
      const prey = o.state === 'imp_vote' || (S.sab && S.sab.side === f.side);
      if (prey && o.vulnerable && o.state !== 'dizzy') {
        if (!free) return { held: {}, pressed: {} };
        if (d > 74) return { held: { [toward]: true }, pressed: {} };
        if (api.frame % 14 !== 0 || !chance(0.55 + 0.3 * lv)) return { held: {}, pressed: {} };
        const r = Math.random();
        return r < 0.4 ? { held: {}, pressed: { punch: true } } : r < 0.7 ? { held: {}, pressed: { kick: true } } : { held: { down: true }, pressed: { punch: true } };
      }
      if (g.next > 0) { g.next--; return null; }
      if (!free || !o.vulnerable || o.state === 'dizzy') return null;
      g.next = Math.round(rnd(40, 80) / lv);
      const cand = [];                                                  // vhodné schopnosti s váhou; striedanie ako GLITCH
      if (f.cd.special === 0 && d > 70) cand.push(['vent', o.attacking || d > 200 ? 4 : 2]);
      if (!(f.cd.sab > 0) && !S.sab) cand.push(['sabotage', 2]);
      if (!f.impMeet && !S.meet && d < 170 && o.onGround) cand.push(['meeting', d < 120 ? 3.5 : 2]);   // zblízka: potom dobehne a útočí
      if (!cand.length || !chance(0.35 + 0.3 * lv)) return null;        // nič → moves.js a základná logika game.js
      for (const cd of cand) cd[1] *= (cd[0] === g.last ? 0.35 : 1) / (1 + 1.5 * (g.n[cd[0]] || 0));
      let r = rnd(0, cand.reduce((s, cd) => s + cd[1], 0)), mv = cand[cand.length - 1][0];
      for (const [m, w] of cand) { if ((r -= w) <= 0) { mv = m; break; } }
      g.last = mv; g.n[mv] = (g.n[mv] || 0) + 1;
      c.wait = Math.floor(rnd(18, 36) / lv);
      return intent(c, mv);
    });

    // ================================================================ kreslenie postavy (do živého plátna, postava hľadí doprava)
    function rr(g, x, y, w, h, r) {
      const k = Math.min(r, w / 2, h / 2);
      g.moveTo(x + k, y); g.arcTo(x + w, y, x + w, y + h, k); g.arcTo(x + w, y + h, x, y + h, k);
      g.arcTo(x, y + h, x, y, k); g.arcTo(x, y, x + w, y, k); g.closePath();
    }
    function bodyPath(g) {                      // fazuľa: chrbát vľavo, predok s priezorom vpravo; bok od 0 (bedrá) po −104
      g.beginPath();
      g.moveTo(-30, 2);
      g.lineTo(-31, -56);
      g.bezierCurveTo(-31, -94, -15, -104, 3, -104);
      g.bezierCurveTo(23, -104, 33, -91, 33, -60);
      g.lineTo(33, 0);
      g.quadraticCurveTo(33, 7, 25, 7);
      g.lineTo(-23, 7);
      g.quadraticCurveTo(-30, 7, -30, 2);
      g.closePath();
    }
    function inked(g, fill, lw = OUT) { g.fillStyle = fill; g.fill(); g.lineWidth = lw; g.strokeStyle = C.ink; g.lineJoin = 'round'; g.stroke(); }
    function drawLeg(g, x, L, back) {
      const len = LEG * (L.l || 1);
      g.save(); g.translate(x, -2); g.rotate(-(L.a || 0));
      g.beginPath(); rr(g, -10.5, -8, 21, len + 8, 9);
      g.fillStyle = back ? C.dark : C.base; g.fill();
      if (!back) { g.save(); g.clip(); g.fillStyle = C.dark; g.fillRect(-10.5, -8, 6, len + 8); g.fillRect(-10.5, len - 4, 21, 6); g.restore(); }
      g.lineWidth = OUT; g.strokeStyle = C.ink; g.stroke();
      g.restore();
    }
    function drawArm(g, sx, sy, A, back) {
      const a = A.a || 0, l = A.l || 12, ex = sx + Math.sin(a) * l, ey = sy + Math.cos(a) * l;
      g.lineCap = 'round';
      g.strokeStyle = C.ink; g.lineWidth = 12; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = back ? C.dark : C.base; g.lineWidth = 7; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      g.beginPath(); g.arc(ex, ey, 7.5, 0, Math.PI * 2); inked(g, back ? C.dark : C.base, 2.4);
      if (!back) { g.fillStyle = 'rgba(255,190,180,0.6)'; g.beginPath(); g.arc(ex + 2, ey - 2.5, 2.3, 0, Math.PI * 2); g.fill(); }
      return [ex, ey];
    }
    function drawVisor(g, mode, t) {
      if (mode === 'glow') {                   // KIAI: žiara okolo priezoru
        const gl = g.createRadialGradient(17, -75, 4, 17, -75, 34);
        gl.addColorStop(0, 'rgba(200,245,255,0.9)'); gl.addColorStop(1, 'rgba(120,210,255,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(17, -75, 34, 0, Math.PI * 2); g.fill();
      }
      g.beginPath(); rr(g, -3, -87, 41, 25, 12.5);
      g.fillStyle = mode === 'white' ? '#ffffff' : mode === 'glow' ? '#e9fbff' : C.visor; g.fill();
      g.save(); g.clip();
      if (mode === 'glow') { g.fillStyle = '#9fe2ff'; g.beginPath(); g.ellipse(15, -58, 28, 9, 0, 0, Math.PI * 2); g.fill(); }
      else if (mode !== 'white') {
        g.fillStyle = C.visorDark; g.beginPath(); g.ellipse(15, -58, 28, 11, 0, 0, Math.PI * 2); g.fill();
        if (mode === 'swirl') {                // omámený: špirála na priezore
          g.strokeStyle = '#ffffff'; g.lineWidth = 1.6; g.beginPath();
          for (let i = 0; i <= 26; i++) { const a = i * 0.55 + t * 0.25, r = 1 + i * 0.36; const px = 17 + Math.cos(a) * r * 1.5, py = -75 + Math.sin(a) * r * 0.8; i ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.stroke();
        } else {
          g.fillStyle = C.glint; g.beginPath(); rr(g, 16, -83, 15, 5, 2.5); g.fill();
          g.beginPath(); g.arc(34, -81, 1.8, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
      g.beginPath(); rr(g, -3, -87, 41, 25, 12.5); g.lineWidth = OUT; g.strokeStyle = C.ink; g.stroke();
    }
    function drawBody(g, P) {
      // ruka vzadu (za telom), nohy pod telom, batoh, telo, priezor, ruka vpredu, rekvizity
      if (P.armB && !P.armB.front) drawArm(g, -12, -52, P.armB, true);
      drawLeg(g, -13, P.legB, true);
      drawLeg(g, 12, P.legF, false);
      g.beginPath(); rr(g, -44, -86, 20, 54, 7); inked(g, C.base);   // batoh
      g.save(); g.beginPath(); rr(g, -44, -86, 20, 54, 7); g.clip(); g.fillStyle = C.dark; g.fillRect(-44, -86, 8, 54); g.fillRect(-44, -40, 20, 8); g.restore();
      g.beginPath(); rr(g, -44, -86, 20, 54, 7); g.lineWidth = OUT; g.strokeStyle = C.ink; g.stroke();
      bodyPath(g); g.fillStyle = C.base; g.fill();
      g.save(); bodyPath(g); g.clip();
      g.fillStyle = C.dark;
      g.beginPath(); g.ellipse(-39, -44, 21, 76, 0, 0, Math.PI * 2); g.fill();            // tieň na chrbte
      g.beginPath(); g.ellipse(2, 15, 48, 14, 0, 0, Math.PI * 2); g.fill();               // tieň dole
      g.fillStyle = C.light;
      g.beginPath(); g.ellipse(18, -96, 9, 3.8, -0.4, 0, Math.PI * 2); g.fill();          // lesk navrchu
      g.beginPath(); g.ellipse(29, -40, 2.2, 12, 0, 0, Math.PI * 2); g.fill();            // odlesk na boku
      if (P.prop === 'kroj') {                                                            // FOLKLORITY: čierna vesta s výšivkou
        g.fillStyle = '#1b1b1f';
        g.beginPath(); g.moveTo(-34, -54); g.lineTo(10, -54); g.quadraticCurveTo(20, -32, 12, -8); g.lineTo(-34, -8); g.closePath(); g.fill();
        const cols = ['#ffd200', '#2fbf3a', '#3fa9ff', '#ff5a8a'];
        g.lineWidth = 2;
        for (let i = 0; i < 9; i++) {           // vyšívaný okraj vesty
          const k = i / 8, y = -54 + 46 * k, xx = 10 + 10 * Math.sin(k * Math.PI) - 2;
          g.fillStyle = cols[i % 4]; g.beginPath(); g.arc(xx, y, 2.2, 0, Math.PI * 2); g.fill();
        }
        for (const [cx, cy, c] of [[-20, -40, 0], [-6, -26, 1], [-22, -20, 3]]) {   // kvietky
          g.fillStyle = cols[c]; for (let j = 0; j < 5; j++) { const a = j * 1.2566; g.beginPath(); g.arc(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, 2, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, 1.6, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
      bodyPath(g); g.lineWidth = OUT; g.strokeStyle = C.ink; g.lineJoin = 'round'; g.stroke();
      drawVisor(g, P.visor, P.t);
      let hand = null;
      if (P.armB && P.armB.front) drawArm(g, 20, -54, P.armB, true);
      if (P.armF) hand = drawArm(g, 26, -48, P.armF, false);
      if (P.prop === 'kroj') {                                                            // klobúk s pierkom
        g.beginPath(); g.ellipse(2, -104, 28, 5, 0, 0, Math.PI * 2); inked(g, '#1b1b1f', 2.2);
        g.beginPath(); rr(g, -14, -122, 32, 18, 5); inked(g, '#1b1b1f', 2.2);
        g.fillStyle = '#c0392b'; g.fillRect(-14, -110, 32, 4);
        g.strokeStyle = '#f6eedb'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, -118); g.quadraticCurveTo(-20, -134, -30, -132); g.stroke();
      }
      if (P.prop === 'tablet' && hand) {                                                  // SABOTAGE: tablet s mapou a výstrahou
        g.save(); g.translate(hand[0] + 4, hand[1] - 6); g.rotate(-0.25);
        g.beginPath(); rr(g, -4, -20, 26, 30, 4); inked(g, '#2b3140', 2.2);
        g.fillStyle = '#18303f'; g.fillRect(-1, -17, 20, 22);
        const on = (P.t >> 2) % 2 === 0;
        g.fillStyle = on ? '#ff3b30' : '#7a1810';
        g.beginPath(); g.moveTo(9, -14); g.lineTo(16, 0); g.lineTo(2, 0); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.fillRect(8, -10, 2, 6); g.fillRect(8, -3, 2, 2);
        g.restore();
      }
      if (P.prop === 'cake' && hand) {                                                    // FRIENDSHIP: torta k narodeninám
        const x = hand[0] + 6, y = hand[1] - 4;
        g.beginPath(); rr(g, x - 14, y - 14, 30, 16, 3); inked(g, '#f6d6a8', 2.2);
        g.fillStyle = '#ff7ab8'; g.fillRect(x - 13, y - 13, 28, 4);
        for (let i = 0; i < 3; i++) {
          g.fillStyle = ['#3fa9ff', '#ffd200', '#7dff6a'][i]; g.fillRect(x - 7 + i * 8, y - 22, 3, 9);
          g.fillStyle = (P.t + i * 5) % 12 < 6 ? '#ffe066' : '#ff9f1a'; g.beginPath(); g.ellipse(x - 5.5 + i * 8, y - 25, 2, 3, 0, 0, Math.PI * 2); g.fill();
        }
      }
    }
    function drawButton(g, x, y, press) {       // EMERGENCY MEETING: červené tlačidlo na stĺpiku vyrastie zo zeme
      const PH = 40;
      g.save();
      g.beginPath(); g.rect(0, 0, CW, y + 1); g.clip();                 // pod zemou ho nevidno
      g.translate(x, y + (1 - press.rise) * (PH + 18));
      g.beginPath(); rr(g, -11, -PH, 22, PH + 2, 3); inked(g, C.metal, 2.4);
      g.fillStyle = C.metalDark; g.fillRect(-10, -PH + 3, 6, PH - 2);
      g.fillStyle = '#ffd200'; g.fillRect(-10, -PH + 12, 20, 4); g.fillStyle = '#1b1b1f'; for (let i = 0; i < 4; i++) g.fillRect(-9 + i * 6, -PH + 12, 3, 4);
      g.beginPath(); g.ellipse(0, -PH, 19, 6, 0, 0, Math.PI * 2); inked(g, '#c9d0da', 2.4);
      const h = press.down ? 4 : 10;
      g.beginPath(); g.ellipse(0, -PH - 1, 14, h, 0, Math.PI, 0); g.closePath(); inked(g, '#ff2b2b', 2.4);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(-5, -PH - 1 - h * 0.55, 4, Math.max(1.2, h * 0.22), -0.3, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // ---------------------------------------------------------------- pózy (všetko z f.state, f.t, f.move, f.vx/vy → beží aj u hosťa)
    const STRAIGHT = { a: 0, l: 1 };
    function atkK(f) {                          // vysunutie útoku 0…1 podľa fáz MOVE (nábeh, úder, návrat)
      const m = MOVE[f.move] || MOVE[f.state]; if (!m) return 0;
      const t = f.t, s = m.startup || 1, a = m.active || 1, r = m.recovery || 1;
      if (t < s) return ease(t / s);
      if (t < s + a) return 1;
      return 1 - ease((t - s - a) / Math.max(1, r * 0.7));
    }
    function poseOf(f, x) {
      const t = f.t || 0, s = f.state;
      const P = { t, dx: 0, lift: 0, rot: 0, piv: 0, sx: 1, sy: 1, spin: 0, legF: STRAIGHT, legB: STRAIGHT, armF: null, armB: null,
                  visor: 'n', prop: null, sink: 0, button: null };
      const breathe = () => { const b = Math.sin(t / 14); P.sy = 1 + 0.018 * b; P.sx = 1 - 0.012 * b; P.rot = 0.025 * Math.sin(t / 40); };
      const walkCycle = (speed) => {
        const dir = Math.sign((f.vx || 0) * (f.facing || 1)) || 1, ph = t * speed * dir;
        P.legF = { a: 0.55 * Math.sin(ph), l: 1 }; P.legB = { a: -0.55 * Math.sin(ph), l: 1 };
        P.lift = 2.5 * Math.abs(Math.cos(ph)); P.rot = 0.07 * Math.sin(ph) + (dir > 0 ? 0.05 : -0.04); P.piv = 20;
      };
      switch (s) {
        case 'idle': case 'imp_vote': default:
          breathe(); break;
        case 'frozen': case 'shocked': break;  // pevná póza (efekty iných modulov si snímku pamätajú)
        case 'walk': case 'futrun': walkCycle(s === 'futrun' ? 0.5 : 0.27); break;
        case 'jump': {
          P.legF = { a: 0.7, l: 0.75 }; P.legB = { a: -0.2, l: 0.75 };
          P.armF = { a: 1.9, l: 16 };
          P.sy = (f.vy || 0) < 0 ? 1.06 : 0.97; P.sx = 2 - P.sy;
          if (x.flip) {                          // salto: celé telo sa otočí okolo stredu za čas skoku
            const k = Math.min(1, t / (2 * 7.4 / 0.38));
            P.spin = k * Math.PI * 2 * (Math.sign((f.vx || 0) || x.flip) || 1) * (f.facing || 1);
            P.legF = { a: 1.1, l: 0.7 }; P.legB = { a: 0.8, l: 0.7 }; P.armF = null;
          }
          break;
        }
        case 'airkick': case 'flykick': {
          const fly = s === 'airkick' || (f.mvFly && f.mvFly.phase === 'fly');
          if (fly) { P.rot = -0.45; P.piv = 60; P.legF = { a: 1.75, l: 2.2 }; P.legB = { a: -0.35, l: 0.8 }; P.armF = { a: 1.0, l: 13 }; }
          else { P.sy = 0.88; P.sx = 1.08; P.legF = { a: 0.3, l: 0.8 }; P.legB = { a: -0.3, l: 0.8 }; }
          break;
        }
        case 'block': case 'blockstun':
          P.sy = 0.85; P.sx = 1.08; P.lift = -3; P.rot = -0.06; P.piv = 30;
          P.legF = { a: 0.35, l: 0.72 }; P.legB = { a: -0.35, l: 0.72 };
          P.armF = { a: 1.95, l: 15 }; P.armB = { a: 2.25, l: 14, front: true };   // garda pred telom
          if (s === 'blockstun') P.dx = -2 * Math.sin(t * 1.3);
          break;
        case 'punch': {
          const k = atkK(f);
          if (f.move === 'punch2') {             // druhý úder komba: hlavička telom
            P.rot = 0.5 * k; P.piv = 0; P.dx = 9 * k;
            P.legF = { a: 0.35 * k, l: 1 }; P.legB = { a: -0.6 * k, l: 1 };
            P.armF = { a: -0.7 * k + 0.2, l: 13 }; P.armB = { a: -0.9 * k + 0.2, l: 13 };
          } else {                               // krátky direkt pružnou pažou
            P.rot = 0.13 * k; P.dx = 4 * k;
            P.legF = { a: 0.18 * k, l: 1 }; P.legB = { a: -0.18 * k, l: 1 };
            P.armF = { a: Math.PI / 2 + 0.38, l: 12 + 38 * k };
            P.armB = { a: -0.4 * k, l: 12 };
          }
          break;
        }
        case 'kick': {                           // kop nôžkou (kreslený gumený kop), kombo 3 s väčším záklonom
          const k = atkK(f), big = f.move === 'combo3';
          P.rot = -(big ? 0.42 : 0.3) * k; P.piv = 0; P.lift = 10 * k; P.dx = (big ? 8 : 5) * k;
          P.legF = { a: (big ? 2.2 : 2.05) * k, l: 1 + (big ? 1.9 : 1.75) * k }; P.legB = { a: -0.18 * k, l: 1 };
          break;
        }
        case 'uppercut': {                       // výskok s päsťou hore
          const m = MOVE.uppercut, k = atkK(f), pre = t < m.startup;
          if (pre) { P.sy = 1 - 0.14 * ease(t / m.startup); P.sx = 2 - P.sy; P.armF = { a: 0.9, l: 13 }; }
          else { P.sy = 1 + 0.12 * k; P.sx = 2 - P.sy; P.lift = 14 * k; P.rot = 0.12 * k; P.armF = { a: 1.3 + 0.95 * k, l: 14 + 18 * k }; P.legF = { a: 0.3 * k, l: 0.9 }; P.legB = { a: -0.4 * k, l: 0.9 }; }
          break;
        }
        case 'sweep': {                          // podkop: prikrčí sa a nôžka sa natiahne pri zemi
          const k = atkK(f);
          P.sy = 1 - 0.18 * k; P.sx = 1 + 0.1 * k; P.lift = -4 * k; P.rot = -0.12 * k; P.piv = 20;
          P.legF = { a: 1.45 * k, l: 1 + 1.6 * k }; P.legB = { a: -0.3 * k, l: 0.8 };
          P.armF = { a: 1.4, l: 13 };
          break;
        }
        case 'kiai': {                           // KIAI lúč z game.js vyletí z rozžiareného priezoru
          const m = MOVE.kiai, charge = t < m.startup;
          P.visor = 'glow';
          if (charge) { const k = ease(t / m.startup); P.sy = 1 - 0.07 * k; P.sx = 1 + 0.05 * k; P.rot = -0.12 * k; P.piv = 20; P.legF = { a: 0.15 * k, l: 0.9 }; P.legB = { a: -0.2 * k, l: 0.9 }; }
          else { const k = Math.max(0, 1 - (t - m.startup) / 20); P.rot = 0.1 * k; P.piv = 20; P.dx = -3 * k; P.legF = { a: 0.25, l: 1 }; P.legB = { a: -0.3, l: 1 }; if (t > m.startup + 16) P.visor = 'n'; }
          break;
        }
        case 'hit': {
          const k = Math.max(0, 1 - t / 16);
          P.rot = -0.3 * k; P.piv = 0; P.dx = -3 * k; P.sx = 1 + 0.06 * k; P.sy = 1 - 0.06 * k;
          P.legF = { a: 0.3 * k, l: 1 }; P.legB = { a: -0.2 * k, l: 1 };
          if (t < 6) P.visor = 'white';
          break;
        }
        case 'fall': case 'down': case 'getup': {   // prevráti sa na chrbát (batoh na zemi), nôžky hore
          const r = s === 'fall' ? Math.min(1.5, t * 0.09) : s === 'down' ? 1.5 : Math.max(0, 1.5 - t * 0.075);
          P.rot = -r; P.piv = 0; P.lift = Math.sin(r) * 40;
          P.legF = { a: 0.5 + (s === 'down' ? 0.2 * Math.sin(t / 5) : 0), l: 1 }; P.legB = { a: 0.85 + (s === 'down' ? 0.2 * Math.sin(t / 5 + 2) : 0), l: 1 };
          P.visor = s === 'getup' && t > 10 ? 'n' : 'swirl';
          break;
        }
        case 'dizzy': case 'deaf': case 'smiech': case 'bubbled': case 'dazed': {
          if (s === 'smiech') { P.dx = 2 * Math.sin(t * 1.7); P.sy = 1 + 0.04 * Math.sin(t * 0.9); P.armF = { a: 0.8, l: 10 }; break; }
          P.rot = 0.13 * Math.sin(t / 7); P.piv = 0;
          P.legF = { a: 0.15 * Math.sin(t / 7), l: 1 }; P.legB = { a: -0.15 * Math.sin(t / 7 + 1), l: 1 };
          P.visor = 'swirl';
          break;
        }
        case 'dance': case 'kroj': {             // odzemok: poskoky a kopy nôžkami striedavo
          const ph = t / 6, up = Math.abs(Math.sin(ph));
          P.lift = 10 * up; P.rot = 0.1 * Math.sin(ph); P.piv = 20; P.sy = 1 + 0.05 * up; P.sx = 2 - P.sy;
          const side = Math.floor(t / (Math.PI * 6)) % 2;
          P.legF = { a: side ? 1.3 * up : 0.1, l: 1 + 0.4 * up * side }; P.legB = { a: side ? -0.1 : -1.1 * up, l: 1 };
          P.armF = { a: 1.55 + 0.55 * Math.sin(ph * 2), l: 17 };
          if (s === 'kroj') P.prop = 'kroj';
          break;
        }
        case 'win': case 'friendship': {
          if (s === 'friendship') { P.armF = { a: 1.5, l: 15 }; P.prop = 'cake'; P.lift = 2 * Math.abs(Math.sin(t / 8)); break; }
          const ph = (t % 34) / 34, hop = Math.sin(ph * Math.PI);           // poskakuje od radosti
          P.lift = 24 * hop; P.sy = hop > 0.15 ? 1.06 : 0.9; P.sx = 2 - P.sy;
          P.legF = { a: 0.4 * hop, l: 0.85 }; P.legB = { a: -0.3 * hop, l: 0.85 };
          P.armF = { a: 2.0 + 0.25 * Math.sin(t / 4), l: 24 };
          break;
        }
        case 'imp_vent': {                       // poklop, prikrčenie, skok šípka dolu do šachty
          if (t < VENT.open) { const k = ease(t / VENT.open); P.sy = 1 - 0.2 * k; P.sx = 1 + 0.1 * k; P.legF = { a: 0.3 * k, l: 0.8 }; P.legB = { a: -0.3 * k, l: 0.8 }; P.armF = { a: 0.6 + 0.6 * k, l: 12 }; }
          else if (t < VENT.dive) { const k = (t - VENT.open) / (VENT.dive - VENT.open); P.lift = 12 * Math.sin(k * Math.PI / 2); P.sy = 1.12; P.sx = 0.92; P.legF = { a: 0.2, l: 0.9 }; P.legB = { a: -0.2, l: 0.9 }; }
          else if (t < VENT.sink) { const k = ease((t - VENT.dive) / (VENT.sink - VENT.dive)); P.lift = 12 - 150 * k; P.sy = 1.15; P.sx = 0.9; P.sink = 1; }
          else P.hide = true;
          break;
        }
        case 'imp_pop': {                        // výskok zo šachty s hlavičkou a päsťou hore
          const k = Math.min(1, t / 6);
          P.lift = -130 * (1 - k); P.sink = t < 7 ? 1 : 0;
          P.sy = (f.vy || 0) < -1 ? 1.12 : f.onGround && t > 8 ? 0.92 : 1; P.sx = 2 - P.sy;
          P.rot = 0.2; P.piv = 40; P.armF = { a: 2.2, l: 26 };
          P.legF = { a: 0.2, l: 0.85 }; P.legB = { a: -0.5, l: 0.85 };
          break;
        }
        case 'imp_sab':                          // vytiahne tablet a ťukne do mapy
          P.armF = { a: 1.25 + (t > SAB_CAST - 4 && t < SAB_CAST + 4 ? 0.2 : 0), l: 15 }; P.prop = 'tablet'; P.rot = -0.04; P.piv = 30;
          break;
        case 'imp_meet': {                       // tlačidlo vyrastie, ruka hore a buch!
          const press = t >= MEET_CAST;
          P.button = { rise: ease(t / 8) * (t > MEET_CAST + 26 ? Math.max(0, 1 - (t - MEET_CAST - 26) / 8) : 1), down: press && t < MEET_CAST + 14 };
          P.armF = press ? { a: 1.05, l: 27 } : { a: 2.2, l: 24 };
          P.rot = press ? 0.18 : -0.08; P.piv = 20; P.sy = press && t < MEET_CAST + 4 ? 0.93 : 1; P.sx = 2 - P.sy;
          break;
        }
      }
      return P;
    }
    // f = bojovník (alebo len { state, t, facing }), x = { flip, groundY } doplnky ku kresleniu
    function renderInto(g, f, ff, x = {}) {
      const src = ff || f;
      Object.assign(C, C0, (src.def && src.def.impColors) || null);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, CW, CH);
      const P = poseOf(src, x);
      if (P.hide) return P;
      g.save();
      if (P.sink) { g.beginPath(); g.rect(0, 0, CW, AY + (x.groundY || 0) + 1); g.clip(); }   // časť pod zemou (šachta) nevidno
      if (P.button) drawButton(g, AX + 56, AY + (x.groundY || 0), P.button);
      g.translate(AX + P.dx, AY - P.lift);
      if (P.spin) { g.translate(0, -66); g.rotate(P.spin); g.translate(0, 66); }
      if (P.rot) { g.translate(0, -P.piv); g.rotate(P.rot); g.translate(0, P.piv); }
      g.scale(P.sx, P.sy);
      g.translate(0, -LEG);
      drawBody(g, P);
      g.restore();
      return P;
    }

    // ---------------------------------------------------------------- pred postavami: živé plátno, aura, poklopy
    const TMP = new Map();                      // dočasné úpravy bojovníka počas kreslenia → späť v prvom drawFront
    function restoreDraw() {
      for (const [f, o] of TMP) { f.ssj = o.ssj; f.flip = o.flip; f.x = o.x; }
      TMP.clear();
    }
    function drawAura(f, L) {                   // aura Super Saiyana zo živej snímky (game.js by si pamätal starú siluetu)
      L.gg.setTransform(1, 0, 0, 1, 0, 0); L.gg.clearRect(0, 0, CW, CH);
      L.gg.globalCompositeOperation = 'source-over'; L.gg.drawImage(L.c, 0, 0);
      L.gg.globalCompositeOperation = 'source-in'; L.gg.fillStyle = '#ffd23a'; L.gg.fillRect(0, 0, CW, CH);
      L.gg.globalCompositeOperation = 'source-over';
      const s = (f.def && f.def.scale) || 1;
      ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y)); if (f.facing < 0) ctx.scale(-1, 1); if (s !== 1) ctx.scale(s, s);
      ctx.globalAlpha = 0.3 + 0.12 * Math.sin(api.frame / 5);
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -4], [-2, -3], [2, -3], [0, 2]]) ctx.drawImage(L.gold, -AX + dx, -AY + dy);
      ctx.restore();
      const F = fight();
      if (F && Math.random() < 0.5) F.fx.push({ kind: 'spark', x: f.x + rnd(-26, 26), y: f.y - rnd(10, 130), vx: 0, vy: -rnd(0.8, 1.8), c: chance(0.5) ? '#fff3a0' : '#ffc21a', t: 0, life: 18 });
    }
    function drawHatch(h) {                     // kovový poklop šachty v zemi; otvorený = veko stojí za čiernou dierou
      const k = h.t < 6 ? h.t / 6 : h.t > h.life - 8 ? Math.max(0, (h.life - h.t) / 8) : 1;
      const x = Math.round(h.x), y = GROUND;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 31, 6, 0, 0, Math.PI * 2); ctx.fill();
      if (k > 0) {                              // veko stojí (otvorené)
        const lh = 22 * k;
        ctx.fillStyle = C.metal; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.rect(x - 24, y - 3 - lh, 48, lh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.metalDark; for (let i = 1; i < 4; i++) ctx.fillRect(x - 20, Math.round(y - 3 - lh + i * lh / 4) - 1, 40, Math.max(1, Math.round(2 * k)));
      }
      ctx.fillStyle = '#07080c'; ctx.beginPath(); ctx.ellipse(x, y + 1, 26 * Math.max(0.35, k), 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.metalDark; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y + 1, 28, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#b9c2cf'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 28, 5.5, 0, Math.PI, Math.PI * 2); ctx.stroke();
      if (k < 1) {                              // zatvorený (alebo sa zatvára): mriežka na diere
        ctx.globalAlpha = 1 - k; ctx.fillStyle = C.metal; ctx.beginPath(); ctx.ellipse(x, y + 1, 26, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.metalDark; for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 9 - 3, y - 1, 5, 4);
      }
      ctx.restore();
    }
    hooks.drawBack.push((stage, F) => {
      restoreDraw();
      for (const f of F.fighters) {
        if (!mine(f)) continue;
        const L = liveOf(f);
        TMP.set(f, { ssj: f.ssj, flip: f.flip, x: f.x });
        const flip = f.state === 'jump' ? f.flip : 0;
        renderInto(L.g, f, null, { flip, groundY: GROUND - f.y });
        if (f.ssj && f.state !== 'baby' && !hiddenNow(f)) drawAura(f, L);
        f.ssj = false;                          // game.js nekreslí vlastnú auru (mal by starú siluetu)
        if (f.state === 'jump' && f.flip) f.flip = 0;   // salto je už na plátne (game.js by plátno točil okolo zlého bodu)
        if (hiddenNow(f)) f.x = -9999;          // v šachte: ani postava, ani tieň
      }
      const S = F.imp; if (!S) return;
      for (const h of S.hatches) { try { drawHatch(h); } catch (e) { /* efekt nesmie zhodiť hru */ } }
    });
    hooks.drawFront.unshift(() => restoreDraw());   // hneď po kreslení postáv (pred ostatnými modulmi) vrátiť skutočný stav

    // ---------------------------------------------------------------- nad postavami: tma, porada, nápisy
    function drawBallot(F, v, side, t) {        // hlasovací lístok nad hlasujúcim (ako tablet porady v Among Us)
      const x = Math.round(v.x), y = Math.round(v.y - HEIGHT(v) - 34 + Math.sin(t / 8) * 2);
      const imp = F.fighters[side], vic = v;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t / 15) * 0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-25, -15, 54, 38);
      ctx.fillStyle = '#f4f6fa'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      ctx.beginPath(); rr(ctx, -28, -18, 56, 38, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3d6fd6'; ctx.fillRect(-27, -17, 54, 9);
      api.text('VOTE', 0, -9.5, 7, 'center', '#ffffff');
      const tick = Math.floor(t / 20) % 2;     // nevie sa rozhodnúť: fajka skáče medzi dvoma
      [[-13, imp && imp.def ? imp.def.gi : C.base], [13, vic.def && vic.def.gi ? vic.def.gi : '#f2f2f2']].forEach(([cx, col], i) => {
        ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(cx - 6, 8); ctx.lineTo(cx - 6, -1); ctx.quadraticCurveTo(cx - 6, -6, cx, -6); ctx.quadraticCurveTo(cx + 6, -6, cx + 6, -1); ctx.lineTo(cx + 6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.visor; ctx.beginPath(); rr(ctx, cx - 1, -3, 7, 4, 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(cx - 4, 11, 8, 6);
        if (tick === i) { ctx.strokeStyle = '#1aa33a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx - 3, 14); ctx.lineTo(cx - 1, 16.5); ctx.lineTo(cx + 5, 9); ctx.stroke(); }
      });
      ctx.restore();
      api.text('HLASUJE' + '...'.slice(0, 1 + Math.floor(t / 12) % 3), x, y - 22, 9, 'center', '#ffe066');
    }
    function drawMeetingSplash(mt) {            // krátky záblesk porady: lúče za nápisom
      const t = mt.t; if (t > 40) return;
      const a = t < 6 ? t / 6 : t > 26 ? (40 - t) / 14 : 1;
      ctx.save(); ctx.globalAlpha = 0.34 * a; ctx.translate(W / 2, 146);
      ctx.rotate(t * 0.01);
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 ? '#ffb21a' : '#d61f1f';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 330, i * Math.PI / 8, (i + 1) * Math.PI / 8); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    function drawDark(F, s) {                   // tma okrem kruhu okolo súpera; IMPOSTOROVI v tme len svieti priezor
      const v = F.fighters[1 - s.side], imp = F.fighters[s.side]; if (!v) return;
      const k = s.t < 12 ? s.t / 12 : s.t > s.T - 18 ? Math.max(0, (s.T - s.t) / 18) : 1;
      const cx = v.x, cy = v.y - HEIGHT(v) * 0.5, R = SAB_R;
      ctx.save();
      const g = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
      g.addColorStop(0, 'rgba(3,5,16,0)'); g.addColorStop(1, `rgba(3,5,16,${0.93 * k})`);
      ctx.fillStyle = g; ctx.fillRect(-30, -30, W + 60, ctx.canvas.height + 60);
      if (s.t < 70 && (s.t >> 3) % 2 === 0) { ctx.fillStyle = `rgba(255,30,30,${0.16 * k})`; ctx.fillRect(-30, -30, W + 60, ctx.canvas.height + 60); }   // alarm
      if (imp && !hiddenNow(imp) && k > 0.3) {  // svietiaci priezor v tme
        const hx = imp.x + (imp.facing || 1) * 17, hy = imp.y - 100 * ((imp.def && imp.def.scale) || 1);
        const gl = ctx.createRadialGradient(hx, hy, 0, hx, hy, 16);
        gl.addColorStop(0, `rgba(170,230,255,${0.55 * k})`); gl.addColorStop(1, 'rgba(170,230,255,0)');
        ctx.fillStyle = gl; ctx.fillRect(hx - 16, hy - 16, 32, 32);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * k})`; ctx.fillRect(Math.round(hx) - 4, Math.round(hy) - 3, 7, 2);
      }
      ctx.restore();
      if (k > 0.5 && s.t % 50 < 30) api.text('?', v.x + (s.t % 100 < 50 ? -14 : 14), v.y - HEIGHT(v) - 8, 14, 'center', '#cfe6ff');
    }
    hooks.drawFront.push((stage, F) => {
      const S = F.imp;
      for (const f of F.fighters) {
        if (!mine(f) || hiddenNow(f)) continue;
        if (f.state === 'win' && f.t > 8) {     // SUS! v bubline vedľa priezoru
          const d = f.facing || 1, sc = (f.def && f.def.scale) || 1, bob = Math.sin(f.t / 6) * 2;
          const x = Math.round(clamp(f.x + d * 64 * sc, 32, W - 32)), y = Math.round(f.y - 118 * sc + bob), tx = x - d * 26;
          ctx.save();
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
          ctx.beginPath(); rr(ctx, x - 26, y - 13, 52, 24, 9); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(tx, y - 2); ctx.lineTo(tx - d * 12, y + 8); ctx.lineTo(tx, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(tx - (d > 0 ? 1 : 2), y - 1, 3, 6);
          ctx.restore();
          api.text('SUS!', x, y + 6, 14, 'center', '#e8120c');
        }
      }
      if (!S) return;
      try {
        if (S.meet) drawMeetingSplash(S.meet);
        for (const v of F.fighters) if (v.state === 'imp_vote') drawBallot(F, v, 1 - v.side, v.t);
        for (const t of S.texts) {
          ctx.save(); ctx.globalAlpha = t.t > t.life - 10 ? (t.life - t.t) / 10 : 1;
          api.text(t.txt, t.x, t.y - t.t * 0.3, t.size || 13, 'center', t.c);
          ctx.restore();
        }
        if (S.sab) drawDark(F, S.sab);
      } catch (e) { /* efekt nesmie zhodiť hru */ }
    });

    // ---------------------------------------------------------------- HUD: SABOTAGE (tretí ukazovateľ), MEETING (raz za kolo), nápoveda
    hooks.drawHud.push(F => {
      if (F.paused) return;
      F.fighters.forEach((f, side) => {
        if (!mine(f)) return;
        const right = side === 1, x = right ? W - 12 - 190 : 12;
        const v = clamp(1 - (f.cd.sab || 0) / SAB_CD, 0, 1), col = '#ff5a4f';
        const mx = right ? x + 190 - 60 - 132 : x + 132, my = 27;
        ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
        ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * v), 4);
        api.text('SABOTAGE', mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
        const bx = right ? W - 56 : 56, by = 47, ok = !f.impMeet;        // tlačidlo porady vedľa medailí
        ctx.fillStyle = ok ? '#ff2b2b' : '#555'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(bx, by, 4.5, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ok ? '#c9d0da' : '#444'; ctx.fillRect(bx - 6, by, 12, 3);
        api.text('MEETING', bx + (right ? -10 : 10), by + 3, 7, right ? 'right' : 'left', ok ? '#ff8a80' : '#777');
        if (F.round === 1 && (F.phase === 'intro' || (F.phase === 'fight' && F.t < 240)) && !['cpu', 'remote'].includes(api.inputKind(side))) {
          const k = (b, word) => api.keyHint(side, b).trim() || word;
          api.text(`VENT = ${k('special', '♪')} · SABOTAGE = ${k('down', '↓')} VPRED ${k('special', '♪')} · MEETING = VZAD VZAD ${k('special', '♪')}`,
            side === 0 ? 8 : W - 30, 254, 7, side === 0 ? 'left' : 'right', '#ffb3ad');
        }
      });
    });

    // ================================================================ portrét a mini kozmonaut (náhrady, kým Master nedodá img/portrait_impostor, img/baby_impostor)
    function makePortrait() {
      const c = document.createElement('canvas'); c.width = 96; c.height = 120;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, '#0b0f2a'); g.addColorStop(1, '#03040c');
      x.fillStyle = g; x.fillRect(0, 0, 96, 120);
      for (let i = 0; i < 26; i++) { x.fillStyle = i % 5 ? '#8f9bc8' : '#ffffff'; x.fillRect((i * 37) % 96, (i * 53) % 120, 1, 1); }
      const tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH;
      renderInto(tmp.getContext('2d'), null, { state: 'idle', t: 0, facing: 1 });
      x.imageSmoothingEnabled = true;
      x.drawImage(tmp, AX - 58, AY - 150, 116, 145, -12, 6, 120, 150);   // hlava, priezor a batoh zblízka
      return c;
    }
    function miniCrew() {                       // BABALITY: mini kozmonaut s cumlíkom (drawBaby v game.js ho kreslí a poskakuje)
      const tmp = document.createElement('canvas'); tmp.width = CW; tmp.height = CH;
      const tg = tmp.getContext('2d');
      renderInto(tg, null, { state: 'idle', t: 0, facing: 1 });
      const c = document.createElement('canvas'); c.width = 54; c.height = 56;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = true;
      x.drawImage(tmp, AX - 50, AY - 136, 100, 140, 0, 0, 54 * 100 / 140 * 1.4, 56);
      x.fillStyle = '#5fb4ff'; x.strokeStyle = C.ink; x.lineWidth = 1.2;
      x.beginPath(); x.arc(31, 24, 4, 0, Math.PI * 2); x.fill(); x.stroke();
      x.fillStyle = '#d8f0ff'; x.beginPath(); x.arc(31, 24, 1.6, 0, Math.PI * 2); x.fill();
      return c;
    }
    try {
      if (!IMG['img/portrait_' + ID]) IMG['img/portrait_' + ID] = makePortrait();     // dodaný obrázok ho pri načítaní prepíše
      if (!IMG['img/baby_' + ID]) IMG['img/baby_' + ID] = miniCrew();
    } catch (e) { console.warn('impostor: portrét', e); }

    // pre testy, rebríček a OVLÁDANIE
    api.impostor = {
      id: ID, def: DEF, isImpostor: mine, live: LIVE, pose: poseOf, render: renderInto, size: { CW, CH, AX, AY },
      start(f, mv, ignoreCd = false) { const F = fight(); return !!F && start(f, F.fighters[1 - f.side], mv, ignoreCd); },
      cfg: { VENT, SAB_CD, SAB_T, SAB_SLOW, SAB_R, MEET_FREEZE, MEET_PEND, SEQ_GAP, SPECIAL_CD },
      help: [   // [pohyb, klávesnica P1, klávesnica P2, ovládač PS, dotyk] — rovnaký formát ako api.glitch.help (OVLÁDANIE, COMBOS.md)
        ['VENT (IMPOSTOR)', 'T', 'O', '△', '♪'],
        ['SABOTAGE (IMPOSTOR)', 'S VPRED T', '↓ VPRED O', '↓ ▶ △', 'páčka dole, vpred + ♪'],
        ['EMERGENCY MEETING', 'VZAD VZAD T', 'VZAD VZAD O', '◀ ◀ △', 'páčka vzad 2× + ♪'],
      ],
    };
  },
});
