// MATÚŠKO KOMBAT XII — modul stats: SIEŇ SLÁVY (bratský súboj, víťazstvá postáv, rekordy), uložené v prehliadači (localStorage)
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'stats',
  init(api) {
    const KEY = 'mk12_stats';
    // prefarbení bratia sa rátajú za svojho brata (ZLATÝ/ORANŽOVÝ MATÚŠKO = Matúš, ČERVENÝ ŠIMON = Šimon)
    const BRO = { matusko: 'matusko', zlaty: 'matusko', oranzovy: 'matusko', simon: 'simon', cerveny: 'simon' };
    const COLOR = { matusko: '#ff9f1a', simon: '#5b8cff' };
    const empty = () => ({ v: 1, matches: 0, wins: {}, flawless: {}, finishers: {},
      duel: { matusko: 0, simon: 0, last: [], streak: null, best: null }, hora: { done: 0, best: null } });
    let S = empty();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); S = Object.assign(empty(), d); S.duel = Object.assign(empty().duel, d.duel); S.hora = Object.assign(empty().hora, d.hora); }
    } catch (e) { /* bez úložiska (súkromné okno) sa počíta len v pamäti */ }
    {                                          // poškodené alebo staré údaje: zlé typy nahradiť prázdnymi (Codex r6: wins:null zhodil SIEŇ SLÁVY)
      const obj = v => !!v && typeof v === 'object' && !Array.isArray(v), num = v => typeof v === 'number' && isFinite(v);
      for (const k of ['wins', 'flawless', 'finishers']) if (!obj(S[k])) S[k] = {};
      if (!num(S.matches)) S.matches = 0;
      if (!obj(S.duel)) S.duel = empty().duel;
      for (const k of ['matusko', 'simon']) if (!num(S.duel[k])) S.duel[k] = 0;
      if (!Array.isArray(S.duel.last)) S.duel.last = [];
      if (!obj(S.hora)) S.hora = empty().hora;
      if (!num(S.hora.done)) S.hora.done = 0;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* nevadí */ } }
    const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
    const seen = new Set();                    // každý zápas a kolo sa zapíše raz (aj keď stav prichádza zo siete)

    function recordMatch(F) {
      const w = F.fighters[F.winner], l = F.fighters[1 - F.winner];
      if (!w || !l) return;
      S.matches++; inc(S.wins, w.id);
      const kr = F.statId + ':r' + F.round;                   // posledné kolo cez FINISH HIM nejde cez roundEnd
      if (!seen.has(kr)) { seen.add(kr); if (w.damageTaken === 0) inc(S.flawless, w.id); }
      if (F.finisher) inc(S.finishers, F.finisher);
      const bw = BRO[w.id], bl = BRO[l.id];
      if (api.game.mode === 2 && bw && bl && bw !== bl) {        // bratský súboj = len dvaja hráči (na jednom zariadení aj cez sieť)
        const d = S.duel;
        d[bw]++; d.last.push(bw); if (d.last.length > 10) d.last.shift();
        d.streak = d.streak && d.streak.id === bw ? { id: bw, n: d.streak.n + 1 } : { id: bw, n: 1 };
        if (!d.best || d.streak.n > d.best.n) d.best = { id: bw, n: d.streak.n };
      }
      save();
    }
    api.stats = {
      get data() { return S; },
      hora(id, ms) { S.hora.done++; if (ms > 0 && (!S.hora.best || ms < S.hora.best.ms)) S.hora.best = { id, ms }; save(); },   // volá ladder.js
      reset() { S = empty(); save(); },
      get resetUI() { return R; },             // pre testy: stav dialógu VYNULOVAŤ POSTUP (focus, step, sel)
    };

    api.hooks.matchStart.push(F => { if (!(api.NET && api.NET.role === 'guest')) F.statId = Math.random().toString(36).slice(2, 10); });
    api.hooks.frame.push(() => {               // beží aj u sieťového hosťa: zapisuje zo stavu, ktorý príde od hostiteľa
      const F = api.fight;
      if (!F || !F.statId || !F.fighters || F.trening) return;          // TRÉNING (trening.js) sa do SIENE SLÁVY nezapisuje
      if (F.phase === 'roundEnd' && F.roundWinner >= 0) {
        const k = F.statId + ':r' + F.round;
        if (!seen.has(k)) { seen.add(k); const w = F.fighters[F.roundWinner]; if (w && w.damageTaken === 0) { inc(S.flawless, w.id); save(); } }
      }
      if (F.winner >= 0 && (F.phase === 'matchEnd' || api.scene === 'eject' || api.scene === 'result')) {
        const k = F.statId + ':m';
        if (!seen.has(k)) { seen.add(k); recordMatch(F); }
      }
    });

    // ---------------------------------------------------------------- scéna SIEŇ SLÁVY
    const nameOf = id => (api.ROSTER[id] ? (api.ROSTER[id].short || api.ROSTER[id].name) : String(id).toUpperCase());
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const mmss = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    function face(id, x, y, w, h, hl) {
      const ctx = api.ctx, im = api.IMG['img/portrait_' + id];
      ctx.fillStyle = '#16121f'; ctx.fillRect(x, y, w, h);
      if (im) ctx.drawImage(im, x, y, w, h);
      if (hl) { ctx.strokeStyle = hl; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); }
    }
    // ---------------------------------------------------------------- VYNULOVAŤ POSTUP (Peťo: cez menu, aby sa to nevymazalo omylom jedným gombíkom)
    const RESET_KEYS = ['mk12_unlocks', 'mk12_finishers', 'mk12_stats'];   // odomknuté postavy, KNIHA KOMB, SIEŇ SLÁVY; hudba (mk12_music) ostáva
    const R = { focus: 0, step: 0, sel: 0, t: 0 };                           // focus 0 = späť, 1 = VYNULOVAŤ…; step 1 = otázka, 2 = NAOZAJ?, 3 = hotovo
    const BTN_RESET = { x: api.W - 98, y: api.H - 25, w: 90, h: 18 };
    const OPT = [{ x: 130, y: 170, w: 96, h: 24 }, { x: 254, y: 170, w: 96, h: 24 }];
    function doReset() {
      for (const k of RESET_KEYS) { try { localStorage.removeItem(k); } catch (e) { /* bez úložiska nie je čo mazať */ } }
      S = empty(); R.step = 3; R.t = 0; api.sfx('confirm');
    }
    function update() {
      const m = api.menu;
      if (api.sceneT <= 1) { R.focus = 0; R.step = 0; R.sel = 0; }
      if (R.step === 3) { if (++R.t === 70) { try { location.reload(); } catch (e) { api.setScene('title'); } } return; }   // čistý štart bez starého stavu v pamäti modulov
      if (R.step > 0) {
        if (m.back) { R.step = 0; api.sfx('select'); return; }
        const yesPos = R.step === 2 ? 0 : 1;                                   // NAOZAJ?: ÁNO vľavo, NIE vpravo — dvojitý ťuk na to isté miesto nič nezmaže
        if (m.left || m.right) { R.sel = 1 - R.sel; api.sfx('select'); }
        let act = m.ok && !m.tap ? (R.sel === yesPos ? 'yes' : 'no') : null;
        if (m.tapPos) act = api.inBtn(m.tapPos, OPT[yesPos]) ? 'yes' : api.inBtn(m.tapPos, OPT[1 - yesPos]) ? 'no' : null;
        if (act === 'no') { R.step = 0; api.sfx('select'); }
        else if (act === 'yes') { if (R.step === 1) { R.step = 2; R.sel = 1; api.sfx('block'); } else doReset(); }   // predvolené vždy NIE
        return;
      }
      if (m.left || m.right) { R.focus = 1 - R.focus; api.sfx('select'); }
      const open = () => { R.step = 1; R.sel = 0; api.sfx('select'); };
      if (m.tapPos && api.inBtn(m.tapPos, BTN_RESET)) return open();
      if ((m.ok || m.back) && api.sceneT > 10) {
        if (m.ok && !m.tap && R.focus === 1) return open();
        api.sfx('confirm'); api.setScene('title');
      }
    }
    function draw() {
      const ctx = api.ctx, W = api.W, H = api.H, T = api.text, d = S.duel;
      ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, W, H);
      api.bigText('SIEŇ SLÁVY', W / 2, 30, 24);
      // bratský súboj
      const lead = d.matusko > d.simon ? 'matusko' : d.simon > d.matusko ? 'simon' : null;
      face('matusko', W / 2 - 160, 42, 52, 65, lead === 'matusko' ? '#ffd200' : COLOR.matusko);
      face('simon', W / 2 + 108, 42, 52, 65, lead === 'simon' ? '#ffd200' : COLOR.simon);
      T(nameOf('matusko'), W / 2 - 134, 118, 9, 'center', COLOR.matusko);
      T(nameOf('simon'), W / 2 + 134, 118, 9, 'center', COLOR.simon);
      T('BRATSKÝ SÚBOJ', W / 2, 52, 10, 'center', '#ffd200');
      if (d.matusko + d.simon === 0) {
        T('Zatiaľ žiadny zápas 2 hráčov.', W / 2, 80, 9, 'center', '#bbb');
        T('Počíta sa hra 2 HRÁČI aj HRA CEZ SIEŤ.', W / 2, 94, 8, 'center', '#888');
      } else {
        api.bigText(`${d.matusko} : ${d.simon}`, W / 2, 92, 34, !lead);
        d.last.forEach((id, i) => { ctx.fillStyle = COLOR[id] || '#888'; ctx.fillRect(W / 2 - d.last.length * 5 + i * 10, 101, 8, 5); });
        if (d.streak) T(`séria: ${nameOf(d.streak.id)} ${d.streak.n}×` + (d.best && d.best.n > d.streak.n ? `   rekord: ${nameOf(d.best.id)} ${d.best.n}×` : ''), W / 2, 117, 8, 'center', '#ddd');
      }
      // víťazstvá postáv
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(28, 130, W - 56, 1);
      T('VÍŤAZSTVÁ', 40, 146, 10, 'left', '#ffd200');
      const wins = top(S.wins).slice(0, 7);
      if (!wins.length) T('zatiaľ nič', 40, 162, 9, 'left', '#888');
      wins.forEach(([id, n], i) => { T(nameOf(id), 40, 162 + i * 12, 9, 'left', '#fff'); T(String(n), 214, 162 + i * 12, 9, 'right', '#ffe066'); });
      // rekordy
      T('REKORDY', 254, 146, 10, 'left', '#ffd200');
      const fl = top(S.flawless)[0], fin = top(S.finishers), finN = fin.reduce((a, e) => a + e[1], 0);
      const lines = [
        ['Odohrané zápasy', String(S.matches)],
        ['HORA zdolaná', S.hora.done + '×'],
        ['Najrýchlejší výstup', S.hora.best ? `${nameOf(S.hora.best.id)} ${mmss(S.hora.best.ms)}` : '—'],
        ['Najviac FLAWLESS', fl ? `${nameOf(fl[0])} ${fl[1]}×` : '—'],
        ['Zakončenia', String(finN)],
        ['Najobľúbenejšie', fin[0] ? `${fin[0][0].toUpperCase()} ${fin[0][1]}×` : '—'],
      ];
      lines.forEach(([k, v], i) => { T(k, 254, 162 + i * 12, 9, 'left', '#cfd8e8'); T(v, W - 40, 162 + i * 12, 9, 'right', '#fff'); });
      T(R.focus === 1 ? 'ENTER = vynulovať postup…   ← = späť' : 'ÚDER / ENTER / Esc / ťuk = späť', W / 2, H - 12, 9, 'center', '#aaa');
      const b = BTN_RESET;                                                  // nenápadné tlačidlo vpravo dole (na klávesnici šípkou →)
      ctx.fillStyle = R.focus === 1 ? 'rgba(255,90,90,0.25)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(b.x, b.y, b.w, b.h);
      if (R.focus === 1) { ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = 1; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); }
      T('VYNULOVAŤ…', b.x + b.w / 2, b.y + 12, 8, 'center', R.focus === 1 ? '#ffb0b0' : '#777');
      if (R.step > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#1b1020'; ctx.fillRect(60, 72, W - 120, 138); ctx.strokeStyle = '#ff6a6a'; ctx.lineWidth = 2; ctx.strokeRect(60, 72, W - 120, 138);
        if (R.step === 3) {
          api.bigText('POSTUP VYNULOVANÝ', W / 2, 136, 18);
          T('Hra sa spustí odznova…', W / 2, 160, 9, 'center', '#ddd');
          return;
        }
        api.bigText(R.step === 1 ? 'VYNULOVAŤ POSTUP?' : 'NAOZAJ?', W / 2, 100, 18);
        if (R.step === 1) {
          T('Zmažú sa odomknuté postavy, objavené zakončenia', W / 2, 122, 9, 'center', '#eee');
          T('v KNIHE KOMB a celá SIEŇ SLÁVY. Hudba ostane.', W / 2, 136, 9, 'center', '#eee');
        } else {
          T('Toto sa nedá vrátiť.', W / 2, 126, 10, 'center', '#ffb0b0');
        }
        const yesPos = R.step === 2 ? 0 : 1;
        (R.step === 1 ? ['NIE', 'ÁNO, VYMAZAŤ'] : ['ÁNO', 'NIE']).forEach((lb, i) => {
          const o = OPT[i], on = R.sel === i, yes = i === yesPos;
          ctx.fillStyle = on ? (yes ? 'rgba(255,90,90,0.35)' : 'rgba(255,210,0,0.25)') : 'rgba(255,255,255,0.08)'; ctx.fillRect(o.x, o.y, o.w, o.h);
          if (on) { ctx.strokeStyle = yes ? '#ff6a6a' : '#ffd200'; ctx.lineWidth = 2; ctx.strokeRect(o.x, o.y, o.w, o.h); }
          T(lb, o.x + o.w / 2, o.y + 16, 10, 'center', on ? '#fff' : '#bbb');
        });
        T('← → výber   ENTER / ťuk = potvrdiť   Esc = nie', W / 2, 204, 8, 'center', '#999');
      }
    }
    api.registerScene('slava', { update, draw });
    const ovl = api.MENU.findIndex(it => it.label === 'OVLÁDANIE');
    api.addMenuItem({ label: 'SIEŇ SLÁVY', act() { api.setScene('slava'); } }, ovl < 0 ? undefined : ovl);
  },
});
