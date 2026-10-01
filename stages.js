// Pohyblivé arény. Kreslené vrstvy fungujú aj bez obrázkov v manifeste.
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'stages',
  init(api) {
    const { ctx, W, H, GROUND } = api;
    for (const [id, name] of [['most', 'DRAČÍ MOST'], ['hora', 'VRCHOL HORY'], ['zahrada', 'ZÁHRADA']]) {
      if (!api.STAGES.some(stage => stage.id === id)) api.STAGES.push({ id, name });
    }

    let started = api.frame;
    const motion = { dragonX: -140 };
    api.stageMotion = motion; // číslo draka sprístupnené aj testu
    api.hooks.matchStart.push(() => { started = api.frame; motion.dragonX = -140; });
    const elapsed = () => Math.max(0, api.frame - started);
    const parallax = F => api.clamp((((F.fighters[0].x + F.fighters[1].x) / 2) - W / 2) * 0.1, -8, 8);
    const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
    const circle = (color, x, y, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    const poly = (color, pts) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fill();
    };
    const sky = (top, bottom) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    };
    const haze = (x, y, rx, ry, alpha) => {
      ctx.fillStyle = `rgba(233,241,240,${alpha})`;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    };
    const periodX = (base, speed, span = W + 160) => ((base + speed * elapsed()) % span + span) % span - 80;

    function bridgeBase() {
      sky('#201b42', '#e19a68');
      circle('#f6cf98', 374, 72, 26);
      poly('#4e4766', [[0,174],[76,77],[160,174],[240,91],[337,174],[417,82],[W,171],[W,238],[0,238]]);
      poly('#332b50', [[0,187],[84,123],[160,188],[292,115],[403,183],[W,125],[W,245],[0,245]]);
      rect('#1b1d37', 0, 206, W, H - 206);
      for (let i = 0; i < 17; i++) {
        const x = i * 31 - 9;
        rect(i % 2 ? '#75513b' : '#8d6142', x, 218, 27, 38);
        rect('#392d2d', x + 25, 218, 3, 38);
      }
      rect('#c4975e', 0, 215, W, 5); rect('#4b3834', 0, 254, W, 16);
      for (const x of [23, 132, 347, 455]) { rect('#3c2b34', x, 142, 4, 76); rect('#a97b52', x - 2, 141, 8, 5); }
      ctx.strokeStyle = '#30242f'; ctx.lineWidth = 2;
      for (let x = -20; x < W; x += 8) { const y = 155 + Math.sin(x / 35) * 9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 8, 155 + Math.sin((x + 8) / 35) * 9); ctx.stroke(); }
    }
    function lantern(x, y, t) {
      const sway = Math.sin(t / 36 + x / 37) * 4;
      ctx.strokeStyle = '#362438'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 23); ctx.lineTo(x + sway, y); ctx.stroke();
      const lx = x + sway;
      circle('rgba(255,176,78,0.14)', lx, y + 8, 16);
      rect('#9f3c32', lx - 6, y, 12, 16); rect('#edb45e', lx - 4, y + 2, 8, 12);
      rect('#792d2b', lx - 7, y - 2, 14, 3); rect('#792d2b', lx - 7, y + 15, 14, 3);
    }
    function dragon(t, px) {
      const x = -150 + (t % 1200) / 1200 * (W + 300);
      motion.dragonX = x;
      const im = api.IMG['img/dragon'];
      const strips = 14, width = 154, height = 42;
      for (let i = strips - 1; i >= 0; i--) {
        const dx = x + i * width / strips - px;
        const dy = 52 + Math.sin(t / 24 + i * 0.7) * 9 + i * 0.85;
        if (im && im.width && im.height) {
          const sw = im.width / strips;
          ctx.drawImage(im, i * sw, 0, sw, im.height, dx, dy, width / strips + 1, height);
        } else {
          circle(i % 2 ? '#b5473c' : '#dc7146', dx + 5, dy + 9, Math.max(4, 10 - i * 0.35));
          if (i % 2 === 0) poly('#e6b35d', [[dx,dy],[dx + 5,dy - 8],[dx + 9,dy + 2]]);
        }
      }
      if (!im) { circle('#f5d468', x + 12 - px, 58 + Math.sin(t / 24) * 9, 2); }
    }
    function bridgeBack(t, px) {
      if (!api.IMG['stage/most']) bridgeBase();
      for (let i = 0; i < 5; i++) haze(periodX(i * 138, 0.12) - px, 189 + i % 2 * 12, 95, 11, 0.08);
      dragon(t, px);
      for (const x of [72, 240, 412]) lantern(x - px * 0.3, 92, t);
    }

    function mountainBase() {
      sky('#12264e', '#9bc3db');
      circle('#e8f2ef', 404, 49, 20);
      poly('#597694', [[0,191],[65,68],[139,189],[246,44],[354,191],[425,76],[W,181],[W,240],[0,240]]);
      poly('#dbe9ed', [[28,137],[65,68],[105,143],[79,128],[63,113],[53,130]]);
      poly('#e4f0ee', [[193,116],[246,44],[298,125],[269,108],[248,84],[224,112]]);
      poly('#c8e0e9', [[389,129],[425,76],[464,141],[437,129],[425,108],[411,131]]);
      poly('#294d67', [[0,209],[74,166],[146,206],[212,160],[302,210],[398,168],[W,206],[W,245],[0,245]]);
      poly('#e9f2f3', [[0,224],[82,212],[169,221],[251,207],[338,220],[W,207],[W,H],[0,H]]);
      rect('#b9d9e2', 0, 252, W, 18);
    }
    function cloud(x, y, size, alpha) {
      ctx.save(); ctx.globalAlpha = alpha;
      for (const [dx,dy,r] of [[-25,4,14],[-8,-2,19],[13,0,16],[31,5,12]]) circle('#eaf3f4',x + dx * size,y + dy * size,r * size);
      ctx.restore();
    }
    function flag(x, t, color) {
      rect('#3d4051', x, 139, 3, 92);
      const wave = Math.sin(t / 17 + x) * 5;
      poly(color, [[x + 3,144],[x + 34,148 + wave],[x + 32,162 + wave],[x + 3,158]]);
      circle('#e8c266', x + 1, 139, 3);
    }
    function mountainBack(t, px) {
      if (!api.IMG['stage/hora']) mountainBase();
      for (let i = 0; i < 4; i++) cloud(periodX(i * 173, 0.13) - px, 53 + i % 2 * 29, 0.8, 0.48);
      for (let i = 0; i < 3; i++) cloud(periodX(i * 216 + 85, 0.31) - px * 0.4, 111 + i % 2 * 19, 0.54, 0.34);
      flag(59 - px * 0.3, t, '#b73f47'); flag(415 - px * 0.3, t, '#e3b94e');
      for (let i = 0; i < 72; i++) {
        const x = ((i * 97 + t * (0.28 + i % 3 * 0.15)) % (W + 20)) - 10;
        const y = ((i * 53 + t * (0.6 + i % 4 * 0.17)) % (H + 20)) - 10;
        rect(i % 5 ? 'rgba(241,249,250,0.75)' : '#fff', x, y, i % 7 ? 1 : 2, i % 7 ? 1 : 2);
      }
      if (t % 900 < 6) {
        ctx.strokeStyle = '#f8ffff'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(330, 1); ctx.lineTo(311, 39); ctx.lineTo(330, 48); ctx.lineTo(306, 87); ctx.stroke();
        rect('rgba(244,251,255,0.15)', 0, 0, W, H);
      }
    }

    function gardenBase() {
      sky('#8fc8eb', '#eaf2dd');
      circle('#ffe6a2', 418, 49, 26);
      rect('#91ae79', 0, 154, W, 67);
      rect('#dec3a0', 0, 169, W, 33);
      for (let x = 0; x < W; x += 19) { rect('#e9d2ae', x, 135, 14, 68); poly('#f3dcb9', [[x,135],[x + 7,126],[x + 14,135]]); }
      rect('#6e8f5b', 0, 204, W, 66);
      for (let i = 0; i < 18; i++) circle(i % 2 ? '#86a55d' : '#779e55', i * 29, 216 + i % 3 * 5, 13);
      rect('#a38965', 0, 248, W, 22);
    }
    function clothes(t, px) {
      ctx.strokeStyle = '#66584f'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(10 - px, 82); ctx.quadraticCurveTo(220 - px, 101, 470 - px, 79); ctx.stroke();
      const items = [[49,29,'#f3e4d0'],[112,24,'#f0a0a3'],[179,35,'#b0d3ec'],[262,27,'#f3dc87'],[345,32,'#dfbadf'],[415,24,'#f4ede2']];
      for (const [x,w,color] of items) {
        const sway = Math.sin(t / 20 + x / 25) * 4;
        const top = 84 + Math.sin(x / 105) * 6;
        poly(color, [[x - px,top],[x + w - px,top],[x + w + sway - px,top + 30],[x + sway - px,top + 30]]);
        rect('#756457', x + 3 - px, top - 2, 3, 3);
      }
    }
    const crowd = [
      [38,'#edc458','#9b593f'],[111,'#9ecbda','#5c6f8a'],[367,'#f3b49e','#ae5868'],[439,'#d9c4e6','#705782']
    ];
    function gardenBack(t, px, F) {
      if (!api.IMG['stage/zahrada']) gardenBase();
      clothes(t, px);
      const celebrating = ['roundEnd','finish','finisher','matchEnd'].includes(F.phase);
      for (let i = 0; i < crowd.length; i++) {
        const [x,gi,dark] = crowd[i];
        const jump = celebrating ? Math.abs(Math.sin(t / 8 + i)) * 12 : 0;
        const bob = Math.sin(t / 19 + i * 2) * 2;
        api.drawFigure(x - px * 0.35, 230 - jump + bob, i % 2 ? -1 : 1, api.POSES.stand,
          { gi, giDark: dark, belt: '#ede4c6', hair: '#5c3c2f' }, { scale: 0.45 });
      }
      // Rocky oddychuje pri plote a vrtí chvostom.
      ctx.fillStyle = '#b98754'; ctx.beginPath(); ctx.ellipse(420 - px * 0.2, 226, 19, 8, 0, 0, Math.PI * 2); ctx.fill();
      circle('#c99860', 404 - px * 0.2, 221, 7);
      ctx.strokeStyle = '#b98754'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(436 - px * 0.2, 222);
      ctx.lineTo(445 - px * 0.2, 215 + Math.sin(t / 9) * 5); ctx.stroke();
      circle('#3f3027', 400 - px * 0.2, 221, 1.5);
      for (let i = 0; i < 5; i++) {
        const x = periodX(i * 111, 0.32 + i * 0.04) - px * 0.3;
        const y = 153 + Math.sin(t / 14 + i * 4) * 14;
        const wing = Math.abs(Math.sin(t / 3 + i));
        circle(i % 2 ? '#f6b5d7' : '#ffe18d', x - 3, y, 2 + wing * 2);
        circle(i % 2 ? '#f6b5d7' : '#ffe18d', x + 3, y, 2 + wing * 2);
        rect('#795d4d', x, y - 2, 1, 5);
      }
    }
    function campBack(t) {
      for (let i = 0; i < 8; i++) {
        const x = 240 + Math.sin(t / 10 + i * 7) * (4 + i);
        const y = 213 - ((t * (0.7 + i % 3 * 0.3) + i * 17) % 55);
        circle(i % 3 ? '#ffc74b' : '#ff7a38', x, y, i % 4 ? 1 : 2);
      }
      poly('rgba(255,122,29,0.25)', [[225,220],[240 + Math.sin(t / 6) * 5,190],[255,220]]);
    }
    function streamBack(t) {
      for (let i = 0; i < 22; i++) {
        const x = periodX(i * 29, 0.46, W + 30);
        const y = 198 + i % 4 * 6;
        rect(i % 4 ? 'rgba(226,249,255,0.6)' : '#ffffff', x, y, 3 + i % 3, 1);
      }
    }
    function seaBack(t, px) {
      if (!api.IMG['stage/more']) {
        sky('#101b40', '#7583a5');
        circle('#e4e6d5', 391, 47, 19);
        poly('#273553', [[0,194],[74,149],[141,188],[270,139],[373,188],[W,151],[W,220],[0,220]]);
        rect('#185d76', 0, 199, W, 43); rect('#655f61', 0, 239, W, 31);
      }
      for (let j = 0; j < 3; j++) {
        ctx.strokeStyle = `rgba(185,236,246,${0.36 - j * 0.07})`; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = -10; x <= W + 10; x += 7) {
          const y = 207 + j * 9 + Math.sin(x / 24 + t / (23 + j * 7)) * 3;
          if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (t % 780 < 130) {
        const x = 384 - px * 0.3, y = 197 - Math.sin(Math.PI * (t % 780) / 130) * 11;
        circle('#213b4b', x, y, 10); circle('#cdddab', x, y - 2, 5); circle('#e2ad43', x, y - 2, 2);
      }
    }
    function dojoBack(t) {
      for (const x of [52, 428]) {
        circle('rgba(255,211,118,0.10)', x, 73, 29 + Math.sin(t / 24 + x) * 3);
        circle('rgba(255,226,154,0.16)', x, 73, 13 + Math.sin(t / 17 + x) * 2);
      }
    }

    api.hooks.drawBack.push((stage, F) => {
      const t = elapsed(), px = parallax(F);
      ctx.save();
      switch (stage.id) {
        case 'most': bridgeBack(t, px); break;
        case 'hora': mountainBack(t, px); break;
        case 'zahrada': gardenBack(t, px, F); break;
        case 'tabor': campBack(t); break;
        case 'potok': streamBack(t); break;
        case 'more': seaBack(t, px); break;
        case 'dojo': dojoBack(t); break;
      }
      ctx.restore();
    });
    api.hooks.drawFront.push((stage, F) => {
      const t = elapsed();
      ctx.save();
      if (stage.id === 'zahrada') {
        for (let i = 0; i < 12; i++) rect(i % 3 ? '#5b8546' : '#87a85a', i * 44 + Math.sin(t / 20 + i) * 2, 266, 15, 4);
      } else if (stage.id === 'hora') {
        for (let i = 0; i < 16; i++) rect('rgba(251,255,255,0.75)', i * 31 + Math.sin(t / 35 + i), 266, 12, 2);
      } else if (stage.id === 'most') {
        rect('rgba(31,22,30,0.35)', 0, 267, W, 3);
      } else if (stage.id === 'more' || stage.id === 'potok') {
        for (let i = 0; i < 10; i++) rect('rgba(184,229,226,0.4)', (i * 59 + t * 0.3) % W, 268, 11, 1);
      }
      ctx.restore();
    });
  },
});
