// MATÚŠKO KOMBAT XII — modul finishers (P2): zakončenia kombináciou vo FINISH HIM + KNIHA ZAKONČENÍ.
// Staré jednotlačidlové spúšťanie (KIAI=rockyality, ŠPECIÁL=def.finisher, ÚDER=friendship, KOP=creeperality)
// sa týmto modulom v game.js vypína (hooks.finisher.length > 0) — nahrádza ho tajné kombo zo zdieľanej
// histórie vstupov (api.matchSeq). Nepoznané tlačidlo naďalej funguje ako obyčajný útok: zásah vo fáze
// 'finish' necháva game.js (applyHitCore) spraviť pád súpera, tu sa nič extra nerobí.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'finishers',
  init(api) {
    const MAX_GAP = 36;   // 0,6 s pri 60 fps — medzera medzi stlačeniami v kombe
    // posledné tlačidlo je pri každom kombe iné, takže sa nepletú (suffix-match histórie)
    const COMBOS = [
      { kind: 'rockyality',   seq: ['down', 'down', 'kiai'] },
      { kind: 'creeperality', seq: ['down', 'up', 'kick'] },
      { kind: 'babality',     seq: ['down', 'down', 'down', 'punch'] },
      { kind: 'friendship',   seq: ['B', 'B', 'B', 'kick'] },
      { kind: 'folklority',   seq: ['F', 'B', 'special'] },
      { kind: 'moreality',    seq: ['F', 'F', 'kiai'], arena: 'more' },
    ];
    const BOOK_KEY = 'mk12_finishers';
    // zoznam pre KNIHU KOMB (MOREALITY je skryté tajomstvo len pre more oblúd, nepočíta sa do X/5)
    const BOOK_LIST = [
      { kind: 'rockyality',   label: 'ROCKYALITY',   combo: '↓ ↓ KIAI' },
      { kind: 'creeperality', label: 'CREEPERALITY', combo: '↓ ↑ KOP' },
      { kind: 'babality',     label: 'BABALITY',     combo: '↓ ↓ ↓ ÚDER' },
      { kind: 'friendship',   label: 'FRIENDSHIP',   combo: 'VZAD VZAD VZAD KOP' },
      { kind: 'folklority',   label: 'FOLKLORITY',   combo: 'VPRED VZAD ŠPECIÁL' },
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
      const list = ['rockyality', 'creeperality', 'babality', 'friendship'];
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
