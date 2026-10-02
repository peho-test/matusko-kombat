// Arény: statické obrázky. Peťo 2. 10.: pohyblivé prvky (oheň, svetlá, diváci, drak…) pôsobili lacno, preto preč.
// Kreslené náhrady sa použijú, len keď chýba obrázok arény (most, hora, záhrada).
(window.MK_MODULES = window.MK_MODULES || []).push({
  name: 'stages',
  init(api) {
    const { ctx, W, H } = api;
    for (const [id, name] of [['most', 'DRAGON BRIDGE'], ['hora', 'MOUNTAIN PEAK'], ['zahrada', 'BACKYARD']]) {
      if (!api.STAGES.some(stage => stage.id === id)) api.STAGES.push({ id, name });
    }
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

    api.hooks.drawBack.push(stage => {
      if (api.IMG['stage/' + stage.id]) return;             // obrázok arény kreslí game.js
      ctx.save();
      if (stage.id === 'most') bridgeBase();
      else if (stage.id === 'hora') mountainBase();
      else if (stage.id === 'zahrada') gardenBase();
      ctx.restore();
    });
  },
});
