// MATÚŠKO KOMBAT XII — modul finishers (P2): zakončenia kombináciou vo FINISH HIM + KNIHA ZAKONČENÍ.
// Staré jednotlačidlové spúšťanie (KIAI=rockyality, ŠPECIÁL=def.finisher, ÚDER=friendship, KOP=creeperality)
// sa týmto modulom v game.js vypína (hooks.finisher.length > 0) — nahrádza ho tajné kombo zo zdieľanej
// histórie vstupov (api.matchSeq). Nepoznané tlačidlo naďalej funguje ako obyčajný útok: zásah vo fáze
// 'finish' necháva game.js (applyHitCore) spraviť pád súpera, tu sa nič extra nerobí.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'finishers',
  init(api) {
    const MAX_GAP = 36;   // 0,6 s pri 60 fps — medzera medzi stlačeniami v kombe
    // zhoda konca histórie (api.matchSeq); kombá sa líšia poradím smerov a tlačidla. Dlhšie kombo sa skúša
    // skôr, takže pri prípadnom prekryve vyhrá najdlhšia zhoda (VZAD×3 KOP = FRIENDSHIP, nikdy FUTBALITY).
    const COMBOS = [
      { kind: 'rockyality',   seq: ['down', 'down', 'kiai'] },
      { kind: 'creeperality', seq: ['down', 'up', 'kick'] },
      { kind: 'babality',     seq: ['down', 'down', 'down', 'punch'] },
      { kind: 'friendship',   seq: ['B', 'B', 'B', 'kick'] },
      { kind: 'folklority',   seq: ['F', 'B', 'special'] },
      { kind: 'moreality',    seq: ['F', 'F', 'kiai'], arena: 'more' },
      { kind: 'futbality',    seq: ['B', 'F', 'kick'] },
    ].sort((a, b) => b.seq.length - a.seq.length);
    const BOOK_KEY = 'mk12_finishers';
    // zoznam pre KNIHU KOMB (MOREALITY je skryté tajomstvo len pre more oblúd, nepočíta sa do X/6)
    const BOOK_LIST = [
      { kind: 'rockyality',   label: 'ROCKYALITY',   combo: '↓ ↓ KIAI' },
      { kind: 'creeperality', label: 'CREEPERALITY', combo: '↓ ↑ KOP' },
      { kind: 'babality',     label: 'BABALITY',     combo: '↓ ↓ ↓ ÚDER' },
      { kind: 'friendship',   label: 'FRIENDSHIP',   combo: 'VZAD VZAD VZAD KOP' },
      { kind: 'folklority',   label: 'FOLKLORITY',   combo: 'VPRED VZAD ŠPECIÁL' },
      { kind: 'futbality',    label: 'FUTBALITY',    combo: 'VZAD VPRED KOP' },
    ];

    // ---------------------------------------------------------------- kniha zakončení (localStorage, try/catch)
    function loadBook() {
      try {
        const raw = localStorage.getItem(BOOK_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
      } catch (e) { return new Set(); }   // bez úložiska kniha jednoducho ukáže samé "???"
    }
    function recordDiscovered(kind) {
      try {
        const set = loadBook();
        if (set.has(kind)) return;
        set.add(kind);
        localStorage.setItem(BOOK_KEY, JSON.stringify(Array.from(set)));
      } catch (e) { /* bez úložiska sa kniha nezapíše, hra beží ďalej */ }
    }

    // ---------------------------------------------------------------- dostupnosť podľa spritov/arény
    function hasKroj(L) {
      const fa = api.FA[L.sid];
      return !!(fa && fa.anims && fa.anims.kroj);
    }
    function availableKinds(F, L) {
      const list = ['rockyality', 'creeperality', 'babality', 'friendship', 'futbality'];
      if (hasKroj(L)) list.push('folklority');
      if (F.stage && F.stage.id === 'more') list.push('moreality');
      return list;
    }
    // zakončenie, pre ktoré chýba sprite, sa ticho nahradí pádom (rovnaký vzor ako timeout v game.js)
    function silentFall(F, L) {
      L.set('fall'); L.vy = -3; L.vx = 0;
      F.phase = 'matchEnd'; F.t = -40;
    }

    // ---------------------------------------------------------------- hooks.finisher: rozhodca komb
    api.hooks.finisher.push((w, L) => {
      const F = api.fight;
      if (!F) return null;
      if (w.ctl instanceof api.CPU) {
        // CPU víťaz nemá históriu (žiadne matchSeq) → po ~70 snímkach vyber náhodné dostupné zakončenie
        if (F.t < 70) return null;
        const list = availableKinds(F, L);
        if (!list.length) return null;
        const kind = list[Math.floor(api.rnd(0, list.length))];
        recordDiscovered(kind);
        return kind;
      }
      for (const c of COMBOS) {
        if (c.arena && (!F.stage || F.stage.id !== c.arena)) continue;   // MOREALITY len v aréne 'more'
        if (!api.matchSeq(w.ctl, c.seq, MAX_GAP)) continue;
        if (c.kind === 'folklority' && !hasKroj(L)) { silentFall(F, L); return null; }
        recordDiscovered(c.kind);
        return c.kind;
      }
      return null;   // žiadne kombo → game.js necháva stlačenie prejsť ako obyčajný útok
    });

    // ---------------------------------------------------------------- hooks.cpu: počas FINISH HIM nech CPU mlčí
    // (bez tohto by stará "vyber tlačidlo po 70 snímkach" logika v CPU.think bežala súbežne s výberom vyššie)
    api.hooks.cpu.push((cpuCtl, f, o, phase) => {
      if (phase !== 'finish') return null;   // boj necháva riešiť pôvodnú/P1 AI
      return { held: {}, pressed: {} };
    });

    // ---------------------------------------------------------------- HUD: tajná nápoveda namiesto starej
    // Stará nápoveda (game.js, len keď víťaz nie je CPU) sa nedá vypnúť — táto je posadená inde na obrazovke,
    // aby sa neprekrývali.
    api.hooks.drawHud.push((F) => {
      if (!F || F.phase !== 'finish') return;
      const w = F.fighters[F.winner];
      if (!w || w.ctl instanceof api.CPU) return;
      if (F.t > 40 && F.t % 70 < 50) {
        api.text('TAJNÉ KOMBO — pozri KNIHU KOMB', api.W / 2, 206, 9, 'center', '#ffe066');
      }
    });

    // ---------------------------------------------------------------- MOREALITY (B): kreslené chápadlo z mora
    function drawTentacle(F) {
      const m = F.moreality; if (!m) return;
      const ctx = api.ctx, t = m.t, rise = Math.min(1, t / 20);
      const baseX = m.baseX, baseY = api.GROUND + 10, topY = baseY - 130 * rise;
      const sway = Math.sin(t / 6) * 13 * rise, curl = Math.cos(t / 6) * 10 * rise;
      const midX = baseX + sway, midY = (baseY + topY) / 2, tipX = baseX + sway * 1.5 + curl;
      ctx.save();
      // hrubé telo chápadla, zužuje sa smerom k špičke
      for (let seg = 0; seg < 10; seg++) {
        const k0 = seg / 10, k1 = (seg + 1) / 10;
        const x0 = baseX + (tipX - baseX) * k0 * (2 - k0), y0 = baseY + (topY - baseY) * k0;
        const x1 = baseX + (tipX - baseX) * k1 * (2 - k1), y1 = baseY + (topY - baseY) * k1;
        ctx.strokeStyle = seg % 2 ? '#1f6e52' : '#276b4f'; ctx.lineWidth = 20 - seg * 1.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(190,255,220,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.quadraticCurveTo(midX, midY, tipX, topY); ctx.stroke();
      ctx.fillStyle = '#133527';
      for (let i = 1; i <= 6; i++) {
        const k = i / 7, x = baseX + (tipX - baseX) * k * (2 - k), y = baseY + (topY - baseY) * k;
        ctx.beginPath(); ctx.arc(x, y, Math.max(2, 5 - i * 0.4), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    api.hooks.drawFront.push((stage, F) => {
      if (F && F.phase === 'finisher' && F.finisher === 'moreality') drawTentacle(F);
    });
    api.registerFinisher('moreality', {
      start(F, w, L) {
        w.set('idle');
        const dir = L.x >= w.x ? 1 : -1;
        F.moreality = { t: 0, baseX: api.clamp(L.x + dir * 8, 30, api.W - 30), startX: L.x };
        api.sfx('hiss', 0.7);
      },
      update(F, w, L) {
        const m = F.moreality; m.t++;
        if (m.t === 8) { api.banner('MOREALITY', 170, 36); api.say('moreality'); }
        if (m.t > 20 && m.t <= 70) L.x = m.startX + (m.baseX - m.startX) * ((m.t - 20) / 50);
        if (m.t === 71) { api.sfx('splash', 0.85); api.shake(8); api.spark(m.baseX, api.GROUND - 6, '#bfe8ff', 16); }
        return m.t > 150;
      },
    });

    // ---------------------------------------------------------------- FUTBALITY (P9): lopta, rozbeh, kop a GÓÓÓL!
    // Pred víťaza sa skotúľa lopta, víťaz cúvne na rozbeh, rozbehne sa a kopne. Lopta trafí porazeného a ten
    // v oblúku odletí do brány, ktorá sa medzitým vysunie z okraja; sieť sa prehne, GÓÓÓL!, FUTBALITY.
    // Stav je len v F.futbality ako čisté dáta (čísla, reťazce, bool; bojovníci len cez F.winner/F.loser), takže
    // ho sieťový hosť dostane v snímke stavu. Logika beží len v update (hosť ho nevolá), kreslenie len zo stavu.
    // Zostava sa ráta v „u“ = vzdialenosť od okraja za víťazom; x = u pre súpera vpravo, x = W − u pre súpera vľavo.
    const FUT = {
      R: 10,          // polomer lopty (futbal pri ~140 px vysokom chlapcovi)
      GH: 166,        // výška brány
      GD: 124,        // hĺbka brány z boku
      EDGE: 22,       // zadná sieť od okraja obrazovky (miesto na prehnutie)
      RUN: 46,        // dĺžka rozbehu
      SET: 40,        // príprava: lopta sa kotúľa, víťaz cúva na rozbeh
      PAUSE: 6,       // nádych pred rozbehom
      RUNF: 12,       // rozbeh (snímky)
      POP: 11,        // od začiatku kopu po úder do lopty (kop: startup 9 + 2)
      FLY: 40,        // let porazeného do siete
      SLIDE: 10,      // zosun po sieti na zem
      GOAL: 62,       // GÓÓÓL! → FUTBALITY
      HOLD: 96,       // FUTBALITY → koniec zakončenia
    };
    api.animFallback('futrun', 'walk');   // rozbeh/cúvanie: sprite walk (Rocky má walk = run)
    const isGuest = () => !!(api.NET && api.NET.role === 'guest');
    const smooth = k => k * k * (3 - 2 * k);
    const easeOut = k => 1 - (1 - k) * (1 - k) * (1 - k);
    const easeBack = k => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);   // vysunie sa s malým prekmitom
    const clamp01 = k => Math.max(0, Math.min(1, k));
    function bodyHeight(f) {   // výška postavy: def.height (boss, XXL), inak sprite idle × mierka (menšia postava = menšia)
      if (f.def && f.def.height) return f.def.height;
      const fa = api.FA[f.sid], a = fa && fa.anims && fa.anims.idle;
      return (a ? a.h * (a.scale || 1) : 138) * ((f.def && f.def.scale) || 1);
    }
    function lyingBehind(f) {  // ako ďaleko za kotvou (smerom k hlave) siaha ležiaca postava: ax spritu fall × mierky
      const fa = api.FA[f.sid], a = fa && fa.anims && fa.anims.fall;
      return (a ? a.ax * (a.scale || 1) : 88) * ((f.def && f.def.scale) || 1);
    }

    api.registerFinisher('futbality', {
      start(F, w, L) {
        if (isGuest()) return;
        const W = api.W, G = api.GROUND, dir = L.x >= w.x ? 1 : -1;
        const X = u => (dir > 0 ? u : W - u);                          // u ↔ x (tá istá funkcia oboma smermi)
        const hw = bodyHeight(w), hl = bodyHeight(L);
        const reach = Math.round(hw * 0.5);                              // lopta pri údere: pred víťazom
        const gap = reach + 36 + Math.round(hl * 0.1);                   // víťaz pri kope → porazený (lopta letí ~36 px)
        const back = W - FUT.EDGE;
        const net = Math.round(back - 6 - lyingBehind(L));              // kde porazený dopadne (hlava pri zadnej sieti)
        const minL = 30 + gap + FUT.RUN, maxL = Math.max(minL, net - 70);   // za ním je miesto na rozbeh, letí aspoň 70 px
        const uW0 = X(w.x), uL0 = X(L.x);
        let uL = api.clamp(uL0, minL, maxL), uR = Math.max(26, uL - gap - FUT.RUN);
        // veľký presun (zahnaný v rohu, ďaleko od seba) by vyzeral ako kĺzanie → záblesk a rovno výkop
        const cut = Math.abs(uR - uW0) > 140 || Math.abs(uL - uL0) > 90;
        if (cut) { uL = Math.min(maxL, minL + 20); uR = Math.max(26, uL - gap - FUT.RUN); }
        const uK = uR + FUT.RUN;
        F.futbality = {
          t: 0, dir, cut,
          wx0: cut ? X(uR) : w.x, wx1: X(uR), wxk: X(uK),                 // víťaz: štart → rozbeh → kop
          lx0: cut ? X(uL) : L.x, lx1: X(uL),                             // porazený: štart → miesto pred bránou
          ball: 'roll', bx: X(-14), by: G - FUT.R, rot: 0, vx: 0, vy: 0,  // lopta (kreslí sa len z týchto čísel)
          bx0: X(-14), bxs: X(uK + reach), bys: G - Math.round(hw * 0.42),   // odkiaľ sa kotúľa, kde ju kopne (x, výška)
          tx: X(uL - Math.round(hl * 0.12)), ty: G - Math.round(hl * 0.55),  // kam trafí porazeného (hruď)
          hitAt: -1, hitT: -1, hx: 0, hy: 0,                              // úder do porazeného
          fx0: 0, fx1: X(net), fy1: G - 46, arc: 0,                       // let porazeného do siete
          cx0: 0, cy0: 0, cx1: X(back - FUT.R - 10), cy1: G - 64, carc: 0,   // let lopty do siete
          netT: -1, gk: 0, bulge: 0,                                      // brána: vysunutie 0..1, prehnutie siete (px)
        };
        w.vx = 0; w.vy = 0; w.y = G; w.facing = dir;
        L.vx = 0; L.vy = 0; L.y = G; L.facing = -dir;
        if (L.state !== 'dizzy') L.set('dizzy');
        if (cut) { w.x = X(uR); L.x = X(uL); w.set('idle'); F.flash = 18; }
        else if (Math.abs(uR - uW0) > 4) w.set('futrun');
        else w.set('idle');
      },
      update(F, w, L) {
        const m = F.futbality;
        if (!m || isGuest()) return false;                                // sieťový hosť len kreslí
        m.t++;
        const t = m.t, G = api.GROUND, dir = m.dir;
        const T_RUN = FUT.SET + FUT.PAUSE, T_KICK = T_RUN + FUT.RUNF, T_STRIKE = T_KICK + FUT.POP;
        // 1) príprava: lopta sa kotúľa spoza víťaza, víťaz cúva na rozbeh, porazený sa potáca pred bránu
        if (t <= FUT.SET) {
          const k = smooth(t / FUT.SET);
          w.x = m.wx0 + (m.wx1 - m.wx0) * k; L.x = m.lx0 + (m.lx1 - m.lx0) * k;
          if (w.state === 'futrun') {
            if (t >= FUT.SET) w.set('idle');
            else w.t = (m.wx1 - m.wx0) * dir < 0 ? 6000 - t : t;            // cúvanie = chôdza odzadu
          }
        }
        if (m.ball === 'roll') {
          const p = easeOut(clamp01((t - 2) / (FUT.SET - 2)));
          m.bx = m.bx0 + (m.bxs - m.bx0) * p; m.by = G - FUT.R;
          m.rot = (m.bx - m.bx0) / FUT.R;                                   // kotúľa sa bez šmyku
          if (p >= 1) m.ball = 'rest';
        }
        // 2) rozbeh a kop
        if (t >= T_RUN && t < T_KICK) {
          if (w.state !== 'futrun') w.set('futrun');
          const p = (t - T_RUN) / FUT.RUNF;
          w.x = m.wx1 + (m.wxk - m.wx1) * Math.pow(p, 1.25); w.t = (t - T_RUN) * 2 + 3;   // beh = chôdza 2× rýchlejšie
        }
        if (t === T_KICK) { w.x = m.wxk; w.vx = 0; w.facing = dir; w.set('kick', 'kick'); w.hitDone = true; m.ball = 'pop'; }   // hitDone: kop nezasiahne porazeného
        if (m.ball === 'pop') {                                             // špička nohy loptu podbije do výšky úderu
          const p = clamp01((t - T_KICK) / FUT.POP);
          m.by = (G - FUT.R) - ((G - FUT.R) - m.bys) * (1 - (1 - p) * (1 - p)); m.rot += dir * 0.25;
        }
        if (t === T_STRIKE) {
          api.sfx('ballkick'); api.shake(5); api.spark(m.bx, m.by, '#ffffff', 10);
          const n = Math.max(3, Math.round(Math.hypot(m.tx - m.bx, m.ty - m.by) / 11));
          m.vx = (m.tx - m.bx) / n; m.vy = (m.ty - m.by) / n; m.ball = 'shot'; m.hitAt = t + n;
        }
        if (m.ball === 'shot') { m.bx += m.vx; m.by += m.vy; m.rot += dir * 0.6; }
        // 3) zásah: porazený letí v oblúku do siete, lopta s ním
        if (t === m.hitAt) {
          L.set('fall'); L.vx = 0; L.vy = 0;
          m.hitT = t; m.hx = m.bx; m.hy = m.by; m.fx0 = L.x;
          m.arc = api.clamp(60 + Math.abs(m.fx1 - L.x) * 0.3, 60, 115);
          m.cx0 = m.bx; m.cy0 = m.by; m.carc = m.arc * 0.85; m.ball = 'carry';
          api.spark(m.bx, m.by, '#ffe23a', 14); api.shake(7);
        }
        if (m.hitT >= 0 && t > m.hitT && t <= m.hitT + FUT.FLY) {
          const k = (t - m.hitT) / FUT.FLY;
          L.x = m.fx0 + (m.fx1 - m.fx0) * k; L.y = G + (m.fy1 - G) * k - m.arc * 4 * k * (1 - k);
          L.vx = 0; L.vy = 0; L.t = Math.floor((t - m.hitT) * 1.7);       // pád rýchlejšie → vo vrchole oblúka už leží
        }
        if (m.ball === 'carry') {
          const k = clamp01((t - m.hitT) / (FUT.FLY - 4));
          m.bx = m.cx0 + (m.cx1 - m.cx0) * k; m.by = m.cy0 + (m.cy1 - m.cy0) * k - m.carc * 4 * k * (1 - k);
          m.rot += dir * 0.5;
          if (k >= 1) { m.ball = 'drop'; m.vx = 0; m.vy = 0; }
        }
        if (m.ball === 'drop') {                                            // lopta v sieti padne a doskáče
          m.vy += 0.5; m.by += m.vy;
          if (m.by >= G - FUT.R) { m.by = G - FUT.R; m.vy = Math.abs(m.vy) > 1.5 ? -m.vy * 0.45 : 0; }
        }
        // 4) sieť: GÓÓÓL!, zosun na zem, FUTBALITY
        if (m.hitT >= 0 && t === m.hitT + FUT.FLY) {
          m.netT = t;
          api.say('goal'); api.banner('GÓÓÓL!', FUT.GOAL, 62, 112); api.shake(10);
          w.set('win');                                                     // víťaz oslavuje gól
          for (let i = 0; i < 26; i++) F.fx.push({ kind: 'confetti', x: api.rnd(0, api.W), y: -6, vy: api.rnd(1, 2.2), vx: api.rnd(-0.6, 0.6),
            c: ['#ff4d4d', '#ffd200', '#4dd2ff', '#7dff6a', '#ffffff'][Math.floor(api.rnd(0, 5))], t: 0, life: 150 });
        }
        if (m.netT >= 0 && t > m.netT && t <= m.netT + FUT.SLIDE) {
          L.x = m.fx1; L.vx = 0; L.vy = 0;
          L.y = m.fy1 + (G - m.fy1) * smooth((t - m.netT) / FUT.SLIDE);   // na zemi ho game.js prepne na 'down' (zvuk pádu)
        }
        m.bulge = m.netT >= 0 ? 20 * Math.exp(-(t - m.netT) / 16) * Math.cos((t - m.netT) / 3.4) : 0;
        m.gk = easeBack(clamp01((t - (FUT.SET - 10)) / 24));
        if (m.netT >= 0 && t === m.netT + FUT.GOAL) { api.banner('FUTBALITY', 170, 36); api.say('futbality'); api.sfx('crowd', 0.6); }
        return (m.netT >= 0 && t >= m.netT + FUT.GOAL + FUT.HOLD) || t > 600;
      },
    });

    // ---------------------------------------------------------------- FUTBALITY: kreslenie (len z F.futbality)
    function goalGeom(m) {                       // v súradniciach „súper vpravo“; pre súper vľavo sa kreslí zrkadlovo
      const G = api.GROUND, slide = (1 - m.gk) * (FUT.GD + FUT.EDGE + 18);
      const back = api.W - FUT.EDGE + slide, front = back - FUT.GD, top = G - FUT.GH;
      return { G, back, front, top, roofX: back - 8, roofY: top + 22, footX: back + 5 };
    }
    function bulgeAt(g, m, x, y) {               // prehnutie siete: najviac vzadu v strede výšky, pri tyčiach nič
      if (!m.bulge) return 0;
      const d = clamp01((x - g.front) / (g.back - g.front)), v = Math.sin(Math.PI * clamp01((y - g.top) / (g.G - g.top)));
      return m.bulge * d * d * v;
    }
    function goalPath(ctx, g, m) {               // obrys siete: predná tyč, strecha, prehnutá zadná sieť, zem
      ctx.beginPath(); ctx.moveTo(g.front, g.G); ctx.lineTo(g.front, g.top); ctx.lineTo(g.roofX, g.roofY);
      for (let j = 1; j <= 10; j++) {
        const k = j / 10, x = g.roofX + (g.footX - g.roofX) * k, y = g.roofY + (g.G - g.roofY) * k;
        ctx.lineTo(x + bulgeAt(g, m, x, y), y);
      }
      ctx.closePath();
    }
    function onSide(m, fn) {
      const ctx = api.ctx; ctx.save();
      if (m.dir < 0) { ctx.translate(api.W, 0); ctx.scale(-1, 1); }
      fn(ctx); ctx.restore();
    }
    function drawGoalBack(m) {                   // pod postavami: vnútro, zadná sieť, vzdialená tyč
      const g = goalGeom(m); if (g.front >= api.W + 4) return;
      onSide(m, ctx => {
        goalPath(ctx, g, m); ctx.fillStyle = 'rgba(12,22,34,0.22)'; ctx.fill();
        ctx.strokeStyle = 'rgba(225,232,240,0.55)'; ctx.lineWidth = 1;
        for (let j = 0; j <= 12; j++) {          // zadná sieť: vodorovné oká medzi strechou a zemou
          const k = j / 12, y0 = g.roofY + (g.G - g.roofY) * k, x0 = g.roofX + (g.footX - g.roofX) * k;
          ctx.beginPath(); ctx.moveTo(x0 - 18, y0); ctx.lineTo(x0 + bulgeAt(g, m, x0, y0), y0); ctx.stroke();
        }
        ctx.strokeStyle = '#8f99a6'; ctx.lineWidth = 3; ctx.lineCap = 'round';   // vzdialená tyč a brvno (hĺbka)
        ctx.beginPath(); ctx.moveTo(g.front + 12, g.G - 12); ctx.lineTo(g.front + 12, g.top - 10); ctx.lineTo(g.front, g.top); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(g.front, g.G - 1); ctx.lineTo(g.footX, g.G - 1); ctx.stroke();
      });
    }
    function drawGoalFront(m) {                  // nad postavami: bočná sieť (porazený je „v nej“), predná tyč, brvno
      const g = goalGeom(m); if (g.front >= api.W + 4) return;
      onSide(m, ctx => {
        ctx.save(); goalPath(ctx, g, m); ctx.clip();
        const h = g.G - g.top;
        for (const pass of [0, 1]) {             // tmavý podklad + biela niť: oká vidno na svetlom aj tmavom pozadí
          ctx.strokeStyle = pass ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.22)'; ctx.lineWidth = pass ? 1 : 2.2;
          for (const s of [1, -1]) for (let c = g.front - h; c <= g.footX + 30 + h; c += 12) {
            ctx.beginPath();
            for (let j = 0; j <= 10; j++) {
              const y = g.top + h * j / 10, x = c + s * (y - g.top);
              const px = x + bulgeAt(g, m, x, y);
              if (j) ctx.lineTo(px, y); else ctx.moveTo(px, y);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#222'; ctx.lineWidth = 3;                      // zadná sieť (prehýba sa)
        goalPath(ctx, g, m); ctx.stroke();
        ctx.strokeStyle = '#d9dee4'; ctx.lineWidth = 1.5; ctx.stroke();
        for (const [lw, col] of [[8, '#1a1a1a'], [5, '#f7f7f7']]) {       // predná tyč a strecha brány (biele s obrysom)
          ctx.strokeStyle = col; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(g.front, g.G); ctx.lineTo(g.front, g.top); ctx.lineTo(g.roofX, g.roofY); ctx.stroke();
        }
        ctx.strokeStyle = '#b8c0ca'; ctx.lineWidth = 1.5;                 // tieň na tyči
        ctx.beginPath(); ctx.moveTo(g.front + 1.5, g.G - 2); ctx.lineTo(g.front + 1.5, g.top + 3); ctx.stroke();
      });
    }
    function drawBall(x, y, r, rot) {            // biela lopta s čiernymi päťuholníkmi
      const ctx = api.ctx;
      const pent = (cx, cy, pr, a0) => {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { const a = a0 + i * Math.PI * 0.4; const px = cx + Math.cos(a) * pr, py = cy + Math.sin(a) * pr; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath(); ctx.fill();
      };
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#fbfbfb'; ctx.fill();
      ctx.save(); ctx.clip(); ctx.rotate(rot);
      ctx.fillStyle = '#17171d'; ctx.strokeStyle = '#8d8d99'; ctx.lineWidth = 1;
      pent(0, 0, r * 0.38, -Math.PI / 2);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 0.4;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38); ctx.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66); ctx.stroke();
        pent(Math.cos(a) * r * 0.98, Math.sin(a) * r * 0.98, r * 0.34, a + Math.PI);
      }
      ctx.restore();
      const sh = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);   // guľatosť a lesk
      sh.addColorStop(0, 'rgba(255,255,255,0.4)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    function drawBallShadow(m) {
      const ctx = api.ctx, h = Math.max(0, api.GROUND - FUT.R - m.by), k = Math.max(0.35, 1 - h / 160);
      ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
      ctx.beginPath(); ctx.ellipse(m.bx, api.GROUND - 1, FUT.R * k, 3 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    function drawFutFront(m) {
      const ctx = api.ctx;
      if (m.ball === 'shot') for (let i = 3; i >= 1; i--) {               // stopa za vystrelenou loptou
        ctx.fillStyle = `rgba(255,255,255,${0.12 * (4 - i)})`;
        ctx.beginPath(); ctx.arc(m.bx - m.vx * i * 0.8, m.by - m.vy * i * 0.8, FUT.R * (1 - i * 0.12), 0, Math.PI * 2); ctx.fill();
      }
      drawBall(m.bx, m.by, FUT.R, m.rot);
      drawGoalFront(m);
      const e = m.hitT >= 0 ? m.t - m.hitT : 99;
      if (e >= 0 && e < 9) {                                              // hviezda zásahu
        ctx.save(); ctx.globalAlpha = 1 - e / 9; ctx.translate(m.hx, m.hy);
        const r0 = 9 + e * 3; ctx.beginPath();
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r0 * 0.45 : r0; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fillStyle = '#fff6b0'; ctx.fill(); ctx.strokeStyle = '#ff9f1a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }
    }
    const futOn = F => !!(F && F.finisher === 'futbality' && F.futbality && (F.phase === 'finisher' || F.phase === 'matchEnd'));
    api.hooks.drawBack.push((stage, F) => { if (futOn(F)) { drawGoalBack(F.futbality); drawBallShadow(F.futbality); } });
    api.hooks.drawFront.push((stage, F) => { if (futOn(F)) drawFutFront(F.futbality); });

    // ---------------------------------------------------------------- KNIHA KOMB: menu položka + scéna
    function updateBook() {
      const m = api.menu;
      if ((m.ok || m.back) && api.sceneT > 10) { api.sfx('confirm'); api.setScene('title'); }
    }
    function drawBook() {
      const ctx = api.ctx, W = api.W;
      ctx.fillStyle = '#0b0b14'; ctx.fillRect(0, 0, W, api.H);
      api.bigText('KNIHA KOMB', W / 2, 30, 24);
      const found = loadBook();
      let n = 0;
      BOOK_LIST.forEach((it, i) => {
        const y = 58 + i * 28, ok = found.has(it.kind);
        if (ok) n++;
        api.text(ok ? it.label : '???', W / 2 - 140, y, 13, 'left', ok ? '#ffd200' : '#555');
        if (ok) api.text(it.combo, W / 2 - 140, y + 13, 9, 'left', '#9fd8ff');
      });
      api.text(`${n}/${BOOK_LIST.length} OBJAVENÝCH`, W / 2, 58 + BOOK_LIST.length * 28 + 14, 12, 'center', '#ffe066');
      api.text('ÚDER / ENTER / Esc / ťuk = späť', W / 2, api.H - 12, 9, 'center', '#aaa');
    }
    api.registerScene('combobook', { update: updateBook, draw: drawBook });
    const ovladanieIdx = api.MENU.findIndex(it => it.label === 'OVLÁDANIE');
    api.addMenuItem({ label: 'KNIHA KOMB', act() { api.setScene('combobook'); } }, ovladanieIdx < 0 ? undefined : ovladanieIdx);
  },
});
