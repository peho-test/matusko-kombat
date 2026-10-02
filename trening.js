// MATÚŠKO KOMBAT XII — modul trening (P17, 2. 10. 2026): TRÉNING = skúšanie úderov, kômb a FINISH HIM bez straty života.
// Peťo: „to na konci FINISH HIM pomôcka je super, ale to by som dal normálne tréningovú časť, samostatnú hru, kde sa bude biť
// do vzduchu, len tak skúšať tieto triky bez odoberania života“.
// - Položka TRÉNING v podmenu SINGLE PLAYER za JEDEN ZÁPAS (game.js groupMenu presúva položky s group: 'single').
//   Tok ako JEDEN ZÁPAS: výber bojovníka (aj odomknuté postavy) → VS s výberom arény (▲ ▼) → tréning.
//   Cvičný súper je Šimon (za Šimona Matúško). Počítač za neho nič nestláča (hooks.cpu ako prvý), takže neútočí, nechodí
//   a neblokuje; zásahy naňho fungujú normálne (potácanie, pád, vstávanie).
// - Bez straty života: po zásahu sa život vráti (pásik krátko klesne a dobehne), čas nebeží (∞), žiadne kolá, výhra ani prehra.
//   KIAI, špeciály a schopnosti tajných postáv sa nabíjajú 4× rýchlejšie.
// - Panel úderov vľavo (malé písmo, polopriesvitný, nad bojovníkom ešte priesvitnejší): KIAI, špeciál, pohyby z api.moves.help,
//   TORNADO / TELEPORT a schopnosti tajných postáv z ich help; kombo pre klávesnicu, ovládač PS alebo dotyk podľa api.inputKind(0).
//   Podarený pohyb dostane ✓ (stav bojovníka f.state / f.move). Skryť / ukázať: v pauze alebo ťuk / klik na hlavičku panela.
// - FINISH HIM na požiadanie: ENTER (klávesnica), tlačidlo FINISH HIM! vpravo hore (ťuk / myš) alebo položka v pauze (ovládač:
//   START). Nápoveda a ťukacie zakončenia sú z finishers.js. Po zakončení alebo po čase sa tréning obnoví, bez výsledkov.
//   Zakončenie sa zapíše do KNIHY KOMB (finishers.js), do SIENE SLÁVY nie (stats.js: F.trening) a nič neodomyká (ladder.js: F.trening).
// - Pauza (Esc / START): POKRAČOVAŤ, FINISH HIM!, OBNOVIŤ POZÍCIE, SKRYŤ / UKÁZAŤ PANEL, SPÄŤ DO MENU. ◀ MENU vľavo hore = rovno do menu.
// - Len na jednom zariadení (1 hráč), sieťovú hru nemení. Vstup číta len cez api.ctls a api.menu, nikdy nie klávesnicu priamo.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'trening',
  init(api) {
    'use strict';
    const { W, GROUND } = api;
    const TIMER = 99 * 60;           // časomiera sa drží plná (game.js by po 60 s ukončil kolo); namiesto čísla sa kreslí ∞
    const CD_EXTRA = 3;              // k bežnému odpočtu 1 snímky ešte 3 = KIAI a špeciály sa nabijú 4× rýchlejšie
    const START_X = [190, 290];      // bližšie k sebe ako v zápase (150 / 330): hneď sa dá biť a panel vľavo bojovníka nezakrýva
    const PANEL_Y = 70;              // pod ukazovateľmi HUD a pod nápisom „2 HITS“ (moves.js, y 66)
    const ROW_H = 9;
    const FONT = s => `bold ${s}px "Trebuchet MS", "Arial Black", Arial, sans-serif`;   // ako api.text (meranie šírky)
    const BTN = { menu: { x: 4, y: 42, w: 50, h: 13 }, finish: { x: W - 96, y: 42, w: 92, h: 13 } };
    const PAUSE = { x: 70, y: 74, w: 340, h: 132, row0: 128, step: 14 };              // prekryje nápis PAUZA a nápovedu z game.js

    const T = { pending: false, panel: true, rows: [], done: {}, flash: {}, allDone: false, first: false, msg: '',
                startAt: -1, pStartAt: -1, wasPaused: false, pauseIdx: 0 };
    const on = () => { const F = api.fight; return !!(F && F.trening && api.scene === 'fight'); };
    const partnerOf = id => { const d = api.ROSTER[id] || {}; return (d.sprites || id) === 'simon' ? 'matusko' : 'simon'; };

    // ---------------------------------------------------------------- riadky panelu úderov
    // stĺpce ako help modulov: [klávesnica P1, klávesnica P2, ovládač PS, dotyk]; test(f) = pohyb sa práve podaril
    const isState = (...s) => f => s.includes(f.state);
    const UNIVERSAL = [              // [začiatok riadku v api.moves.help, pohyb v def.moves (moves.js), test]
      ['UPPERCUT', 'uppercut', isState('uppercut')],
      ['SWEEP', 'sweep', isState('sweep')],
      ['FLYING KICK', 'flykick', isState('flykick')],
      ['COMBO 3', 'combo', f => f.move === 'combo3' || (f.state === 'uppercut' && !!f.mvCombo && f.mvCombo.links >= 2)],   // ÚDER ÚDER KOP (alebo ↓+ÚDER)
    ];
    const MOVE_SPECIAL = { tornado: 'TORNADO', teleport: 'TELEPORT' };
    // tajné postavy: modul s help a [začiatok riadku v help, stavy bojovníka, keď sa schopnosť podarila]
    const SECRET = {
      glitch: ['glitch', [['LAG', 'glitch_lag'], ['CLONE', 'glitch_clone'], ['REWIND', 'glitch_rw']]],
      vodnik: ['vodnik', [['BUBBLE', 'bubble'], ['SOUL CUP', 'cup'], ['PUDDLE', 'pour']]],
      rocky: ['rocky', [['WOOF', 'hav'], ['BONE', 'kost'], ['LICK', 'oliz']]],
      impostor: ['impostor', [['VENT', 'imp_vent imp_pop'], ['SABOTAGE', 'imp_sab'], ['EMERGENCY', 'imp_meet']]],
      bananac: ['bananac', [['BUILD', 'bn_build'], ['EMOTE', 'bn_emote'], ['LOOT LLAMA', 'bn_throw']]],
      blocky: ['blocky', [['TNT', 'blk_tnt'], ['ARROW', 'blk_bow'], ['PICKAXE', 'blk_pick']]],
      ninja_fire: ['enemies', [['ROPE', 'rope'], ['FIRE KICK', 'firekick']]],
      ninja_ice: ['enemies', [['ICE BALL', 'iceball'], ['SLIDE', 'iceslide']]],
      ninja_shadow: ['enemies', [['INVISIBILITY', 'vanish']]],
      boss: ['enemies', [['LIGHTNING', 'lightning'], ['TELEPORT (STORM)', 'warp'], ['TORPEDO', 'torpedo']]],
    };
    const TOUCH_TOK = { S: 'DOLE', W: 'HORE', F: 'ÚDER', G: 'KOP', R: 'KIAI', T: '♪' };   // šípky by v 7 px písme na mobile neboli čitateľné
    const touchOf = p1 => String(p1).split(/\s+/).map(t => TOUCH_TOK[t] || t).join(' ');   // 'S VPRED G' → 'DOLE VPRED KOP' (kratšie ako text dotyku v help)
    const short = s => String(s).replace(/\s*\(.*\)\s*$/, '');                             // 'TORNADO (Matúško)' → 'TORNADO'
    const row = (id, label, cols, test) => ({ id, label, cols, test });
    const helpRow = (id, h, test) => row(id, short(h[0]), [h[1], h[2], h[3], touchOf(h[1])], test);
    const fromHelp = (help, prefix) => (help || []).find(r => String(r[0]).toUpperCase().startsWith(prefix));
    const can = (f, mv) => !(f.def && Array.isArray(f.def.moves)) || f.def.moves.includes(mv);   // ako moves.js
    function buildRows(f) {
      const d = f.def || {}, rows = [], own = [], tab = SECRET[f.id];
      if (tab) {
        const help = api[tab[0]] && api[tab[0]].help;
        for (const [prefix, states] of tab[1]) { const h = fromHelp(help, prefix); if (h) own.push(helpRow('s_' + prefix, h, isState(...states.split(' ')))); }
      }
      const kiai = own.find(r => r.cols[0] === 'R');                       // Rocky: WOOF! namiesto KIAI
      rows.push(kiai || row('kiai', d.kiaiName || 'KIAI', ['R', 'I', '○', 'KIAI'], isState('kiai')));
      if (tab) rows.push(...own.filter(r => r !== kiai));                  // ♪ tajných postáv je v ich help
      else rows.push(row('special', d.specialName || 'ŠPECIÁL', ['T', 'O', '△', '♪'], isState('special')));
      const mh = api.moves && api.moves.help;
      if (mh) {
        for (const [prefix, mv, test] of UNIVERSAL) { const h = fromHelp(mh, prefix); if (h && can(f, mv)) rows.push(helpRow('u_' + mv, h, test)); }
        const sp = api.moves.specialOf ? api.moves.specialOf(f) : null, h = sp && MOVE_SPECIAL[sp] && fromHelp(mh, MOVE_SPECIAL[sp]);
        if (h) rows.push(helpRow('m_' + sp, h, isState(sp)));
      }
      const c2 = api.combos2 && api.combos2.rows ? api.combos2.rows(f) : [];   // nové kombá (combos2.js): FLIP KICK, ROCKY HELP, WAVE / SOLO
      for (const r of c2) rows.push(helpRow(r.id, r.help, r.test));
      rows.push(row('finish', 'FINISH HIM', ['ENTER', 'ENTER', 'START', 'tlačidlo hore'], null));
      return rows;
    }
    function colOf() {               // 0 = klávesy P1, 1 = klávesy P2 (šípky), 2 = ovládač PS, 3 = dotyk
      const k = api.inputKind(0);
      if (k === 'pad') return 2;
      if (k === 'touch') return 3;
      return api.keyHint(0, 'punch').trim() === 'K' ? 1 : 0;              // 1 hráč má obe sady kláves: ukáž tú, ktorou práve hrá
    }
    function markDone(id) {
      if (T.done[id] || !T.rows.some(r => r.id === id)) return;
      T.done[id] = T.flash[id] = api.frame; api.sfx('confirm', 0.45);
      if (!T.allDone && T.rows.every(r => T.done[r.id])) T.allDone = 'wait';   // nápis až späť v tréningu (po zakončení by ho zmazal nextRound)
    }

    // ---------------------------------------------------------------- tok tréningu
    function start() {
      if (api.NET && api.NET.role) { api.showToast('TRÉNING JE LEN NA JEDNOM ZARIADENÍ'); return; }
      T.pending = true; api.game.mode = 1; api.setScene('select');
    }
    function begin(id) {             // rovno do tréningu bez výberu postavy a VS (testy)
      const g = api.game;
      T.pending = true; g.mode = 1; g.picks = [id, partnerOf(id)]; g.locked = [true, true]; api.startMatch();
    }
    function exit() { const F = api.fight; if (F) F.paused = false; api.sfx('confirm'); api.setScene('title'); api.music('title'); }
    function heal(f) {               // život sa vráti; pásik krátko ukáže, koľko úder zobral, a dobehne (shownHp v game.js)
      if (f.hp >= f.maxHp) return;
      f.shownHp = Math.min(f.shownHp, f.hp); f.hp = f.maxHp;
    }
    function fastCd(f) {             // f.cd (KIAI, špeciál, TORNADO…), f.enCd (nindžovia, boss), p7g.cdK, p7v.cdC/cdP, p14.cdE, rkOliz
      const dec = (o, k) => { if (typeof o[k] === 'number' && o[k] > 0) o[k] = Math.max(0, o[k] - CD_EXTRA); };
      for (const o of [f.cd, f.enCd]) if (o) for (const k of Object.keys(o)) dec(o, k);
      for (const [k, v] of Object.entries(f)) {
        if (k === 'ctl' || k === 'def' || k === 'cd' || !v || typeof v !== 'object' || Array.isArray(v)) continue;
        for (const kk of Object.keys(v)) if (/^cd[A-Z]/.test(kk)) dec(v, kk);
      }
      dec(f, 'rkOliz');
    }
    function startFinish(F) {        // ako game.js po K.O. v rozhodujúcom kole: súper omámený, FINISH HIM!, nápoveda z finishers.js
      if (!F || !F.trening || F.phase !== 'fight') return false;
      const P = F.fighters[0], D = F.fighters[1];
      F.banners.length = 0; F.notes.length = 0; F.beams.length = 0;
      F.phase = 'finish'; F.t = 0; F.winner = 0; F.loser = 1; F.finishTry = undefined;
      P.set('idle');
      D.set('dizzy'); D.vx = 0; D.vy = 0; D.stun = 0; D.y = GROUND; D.hp = 0;   // aj keď práve letel alebo ležal; prázdny život ako v zápase
      api.ctls[0].history.length = 0;                                          // stlačenia spred FINISH HIM (aj z pauzy) zakončenie nespustia
      F.flash = Math.max(F.flash, 6);
      api.banner('FINISH HIM!', 150, 38); api.say('finish');
      return true;
    }
    function resetRound(F, msg) {    // späť do tréningu: game.js nextRound (bojovníci na miesto, plný život, efekty, roundStart modulov)
      F.finisher = null; F.rocky = null; F.creeper = null; F.futbality = null; F.moreality = null; F.ending = null;
      F.winner = -1; F.loser = -1; F.finishTry = undefined; F.finishFrames = undefined; F.paused = false;
      T.msg = msg || '';
      api.nextRound();
      F.flash = Math.max(F.flash, 8);
    }

    api.hooks.matchStart.push(F => {
      if (!T.pending) return;
      T.pending = false;
      F.trening = true;
      F.round = 2;                   // nextRound → 3: hlásateľ nezahlási „Round one“ (game.js hlási len 1. a 2. kolo)
      Object.assign(T, { first: true, msg: '', done: {}, flash: {}, allDone: false, startAt: -1, pStartAt: -1, wasPaused: false, pauseIdx: 0 });
      T.rows = buildRows(F.fighters[0]);
    });
    api.hooks.roundStart.push(F => {
      if (!F.trening) return;
      F.phase = 'fight'; F.t = 0; F.timer = TIMER; F.banners.length = 0;      // bez ROUND n a FIGHT! z game.js
      F.fighters.forEach((f, i) => { f.x = START_X[i]; });
      if (T.first) {
        T.first = false;
        api.banner('TRÉNING', 120, 38, 112); api.banner('BEZ STRATY ŽIVOTA', 120, 14, 134, true); api.say('fight');   // krátky: nezájde pod panel
      } else if (T.msg) { api.banner(T.msg, 60, 28, 112); F.fighters[1].shownHp = 0; }   // po zakončení súperovi život dobehne
      T.msg = '';
    });
    api.hooks.cpu.unshift(() => (on() ? { held: {}, pressed: {} } : null));   // prvý pred háčikmi postáv: cvičný súper nič nestláča
    api.hooks.afterHit.push((a, d) => {
      const F = api.fight;
      if (F && F.trening && F.phase === 'fight') { heal(d); heal(a); }       // ešte pred kontrolou K.O. v game.js
    });

    // ---------------------------------------------------------------- každý snímok (pred updateFight v game.js)
    const consume = m => { m.tap = false; m.tapPos = null; m.ok = false; };
    api.hooks.frame.push(() => {
      const sc = api.scene, g = api.game, F = api.fight;
      if (T.pending) {               // výber postavy a VS ako pri JEDEN ZÁPAS, súperom je cvičný partner
        if (sc === 'select' || sc === 'vs') { if (g.locked[0] && g.picks[0]) { g.picks[1] = partnerOf(g.picks[0]); g.locked[1] = true; } }
        else T.pending = false;      // späť do menu, tajný súboj a pod.: tréning sa nespustí
      }
      if (sc !== 'fight' || !F || !F.trening) { T.wasPaused = false; return; }
      if (F.paused) { onPause(F); return; }
      T.wasPaused = false;
      if (F.phase === 'roundEnd' || F.phase === 'matchEnd') { resetRound(F, F.phase === 'matchEnd' ? 'ZNOVA!' : ''); return; }   // tréning sám nekončí
      if (F.phase === 'intro') { F.phase = 'fight'; F.t = 0; }
      F.timer = TIMER;
      const [P, D] = F.fighters;
      heal(P); if (F.phase === 'fight') heal(D);
      for (const f of F.fighters) fastCd(f);
      for (const r of T.rows) if (r.test && !T.done[r.id] && r.test(P)) markDone(r.id);
      if (F.phase === 'finisher') markDone('finish');
      if (T.allDone === 'wait' && F.phase === 'fight') { T.allDone = true; api.banner('VŠETKO ZVLÁDNUTÉ!', 150, 26, 96); api.say('excellent'); }
      // START: ENTER z klávesnice pauzu nezapne → FINISH HIM; START z ovládača / dotyku zapne pauzu v game.js (pozná sa o snímku neskôr)
      if (T.startAt === api.frame - 1) startFinish(F);
      T.startAt = api.ctls[0].pressed.start ? api.frame : -1;
      const m = api.menu, tp = m.tapPos;   // ťuk / klik: ◀ MENU, FINISH HIM!, hlavička panela
      if (!tp) return;
      if (api.inBtn(tp, BTN.menu)) { consume(m); exit(); }
      else if (F.phase === 'fight' && api.inBtn(tp, BTN.finish)) { consume(m); startFinish(F); }
      else if (F.phase === 'fight' && api.inBtn(tp, headRect())) { consume(m); T.panel = !T.panel; api.sfx('select'); }
    });

    // ---------------------------------------------------------------- pauza tréningu
    function pauseItems(F) {
      return [
        { id: 'resume', label: 'POKRAČOVAŤ' },
        { id: 'finish', label: 'FINISH HIM!', off: !F || F.phase !== 'fight' },
        { id: 'reset', label: 'OBNOVIŤ POZÍCIE' },
        { id: 'panel', label: T.panel ? 'SKRYŤ PANEL ÚDEROV' : 'UKÁZAŤ PANEL ÚDEROV' },
        { id: 'menu', label: 'SPÄŤ DO MENU' },
      ];
    }
    const pauseRect = i => ({ x: PAUSE.x + 40, y: PAUSE.row0 + i * PAUSE.step - 10, w: PAUSE.w - 80, h: PAUSE.step });
    function onPause(F) {
      const m = api.menu, c = api.ctls[0], items = pauseItems(F), n = items.length;
      if (!T.wasPaused) { T.wasPaused = true; T.pauseIdx = 0; T.pStartAt = -1; }
      T.startAt = -1;                // START, ktorý pauzu zapol, nie je FINISH HIM
      if (m.up) { T.pauseIdx = (T.pauseIdx + n - 1) % n; api.sfx('select'); }
      if (m.down) { T.pauseIdx = (T.pauseIdx + 1) % n; api.sfx('select'); }
      let pick = -1;
      if (c.pressed.punch || c.pressed.kick) pick = T.pauseIdx;
      if (T.pStartAt === api.frame - 1) pick = T.pauseIdx;                 // ENTER: game.js pauzu nevypol (START z ovládača ju vypne)
      T.pStartAt = c.pressed.start ? api.frame : -1;
      if (m.tapPos) { for (let i = 0; i < n; i++) if (api.inBtn(m.tapPos, pauseRect(i))) { T.pauseIdx = i; pick = i; } }
      consume(m);                    // ťuk mimo položiek nič (game.js by inak pri každom ťuku v pauze odišiel do menu)
      if (pick >= 0) runItem(F, items[pick]);
    }
    function runItem(F, it) {
      if (it.off) { api.sfx('block'); return; }
      api.sfx('confirm');
      for (const b of api.BUTTONS_LIST) api.ctls[0].pressed[b] = false;   // potvrdzovací úder nevyletí do tréningu
      if (it.id === 'menu') { exit(); return; }
      F.paused = false; T.wasPaused = false;
      if (it.id === 'finish') startFinish(F);
      else if (it.id === 'reset') resetRound(F, '');
      else if (it.id === 'panel') T.panel = !T.panel;
    }

    // ---------------------------------------------------------------- kreslenie
    function rrect(ctx, x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function tick(ctx, x, y, ok) {   // ✓ ako tvar (znak by v 7 px nebol čitateľný); nesplnené = prázdny štvorček
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (ok) {
        ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x + 2.2, y - 0.6); ctx.lineTo(x + 6, y - 6.4);
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#7dff6a'; ctx.lineWidth = 1.6; ctx.stroke();
      } else { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y - 5.5, 5, 5); }
      ctx.restore();
    }
    function tri(ctx, x, y, open, col) {   // ▾ panel otvorený, ▸ zatvorený
      ctx.beginPath();
      if (open) { ctx.moveTo(x, y - 5); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x + 3, y - 1); }
      else { ctx.moveTo(x + 1, y - 6); ctx.lineTo(x + 5, y - 3); ctx.lineTo(x + 1, y); }
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
    function panelLayout(F) {
      const ctx = api.ctx, col = colOf(), P = F && F.fighters && F.fighters[0];
      const footer = col === 3 ? '' : col === 2 ? 'START = pauza: FINISH HIM, menu' : 'ESC = pauza: panel, menu';
      const head = ((P && P.def && P.def.name) || '') + ' · ÚDERY';
      ctx.save(); ctx.font = FONT(7);
      let lw = 0, cw = 0;
      for (const r of T.rows) { lw = Math.max(lw, ctx.measureText(r.label).width); cw = Math.max(cw, ctx.measureText(r.cols[col]).width); }
      const hw = ctx.measureText(head).width + 40;
      ctx.font = FONT(6); const fw = footer ? ctx.measureText(footer).width + 10 : 0;
      ctx.restore();
      const w = Math.ceil(Math.max(14 + lw + 10 + cw + 5, hw, fw, 110));
      const h = T.panel ? 13 + T.rows.length * ROW_H + (footer ? 9 : 0) + 2 : 13;
      return { x: 4, y: PANEL_Y, w, h, col, head, footer };
    }
    function headRect() { const L = panelLayout(api.fight); return { x: L.x, y: L.y - 3, w: L.w, h: 17 }; }
    function drawPanel(F) {
      const ctx = api.ctx, L = panelLayout(F), n = T.rows.filter(r => T.done[r.id]).length;
      const behind = F.fighters.some(f => f.x + 36 > L.x && f.x - 36 < L.x + L.w && f.y > L.y && f.y - 150 < L.y + L.h);   // bojovník za panelom
      ctx.save(); ctx.globalAlpha = behind ? 0.8 : 1;                 // predtým 0,42 a pozadie 0,5: na pestrej scéne sa nedalo čítať (audit 2. 10.)
      rrect(ctx, L.x, L.y, L.w, L.h, 4); ctx.fillStyle = 'rgba(8,8,22,0.72)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      tri(ctx, L.x + 5, L.y + 9, T.panel, '#ffd200');
      api.text(L.head, L.x + 14, L.y + 9, 7, 'left', '#ffd200');
      api.text(n + '/' + T.rows.length, L.x + L.w - 5, L.y + 9, 7, 'right', n === T.rows.length ? '#7dff6a' : '#ffe8a0');
      if (T.panel) {
        T.rows.forEach((r, i) => {
          const y = L.y + 13 + i * ROW_H, ok = !!T.done[r.id], age = api.frame - (T.flash[r.id] || -999);
          if (age < 48 && Math.floor(age / 6) % 2 === 0) { ctx.fillStyle = 'rgba(125,255,106,0.3)'; ctx.fillRect(L.x + 2, y, L.w - 4, ROW_H); }
          tick(ctx, L.x + 5, y + 7.5, ok);
          api.text(r.label, L.x + 14, y + 7, 7, 'left', ok ? '#9dff8a' : '#ffffff');
          api.text(String(r.cols[L.col] || ''), L.x + L.w - 5, y + 7, 7, 'right', ok ? '#bfe8b8' : '#cfe6ff');
        });
        if (L.footer) api.text(L.footer, L.x + 5, L.y + L.h - 4, 6, 'left', '#a7a7c0');
      }
      ctx.restore();
    }
    function drawBtn(b, label, fill) {
      const ctx = api.ctx;
      rrect(ctx, b.x, b.y, b.w, b.h, 3); ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,0,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      api.text(label, b.x + b.w / 2, b.y + 10, label.length > 12 ? 7 : 8, 'center', '#ffd200');
    }
    function drawPause(F) {
      const ctx = api.ctx, P = PAUSE, col = colOf();
      ctx.fillStyle = '#0d0b18'; ctx.fillRect(P.x, P.y, P.w, P.h);
      ctx.strokeStyle = 'rgba(255,210,0,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
      api.bigText('PAUZA', W / 2, P.y + 28, 24);
      api.text('TRÉNING', W / 2, P.y + 40, 8, 'center', '#9fffb0');
      pauseItems(F).forEach((it, i) => {
        const sel = i === T.pauseIdx;
        api.text((sel ? '▶ ' : '') + it.label, W / 2, P.row0 + i * P.step, 10, 'center', it.off ? '#666666' : sel ? '#ffd200' : '#cccccc');
      });
      const hint = col === 3 ? 'ťukni na položku · ▶ HRAŤ = pokračovať' : col === 2 ? '▲ ▼ vybrať · □ / ✕ potvrdiť · START = pokračovať'
        : '↑ ↓ vybrať · ÚDER / ENTER potvrdiť · ESC = pokračovať · H hudba · M zvuk';
      api.text(hint, W / 2, P.y + P.h - 7, 7, 'center', '#a7a7c0');
    }
    api.hooks.drawHud.push(F => {
      if (!F || !F.trening) return;
      const ctx = api.ctx;
      ctx.save();
      rrect(ctx, W / 2 - 16, 8, 32, 22, 4); ctx.fillStyle = '#0d0b18'; ctx.fill();   // ∞ namiesto časomiery (čas v tréningu nebeží)
      ctx.strokeStyle = F.paused ? 'rgba(255,210,0,0.25)' : 'rgba(255,210,0,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      api.text('∞', W / 2, 26, 18, 'center', F.paused ? '#6b5a12' : '#ffd200');    // v pauze stlmené ako zvyšok HUD
      if (F.paused) drawPause(F);
      else {
        api.text('TRÉNING', W / 2, 40, 7, 'center', '#9fffb0');
        drawBtn(BTN.menu, '◀ MENU', 'rgba(255,255,255,0.14)');
        if (F.phase === 'fight') {
          drawBtn(BTN.finish, colOf() < 2 ? 'FINISH HIM! (ENTER)' : 'FINISH HIM!', 'rgba(170,20,10,0.7)');
          drawPanel(F);
        }
      }
      ctx.restore();
    });

    // ---------------------------------------------------------------- položka menu a API pre testy
    api.addMenuItem({ label: 'TRÉNING', group: 'single', hint: 'Skúšaj údery, kombá a FINISH HIM bez straty života', act() { start(); } });
    api.trening = {
      start, begin, partnerOf, BTN, PAUSE, pauseRect, headRect,
      finish: () => startFinish(api.fight),
      reset: () => resetRound(api.fight, ''),
      pauseItems: () => pauseItems(api.fight),
      layout: () => panelLayout(api.fight),
      rows: () => T.rows.map(r => ({ id: r.id, label: r.label, cols: r.cols.slice(), done: !!T.done[r.id] })),
      get state() { return T; },
    };
  },
});
