// MATÚŠKO KOMBAT XII — modul credits: záverečné titulky ako v MK2 (P16, 2. 10. 2026)
// - Scéna 'credits': čierna noc s hviezdami, text plynulo stúpa zdola nahor (30 px/s). Na konci sa v strede zastaví logo
//   a ĎAKUJEME ZA HRANIE! (~5 s), potom návrat. ÚDER / ENTER / Esc / ťuk preskočí (až po 0,5 s).
// - Položka CREDITS na konci hlavného menu. api.credits.start(onDone, opts) pre ostatné moduly: koncovka HORY (ladder.js)
//   pošle porazených súperov (opts.foes) a má vlastnú záverečnú obrazovku (opts.finale = false → bez záverečnej karty).
//   onDone(ako): 'end' = dobehli, 'skip' = ÚDER / ENTER / ťuk, 'back' = Esc. Bez onDone návrat do menu.
// Vstup číta len cez api.menu (ok / back), nikdy nie klávesnicu priamo.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'credits',
  init(api) {
    'use strict';
    const { W, H } = api;
    const ctx = api.ctx, text = api.text, bigText = api.bigText;

    // ================================================================= TEXTY TITULKOV (Master / Peťo môžu upraviť)
    // Jeden prvok poľa = jeden blok: [nadpis, riadok, riadok…]; nadpis '' = blok bez nadpisu. Riadky:
    //   'text' = obyčajný riadok, '* text' = zvýraznený, '# TEXT' = veľký zlatý nápis, 'MENO | popis' = bojovník s portrétom,
    //   '@LOGO' = logo MATÚŠKO KOMBAT XII, '@BOJOVNICI' = ostatné postavy z hry (api.ROSTER bez prefarbených variantov),
    //   '@ARENY' = arény z hry, '@SUPERI' = porazení súperi z výstupu na HORU (mimo HORY sa celý blok vynechá).
    // Posledný blok je záverečná karta: zastaví sa v strede obrazovky (koncovka HORY ju nahrádza vlastnou obrazovkou).
    // Nadpis SLÁVNA TROJKA nepoužívať (Peťo 2. 10.: „ten nápis sa mi tam nepáči“).
    const CREDITS = [
      ['', '@LOGO', '* hra k 12. narodeninám Matúška', '3. októbra 2026'],
      ['', '# VŠETKO NAJLEPŠIE, MATÚŠKO!', '* Nech ti KIAI vydrží celý rok!'],
      ['DARČEK K NARODENINÁM', 'Hra pre Matúška', 'od Peťa, Mišky, Adamka a Alžbetky'],   // Peťo 2. 10.: venovanie, bez „s láskou“
      ['BOJOVNÍCI', 'MATÚŠKO | karate · heligónka · KIAI', 'ŠIMON | karate · husle · KIAI', 'ROCKY | zlatý retríver · majster olizovania', '@BOJOVNICI'],
      ['PORAZENÍ SÚPERI', '@SUPERI'],
      ['ARÉNY', '@ARENY'],
      ['NÁMET A VÝROBA', 'Peťo'],
      ['PROGRAMOVANIE, ANIMÁCIE A ZVUK', 'Claude a tím AI agentov'],
      ['KONTROLA KÓDU', 'Codex'],
      ['HUDBA', 'Okinawa Song · 13Up'],
      ['HLASY', 'ElevenLabs'],
      ['ANIMÁCIE POSTÁV', 'Higgsfield (Kling)'],
      ['INŠPIRÁCIA', 'Mortal Kombat II (1993)', 'ako fanúšikovská pocta'],
      ['', '@LOGO', '# ĎAKUJEME ZA HRANIE!'],
    ];
    // poradie bojovníkov (boss vždy posledný, nové postavy pred ním) a náhradný zoznam, keby ROSTER nebol k dispozícii
    const FIGHTER_ORDER = ['matusko', 'simon', 'rocky', 'ninja_fire', 'ninja_ice', 'ninja_shadow', 'vodnik', 'glitch', 'impostor', 'bananac', 'blocky'];
    const FIGHTERS_FALLBACK = ['MATÚŠKO', 'ŠIMON', 'ROCKY', 'FIRE NINJA', 'ICE NINJA', 'SHADOW NINJA', 'WATER GOBLIN', 'GLITCH', 'IMPOSTOR', 'BANÁNÁČ', 'BLOCKY', 'MASTER STORM'];

    const SPEED = 0.5;          // px za snímok: 60 snímok/s → 30 px/s, posun o 1 px každý druhý snímok (rovnomerne, bez trhania)
    const SKIP_AFTER = 30;      // 0,5 s: stlačenie, ktoré titulky spustilo (alebo tesne po ňom), ich hneď nezruší
    const HOLD = 300;           // záverečná karta svieti ~5 s
    const GAP = 24;             // medzera medzi blokmi
    const FINAL_GAP = 96;       // pred záverečnou kartou: keď zastane v strede, predošlé riadky sú už mimo obrazovky
    const START = H + 6;        // obsah začína tesne pod spodným okrajom
    const H_ROW = { logo: 80, big: 34, head: 18, line: 15, hero: 44, grid: 52 };

    const FONT = size => `bold ${size}px "Trebuchet MS", "Arial Black", Arial, sans-serif`;      // ako api.text (meranie šírky)
    const BIG_FONT = size => `bold ${size}px Impact, "Arial Black", "Trebuchet MS", sans-serif`;   // ako api.bigText
    const chunk = (arr, k) => { const out = []; for (let i = 0; i < arr.length; i += k) out.push(arr.slice(i, i + k)); return out; };

    function fighters() {        // postavy z hry bez prefarbených variantov (GOLDEN MATÚŠKO, ČERVENÝ ŠIMON…), vyradených a skrytých
      const R = api.ROSTER || {}, retired = (api.ladder && api.ladder.RETIRED_IDS) || [];
      const ids = Object.keys(R).filter(id => {
        const d = R[id];
        if (!d || !d.name || retired.includes(id) || d.hidden || d.credits === false) return false;
        return !(d.sprites && d.sprites !== id && R[d.sprites]);        // sprity inej postavy z ROSTER = jej prefarbený variant
      });
      const rank = id => (id === 'boss' ? 999 : FIGHTER_ORDER.includes(id) ? FIGHTER_ORDER.indexOf(id) : 100);
      ids.sort((a, b) => rank(a) - rank(b));
      return ids.length >= 2 ? ids.map(id => ({ id, name: R[id].name })) : FIGHTERS_FALLBACK.map(name => ({ id: null, name }));
    }
    function portrait(id) {
      if (!id) return null;
      if (api.IMG['img/portrait_' + id]) return api.IMG['img/portrait_' + id];
      try { return api.ladder && api.ladder.portraitOf ? api.ladder.portraitOf(id) : null; } catch (e) { return null; }
    }
    function fit(str, size, font, maxW) { ctx.font = font(size); const w = ctx.measureText(str).width; return w > maxW ? Math.floor(size * maxW / w) : size; }

    // rozloženie: položky s výškou a polohou y od začiatku titulkov
    function build(opts) {
      const items = [], all = fighters(), byName = new Map(all.map(f => [f.name, f]));
      const blocks = opts.finale === false ? CREDITS.slice(0, -1) : CREDITS;
      let y = 0, finalTop = 0;
      blocks.forEach((blk, bi) => {
        const [head, ...lines] = blk, rows = [], shown = new Set();
        const line = (s, color) => rows.push({ type: 'line', s, color });
        for (const ln of lines) {
          if (ln === '@LOGO') rows.push({ type: 'logo' });
          else if (ln === '@SUPERI') chunk(opts.foes || [], 3).forEach(g => line(g.join(' · ')));
          else if (ln === '@ARENY') chunk((api.STAGES || []).map(s => s.name), 3).forEach(g => line(g.join(' · ')));
          else if (ln === '@BOJOVNICI') chunk(all.filter(f => !shown.has(f.name)), 3).forEach(g => rows.push({ type: 'grid', cells: g.map(f => ({ name: f.name, im: portrait(f.id) })) }));
          else if (ln.includes(' | ')) {
            const [name, desc] = ln.split(' | ');
            shown.add(name);
            ctx.font = FONT(14); const wn = ctx.measureText(name).width; ctx.font = FONT(9); const wd = ctx.measureText(desc).width;
            rows.push({ type: 'hero', name, desc, im: portrait((byName.get(name) || {}).id), w: Math.max(wn, wd) });
          }
          else if (ln.startsWith('# ')) rows.push({ type: 'big', s: ln.slice(2), size: fit(ln.slice(2), 24, BIG_FONT, W - 24) });
          else if (ln.startsWith('* ')) line(ln.slice(2), '#ffd28a');
          else line(ln);
        }
        if (!rows.length) return;                                   // napr. PORAZENÍ SÚPERI mimo HORY
        const heroes = rows.filter(r => r.type === 'hero');        // bojovníci s popisom: portréty pod sebou, skupina v strede
        if (heroes.length) {
          const pw = heroes.some(r => r.im) ? 38 : 0, x0 = Math.round(W / 2 - (pw + Math.max(...heroes.map(r => r.w))) / 2);
          for (const r of heroes) { r.x0 = x0; r.tx = x0 + pw; }
        }
        const last = opts.finale !== false && bi === blocks.length - 1;
        if (items.length) y += last ? FINAL_GAP : GAP;
        if (last) finalTop = y;
        if (head) rows.unshift({ type: 'head', s: head });
        for (const r of rows) { r.y = y; r.h = H_ROW[r.type]; y += r.h; items.push(r); }
      });
      const stopOff = opts.finale === false ? null : Math.round(H / 2 - (finalTop + y) / 2);   // záverečná karta v strede
      const stopT = stopOff === null ? Math.ceil((START + y) / SPEED) : Math.ceil((START - stopOff) / SPEED);
      return { items, total: y, stopOff, stopT, endT: stopOff === null ? stopT : stopT + HOLD };
    }

    // ================================================================= scéna
    let S = null;
    function begin(onDone, opts) {
      opts = opts || {};
      S = Object.assign(build(opts), {
        onDone: typeof onDone === 'function' ? onDone : null, foes: (opts.foes || []).slice(), finale: opts.finale !== false,
        t: 0, done: false, how: null, entered: false,
        stars: Array.from({ length: 70 }, () => ({ x: api.rnd(0, W), y: api.rnd(0, H), v: api.rnd(0.04, 0.2), b: api.rnd(0.25, 0.9), p: api.rnd(0, 6.3) })),
      });
    }
    function finish(how) {
      if (!S || S.done) return;
      S.done = true; S.how = how;
      const cb = S.onDone; S.onDone = null;
      if (cb) { try { cb(how); } catch (e) { console.error('credits: onDone', e); } }
      if (api.scene === 'credits') { api.setScene('title'); api.music('title'); }   // bez callbacku (alebo ak scénu nezmenil) do menu
    }
    function start(onDone, opts) { begin(onDone, opts); api.setScene('credits'); }
    const offset = () => { const o = START - S.t * SPEED; return S.stopOff !== null && o < S.stopOff ? S.stopOff : o; };

    function update() {
      if (!S || S.done || (api.sceneT === 1 && S.entered)) begin(null, {});   // scéna spustená priamo cez api.setScene('credits')
      if (!S.entered) { S.entered = true; api.music('title'); }
      S.t++;
      for (const st of S.stars) { st.y -= st.v; if (st.y < 0) { st.y += H; st.x = api.rnd(0, W); } }   // hviezdy pomalšie ako text
      const m = api.menu;
      if ((m.ok || m.back) && S.t > SKIP_AFTER) { api.sfx('confirm'); finish(m.back ? 'back' : 'skip'); return; }
      if (S.t >= S.endT) finish('end');
    }
    function face(im, x, y, w, h) {             // malý portrét: plynulé zmenšenie (bez „bodkovania“) a zlatý rámik
      ctx.fillStyle = '#16121f'; ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, x, y, w, h); ctx.restore();
      ctx.strokeStyle = '#c99a2e'; ctx.lineWidth = 1; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    }
    function drawItem(it, y) {
      if (it.type === 'logo') {
        if (api.drawLogoTitle) api.drawLogoTitle(W / 2, y + 44, 34, S.t); else bigText('MATÚŠKO KOMBAT', W / 2, y + 44, 34);
        bigText('XII', W / 2, y + 75, 26, true);
      } else if (it.type === 'big') bigText(it.s, W / 2, y + 26, it.size);
      else if (it.type === 'head') text(it.s, W / 2, y + 12, 11, 'center', '#9fd8ff');
      else if (it.type === 'line') text(it.s, W / 2, y + 11, 10, 'center', it.color || '#e8e8e8');
      else if (it.type === 'hero') {
        if (it.im) face(it.im, it.x0, y + 3, 30, 38);
        text(it.name, it.tx, y + 20, 14, 'left', '#ffd200');
        text(it.desc, it.tx, y + 35, 9, 'left', '#d8d8d8');
      } else if (it.type === 'grid') it.cells.forEach((c, i) => {
        const cx = Math.round(W / 2 + (i - (it.cells.length - 1) / 2) * 124);
        if (c.im) face(c.im, cx - 13, y + 3, 26, 32);
        text(c.name, cx, y + 47, 9, 'center', '#ffffff');
      });
    }
    function draw() {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (!S) return;
      ctx.fillStyle = '#fff';
      for (const st of S.stars) { ctx.globalAlpha = st.b * (0.65 + 0.35 * Math.sin(S.t / 24 + st.p)); ctx.fillRect(Math.round(st.x), Math.round(st.y), 1, 1); }
      ctx.globalAlpha = 1;
      const off = Math.round(offset());                         // celé pixely: ostré písmo (plátno sa zväčšuje bez vyhladenia)
      for (const it of S.items) { const y = it.y + off; if (y + it.h >= -4 && y <= H + 4) drawItem(it, y); }
      if (S.stopOff !== null && S.t > S.stopT + 60 && S.t % 60 < 42 && !S.done)
        text((api.inputKind(0) === 'touch' ? 'ťukni' : 'ÚDER / ENTER') + (S.onDone ? ' = ďalej' : ' = menu'), W / 2, H - 8, 9, 'center', '#9a9a9a');
    }
    api.registerScene('credits', { update, draw });
    api.addMenuItem({ label: 'CREDITS', act() { start(); } });          // bez indexu = na koniec (game.js presúva hry do podmenu)

    api.credits = {
      start, CREDITS, fighters,
      get state() { return S; },                                         // pre testy
      get offset() { return S ? Math.round(offset()) : null; },
    };
  },
});
