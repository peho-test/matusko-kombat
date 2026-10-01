// MATÚŠKO KOMBAT XII — modul net: sieťová hra cez WebRTC (PeerJS, verejný signalizačný server + TURN).
// Hostiteľ (vytvorí zápas, ukáže kód) počíta celú hru a posiela stav + zvuky; hosť (zadá kód) posiela len tlačidlá a kreslí.
// Bez internetu alebo v prostredí bez WebRTC sa sieťová hra len slušne odmietne; hra na jednom zariadení ide vždy.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'net',
  init(api) {
    const PREFIX = 'mk12-matusko-kombat-xii-';
    const NET = api.NET;
    const L = { mode: 'menu', idx: 0, code: '', entry: '', cur: 0, msg: '', peer: null, conn: null, t: 0, since: 0, lastRx: 0 };
    const TIMEOUT = 60 * 5;                              // 5 s bez správy = súper odpadol (zavretá stránka, výpadok Wi-Fi)
    api.net = L;                                         // pre testy (L.host(), L.join(kód))
    const canRTC = () => typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function';

    api.addMenuItem({ label: 'HRA CEZ SIEŤ', act() { L.mode = 'menu'; L.idx = 0; L.msg = ''; api.setScene('net'); } }, 2);

    // ---------------------------------------------------------------- spojenie
    function cleanup() {
      try { if (L.conn) L.conn.close(); } catch (e) { /* už zavreté */ }
      try { if (L.peer) L.peer.destroy(); } catch (e) { /* už zničené */ }
      L.conn = null; L.peer = null;
      restoreOrder();
    }
    function fail(msg) { cleanup(); L.mode = 'error'; L.msg = msg; }
    function lost() {
      const was = NET.role;
      NET.role = null; NET.events.length = 0; api.ctls[1].remote = null; cleanup();
      if (was) { api.setScene('title'); api.showToast('SÚPER SA ODPOJIL'); }
    }
    function errText(e) {
      const t = (e && e.type) || '';
      if (t === 'peer-unavailable') return 'Zápas s týmto kódom neexistuje.';
      if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Nedá sa spojiť so serverom. Je zapnutý internet?';
      if (t === 'browser-incompatible') return 'Tento prehliadač sieťovú hru nevie.';
      return 'Spojenie zlyhalo (' + (t || 'neznáma chyba') + ').';
    }
    function host(attempt = 0) {
      if (!canRTC()) return fail('Sieťová hra tu nefunguje. Otvor hru na peho-test.github.io/matusko-kombat');
      cleanup();
      L.code = String(Math.floor(1000 + Math.random() * 9000)); L.mode = 'host-wait'; L.msg = 'Pripájam sa na server…'; L.since = api.frame;
      let peer;
      try { peer = new window.Peer(PREFIX + L.code, { debug: 0 }); } catch (e) { return fail('Sieťová hra tu nefunguje.'); }
      L.peer = peer;
      peer.on('open', () => { L.msg = 'Čakám na súpera…'; });
      peer.on('error', e => { if (e.type === 'unavailable-id' && attempt < 3) host(attempt + 1); else if (!NET.role) fail(errText(e)); });
      peer.on('connection', conn => {
        if (L.conn) { try { conn.close(); } catch (e) { /* druhý hosť nemá miesto */ } return; }
        L.conn = conn;
        conn.on('open', () => startHost(conn));
        conn.on('data', onHostData);
        conn.on('close', lost); conn.on('error', lost);
      });
    }
    function join(code) {
      if (!canRTC()) return fail('Sieťová hra tu nefunguje. Otvor hru na peho-test.github.io/matusko-kombat');
      cleanup();
      L.mode = 'joining'; L.msg = 'Pripájam sa k zápasu ' + code + '…'; L.since = api.frame;
      let peer;
      try { peer = new window.Peer({ debug: 0 }); } catch (e) { return fail('Sieťová hra tu nefunguje.'); }
      L.peer = peer;
      peer.on('error', e => { if (!NET.role) fail(errText(e)); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        L.conn = conn;
        conn.on('open', () => { NET.role = 'guest'; L.lastRx = api.frame; L.mode = 'menu'; api.showToast('PRIPOJENÉ!'); });
        conn.on('data', onGuestData);
        conn.on('close', lost); conn.on('error', lost);
      });
    }
    function startHost(conn) {
      NET.role = 'host'; NET.events.length = 0; L.lastRx = api.frame;
      api.ctls[1].remote = { held: {}, hits: new Set() };
      api.game.mode = 2; L.mode = 'menu';
      api.setScene('select');
      api.showToast('SÚPER PRIPOJENÝ!');
    }

    L.host = () => { api.setScene('net'); host(); }; L.join = code => { api.setScene('net'); join(code); };

    // ---------------------------------------------------------------- hostiteľ: vstup hosťa + odosielanie stavu
    function onHostData(d) {
      L.lastRx = api.frame;
      if (!d || d.t !== 'i') return;
      const r = api.ctls[1].remote; if (!r) return;
      r.held = d.h || {};
      for (const b of d.p || []) r.hits.add(b);
    }
    function pack() {
      const F = api.fight, g = api.game;
      const snap = { sc: api.scene, st: api.sceneT, o: api.ORDER.slice(),     // o = poradie postáv hostiteľa (odomknuté postavy má každý zariadenie inak)
        g: { mode: g.mode, picks: g.picks, cursor: g.cursor, locked: g.locked, stageSel: g.stageSel, lastWinner: g.lastWinner,
             score: g.score, menuIdx: g.menuIdx, rockyMsg: g.rockyMsg, msg: g.msg, msgT: g.msgT } };
      if (F && ['vs', 'fight', 'eject', 'result'].includes(api.scene)) {
        try {
          snap.F = JSON.parse(JSON.stringify(F, function (k, v) {
            if (k === 'ctl' || k === 'def') return undefined;
            if (k === 'stage' && v && typeof v === 'object') return v.id;
            if (k === 'owner' && v instanceof api.Fighter) return v.side;
            if (v instanceof api.Fighter && this !== F.fighters) return { __f: v.side };   // odkaz na bojovníka v efektoch modulov
            if (k === 'fx' && Array.isArray(v)) return v.slice(-50);
            if (typeof v === 'function') return undefined;
            return v;
          }));
        } catch (e) { /* stav sa nepodarilo zbaliť, pošle sa nabudúce */ }
      }
      return snap;
    }
    api.hooks.frame.push(() => {
      if (NET.role && api.frame - L.lastRx > TIMEOUT) return lost();
      if (NET.role !== 'host' || !L.conn || !L.conn.open) return;
      L.t++;
      const ev = NET.events.splice(0);
      try {
        if (L.t % 2 === 0) L.conn.send({ t: 's', s: pack(), e: ev });     // celý stav 30× za sekundu
        else if (ev.length) L.conn.send({ t: 'e', e: ev });             // zvuky hneď
      } catch (e) { lost(); }
    });

    // ---------------------------------------------------------------- hosť: kreslenie stavu + posielanie tlačidiel
    function revive(o, fighters) {
      if (!o || typeof o !== 'object') return o;
      if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) o[i] = revive(o[i], fighters); return o; }
      if (typeof o.__f === 'number' && Object.keys(o).length === 1) return fighters[o.__f];
      for (const k of Object.keys(o)) {
        if (k === 'owner' && typeof o[k] === 'number') o[k] = fighters[o[k]];
        else if (o[k] && typeof o[k] === 'object') o[k] = revive(o[k], fighters);
      }
      return o;
    }
    function playEvents(ev) {
      for (const e of ev || []) {
        if (e[0] === 's') api.sfx(e[1], e[2]); else if (e[0] === 'v') api.say(e[1]); else if (e[0] === 'm') api.music(e[1]);
      }
    }
    function syncOrder(o) {                 // hosť vidí výber s postavami hostiteľa; vlastné sa mu vrátia po hre (restoreOrder)
      if (!L.ownOrder) L.ownOrder = api.ORDER.slice();
      const ids = o.filter(id => api.ROSTER[id]);
      if (ids.join() !== api.ORDER.join()) { api.ORDER.length = 0; api.ORDER.push(...ids); }
    }
    function restoreOrder() {
      if (!L.ownOrder) return;
      api.ORDER.length = 0; api.ORDER.push(...L.ownOrder); L.ownOrder = null;
    }
    function onGuestData(d) {
      L.lastRx = api.frame;
      if (!d) return;
      if (d.t === 'e') return playEvents(d.e);
      if (d.t !== 's') return;
      const s = d.s;
      if (s.o) syncOrder(s.o);
      Object.assign(api.game, s.g);
      if (s.F) {
        const F = s.F;
        F.stage = api.STAGES.find(x => x.id === F.stage) || api.STAGES[0];
        const fighters = F.fighters.map((fd, i) => { const f = new api.Fighter(fd.id, i, api.NO_INPUT); Object.assign(f, fd); return f; });
        delete F.fighters;
        revive(F, fighters);
        F.fighters = fighters;
        api.setFight(F);
      }
      api.setSceneRaw(s.sc, s.st);
      playEvents(d.e);
    }
    NET.onGuestFrame = () => {
      if (!L.conn || !L.conn.open) return;
      const c = api.ctls[0];
      const hits = api.BUTTONS_LIST.filter(b => c.pressed[b]);
      try { L.conn.send({ t: 'i', h: c.held, p: hits }); } catch (e) { lost(); }
    };

    // ---------------------------------------------------------------- lobby (scéna 'net')
    const ITEMS = ['VYTVORIŤ ZÁPAS', 'PRIPOJIŤ SA KÓDOM', 'SPÄŤ'];
    const PAD = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['⌫', '0', 'OK']];
    const PAD_X = 300, PAD_Y = 86, PAD_W = 40, PAD_H = 34;
    let typedDigit = null;
    addEventListener('keydown', e => {
      if (api.scene !== 'net' || L.mode !== 'join-enter') return;
      if (/^(Digit|Numpad)[0-9]$/.test(e.code)) typedDigit = e.code.slice(-1);
      else if (e.code === 'Backspace') typedDigit = '⌫';
    });
    function padKey(k) {
      if (k === '⌫') { L.entry = L.entry.slice(0, -1); api.sfx('select'); }
      else if (k === 'OK') { if (L.entry.length === 4) join(L.entry); else api.sfx('block'); }
      else if (L.entry.length < 4) { L.entry += k; api.sfx('select'); }
    }
    api.registerScene('net', {
      update() {
        const m = api.menu;
        if (m.back) { cleanup(); if (L.mode === 'menu' || L.mode === 'error') api.setScene('title'); L.mode = 'menu'; return; }
        if (L.mode === 'menu') {
          if (m.tapPos) { const i = Math.floor((m.tapPos.y - 112) / 22); if (i >= 0 && i < ITEMS.length && Math.abs(m.tapPos.x - api.W / 2) < 110) L.idx = i; }
          if (m.up) L.idx = (L.idx + ITEMS.length - 1) % ITEMS.length;
          if (m.down) L.idx = (L.idx + 1) % ITEMS.length;
          if (m.ok && api.sceneT > 15) {
            api.sfx('confirm');
            if (L.idx === 0) host(); else if (L.idx === 1) { L.mode = 'join-enter'; L.entry = ''; L.cur = 0; } else api.setScene('title');
          }
        } else if (L.mode === 'join-enter') {
          if (typedDigit) { padKey(typedDigit); typedDigit = null; }
          if (m.tapPos) {
            const c = Math.floor((m.tapPos.x - PAD_X) / PAD_W), r = Math.floor((m.tapPos.y - PAD_Y) / PAD_H);
            if (r >= 0 && r < 4 && c >= 0 && c < 3) padKey(PAD[r][c]);
          } else {
            // ovládač / šípky: ↑↓ mení číslicu na pozícii, ←→ posúva, ÚDER = OK
            if (L.entry.length < 4) L.entry = L.entry.padEnd(4, '0');
            const d = +L.entry[L.cur] || 0;
            if (m.up || m.down) { const nd = (d + (m.up ? 1 : 9)) % 10; L.entry = L.entry.slice(0, L.cur) + nd + L.entry.slice(L.cur + 1); api.sfx('select'); }
            if (m.left) L.cur = (L.cur + 3) % 4;
            if (m.right) L.cur = (L.cur + 1) % 4;
            if (m.ok && api.sceneT > 15 && !m.tap) join(L.entry);
          }
        } else if (L.mode === 'joining' || L.mode === 'host-wait') {
          if (L.mode === 'joining' && api.frame - L.since > 60 * 20) fail('Súper neodpovedá. Skontroluj kód a internet.');
          if (m.ok && m.tap && L.mode === 'host-wait' && api.sceneT > 30) { /* ťuk nič nerobí, späť je Esc / SPÄŤ */ }
        } else if (L.mode === 'error') {
          if (m.ok && api.sceneT > 15) { L.mode = 'menu'; L.msg = ''; }
        }
      },
      draw() {
        const { ctx, W, H, text, bigText } = api;
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#071a2e'); g.addColorStop(1, '#14070f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        bigText('HRA CEZ SIEŤ', W / 2, 40, 28);
        text('Každý hrá na svojom mobile alebo počítači. Najlepšie na rovnakej Wi-Fi.', W / 2, 60, 8, 'center', '#9fc4e8');
        if (L.mode === 'menu') {
          ITEMS.forEach((it, i) => text((i === L.idx ? '▶ ' : '  ') + it, W / 2 - 70, 126 + i * 22, 13, 'left', i === L.idx ? '#ffd200' : '#cfd8e8'));
          text('Jeden vytvorí zápas a povie kód, druhý ho zadá.', W / 2, 220, 9, 'center', '#8fa5bf');
        } else if (L.mode === 'host-wait') {
          text('KÓD ZÁPASU', W / 2, 98, 12, 'center', '#cfd8e8');
          bigText(L.code, W / 2, 150, 54, true);
          text(L.msg, W / 2, 182, 11, 'center', api.frame % 60 < 40 ? '#ffd200' : '#c9a400');
          text('Súper zvolí PRIPOJIŤ SA KÓDOM a zadá tieto 4 čísla.', W / 2, 206, 9, 'center', '#8fa5bf');
          text('Esc / Backspace = späť', W / 2, 250, 8, 'center', '#6f8199');
        } else if (L.mode === 'join-enter') {
          text('ZADAJ KÓD ZÁPASU', 150, 92, 12, 'center', '#cfd8e8');
          for (let i = 0; i < 4; i++) {
            const x = 72 + i * 40, y = 108, ch = L.entry[i] || '';
            ctx.fillStyle = '#0b1220'; ctx.fillRect(x, y, 32, 44);
            ctx.strokeStyle = i === L.cur ? '#ffd200' : '#3a4f6a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 32, 44);
            bigText(ch, x + 16, y + 36, 30, true);
          }
          text('↑↓ číslica  ←→ pozícia  ÚDER = pripojiť', 150, 176, 8, 'center', '#8fa5bf');
          text('alebo píš čísla / ťukaj vpravo', 150, 190, 8, 'center', '#8fa5bf');
          PAD.forEach((row, r) => row.forEach((k, c) => {
            const x = PAD_X + c * PAD_W, y = PAD_Y + r * PAD_H;
            ctx.fillStyle = k === 'OK' ? '#1f5f2a' : '#1a2840'; ctx.fillRect(x + 2, y + 2, PAD_W - 4, PAD_H - 4);
            text(k, x + PAD_W / 2, y + PAD_H / 2 + 5, 13, 'center', '#ffffff');
          }));
        } else if (L.mode === 'joining') {
          text(L.msg, W / 2, 140, 12, 'center', api.frame % 60 < 40 ? '#ffd200' : '#c9a400');
        } else if (L.mode === 'error') {
          text('CHYBA', W / 2, 110, 16, 'center', '#ff6060');
          text(L.msg, W / 2, 140, 10, 'center', '#ffd0d0');
          text('ÚDER / ENTER = späť', W / 2, 200, 9, 'center', '#8fa5bf');
        }
      },
    });
    // hosť: v nadpise ukáž, že hrá cez sieť
    api.hooks.drawHud.push(() => { if (NET.role) api.text(NET.role === 'host' ? 'SIEŤ: HOSTITEĽ' : 'SIEŤ: HOSŤ', api.W / 2, 36, 7, 'center', '#7fd4ff'); });
  },
});
