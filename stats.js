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
    function update() {
      const m = api.menu;
      if ((m.ok || m.back) && api.sceneT > 10) { api.sfx('confirm'); api.setScene('title'); }
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
      T('ÚDER / ENTER / Esc / ťuk = späť', W / 2, H - 12, 9, 'center', '#aaa');
    }
    api.registerScene('slava', { update, draw });
    const ovl = api.MENU.findIndex(it => it.label === 'OVLÁDANIE');
    api.addMenuItem({ label: 'SIEŇ SLÁVY', act() { api.setScene('slava'); } }, ovl < 0 ? undefined : ovl);
  },
});
