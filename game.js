/* MATÚŠKO KOMBAT XII — narodeninová bojovka pre Matúška (12) a Šimona.
   Čistý JavaScript a canvas 480×270, žiadne knižnice, beží aj priamo zo súboru.
   Grafiku a zvuky berie z assets/manifest.js; čo chýba, nahradí kreslená náhrada a syntetický zvuk. */
(() => {
'use strict';

// ===================================================================== konštanty
const W = 480, H = 270, GROUND = 256;
const STEP = 1000 / 60;
const ROUND_SECONDS = 60, MAX_HP = 100, WINS_NEEDED = 2;
const WALK_F = 1.7, WALK_B = 1.3, JUMP_V = 7.4, GRAVITY = 0.38;
const KIAI_CD = 300, SPECIAL_CD = 420, STUN = 120;
const MIN_GAP = 60;

const A = window.MK_ASSETS || {};

// ===================================================================== moduly (net.js, moves.js, finishers.js, stages.js, ladder.js)
// Každý modul: (window.MK_MODULES = window.MK_MODULES || []).push({ name, init(api) { ... } }). game.js ich zavolá pri štarte.
const MODULES = window.MK_MODULES || [];
const hooks = {
  input: [],      // (f, o, inp) → true = vstup spracovaný (napr. uppercut ↓+úder); volá sa v idle/walk/block pred blokom
  state: [],      // (f, o, inp) → true = stav spracovaný (vlastné stavy modulov)
  afterHit: [],   // (a, d, m, blocked) — po každom zásahu
  finisher: [],   // (w, L) → názov zakončenia alebo null (vo fáze FINISH HIM)
  cpu: [],        // (cpu, f, o, phase) → { held, pressed } alebo null (vlastné rozhodnutie počítača)
  drawBack: [],   // (stage, F) — nad pozadím, pod postavami
  drawFront: [],  // (stage, F) — nad postavami
  drawHud: [],    // (F) — nad HUD
  frame: [],      // () — každý snímok simulácie
  matchStart: [], // (F)
  roundStart: [], // (F)
  matchEnd: [],   // (F) → true = modul prevzal ďalší tok (napr. rebrík), inak vyhodenie + výsledok
};
const SCENES = {}, FINISHERS = {}, PALETTES = {};
const NET = { role: null, events: [], onGuestFrame: null };   // sieťová hra (net.js): 'host' počíta hru, 'guest' len posiela tlačidlá a kreslí stav
const ANIM_FALLBACK = {};   // nový stav → náhradná animácia, napr. { uppercut: 'punch', sweep: 'kick' }
const MENU = [];           // položky hlavného menu: { label: string | () => string, act() }; moduly pridávajú cez api.addMenuItem
const MUSIC_POOL = [];     // bojová hudba na striedanie (kľúče SND bez 'music_')
function runFirst(list, ...args) { for (const h of list) { try { const r = h(...args); if (r) return r; } catch (e) { console.error('háčik', e); } } return null; }
function callAll(list, ...args) { for (const h of list) { try { h(...args); } catch (e) { console.error('háčik', e); } } }
const FA = A.fighters || {};

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
// Vnútorné rozlíšenie plátna = RES × 480×270 podľa displeja: na veľkej obrazovke ostré texty a hladko zväčšené postavy namiesto kociek.
// Logika aj kreslenie ostávajú v súradniciach 480×270 (draw() nastaví mierku). ?res=1 = pôvodný pixelový vzhľad; automatické testy (navigator.webdriver) kreslia 1:1.
let RES = 1;
function fitRes() {
  const forced = +(new URLSearchParams(location.search).get('res') || window.MK_RES || 0);
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const cap = matchMedia('(pointer: coarse)').matches ? 2 : 3;
  const k = forced ? clamp(Math.round(forced), 1, 4) : navigator.webdriver ? 1 : clamp(Math.round((r.width || 480) * dpr / 480), 1, cap);
  if (k !== RES || cv.width !== 480 * k) { RES = k; cv.width = 480 * k; cv.height = 270 * k; cv.style.imageRendering = k > 1 ? 'auto' : ''; }
}
addEventListener('resize', () => fitRes());

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const chance = p => Math.random() < p;

const ROSTER = {
  matusko: { name: 'MATÚŠKO', gi: '#f2f2f2', giDark: '#c9c9c9', belt: '#e67e22', hair: '#5b3a1e', special: 'heligonka',
             specialName: 'HELIGÓNKA', finisher: 'folklority',
             blurb: ['Kop mawashi geri, KIAI', 'a heligónka: súper musí', 'tancovať odzemok.'] },
  simon:   { name: 'ŠIMON', gi: '#3d6fd6', giDark: '#2a4f9e', belt: '#27ae60', hair: '#4a2f17', special: 'husle',
             specialName: 'HUSLE', finisher: 'babality',
             blurb: ['Kop mawashi geri, KIAI', 'a husľové sólo: praská', 'obrazovka aj uši.'] },
};
const ORDER = ['matusko', 'simon'];

const STAGES = (A.stages && A.stages.length) ? A.stages : [
  { id: 'tabor', name: 'NIGHT CAMP' }, { id: 'potok', name: 'FOREST STREAM' }, { id: 'dojo', name: 'DOJO' }, { id: 'more', name: 'SEA OF MONSTERS' }];

// časovanie útokov (snímky pri 60 fps); x/y sú hitbox voči chodidlám a smeru pohľadu
const MOVE = {
  punch:     { startup: 5, active: 5, recovery: 12, dmg: 5, x0: 10, x1: 72, y0: -126, y1: -88, hitstun: 16, push: 2.6, sound: 'punch' },
  kick:      { startup: 9, active: 6, recovery: 16, dmg: 8, x0: 10, x1: 100, y0: -130, y1: -60, hitstun: 20, push: 3.6, sound: 'kick' },
  // vo vzduchu (MK2): póza sa drží až do dopadu; kop mieri šikmo dole dopredu (nižšie a ďalej ako stojaci kop), úder vpred-dole
  airkick:   { startup: 3, active: 60, recovery: 0, dmg: 7, x0: 16, x1: 110, y0: -94, y1: -16, hitstun: 18, push: 3, sound: 'kick' },
  airpunch:  { startup: 3, active: 60, recovery: 0, dmg: 6, x0: 24, x1: 94, y0: -106, y1: -50, hitstun: 16, push: 2.6, sound: 'punch' },
  kiai:      { startup: 14, active: 1, recovery: 24 },
  heligonka: { startup: 20, active: 1, recovery: 28 },
  husle:     { startup: 30, active: 1, recovery: 28 },
};
const ATTACK_STATES = new Set(['punch', 'kick', 'airkick', 'airpunch', 'kiai', 'special']);   // moduly pridávajú vlastné (uppercut, sweep…)
const HIT_STATES = new Set(['punch', 'kick', 'airkick', 'airpunch']);                         // stavy so zásahovou zónou z MOVE

// ===================================================================== obrázky a zvuky
const IMG = {};
let loadTotal = 0, loadDone = 0;
function loadImages(done) {
  const list = [];
  for (const [id, f] of Object.entries(FA))
    for (const [anim, a] of Object.entries(f.anims || {})) list.push([`${id}/${anim}`, a.src]);
  for (const [anim, a] of Object.entries((A.rocky && A.rocky.anims) || {})) list.push([`rocky/${anim}`, a.src]);
  for (const s of STAGES) if (s.src) list.push([`stage/${s.id}`, s.src]);
  for (const [k, src] of Object.entries(A.images || {})) list.push([`img/${k}`, src]);
  loadTotal = list.length;
  if (!loadTotal) return done();
  for (const [key, src] of list) {
    const im = new Image();
    im.onload = () => { IMG[key] = im; if (++loadDone === loadTotal) done(); };
    im.onerror = () => { console.warn('Chýba obrázok', src); if (++loadDone === loadTotal) done(); };
    im.src = src;
  }
}

const SND = {};
for (const [k, src] of Object.entries(A.sounds || {})) {
  const a = new Audio(); a.preload = 'auto'; a.src = src;
  a.addEventListener('error', () => { if (SND[k] === a) delete SND[k]; });   // chýbajúci súbor → syntetická náhrada
  SND[k] = a;
}

let actx = null, muted = false, audioUnlocked = false, musicOn = true;
try { musicOn = localStorage.getItem('mk12_music') !== 'off'; } catch (e) { /* bez úložiska ostane hudba zapnutá */ }
function audioCtx() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  return actx;
}
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const c = audioCtx(); if (c && c.state === 'suspended') c.resume();
  music(musicKey);
  if (scene === 'title') say('title');
}
function play(a, vol, fallback) { const c = a.cloneNode(); c.volume = vol; c.play().catch(() => { if (fallback) fallback(); }); return c; }
function sfx(name, vol = 0.8) {
  if (NET.role === 'host') NET.events.push(['s', name, vol]);
  if (muted || !audioUnlocked) return;
  if (SND[name + '2']) { const v = [name, name + '2', name + '3'].filter(k => SND[k]); name = v[Math.floor(Math.random() * v.length)]; }   // varianty zvuku
  if (SND[name]) return play(SND[name], vol, () => synth(name, vol));
  synth(name, vol);
}
function synth(name, vol) {
  const c = audioCtx(); if (!c) return;
  const t = c.currentTime;
  const tone = (type, f0, f1, dur, v, delay = 0) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t + delay); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + delay + dur);
    g.gain.setValueAtTime(v * vol, t + delay); g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
    o.connect(g); g.connect(c.destination); o.start(t + delay); o.stop(t + delay + dur + 0.02);
  };
  const noise = (dur, v, freq) => {
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = v * vol;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  };
  switch (name) {
    case 'punch': noise(0.12, 0.7, 1800); tone('square', 180, 60, 0.1, 0.25); break;
    case 'kick': noise(0.2, 0.8, 1100); tone('square', 140, 40, 0.16, 0.3); break;
    case 'block': tone('triangle', 900, 650, 0.09, 0.3); break;
    case 'whoosh': noise(0.14, 0.25, 3200); break;
    case 'kiai': tone('sawtooth', 280, 560, 0.4, 0.3); break;
    case 'heligonka': [262, 330, 392, 523].forEach((f, i) => tone('sawtooth', f, f * 1.01, 0.7, 0.1, i * 0.02)); break;
    case 'notes': tone('square', 784, 784, 0.08, 0.12); tone('square', 988, 988, 0.08, 0.12, 0.09); break;
    case 'husle': tone('sawtooth', 1700, 2900, 0.9, 0.22); tone('sawtooth', 1760, 3000, 0.9, 0.12); break;
    case 'crack': noise(0.5, 0.9, 7000); break;
    case 'fall': noise(0.35, 0.9, 380); break;
    case 'bark': tone('square', 520, 300, 0.11, 0.3); tone('square', 540, 320, 0.11, 0.3, 0.16); break;
    case 'lick': noise(0.09, 0.4, 2600); break;
    case 'baby': tone('triangle', 700, 900, 0.5, 0.2); tone('triangle', 900, 600, 0.6, 0.2, 0.5); break;
    case 'hiss': { const len = Math.floor(c.sampleRate * 1.2), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (len * 0.6)) * 0.6;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf; f.type = 'highpass'; f.frequency.value = 2500; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); break; }
    case 'boom': noise(0.9, 1.0, 500); tone('square', 90, 30, 0.6, 0.4); break;
    case 'select': tone('square', 660, 660, 0.06, 0.18); break;
    case 'confirm': tone('square', 880, 1320, 0.14, 0.2); break;
    default: tone('square', 440, 440, 0.05, 0.1);
  }
}
const SAY_TEXT = {
  title: 'Matúš K.O. Kombat!', round1: 'Round one', round2: 'Round two', round3: 'Final round', fight: 'Fight!',
  finish: 'Finish him!', matusko_wins: 'Matúško wins!', simon_wins: 'Šimon wins!', flawless: 'Flawless victory!',
  rockyality: 'Rockyality!', babality: 'Babality!', folklority: 'Folklority!', friendship: 'Friendship... friendship?',
  birthday: 'Všetko najlepšie k dvanástym narodeninám, Matúško!', draw: 'Draw!',
  ssj_matusko: 'Super Matúško!', ssj_simon: 'Super Šimon!', creeperality: 'Creeperality!', moreality: 'Moreality!', destiny: 'Choose your destiny!', futbality: 'Futbality!', goal: 'Goooal!',
};
function sayText(key) {                     // nové postavy z modulov: „<id>_wins“ / „ssj_<id>“ podľa mena v ROSTER
  if (SAY_TEXT[key]) return SAY_TEXT[key];
  let m = /^(.+)_wins$/.exec(key);
  if (m && ROSTER[m[1]]) return ROSTER[m[1]].name.toLowerCase() + ' wins!';
  m = /^ssj_(.+)$/.exec(key);
  if (m && ROSTER[m[1]]) return 'Super ' + ROSTER[m[1]].name.toLowerCase() + '!';
  return key.replace(/_/g, ' ');
}
function speak(key) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(sayText(key));
  u.lang = key === 'birthday' ? 'sk-SK' : 'en-US'; u.rate = 0.95; u.pitch = 0.55;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}
function say(key) {
  if (NET.role === 'host' && key) NET.events.push(['v', key]);
  if (!key || muted || !audioUnlocked) return;
  if (SND['say_' + key]) { voiceNow = { key, el: play(SND['say_' + key], 1, () => speak(key)) }; return; }
  speak(key);
}
let voiceNow = null;                         // posledná hláška: titul „Matúš K.O. Kombat!“ sa po odchode z menu utne (neprekryje „Choose your destiny“)
function stopTitleVoice() {
  if (voiceNow && voiceNow.key === 'title' && voiceNow.el) { try { voiceNow.el.pause(); } catch (e) { /* nič */ } }
  if (window.speechSynthesis && voiceNow && voiceNow.key === 'title') { try { speechSynthesis.cancel(); } catch (e) { /* nič */ } }
}
// hudba: musicKey si pamätá, čo má hrať, aj keď je zvuk zamknutý, stlmený alebo hudba vypnutá
let musicEl = null, musicKey = null;
function music(key) {
  if (NET.role === 'host') NET.events.push(['m', key]);
  const changed = key !== musicKey;
  musicKey = key;
  if (!audioUnlocked) return;
  const a = key ? (SND['music_' + key] || null) : null;
  if (musicEl && musicEl !== a) musicEl.pause();
  if (a && (changed || musicEl !== a)) { a.loop = true; a.volume = 0.32; try { a.currentTime = 0; } catch (e) { /* ešte nenačítané */ } }
  musicEl = a;
  if (!a) return;
  if (muted || !musicOn) a.pause(); else if (a.paused) a.play().catch(() => {});
}
function toggleMute() {
  muted = !muted;
  showToast(muted ? 'ZVUK VYP' : 'ZVUK ZAP');
  if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  music(musicKey);
}
function toggleMusic() {
  musicOn = !musicOn;
  showToast(musicOn ? 'HUDBA ZAP' : 'HUDBA VYP');
  try { localStorage.setItem('mk12_music', musicOn ? 'on' : 'off'); } catch (e) { /* nevadí */ }
  music(musicKey);
  const btn = document.getElementById('musicBtn');
  if (btn) { btn.classList.toggle('off', !musicOn); btn.setAttribute('aria-pressed', String(musicOn)); }
}

// ===================================================================== vstup
const BUTTONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'kiai', 'special', 'start'];
const KEYS = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], punch: ['KeyF'], kick: ['KeyG'], kiai: ['KeyR'], special: ['KeyT'], start: ['Enter', 'Space'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], punch: ['KeyK', 'Numpad1'], kick: ['KeyL', 'Numpad2'],
    kiai: ['KeyI', 'Numpad4'], special: ['KeyO', 'Numpad5'], start: ['NumpadEnter'] },
];
const GAME_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
const keysDown = new Set(), keysHit = new Set();
const typed = [];
addEventListener('keydown', e => {
  if (!keysDown.has(e.code)) keysHit.add(e.code);
  keysDown.add(e.code);
  if (GAME_CODES.has(e.code)) e.preventDefault();
  if (e.key && e.key.length === 1) { typed.push(e.key.toUpperCase()); if (typed.length > 8) typed.shift(); }
  keyboardSeen = true;
  if (KEY_SET1.has(e.code)) lastKeySet = 1; else if (KEY_SET0.has(e.code)) lastKeySet = 0;
  unlockAudio();
});
let lastKeySet = 0;
const KEY_SET0 = new Set(Object.values(KEYS[0]).flat()), KEY_SET1 = new Set(Object.values(KEYS[1]).flat().filter(c => !KEY_SET0.has(c)));
addEventListener('pointerdown', () => unlockAudio());
let keyboardSeen = false;
const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function setupMusicButton() {
  const btn = document.getElementById('musicBtn'); if (!btn) return;
  btn.classList.toggle('off', !musicOn); btn.setAttribute('aria-pressed', String(musicOn));
  btn.addEventListener('click', () => { unlockAudio(); toggleMusic(); btn.blur(); });
}
addEventListener('keyup', e => keysDown.delete(e.code));
addEventListener('blur', () => keysDown.clear());

const touch = {}; let touchTap = false;
let tapPos = null;
cv.addEventListener('pointerdown', e => {          // ťuk / klik na plátno: potvrdenie a výber položky pod prstom
  const r = cv.getBoundingClientRect();
  tapPos = { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  touchTap = true; unlockAudio();
});
let touchPad = null, touchShown = null;
function syncTouch() {
  if (!touchPad) return;
  const show = scene === 'fight';
  if (show === touchShown) return;
  touchShown = show; touchPad.hidden = !show;
  if (!show) for (const k of Object.keys(touch)) touch[k] = false;      // pustiť tlačidlá, ktoré ostali držané
}
function setupTouch() {
  if (!(('ontouchstart' in window) || navigator.maxTouchPoints > 0)) return;
  const pad = document.getElementById('touch'); if (!pad) return;
  touchPad = pad; syncTouch();                 // joystick a tlačidlá len počas boja (Peťo 2. 10.)
  pad.querySelectorAll('[data-b]').forEach(el => {
    const b = el.dataset.b;
    const on = e => { e.preventDefault(); touch[b] = true; el.classList.add('on'); unlockAudio(); };
    const off = e => { e.preventDefault(); touch[b] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
  });
  // joystick: jeden palec = pohyb, skok (hore), blok (dole); šikmo hore = salto doľava/doprava
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  if (!stick || !knob) return;
  let id = null;
  const setDir = (dx, dy) => {
    const r = 56, d = Math.hypot(dx, dy), k = d > r ? r / d : 1, T = 20;
    knob.style.transform = `translate(${Math.round(dx * k)}px, ${Math.round(dy * k)}px)`;
    const up = dy < -T * 1.2;
    touch.left = dx < -T; touch.right = dx > T; touch.down = dy > T * 1.4;
    if (up && !touch.up && Math.abs(dx) > T * 0.6) { touch.left = dx < 0; touch.right = dx > 0; }
    touch.up = up;
  };
  const move = e => {
    if (e.pointerId !== id) return;
    e.preventDefault();
    const rc = stick.getBoundingClientRect();
    setDir(e.clientX - (rc.left + rc.width / 2), e.clientY - (rc.top + rc.height / 2));
  };
  const end = e => { if (e.pointerId !== id) return; id = null; setDir(0, 0); knob.style.transform = ''; };
  stick.addEventListener('pointerdown', e => { id = e.pointerId; try { stick.setPointerCapture(id); } catch (err) { /* staršie prehliadače */ } unlockAudio(); move(e); });
  stick.addEventListener('pointermove', move);
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
}

function pads() {
  const list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  return list;
}
function padState(p) {
  if (!p) return null;
  const b = k => !!(p.buttons[k] && p.buttons[k].pressed);
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  return { left: b(14) || ax < -0.5, right: b(15) || ax > 0.5, up: b(12) || ay < -0.65,
           down: b(13) || ay > 0.65 || b(4) || b(5) || b(6) || b(7),
           punch: b(2), kick: b(0), kiai: b(1), special: b(3), start: b(9), music: b(8) };
}

class Ctl {
  constructor(idx) { this.idx = idx; this.held = {}; this.pressed = {}; this.prev = {}; this.history = []; }
  poll(pad) {
    if (this.remote) {                                    // sieťový súper: stav tlačidiel poslal hosť
      const r = this.remote, now = {};
      for (const btn of BUTTONS) { now[btn] = !!r.held[btn]; this.pressed[btn] = (now[btn] && !this.prev[btn]) || r.hits.has(btn); }
      r.hits.clear(); this.prev = now; this.held = now; this.record(); return;
    }
    const maps = this.idx === 0 && (game.mode === 1 || NET.role === 'guest') ? [KEYS[0], KEYS[1]] : [KEYS[this.idx]], now = {};   // 1 hráč / sieťový hosť: obe sady kláves
    for (const btn of BUTTONS) {
      let v = false, hit = false;
      for (const map of maps) for (const code of map[btn] || []) { if (keysDown.has(code)) v = true; if (keysHit.has(code)) hit = true; }
      if (pad && pad[btn]) v = true;
      if (this.idx === 0 && touch[btn]) v = true;
      now[btn] = v;
      this.pressed[btn] = (v && !this.prev[btn]) || hit;
    }
    this.prev = now; this.held = now;
    this.record();
  }
  record() {
    for (const btn of BUTTONS) if (this.pressed[btn]) {      // história pre kombá: smer aj relatívne (F = k súperovi, B = od súpera)
      const f = F && F.fighters && F.fighters.find(x => x.ctl === this), face = f ? f.facing : 1;
      const rel = btn === 'right' ? (face > 0 ? 'F' : 'B') : btn === 'left' ? (face < 0 ? 'F' : 'B') : btn;
      this.history.push({ btn, rel, frame: frameNo }); if (this.history.length > 16) this.history.shift();
    }
  }
}
let frameNo = 0;
// zhoda konca histórie so sekvenciou (napr. ['down','down','kiai'] alebo ['B','B','B','kick']); posledné stlačenie práve teraz
function matchSeq(ctl, seq, maxGap = 36) {
  const h = ctl && ctl.history; if (!h || h.length < seq.length) return false;
  const tail = h.slice(-seq.length);
  if (frameNo - tail[tail.length - 1].frame > 1) return false;
  for (let i = 0; i < seq.length; i++) {
    if (tail[i].btn !== seq[i] && tail[i].rel !== seq[i]) return false;
    if (i > 0 && tail[i].frame - tail[i - 1].frame > maxGap) return false;
  }
  return true;
}
const ctls = [new Ctl(0), new Ctl(1)];
const NO_INPUT = { held: {}, pressed: {} };

// spoločný vstup pre menu (ktorýkoľvek hráč)
const menu = { up: false, down: false, left: false, right: false, ok: false, back: false };
let padMusicPrev = false, padUsed = false, padUnlockTried = false;
const padActive = [false, false];
function pollInput() {
  const ps = pads();
  const s0 = padState(ps[0]), s1 = padState(ps[1]);
  ctls[0].poll(s0); ctls[1].poll(s1);
  const pm = !!((s0 && s0.music) || (s1 && s1.music));
  if (pm && !padMusicPrev) toggleMusic();
  padMusicPrev = pm;
  ps.slice(0, 2).forEach((p, i) => { if (p.buttons.some(b => b.pressed) || p.axes.some(v => Math.abs(v) > 0.5)) padActive[i] = padUsed = true; });
  if (padUsed && !audioUnlocked && !padUnlockTried) {          // niektoré prehliadače berú ovládač ako interakciu
    padUnlockTried = true;
    const c = audioCtx();
    if (c) c.resume().then(() => { if (c.state === 'running') unlockAudio(); }).catch(() => {});
  }
  const p = k => ctls[0].pressed[k] || ctls[1].pressed[k];
  menu.up = p('up'); menu.down = p('down'); menu.left = p('left'); menu.right = p('right');
  menu.ok = p('punch') || p('kick') || p('start') || touchTap;
  menu.tap = touchTap; menu.tapPos = touchTap ? tapPos : null;
  menu.back = keysHit.has('Escape') || keysHit.has('Backspace');
  touchTap = false;
}

// nápovedy tlačidiel podľa toho, čím hráč hrá (ovládač / klávesnica / dotyk / počítač)
const PAD_SYM = { left: '◀', right: '▶', up: '▲', down: 'L1', punch: '□', kick: '✕', kiai: '○', special: '△' };
const KEY_SYM = c => ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[c] || c.replace('Key', ''));
function inputKind(side) {
  if (game.mode === 1 && side === 1) return 'cpu';
  if (pads()[side] && padActive[side]) return 'pad';
  if (side === 0 && hasTouch && !keyboardSeen) return 'touch';
  return 'keys';
}
function keyHint(side, btn) {
  const k = inputKind(side);
  if (k === 'pad') return PAD_SYM[btn] + ' ';
  if (k === 'keys') return KEY_SYM(KEYS[side === 0 && game.mode === 1 ? lastKeySet : side][btn][0]) + ' ';
  return '';
}
function legend(side, id) {
  const k = inputKind(side), sp = ROSTER[id].specialName.toLowerCase();
  if (k === 'cpu') return 'POČÍTAČ';
  if (k === 'touch') return 'tlačidlá na obrazovke · ♪ = ' + sp;
  const h = b => keyHint(side, b).trim();
  return `${h('down')} blok · ${h('punch')} úder · ${h('kick')} kop · ${h('kiai')} KIAI · ${h('special')} ${sp}`;
}

// ===================================================================== umelá inteligencia
class CPU {
  constructor() { this.held = {}; this.pressed = {}; this.wait = 40; this.plan = null; this.planT = 0; this.level = 0.6; }
  think(f, o, phase) {
    const own = runFirst(hooks.cpu, this, f, o, phase);
    if (own) { this.held = own.held || {}; this.pressed = own.pressed || {}; return; }
    const held = {}, pressed = {};
    if (phase === 'finish') {
      if (--this.wait <= 0) { pressed[['kiai', 'special', 'kick'][Math.floor(rnd(0, 3))]] = true; this.wait = 9999; }
    } else if (phase === 'fight') {
      if (this.planT > 0) { this.planT--; Object.assign(held, this.plan); }
      else if (--this.wait <= 0) {
        this.wait = Math.floor(rnd(12, 34) / this.level);
        const d = Math.abs(o.x - f.x), toward = o.x > f.x ? 'right' : 'left', away = toward === 'right' ? 'left' : 'right';
        const threat = ATTACK_STATES.has(o.state) && d < 90;
        if (threat && chance(0.35 * this.level)) { this.plan = { down: true }; this.planT = 26; }
        else if (f.cd.special === 0 && chance(0.1) && d < (f.id === 'simon' ? 150 : 400)) pressed.special = true;
        else if (d > 66) { this.plan = { [toward]: true }; this.planT = Math.floor(rnd(8, 28)); }
        else if (f.cd.kiai === 0 && chance(0.1)) pressed.kiai = true;
        else {
          const r = Math.random();
          if (r < 0.42) pressed.punch = true; else if (r < 0.8) pressed.kick = true;
          else if (r < 0.87) { pressed.up = true; if (chance(0.5)) held[toward] = true; } else { this.plan = { [away]: true }; this.planT = 16; }
        }
      }
    }
    this.held = held; this.pressed = pressed;
  }
}

// ===================================================================== bojovník
class Fighter {
  constructor(id, side, ctl) { this.id = id; this.def = ROSTER[id]; this.side = side; this.ctl = ctl; this.reset(); }
  reset() {
    this.x = this.side === 0 ? 150 : 330; this.y = GROUND; this.vx = 0; this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.maxHp = this.def.hp || MAX_HP; this.hp = this.maxHp; this.shownHp = this.maxHp; this.damageTaken = 0;
    this.state = 'idle'; this.t = 0; this.stun = 0; this.move = null;
    this.cd = { kiai: 0, special: 0 }; this.hitDone = false; this.flash = 0; this.ssj = false; this.flip = 0;
  }
  set(state, move = null) { this.state = state; this.t = 0; this.hitDone = false; this.move = move; }
  get onGround() { return this.y >= GROUND; }
  get attacking() { return ATTACK_STATES.has(this.state); }
  get sid() { return this.mimic || this.def.sprites || this.id; }      // prefarbené postavy (TIEŇ…) zdieľajú sprity inej postavy; f.mimic = cudzie sprity (GLITCH), čisté dáta → prejde sieťou
  get vulnerable() { return !['fall', 'down', 'getup', 'baby'].includes(this.state); }
}

// ===================================================================== zápas
let F = null;
const game = { mode: 1, picks: [null, null], cursor: [0, 1], locked: [false, false], stageIdx: 0, menuIdx: 0 };
const cpu = new CPU();

function startMatch() {
  const stage = game.forceStage ? (STAGES.find(s => s.id === game.forceStage) || STAGES[0]) : STAGES[game.stageSel ?? 0];
  game.lastStage = stage.id; game.forceStage = null;
  // hudba: vlastná arény (stage.music), inak náhodná z bojových skladieb a nie tá istá po sebe
  if (!MUSIC_POOL.length) for (const k of Object.keys(SND)) if (k.startsWith('music_fight')) MUSIC_POOL.push(k.slice(6));
  const pool = MUSIC_POOL.filter(k => k !== game.lastMusic);
  game.fightMusic = stage.music || (pool.length ? pool[Math.floor(Math.random() * pool.length)] : MUSIC_POOL[0]);
  game.lastMusic = game.fightMusic;
  const c1 = game.mode === 1 ? cpu : ctls[1];
  F = { stage, fighters: [new Fighter(game.picks[0], 0, ctls[0]), new Fighter(game.picks[1], 1, c1)],
        round: 0, wins: [0, 0], fx: [], notes: [], beams: [], cracks: [], shake: 0, flash: 0, banners: [],
        phase: 'intro', t: 0, timer: ROUND_SECONDS * 60, winner: -1, loser: -1, roundWinner: -1, finisher: null, rocky: null, paused: false };
  cpu.wait = 50; cpu.plan = null; cpu.planT = 0;
  callAll(hooks.matchStart, F);
  nextRound();
  setScene('fight');
  music(game.fightMusic);
}
function nextRound() {
  F.round++;
  for (const f of F.fighters) f.reset();
  F.fx.length = 0; F.notes.length = 0; F.beams.length = 0; F.cracks.length = 0; F.banners.length = 0;
  F.timer = ROUND_SECONDS * 60; F.phase = 'intro'; F.t = 0; F.roundWinner = -1; F.timeUp = false;
  const last = F.wins[0] === WINS_NEEDED - 1 && F.wins[1] === WINS_NEEDED - 1;
  banner(last ? 'FINAL ROUND' : `ROUND ${F.round}`, 66, 34);
  say(last ? 'round3' : F.round <= 2 ? 'round' + F.round : null);
  callAll(hooks.roundStart, F);
}
function banner(text, life, size = 36, y = 120, sub = false) { F.banners.push({ text, life, t: 0, size, y, sub }); }
function decides(attackerSide) { return F.wins[attackerSide] + 1 >= WINS_NEEDED; }

function stepFighter(f, o, allow) {
  f.t++;
  if (f.cd.kiai > 0) f.cd.kiai--;
  if (f.cd.special > 0) f.cd.special--;
  if (f.flash > 0) f.flash--;
  const inp = allow ? f.ctl : NO_INPUT;
  switch (f.state) {
    case 'idle': case 'walk': case 'block': {
      f.facing = o.x >= f.x ? 1 : -1;
      if (runFirst(hooks.input, f, o, inp)) break;
      if (inp.held.down) { if (f.state !== 'block') f.set('block'); f.vx = 0; break; }
      if (inp.pressed.punch) { f.set('punch', 'punch'); sfx('whoosh', 0.35); break; }
      if (inp.pressed.kick) { f.set('kick', 'kick'); sfx('whoosh', 0.45); break; }
      if (inp.pressed.kiai && f.cd.kiai === 0) { f.set('kiai', 'kiai'); f.cd.kiai = KIAI_CD; f.vx = 0; break; }
      if (inp.pressed.special && f.cd.special === 0) { f.set('special', f.def.special); f.cd.special = SPECIAL_CD; f.vx = 0; break; }
      if (inp.pressed.up && F.phase !== 'finish') {
        const jd = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
        f.set('jump'); f.vy = -JUMP_V; f.vx = jd * 2.9; f.flip = jd; break;   // skok so smerom = salto ako v MK
      }
      const dir = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
      if (dir) { f.vx = dir * (dir === f.facing ? WALK_F : WALK_B); if (f.state !== 'walk') f.set('walk'); }
      else { f.vx = 0; if (f.state !== 'idle') f.set('idle'); }
      break;
    }
    case 'jump':   // KOP / ÚDER vo výskoku aj v salte: salto sa hneď zastaví, póza drží do dopadu, let pokračuje (ako v MK2)
      if ((inp.pressed.kick || inp.pressed.punch) && f.t > 3) {
        const mv = inp.pressed.kick ? 'airkick' : 'airpunch';
        f.facing = o.x >= f.x ? 1 : -1; f.state = mv; f.move = mv; f.hitDone = false; f.t = 0; sfx('whoosh', 0.4);
      }
      break;
    case 'airkick': case 'airpunch':
      if (!MOVE[f.move]) f.move = f.state;                            // stav obnovený modulom bez pohybu (REWIND a pod.)
      if (f.hitDone && f.vx * f.facing > 0) f.vx = -f.facing * 1.2;   // po zásahu alebo bloku sa odrazí späť, neprejde cez súpera
      if (f.t >= MOVE[f.move].startup + MOVE[f.move].active) { f.state = 'jump'; f.move = null; f.flip = 0; }   // poistka: dlhý let
      break;
    case 'punch': case 'kick': case 'kiai': case 'special': {
      f.vx *= 0.8;
      const m = MOVE[f.move];
      if (f.state === 'kiai' && f.t === m.startup) { F.beams.push({ x: f.x + f.facing * 34, y: f.y - 100, dir: f.facing, len: 0, owner: f, hit: false, t: 0 }); sfx('kiai'); shake(4); }
      if (f.state === 'special' && f.t === m.startup) doSpecial(f, o);
      if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
      break;
    }
    case 'hit': case 'blockstun':
      f.vx *= 0.86;
      if (--f.stun <= 0) f.set(f.state === 'blockstun' && inp.held.down ? 'block' : 'idle');
      break;
    case 'deaf': case 'dance':
      f.vx *= 0.8;
      if (--f.stun <= 0) f.set('idle');
      break;
    case 'fall':
      if (f.onGround && f.t > 6) { f.set('down'); f.vx = 0; sfx('fall'); shake(3); }
      break;
    case 'down':
      if (f.hp > 0 && f.t > 46) f.set('getup');
      break;
    case 'getup':
      if (f.t > 22) f.set('idle');
      break;
    default:
      if (runFirst(hooks.state, f, o, inp)) break;
      if (ATTACK_STATES.has(f.state) && MOVE[f.move]) {   // útok z modulu bez vlastnej logiky: len časovanie
        const m = MOVE[f.move]; f.vx *= 0.8;
        if (f.t >= m.startup + m.active + m.recovery) f.set('idle');
      }
  }
  // fyzika
  f.x += f.vx;
  if (!f.onGround || f.vy < 0) {
    f.vy += GRAVITY; f.y += f.vy;
    if (f.y >= GROUND) {
      f.y = GROUND; f.vy = 0;
      if (f.state === 'jump' || f.state === 'airkick' || f.state === 'airpunch') { f.set('idle'); f.vx = 0; }
    }
  }
  f.x = clamp(f.x, 22, W - 22);
  f.shownHp += (f.hp - f.shownHp) * 0.12;
}

function separate(a, b) {
  if (!a.onGround || !b.onGround || !a.vulnerable || !b.vulnerable) return;
  const d = b.x - a.x, gap = Math.abs(d);
  if (gap < MIN_GAP) {
    const push = (MIN_GAP - gap) / 2, s = d >= 0 ? 1 : -1;
    a.x = clamp(a.x - push * s, 22, W - 22); b.x = clamp(b.x + push * s, 22, W - 22);
  }
}

function hurtbox(f) {
  if (f.state === 'dance') return { x0: f.x - 18, x1: f.x + 18, y0: f.y - 100, y1: f.y };
  return { x0: f.x - 17, x1: f.x + 17, y0: f.y - (f.def.height || 138), y1: f.y };
}
function checkAttack(f, o) {
  if (!HIT_STATES.has(f.state) || f.hitDone || !o.vulnerable) return;
  const m = MOVE[f.move];
  if (f.t < m.startup || f.t >= m.startup + m.active) return;
  const xa = f.x + f.facing * m.x0, xb = f.x + f.facing * m.x1;
  const hx0 = Math.min(xa, xb), hx1 = Math.max(xa, xb), hy0 = f.y + m.y0, hy1 = f.y + m.y1;
  const h = hurtbox(o);
  if (hx1 < h.x0 || hx0 > h.x1 || hy1 < h.y0 || hy0 > h.y1) return;
  f.hitDone = true;
  return { ...m, name: f.move, sx: f.facing > 0 ? hx1 - 4 : hx0 + 4, sy: (hy0 + hy1) / 2 };
}
function blocking(d, a) { return (d.state === 'block' || d.state === 'blockstun') && d.facing === -a.facing; }

function applyHit(a, d, m) {
  const blocked = m.blockable !== false && blocking(d, a);
  applyHitCore(a, d, m);
  callAll(hooks.afterHit, a, d, m, blocked);
  if (!blocked && m.name === 'combo3' && frameNo - (game.outstandingAt ?? -9999) > 900) {   // celé kombo 3 → „Outstanding!“ (nie častejšie ako raz za 15 s)
    game.outstandingAt = frameNo; setTimeout(() => say('outstanding'), 300);
  }
}
function applyHitCore(a, d, m) {
  const sx = m.sx ?? d.x, sy = m.sy ?? d.y - 90;
  m = { ...m, dmg: Math.round(m.dmg * (a.ssj ? 1.3 : 1)) };
  if (m.blockable !== false && blocking(d, a)) {
    d.hp = Math.max(1, d.hp - Math.ceil(m.dmg * 0.2)); d.damageTaken += Math.ceil(m.dmg * 0.2);   // blok nikdy nezabije
    d.set('blockstun'); d.stun = 10; d.vx = a.facing * (m.push || 3) * 0.9;
    sfx('block'); spark(sx, sy, '#9fd8ff', 6);
  } else {
    d.hp = Math.max(0, d.hp - m.dmg); d.damageTaken += m.dmg; d.flash = 8;
    if (!d.ssj && d.hp > 0 && d.hp <= d.maxHp * 0.25 && F.phase === 'fight') {
      d.ssj = true; banner('SUPER ' + d.def.name + '!', 100, 24, 168, true); say('ssj_' + d.id);
    }
    sfx(m.sound || 'punch'); spark(sx, sy, '#ffe23a', 10); shake(m.knock ? 6 : 3);
    if (F.phase === 'finish' && hooks.finisher.length) return;   // finishers.js: útok bez komba vo FINISH HIM zápas neukončí (potácanie v afterHit)
    if (F.phase === 'finish') { F.banners.length = 0; d.set('fall'); d.vx = a.facing * 3.4; d.vy = -5.5; F.phase = 'matchEnd'; F.t = -50; return; }
    if (d.hp <= 0 && decides(a.side)) { d.set('dizzy'); d.vx = 0; d.stun = 0; return; }
    if (d.hp <= 0 || m.knock || m.launch || !d.onGround) { d.set('fall'); d.vx = a.facing * (m.launch ? 1.6 : 3.2); d.vy = -(m.launch || 4.6); return; }
    if (m.effect) { d.set(m.effect); d.stun = STUN; d.vx = a.facing * 1.2; return; }
    d.set('hit'); d.stun = m.hitstun || 16; d.vx = a.facing * (m.push || 3);
  }
}

function doSpecial(f, o) {
  if (f.def.special === 'heligonka') {
    sfx('heligonka', 0.9);
    F.notes.push({ x: f.x + f.facing * 30, y: f.y - 96, vx: f.facing * 3.3, owner: f, t: 0, dead: false });
  } else {
    sfx('husle', 0.9); sfx('crack', 0.8);
    const cx = clamp(f.x + f.facing * 90, 60, W - 60);
    F.cracks.push(makeCracks(cx, rnd(70, 120)));
    F.flash = 6; shake(10);
    const d = (o.x - f.x) * f.facing;
    if (d > 0 && d < 175 && o.vulnerable && o.state !== 'dizzy')
      applyHit(f, o, { dmg: 6, effect: 'deaf', sound: 'none', sx: o.x, sy: o.y - 120 });
  }
}

function updateProjectiles() {
  for (const n of F.notes) {
    n.t++; n.x += n.vx;
    if (n.t % 12 === 1) sfx('notes', 0.35);
    const o = F.fighters[1 - n.owner.side];
    if (!n.dead && F.phase === 'fight' && o.vulnerable && o.state !== 'dizzy' && Math.abs(o.x - n.x) < 18 && o.y > GROUND - 60) {
      n.dead = true;
      applyHit(n.owner, o, { dmg: 6, effect: 'dance', sound: 'heligonka', sx: n.x, sy: n.y });
    }
    if (n.x < -30 || n.x > W + 30) n.dead = true;
  }
  F.notes = F.notes.filter(n => !n.dead);
  for (const b of F.beams) {
    b.t++; b.len = Math.min(250, b.len + 24);
    const o = F.fighters[1 - b.owner.side];
    const d = (o.x - b.x) * b.dir;
    if (!b.hit && F.phase === 'fight' && b.t < 26 && o.vulnerable && o.state !== 'dizzy' && d > -16 && d < b.len + 16 && o.y > GROUND - 50) {
      b.hit = true;
      applyHit(b.owner, o, { dmg: 10, knock: true, push: 5, sound: 'kick', sx: o.x - b.dir * 10, sy: b.y });
    }
  }
  F.beams = F.beams.filter(b => b.t < 34);
}

function updateFight() {
  if (keysHit.has('Escape') || keysHit.has('KeyP') || ((ctls[0].pressed.start || ctls[1].pressed.start) && keysHit.size === 0)) F.paused = !F.paused;
  if (F.paused) { if (keysHit.has('KeyQ') || menu.tap) { F.paused = false; setScene('title'); music('title'); } return; }
  F.t++;
  const [a, b] = F.fighters;
  if (F.phase === 'intro') {
    if (F.t === 68) { banner('FIGHT!', 44, 46); say('fight'); }
    if (F.t >= 100) { F.phase = 'fight'; F.t = 0; }
  }
  if (b.ctl instanceof CPU) b.ctl.think(b, a, F.phase);
  if (F.phase === 'finish') {
    const w = F.fighters[F.winner], p = w.ctl.pressed;
    const kind = hooks.finisher.length ? runFirst(hooks.finisher, w, F.fighters[F.loser]) : null;
    if (kind) startFinisher(kind);
    else if (hooks.finisher.length) { /* zakončenia len kombom (finishers.js) */ }
    else if (p.kiai) startFinisher('rockyality');
    else if (p.special) startFinisher(w.def.finisher);
    else if (p.punch) startFinisher('friendship');
    else if (p.kick) startFinisher('creeperality');
  }
  for (let i = 0; i < 2; i++) {
    const f = F.fighters[i], o = F.fighters[1 - i];
    let allow = F.phase === 'fight' || (F.phase === 'finish' && i === F.winner);
    if (F.phase === 'finisher') allow = false;
    if (F.phase !== 'finisher' || !['kroj', 'baby'].includes(f.state)) stepFighter(f, o, allow);
    else f.t++;
  }
  separate(a, b);
  const hitA = checkAttack(a, b), hitB = checkAttack(b, a);   // oba zásahy sa vyhodnotia naraz (výmena úderov)
  if (hitA) applyHit(a, b, hitA);
  if (hitB) applyHit(b, a, hitB);
  updateProjectiles();
  updateFx();

  if (F.phase === 'fight') {
    const ko = F.fighters.findIndex(f => f.hp <= 0);
    if (a.hp <= 0 && b.hp <= 0) {                         // dvojité K.O. = remíza
      for (const f of F.fighters) { f.set('fall'); f.vy = -4; }
      F.banners.length = 0; F.phase = 'roundEnd'; F.t = 0; F.roundWinner = -1;
    } else if (ko >= 0) {
      const w = 1 - ko;
      if (F.fighters[ko].state === 'dizzy') {
        F.phase = 'finish'; F.t = 0; F.winner = w; F.loser = ko;
        F.fighters[w].set('idle'); F.notes.length = 0; F.beams.length = 0; cpu.wait = 70;
        banner('FINISH HIM!', 150, 38); say('finish');
      } else { F.phase = 'roundEnd'; F.t = 0; F.roundWinner = w; }
    } else if (--F.timer <= 0) {
      F.phase = 'roundEnd'; F.t = 0; F.timeUp = true;
      F.roundWinner = a.hp === b.hp ? -1 : (a.hp > b.hp ? 0 : 1);
      banner('TIME', 60, 34);
    }
  } else if (F.phase === 'finish') {
    if (F.t > (F.finishFrames || 390)) { const L = F.fighters[F.loser]; L.set('fall'); L.vy = -3; F.phase = 'matchEnd'; F.t = -40; }   // F.finishFrames: finishers.js dá človeku 10 s, počítač 390 snímok
  } else if (F.phase === 'finisher') {
    updateFinisher();
  } else if (F.phase === 'roundEnd') {
    if (F.t === 50) {
      const w = F.roundWinner;
      if (w >= 0) {
        F.wins[w]++;
        const wf = F.fighters[w]; wf.set('win');
        F.banners.length = 0; banner(`${wf.def.name} WINS`, 110, 32); say(wf.id + '_wins');
        if (wf.damageTaken === 0) { banner('FLAWLESS VICTORY', 110, 22, 152, true); setTimeout(() => say('flawless'), 1200); }
        else if (wf.hp >= wf.maxHp * 0.7) setTimeout(() => say('excellent'), 1200);
        if (F.stage && F.stage.id === 'zahrada') sfx('crowd', 0.55);          // diváci v záhrade jasajú
      } else { F.banners.length = 0; banner('DRAW', 100, 36); say('draw'); }
    }
    if (F.t === 190) {
      const champ = F.wins.findIndex(x => x >= WINS_NEEDED);
      if (champ >= 0) { F.winner = champ; F.loser = 1 - champ; F.phase = 'matchEnd'; F.t = 1; }   // t=1: WINS už zaznelo
      else nextRound();
    }
  } else if (F.phase === 'matchEnd') {
    if (F.t === 1) {
      const wf = F.fighters[F.winner];
      if (wf.state !== 'win') wf.set('win');
      F.banners.length = 0; banner(`${wf.def.name} WINS`, 150, 32); say(wf.id + '_wins');
    }
    if (F.t === 200) {
      game.lastWinner = F.winner; game.score = F.wins.slice();
      if (!runFirst(hooks.matchEnd, F)) {                 // koniec sa strieda (Peťo: nie stále impostor), nie dvakrát po sebe rovnaký
        const kinds = ['eject', 'achievement', 'classic'].filter(k => k !== game.lastEnding);
        const kind = game.forceEnding || kinds[Math.floor(Math.random() * kinds.length)]; game.lastEnding = kind;   // forceEnding: testy
        if (kind === 'eject') setScene('eject');
        else { F.ending = kind; F.endT = 0; F.endText = achievementText(F); if (kind === 'achievement') sfx('menu', 0.9); }
      }
    }
    if (F.ending && ++F.endT > (F.ending === 'achievement' ? 210 : 100)) setScene('result');
  }
  if (F.shake > 0) F.shake *= 0.86;
  if (F.shake < 0.3) F.shake = 0;
  for (const bn of F.banners) bn.t++;
  F.banners = F.banners.filter(bn => bn.t < bn.life);
}

function startFinisher(kind) {
  F.banners.length = 0;
  F.phase = 'finisher'; F.t = 0; F.finisher = kind;
  const L = F.fighters[F.loser], w = F.fighters[F.winner];
  if (FINISHERS[kind]) { if (FINISHERS[kind].start) FINISHERS[kind].start(F, w, L); return; }
  w.set('idle');
  if (kind === 'rockyality') {
    const dir = L.x > w.x ? 1 : -1;
    F.rocky = { x: dir > 0 ? -50 : W + 50, dir, state: 'run', t: 0 };
    sfx('bark');
  } else if (kind === 'folklority') {
    L.set('kroj'); sfx('folklority', 0.85); F.flash = 10;
  } else if (kind === 'babality') {
    L.set('baby'); F.flash = 18; sfx('baby');
  } else if (kind === 'friendship') {
    w.set('friendship');
  } else if (kind === 'creeperality') {
    const dir = L.x > w.x ? 1 : -1;
    F.creeper = { x: clamp(L.x + dir * 140, 30, W - 30), dir: -dir, state: 'walk', t: 0 };
    if (Math.abs(F.creeper.x - L.x) < 60) F.creeper.x = clamp(L.x - dir * 140, 30, W - 30), F.creeper.dir = dir;
  }
}
function updateFinisher() {
  const L = F.fighters[F.loser];
  if (FINISHERS[F.finisher]) { if (FINISHERS[F.finisher].update(F, F.fighters[F.winner], L)) endFinisher(); return; }
  switch (F.finisher) {
    case 'rockyality': {
      const r = F.rocky; r.t++;
      if (r.state === 'run') {
        r.x += r.dir * 4.4;
        if (r.t % 30 === 0) sfx('bark', 0.6);
        if ((r.dir > 0 && r.x >= L.x - 12) || (r.dir < 0 && r.x <= L.x + 12)) {
          r.state = 'lick'; r.t = 0; L.set('fall'); L.vy = -3.5; L.vx = r.dir * 1.2; sfx('bark'); shake(5);
        }
      } else {
        r.x += (L.x - r.x) * 0.1;
        if (r.t % 18 === 0) sfx('lick', 0.7);
        if (r.t % 7 === 0) F.fx.push({ kind: 'heart', x: r.x + rnd(-14, 14), y: GROUND - 34, vy: -0.7, t: 0, life: 50 });
        if (r.t === 24) { banner('ROCKYALITY', 170, 36); say('rockyality'); }
        if (r.t > 200) endFinisher();
      }
      break;
    }
    case 'folklority':
      if (F.t % 9 === 0) F.fx.push({ kind: 'note', x: L.x + rnd(-30, 30), y: L.y - rnd(90, 140), vy: -0.6, t: 0, life: 60 });
      if (F.t === 30) { banner('FOLKLORITY', 170, 36); say('folklority'); }
      if (F.t > 240) endFinisher();
      break;
    case 'babality':
      if (F.t % 60 === 30) sfx('baby', 0.7);
      if (F.t === 30) { banner('BABALITY', 170, 38); say('babality'); }
      if (F.t > 230) endFinisher();
      break;
    case 'creeperality': {
      const c = F.creeper; c.t++;
      if (c.state === 'walk') {
        c.x += c.dir * 1.3;
        if (Math.abs(c.x - L.x) < 34) { c.state = 'hiss'; c.t = 0; sfx('hiss', 0.9); }
      } else if (c.state === 'hiss') {
        if (c.t >= 70) {
          c.state = 'gone'; c.t = 0; F.flash = 22; shake(16); sfx('boom'); sfx('crack', 0.5);
          for (let i = 0; i < 40; i++) F.fx.push({ kind: 'block', x: c.x + rnd(-14, 14), y: GROUND - rnd(20, 110), vx: rnd(-4, 4), vy: rnd(-6, -1), c: ['#3fae3f', '#5fcf5f', '#2a7d2a', '#6b4a2b', '#8a8a8a'][Math.floor(rnd(0, 5))], t: 0, life: 70 });
          L.set('fall'); L.vy = -7; L.vx = (L.x >= c.x ? 1 : -1) * 3.5;
        }
      } else if (c.t === 24) { banner('CREEPERALITY', 170, 34); say('creeperality'); }
      else if (c.t > 190) endFinisher();
      break;
    }
    case 'friendship':
      if (F.t % 5 === 0) F.fx.push({ kind: 'confetti', x: rnd(0, W), y: -6, vy: rnd(1, 2.2), vx: rnd(-0.6, 0.6), c: ['#ff4d4d', '#ffd200', '#4dd2ff', '#7dff6a', '#ff7ae0'][Math.floor(rnd(0, 5))], t: 0, life: 200 });
      if (F.t === 24) { banner('FRIENDSHIP', 80, 34); say('friendship'); }
      if (F.t === 110) banner('AWESOME FRIENDLY!', 110, 30);
      if (F.t > 230) endFinisher();
      break;
  }
}
function endFinisher() { F.phase = 'matchEnd'; F.t = 0; }

// ===================================================================== efekty
function shake(n) { F.shake = Math.max(F.shake, n); }
function spark(x, y, c, n) { for (let i = 0; i < n; i++) F.fx.push({ kind: 'spark', x, y, vx: rnd(-3, 3), vy: rnd(-3, 2), c, t: 0, life: 14 }); }
function updateFx() {
  for (const p of F.fx) { p.t++; p.x += p.vx || 0; p.y += p.vy || 0; if (p.kind === 'spark') p.vy += 0.15; if (p.kind === 'block') { p.vy += 0.25; if (p.y > GROUND) { p.y = GROUND; p.vy = 0; p.vx *= 0.8; } } }
  F.fx = F.fx.filter(p => p.t < p.life);
  for (const c of F.cracks) c.t++;
  F.cracks = F.cracks.filter(c => c.t < c.life);
  if (F.flash > 0) F.flash--;
}
function makeCracks(cx, cy) {
  const lines = [];
  const rays = 10;
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * Math.PI * 2 + rnd(-0.25, 0.25);
    let x = cx, y = cy; const pts = [[x, y]];
    const len = rnd(140, 320), seg = 9;
    for (let s = 0; s < seg; s++) { const a2 = ang + rnd(-0.4, 0.4); x += Math.cos(a2) * len / seg; y += Math.sin(a2) * len / seg; pts.push([x, y]); }
    lines.push(pts);
    if (chance(0.6)) { const k = Math.floor(rnd(2, 6)); const [bx, by] = pts[k]; const b2 = ang + rnd(-1, 1); lines.push([[bx, by], [bx + Math.cos(b2) * 40, by + Math.sin(b2) * 40]]); }
  }
  for (let r = rnd(14, 22); r < 80; r += rnd(16, 26)) {
    const pts = [];
    for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 2; const rr = r + rnd(-4, 4); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    lines.push(pts);
  }
  return { lines, cx, cy, t: 0, life: 170 };
}

// ===================================================================== kreslenie: text
function text(str, x, y, size, align = 'left', color = '#fff') {
  ctx.font = `bold ${size}px "Trebuchet MS", "Arial Black", Arial, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 5); ctx.strokeStyle = '#000'; ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function bigText(str, x, y, size, metal = false) {
  ctx.font = `bold ${size}px Impact, "Arial Black", "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const g = ctx.createLinearGradient(0, y - size * 0.85, 0, y);
  if (metal) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#b8c2cc'); g.addColorStop(1, '#5d6b78'); }
  else { g.addColorStop(0, '#fff7a8'); g.addColorStop(0.45, '#ffc21a'); g.addColorStop(1, '#d1350b'); }
  ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = '#000'; ctx.strokeText(str, x, y);
  ctx.fillStyle = g; ctx.fillText(str, x, y);
}
// logo: MATÚŠ + akčné „KO“ (knockout) + KOMBAT — hlásateľ to číta „Matúš K.O. Kombat!“
function drawLogoTitle(x, y, size, t = 0) {
  ctx.save();
  ctx.font = `bold ${size}px Impact, "Arial Black", "Trebuchet MS", sans-serif`;
  const w1 = ctx.measureText('MATÚŠ').width, w3 = ctx.measureText('KOMBAT').width, gap = size * 0.22;
  const koSize = Math.round(size * 1.18);
  ctx.font = `italic 900 ${koSize}px "Arial Black", Impact, sans-serif`;
  const wK = ctx.measureText('KO').width * 0.92;
  const x0 = x - (w1 + wK + gap + w3) / 2;
  bigText('MATÚŠ', x0 + w1 / 2, y, size);
  bigText('KOMBAT', x0 + w1 + wK + gap + w3 / 2, y, size);
  const kx = x0 + w1 + wK / 2, ky = y - size * 0.36, pulse = 1 + Math.sin(t / 7) * 0.04;
  ctx.translate(kx, ky); ctx.rotate(-0.14); ctx.scale(pulse, pulse);
  ctx.beginPath();                                       // komiksový výbuch za KO
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = (i % 2 ? 0.55 : 0.95) * koSize * 0.82; ctx.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r); }
  ctx.closePath(); ctx.fillStyle = '#ffe23a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.font = `italic 900 ${koSize}px "Arial Black", Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, koSize / 5); ctx.strokeStyle = '#000'; ctx.strokeText('KO', 0, 2);
  ctx.lineWidth = Math.max(2, koSize / 12); ctx.strokeStyle = '#fff'; ctx.strokeText('KO', 0, 2);
  ctx.fillStyle = '#e8120c'; ctx.fillText('KO', 0, 2);
  ctx.restore();
}

// ===================================================================== kreslenie: postavy
const POSES = {
  stand:  { hip: [0, -62], sh: [3, -108], hd: [5, -121], fe: [14, -92], fh: [22, -104], be: [-6, -90], bh: [8, -98], fk: [10, -31], ff: [16, 0], bk: [-10, -31], bf: [-16, 0] },
  walkA:  { hip: [0, -63], sh: [4, -109], hd: [6, -122], fe: [14, -92], fh: [22, -104], be: [-6, -90], bh: [8, -98], fk: [14, -32], ff: [24, 0], bk: [-6, -31], bf: [-10, 0] },
  walkB:  { hip: [0, -61], sh: [3, -107], hd: [5, -120], fe: [14, -92], fh: [22, -104], be: [-6, -90], bh: [8, -98], fk: [4, -31], ff: [4, 0], bk: [-14, -31], bf: [-24, 0] },
  punch:  { hip: [2, -62], sh: [8, -108], hd: [10, -121], fe: [28, -104], fh: [48, -106], be: [-8, -92], bh: [4, -98], fk: [12, -31], ff: [20, 0], bk: [-12, -30], bf: [-22, 0] },
  kick:   { hip: [-2, -64], sh: [-12, -108], hd: [-14, -121], fe: [-2, -96], fh: [8, -104], be: [-18, -92], bh: [-8, -100], fk: [26, -78], ff: [58, -84], bk: [-6, -32], bf: [-8, 0] },
  airkick:{ hip: [0, -68], sh: [-10, -112], hd: [-13, -125], fe: [4, -100], fh: [14, -110], be: [-16, -98], bh: [-4, -106], fk: [38, -48], ff: [74, -27], bk: [-2, -40], bf: [-24, -34] },   // noha šikmo dole dopredu (~30°), druhá skrčená
  airpunch:{ hip: [0, -68], sh: [9, -112], hd: [12, -125], fe: [30, -100], fh: [54, -88], be: [-4, -98], bh: [8, -106], fk: [16, -46], ff: [6, -30], bk: [-10, -46], bf: [-24, -32] },    // telo vpred, päsť vpred-dole, nohy skrčené
  jump:   { hip: [0, -70], sh: [2, -116], hd: [4, -130], fe: [14, -100], fh: [20, -112], be: [-8, -98], bh: [4, -106], fk: [12, -52], ff: [4, -38], bk: [-10, -50], bf: [-18, -34] },
  block:  { hip: [-3, -60], sh: [-3, -106], hd: [-1, -119], fe: [12, -100], fh: [14, -118], be: [8, -94], bh: [13, -112], fk: [8, -30], ff: [14, 0], bk: [-12, -30], bf: [-18, 0] },
  kiai:   { hip: [0, -62], sh: [0, -110], hd: [0, -124], fe: [22, -112], fh: [34, -124], be: [-20, -112], bh: [-32, -124], fk: [14, -30], ff: [26, 0], bk: [-14, -30], bf: [-26, 0] },
  hit:    { hip: [-6, -60], sh: [-16, -104], hd: [-21, -115], fe: [-4, -90], fh: [8, -80], be: [-24, -90], bh: [-30, -80], fk: [4, -30], ff: [10, 0], bk: [-14, -30], bf: [-20, 0] },
  dizzy:  { hip: [0, -60], sh: [0, -106], hd: [0, -119], fe: [12, -110], fh: [8, -121], be: [-12, -110], bh: [-8, -121], fk: [7, -30], ff: [12, 0], bk: [-7, -30], bf: [-12, 0] },
  win:    { hip: [0, -62], sh: [0, -110], hd: [0, -124], fe: [8, -128], fh: [12, -150], be: [-12, -96], bh: [-6, -84], fk: [8, -30], ff: [12, 0], bk: [-8, -30], bf: [-12, 0] },
  danceA: { hip: [0, -38], sh: [0, -84], hd: [0, -97], fe: [16, -76], fh: [28, -86], be: [-16, -76], bh: [-28, -86], fk: [14, -22], ff: [36, -26], bk: [-8, -18], bf: [-10, 0] },
  danceB: { hip: [0, -38], sh: [0, -84], hd: [0, -97], fe: [16, -76], fh: [28, -86], be: [-16, -76], bh: [-28, -86], fk: [8, -18], ff: [10, 0], bk: [-14, -22], bf: [-36, -26] },
  heligonka: { hip: [0, -62], sh: [2, -108], hd: [4, -121], fe: [6, -88], fh: [10, -84], be: [24, -92], bh: [36, -86], fk: [10, -31], ff: [16, 0], bk: [-10, -31], bf: [-16, 0] },
  husle:  { hip: [0, -62], sh: [0, -108], hd: [-2, -121], fe: [12, -106], fh: [16, -112], be: [16, -96], bh: [30, -104], fk: [10, -31], ff: [16, 0], bk: [-10, -31], bf: [-16, 0] },
};
function poseFor(f) {
  const s = f.state;
  if (s === 'idle' || s === 'getup') return POSES.stand;
  if (s === 'walk') return Math.floor(f.t / 10) % 2 ? POSES.walkA : POSES.walkB;
  if (s === 'jump') return POSES.jump;
  if (s === 'airkick' || s === 'airpunch') return POSES[s];
  if (s === 'block' || s === 'blockstun') return POSES.block;
  if (s === 'punch' || s === 'kick') { const m = MOVE[f.move]; return f.t >= m.startup - 2 && f.t < m.startup + m.active + 4 ? POSES[s] : POSES.stand; }
  if (s === 'kiai') return f.t >= MOVE.kiai.startup - 4 ? POSES.kiai : POSES.stand;
  if (s === 'special') return POSES[f.def.special];
  if (s === 'hit') return POSES.hit;
  if (s === 'dizzy' || s === 'deaf') return POSES.dizzy;
  if (s === 'dance' || s === 'kroj') return Math.floor(f.t / 9) % 2 ? POSES.danceA : POSES.danceB;
  if (s === 'win' || s === 'friendship') return POSES.win;
  return POSES.stand;
}
function drawFigure(x, y, facing, pose, look, opts = {}) {
  const sc = opts.scale || 1, rot = opts.rot || 0, bob = opts.bob || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const P = k => {
    const [px, py] = pose[k];
    const rx = px * cos - (py + 4) * sin, ry = px * sin + (py + 4) * cos - 4;
    return [x + rx * facing * sc, y + (ry + bob) * sc];
  };
  const limb = (a, b, c, w, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = w * sc; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); const p1 = P(a), p2 = P(b), p3 = P(c); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.stroke();
  };
  const skin = '#e3a97f', dot = (k, r, col) => { const p = P(k); ctx.fillStyle = col; ctx.fillRect(p[0] - r * sc, p[1] - r * sc, 2 * r * sc, 2 * r * sc); };
  const gi = look.gi, dark = look.giDark;
  limb('hip', 'bk', 'bf', 9, dark); dot('bf', 3, skin);
  limb('sh', 'be', 'bh', 7, dark); dot('bh', 3, skin);
  ctx.strokeStyle = gi; ctx.lineWidth = 15 * sc; ctx.lineCap = 'round';
  ctx.beginPath(); const h = P('hip'), s = P('sh'); ctx.moveTo(h[0], h[1]); ctx.lineTo(s[0], s[1]); ctx.stroke();
  ctx.strokeStyle = look.belt; ctx.lineWidth = 4 * sc; ctx.beginPath(); ctx.moveTo(h[0] - 7 * sc, h[1] - 2 * sc); ctx.lineTo(h[0] + 7 * sc, h[1] - 2 * sc); ctx.stroke();
  limb('hip', 'fk', 'ff', 9, gi); dot('ff', 3, skin);
  limb('sh', 'fe', 'fh', 7, gi); dot('fh', 3, skin);
  const hd = P('hd');
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(hd[0], hd[1], 8.5 * sc, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = look.hair; ctx.beginPath(); ctx.arc(hd[0], hd[1] - 2 * sc, 8.8 * sc, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillRect(hd[0] - 8.5 * sc, hd[1] - 6 * sc, 17 * sc, 3 * sc);
}
function drawProp(f) {
  const fx = f.facing;
  if (f.state === 'special' && FA[f.sid] && FA[f.sid].anims && FA[f.sid].anims.special && IMG[`${f.sid}/special`]) return;
  if (f.state === 'special' && f.def.special === 'heligonka') {
    const x = f.x + fx * 22, y = f.y - 92, open = 8 + Math.sin(f.t / 3) * 6;
    ctx.fillStyle = '#7a1f1f'; ctx.fillRect(x - 12 - open / 2, y - 12, 10, 24); ctx.fillRect(x + 2 + open / 2, y - 12, 10, 24);
    ctx.fillStyle = '#1d1d1d'; for (let i = 0; i < 4; i++) ctx.fillRect(x - open / 2 - 2 + i * (open + 4) / 4, y - 11, 2, 22);
    ctx.fillStyle = '#f2d16b'; ctx.fillRect(x - 11 - open / 2, y - 9, 3, 3); ctx.fillRect(x + 7 + open / 2, y - 9, 3, 3);
  }
  if (f.state === 'special' && f.def.special === 'husle') {
    const x = f.x + fx * 14, y = f.y - 112;
    ctx.fillStyle = '#9c4a12'; ctx.beginPath(); ctx.ellipse(x, y, 9, 4, fx * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3b1d06'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + fx * 16, y - 3); ctx.stroke();
    ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 1.5; const bowX = Math.sin(f.t / 2) * 8;
    ctx.beginPath(); ctx.moveTo(x - fx * 14 + bowX, y + 10); ctx.lineTo(x + fx * 18 + bowX, y - 10); ctx.stroke();
  }
}

// ===================================================================== útoky vo vzduchu ako v MK2 (kop a úder zo skoku aj zo salta)
// Najvystretejšia snímka spritu kick/punch sa otočí okolo bedier (AIR_ROT) a časť pred bedrami sa skosí nadol, aby noha mierila
// šikmo dole dopredu (AIR_AIM° pod vodorovnú) a trup ostal skoro zvislý; úder: telo mierne vpred, päsť vpred-dole. Výsledok je
// obyčajný pás 2 snímok (nástup, póza) v IMG pod menom 'airkick~' / 'airpunch~', takže ho rovnako kreslí drawFighter aj moduly
// (paleta, aura SSJ, priehľadnosť nepriateľov, GLITCH cez f.mimic) a hosť v sieťovej hre (stačí f.state, f.t, f.sid).
// Údaje snímok sú zmerané z assets: fr = snímka, hip = bedrá (stred otáčania), tip = špička nohy/päste, obe [dopredu od kotvy,
// výška nad chodidlami]; sig = [snímky, w, h] → po výmene spritu sa použije všeobecný odhad. Rocky (hryz) sa len nakloní papuľou dole.
const AIR_ROT = { kick: 22, punch: 22 }, AIR_AIM = 30, AIR_SHEAR = { punch: 0.3 };
const AIR_TUNE = {
  'matusko/kick':  { sig: [15, 166, 158], fr: 8, hip: [18, 76], tip: [116, 87] },
  'simon/kick':    { sig: [14, 162, 161], fr: 8, hip: [18, 84], tip: [117, 129] },
  'boss/kick':     { sig: [15, 143, 167], fr: 10, hip: [16, 88], tip: [96, 128] },
  'ninja/kick':    { sig: [14, 168, 166], fr: 6, hip: [15, 88], tip: [121, 83] },
  'vodnik/kick':   { sig: [12, 150, 159], fr: 6, hip: [10, 90], tip: [98, 116] },
  'matusko/punch': { sig: [12, 131, 142], fr: 4, hip: [8, 74], tip: [77, 113] },
  'simon/punch':   { sig: [12, 130, 147], fr: 5, hip: [10, 77], tip: [77, 117] },
  'boss/punch':    { sig: [13, 118, 154], fr: 4, hip: [6, 79], tip: [64, 115] },
  'ninja/punch':   { sig: [12, 138, 153], fr: 4, hip: [8, 82], tip: [76, 124] },
  'vodnik/punch':  { sig: [12, 115, 153], fr: 5, hip: [2, 82], tip: [60, 124] },
  'rocky/kick':    { sig: [12, 131, 68], fr: 3, hip: [-20, 40], tip: [38, 50], rot: 16, k: 0 },
  'rocky/punch':   { sig: [12, 131, 68], fr: 3, hip: [-20, 40], tip: [38, 50], rot: -16, k: 0 },   // úder = hryz hore (zásahová zóna úderu je vyššie)
};
const AIR_META = {};
function airPose(f, kind) {             // { name, a, img } ako animFor, alebo null (bez spritu kick/punch → kreslená náhrada)
  const sid = f.sid, src = FA[sid] && FA[sid].anims && FA[sid].anims[kind], raw = IMG[`${sid}/${kind}`];
  if (!src || !raw || !src.frames) return null;
  const name = `air${kind}~`, key = `${sid}/${name}`;
  if (!AIR_META[key] || !IMG[key]) {
    try { const p = buildAirPose(src, raw, AIR_TUNE[`${sid}/${kind}`], kind); IMG[key] = p.canvas; AIR_META[key] = p.a; }
    catch (e) { console.warn('póza vo vzduchu', key, e); return null; }
  }
  return { name, a: AIR_META[key], img: paletteStrip(f, name, IMG[key]) };
}
function buildAirPose(src, raw, tune, kind) {
  const { frames: n, w, h, ax, ay } = src;
  const ok = !!tune && tune.sig[0] === n && tune.sig[1] === w && tune.sig[2] === h;
  const [p0, p1] = src.peak || [Math.floor(n * 0.4), Math.floor(n * 0.6)];
  const fr = ok ? tune.fr : Math.min(n - 1, Math.round((p0 + p1) / 2));
  const hip = ok ? tune.hip : [0, Math.round(ay * 0.55)];
  const tip = ok ? tune.tip : [w - ax - 4, kind === 'kick' ? hip[1] : Math.round(ay * 0.8)];   // neznámy sprite: noha vodorovne
  const rot = (ok && tune.rot != null ? tune.rot : AIR_ROT[kind]) * Math.PI / 180;
  let k = ok && tune.k != null ? tune.k : AIR_SHEAR[kind];
  if (k == null)                        // kop: skosenie tak, aby noha po otočení mierila AIR_AIM° pod vodorovnú
    k = clamp(Math.tan(Math.atan2(tip[1] - hip[1], tip[0] - hip[0])) + Math.tan(AIR_AIM * Math.PI / 180 - rot), -0.3, 0.8);
  const px = ax + hip[0], py = ay - hip[1];                     // bedrá v súradniciach snímky
  const steps = [[rot * 0.55, k * 0.55], [rot, k]];              // snímka 0 = nástup (startup), 1 = póza do dopadu
  const tf = (x, y, r, kk) => { const c = Math.cos(r), s = Math.sin(r), yy = y + kk * x; return [x * c - yy * s, x * s + yy * c]; };
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (const [r, kk] of steps) for (const [cx, cy] of [[-px, -py], [w - px, -py], [-px, h - py], [w - px, h - py]]) {
    const [tx, ty] = tf(cx, cy, r, kk); x0 = Math.min(x0, tx); x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty);
  }
  const cw = Math.ceil(x1 - x0) + 2, ch = Math.ceil(y1 - y0) + 2, ox = Math.ceil(-x0) + 1, oy = Math.ceil(-y0) + 1;
  const canvas = document.createElement('canvas'); canvas.width = cw * 2; canvas.height = ch;
  const x = canvas.getContext('2d');
  x.imageSmoothingEnabled = true;
  steps.forEach(([r, kk], i) => {
    x.setTransform(1, 0, 0, 1, i * cw + ox, oy); x.rotate(r); x.transform(1, kk, 0, 1, 0, 0);
    x.drawImage(raw, fr * w, 0, w, h, -px, -py, w, h);
  });
  const [tx, ty] = tf(tip[0] - hip[0], hip[1] - tip[1], rot, k);   // kam mieri noha/päsť v póze (test, ladenie MOVE)
  return { canvas, a: { frames: 2, w: cw, h: ch, ax: ox - hip[0], ay: oy + hip[1], fps: 12, scale: src.scale, peak: [1, 1], air: kind,
    tip: [Math.round(hip[0] + tx), Math.round(hip[1] - ty)], tuned: ok } };
}
function airTrail(f) {                  // 3 slabnúce stopy v smere letu: miesta spred 3, 6, 9 snímok (z vx, vy → aj u hosťa)
  if ((f.state !== 'airkick' && f.state !== 'airpunch') || f.hitDone || f.onGround) return [];
  const out = [];
  for (const [d, al] of [[9, 0.12], [6, 0.2], [3, 0.32]])
    if (f.t > d) out.push([f.x - f.vx * d, f.y - f.vy * d + GRAVITY * d * (d - 1) / 2, al]);
  return out;
}
function animFor(f) {
  if (f.state === 'jump' && f.flip && FA[f.sid] && FA[f.sid].anims.flip && IMG[`${f.sid}/flip`])   // salto z AI videa
    return { name: 'flip', a: FA[f.sid].anims.flip, img: paletteStrip(f, 'flip', IMG[`${f.sid}/flip`]) };
  if (f.state === 'friendship' && IMG[`img/cake_${f.id}`]) return null;   // víťaz drží tortu (statický obrázok)
  const map = { idle: 'idle', walk: 'walk', jump: 'jump', airkick: 'airkick', airpunch: 'airpunch', block: 'block', blockstun: 'block', punch: 'punch', kick: 'kick',
                kiai: 'kiai', special: 'special', hit: 'hit', fall: 'fall', down: 'fall', getup: 'fall', dizzy: 'dizzy', deaf: 'deaf',
                dance: 'dance', win: 'win', kroj: 'kroj', baby: 'baby', friendship: 'win' };
  const fallback = { ...ANIM_FALLBACK, walk: 'idle', jump: 'idle', airkick: 'kick', airpunch: 'punch', deaf: 'dizzy', dance: 'hit', kroj: null, dizzy: 'hit', win: 'idle', baby: null, block: 'idle', hit: 'idle' };
  const set = (FA[f.sid] && FA[f.sid].anims) || {};
  if ((f.state === 'airkick' || f.state === 'airpunch') && !(set[f.state] && IMG[`${f.sid}/${f.state}`])) {   // vlastný sprite má prednosť
    const p = airPose(f, f.state === 'airkick' ? 'kick' : 'punch');
    if (p) return p;
  }
  let name = map[f.state] || f.state;
  while (name && !(set[name] && IMG[`${f.sid}/${name}`])) name = name in fallback ? fallback[name] : null;
  // postava s AI spritmi nikdy neprepne na kreslenú náhradu (okrem bábätka a kroja, tie majú vlastné kreslenie)
  if (!name && !['baby', 'kroj', 'fall', 'down', 'getup'].includes(f.state) && set.idle && IMG[`${f.sid}/idle`]) name = 'idle';
  return name ? { name, a: set[name], img: paletteStrip(f, name, IMG[`${f.sid}/${name}`]) } : null;
}
function frameOf(f, anim) {
  const a = anim.a, n = a.frames, t = f.t, fps = a.fps || 12;
  const once = Math.min(n - 1, Math.floor(t * fps / 60));
  switch (f.state) {
    case 'punch': case 'kick': case 'kiai': case 'special': case 'airkick': case 'airpunch': {   // póza vo vzduchu: 0 = nástup, 1 = do dopadu
      const m = MOVE[f.move];
      if (anim.name === 'idle') return Math.floor(t * fps / 60) % n;
      const [p0, p1] = a.peak || [Math.floor(n * 0.4), Math.floor(n * 0.6)];
      if (t < m.startup) return Math.floor(t / m.startup * p0);
      if (t < m.startup + m.active) return Math.min(p1, p0 + Math.floor((t - m.startup) / Math.max(1, m.active) * (p1 - p0 + 1)));
      const r = (t - m.startup - m.active) / Math.max(1, m.recovery);
      return Math.min(n - 1, p1 + 1 + Math.floor(r * (n - 1 - p1)));
    }
    case 'down': return n - 1;
    case 'getup': return Math.max(0, n - 1 - Math.floor(t * 18 / 60));
    default:
      if (ATTACK_STATES.has(f.state) && f.move && MOVE[f.move] && anim.name !== 'idle') {
        const m = MOVE[f.move], [p0, p1] = a.peak || [Math.floor(n * 0.4), Math.floor(n * 0.6)];
        if (t < m.startup) return Math.floor(t / m.startup * p0);
        if (t < m.startup + m.active) return Math.min(p1, p0 + Math.floor((t - m.startup) / Math.max(1, m.active) * (p1 - p0 + 1)));
        return Math.min(n - 1, p1 + 1 + Math.floor((t - m.startup - m.active) / Math.max(1, m.recovery) * (n - 1 - p1)));
      }
      return Math.floor(t * fps / 60) % n;
    case 'jump':
      if (anim.name === 'flip') {                 // salto rozložené na celý čas vo vzduchu; dozadu = odzadu
        const k = Math.min(n - 1, Math.floor(t / (2 * JUMP_V / GRAVITY) * n));
        return Math.sign(f.vx || f.flip) === f.facing ? k : n - 1 - k;
      }
      return once;
    case 'hit': case 'fall': case 'block': case 'blockstun': case 'win': return once;
  }
}
// prefarbenie spritov: f.def.palette = 'hue:120' (posun farieb), 'shadow' (čierna silueta) alebo meno z PALETTES (modul)
const PAL_CACHE = {};
PALETTES.shadow = (x, w, h) => { x.globalCompositeOperation = 'source-in'; x.fillStyle = '#0d0b14'; x.fillRect(0, 0, w, h); };
function paletteStrip(f, name, img) {
  const p = f.def.palette; if (!p || !img) return img;
  const key = p + '/' + f.sid + '/' + name;
  if (PAL_CACHE[key]) return PAL_CACHE[key];
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  try {
    if (String(p).startsWith('hue:')) { x.filter = `hue-rotate(${parseFloat(String(p).slice(4))}deg) saturate(1.25)`; x.drawImage(img, 0, 0); x.filter = 'none'; }
    else { x.drawImage(img, 0, 0); (PALETTES[p] || (() => {}))(x, c.width, c.height); }
  } catch (e) { console.warn('paleta', p, e); }
  return (PAL_CACHE[key] = c);
}
const SILHOUETTE = {};
function silhouette(f, anim, fr) {
  const key = `${f.sid}/${f.def.palette || ''}/${anim.name}/${fr}`;
  if (SILHOUETTE[key]) return SILHOUETTE[key];
  const a = anim.a, c = document.createElement('canvas'); c.width = a.w; c.height = a.h;
  const x = c.getContext('2d'); x.drawImage(anim.img, fr * a.w, 0, a.w, a.h, 0, 0, a.w, a.h);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffd23a'; x.fillRect(0, 0, a.w, a.h);
  return (SILHOUETTE[key] = c);
}
function drawAura(f, anim, fr) {
  const t = performance.now() / 70;
  if (Math.random() < 0.5) F.fx.push({ kind: 'spark', x: f.x + rnd(-24, 24), y: f.y - rnd(10, 140), vx: 0, vy: -rnd(0.8, 1.8), c: chance(0.5) ? '#fff3a0' : '#ffc21a', t: 0, life: 18 });
  if (!anim) {
    const g = ctx.createRadialGradient(f.x, f.y - 70, 10, f.x, f.y - 70, 80);
    g.addColorStop(0, 'rgba(255,220,60,0.45)'); g.addColorStop(1, 'rgba(255,200,0,0)');
    ctx.fillStyle = g; ctx.fillRect(f.x - 80, f.y - 160, 160, 170); return;
  }
  const a = anim.a, sc = a.scale || 1, sil = silhouette(f, anim, fr);
  ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y)); if (f.facing < 0) ctx.scale(-1, 1);
  if (f.def.scale) ctx.scale(f.def.scale, f.def.scale);
  ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t);
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -4], [-2, -3], [2, -3], [0, 2]])
    ctx.drawImage(sil, Math.round(-a.ax * sc) + dx, Math.round(-a.ay * sc) + dy, Math.round(a.w * sc), Math.round(a.h * sc));
  ctx.restore();
}
function drawFighter(f) {
  if (RES > 1 && f.def && f.def.blocky) { ctx.save(); ctx.imageSmoothingEnabled = false; try { return drawFighterRaw(f); } finally { ctx.restore(); } }   // BLOCKY ostane kockatý aj vo vysokom rozlíšení
  return drawFighterRaw(f);
}
// 2× pásy (sprites.json "src2") pre veľké displeje: načítajú sa na pozadí až po štarte a len na počítači (mobil ich nesťahuje)
const HI = {};
function loadHires() {
  if (loadHires.started || RES < 2 || matchMedia('(pointer: coarse)').matches) return;
  loadHires.started = true;
  const list = [], keys = {};
  for (const [id, f] of Object.entries(FA)) for (const [anim, a] of Object.entries(f.anims || {})) if (a.src2) list.push([`${id}/${anim}`, a.src2]);
  for (const [anim, a] of Object.entries((A.rocky && A.rocky.anims) || {})) if (a.src2) list.push([`rocky/${anim}`, a.src2]);
  for (const [key, src] of list) {
    if (keys[src]) { keys[src].push(key); continue; }
    keys[src] = [key];
    const im = new Image(); im.onload = () => { for (const k of keys[src]) HI[k] = im; }; im.src = src;
  }
}
function drawStrip(f, anim, fr, dx, dy, dw, dh) {     // snímka postavy: pri RES > 1 z 2× pásu (rovnaké snímky aj výrez), inak 1×
  const a = anim.a, hi = RES > 1 && HI[`${f.sid}/${anim.name}`];
  if (hi && hi.width === a.w * a.frames * 2 && hi.height === a.h * 2)
    ctx.drawImage(paletteStrip(f, anim.name + '@2', hi), fr * a.w * 2, 0, a.w * 2, a.h * 2, dx, dy, dw, dh);
  else ctx.drawImage(anim.img, fr * a.w, 0, a.w, a.h, dx, dy, dw, dh);
}
function drawFighterRaw(f) {
  const anim = animFor(f);
  const flashing = f.flash > 0 && f.flash % 4 < 2;
  if (f.ssj && f.state !== 'baby') drawAura(f, anim, anim ? frameOf(f, anim) : 0);
  if (anim && anim.name !== 'flip' && f.state === 'jump' && f.flip) {   // záloha bez videa salta: schúlená snímka sa točí
    const a = anim.a, sc = (a.scale || 1) * (f.def.scale || 1), fr = a.tuck ?? Math.floor(a.frames / 2);
    const ang = Math.min(1, f.t / (2 * JUMP_V / GRAVITY)) * Math.PI * 2 * Math.sign(f.vx || f.flip);
    ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y - a.h * sc * 0.55)); ctx.rotate(ang); if (f.facing < 0) ctx.scale(-1, 1);
    drawStrip(f, anim, fr, Math.round(-a.w * sc / 2), Math.round(-a.h * sc / 2), Math.round(a.w * sc), Math.round(a.h * sc));
    ctx.restore();
  } else if (anim) {
    const a = anim.a, fr = frameOf(f, anim), sc = a.scale || 1;
    for (const [tx, ty, al] of airTrail(f)) {   // stopy kopu/úderu vo vzduchu (za postavou v smere letu)
      ctx.save(); ctx.globalAlpha = al; ctx.translate(Math.round(tx), Math.round(ty)); if (f.facing < 0) ctx.scale(-1, 1);
      if (f.def.scale) ctx.scale(f.def.scale, f.def.scale);
      drawStrip(f, anim, fr, Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc));
      ctx.restore();
    }
    ctx.save();
    ctx.translate(Math.round(f.x), Math.round(f.y));
    if (f.facing < 0) ctx.scale(-1, 1);
    if (f.def.scale) ctx.scale(f.def.scale, f.def.scale);
    drawStrip(f, anim, fr, Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc));
    ctx.restore();
    if (flashing) { ctx.save(); ctx.globalAlpha = 0.35; ctx.globalCompositeOperation = 'lighter'; ctx.translate(Math.round(f.x), Math.round(f.y)); if (f.facing < 0) ctx.scale(-1, 1);
      if (f.def.scale) ctx.scale(f.def.scale, f.def.scale);
      drawStrip(f, anim, fr, Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc)); ctx.restore(); }
  } else if (f.state === 'baby') {
    drawBaby(f);
  } else if (f.state === 'friendship' && IMG[`img/cake_${f.sid}`]) {
    const im = IMG[`img/cake_${f.sid}`];
    ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y)); if (f.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, Math.round(-im.width / 2), -im.height); ctx.restore();
  } else {
    const look = f.state === 'kroj' ? { gi: '#ffffff', giDark: '#1b1b1b', belt: '#c0392b', hair: f.def.hair } : f.def;
    let rot = 0;
    if (f.state === 'fall') rot = -Math.min(1.45, f.t * 0.09);
    if (f.state === 'down') rot = -1.5;
    if (f.state === 'getup') rot = -1.5 + Math.min(1.5, f.t * 0.075);
    const bob = f.state === 'idle' ? Math.round(Math.sin(f.t / 9) * 1.5) : 0;
    for (const [tx, ty, al] of airTrail(f)) { ctx.save(); ctx.globalAlpha = al; drawFigure(Math.round(tx), Math.round(ty), f.facing, poseFor(f), look, {}); ctx.restore(); }
    ctx.save();
    if (flashing) ctx.globalAlpha = 0.6;
    drawFigure(Math.round(f.x), Math.round(f.y), f.facing, poseFor(f), look, { rot, bob });
    ctx.restore();
    if (f.state === 'kroj') drawKrojHat(f);
  }
  drawProp(f);
  if (f.state === 'dizzy' || f.state === 'deaf') drawStars(f);
  if (f.state === 'deaf' && f.t % 30 < 15) text('ÍÍÍÍ!', f.x, f.y - 150, 10, 'center', '#ff7070');
}
function drawKrojHat(f) {
  const p = poseFor(f).hd, x = f.x + p[0] * f.facing, y = f.y + p[1];
  ctx.fillStyle = '#111'; ctx.fillRect(x - 12, y - 10, 24, 3); ctx.fillRect(x - 7, y - 16, 14, 7);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 7, y - 11, 14, 2);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(f.x - 8, f.y - 104, 16, 30);
}
function drawBaby(f) {
  const x = Math.round(f.x), y = f.y, bounce = Math.abs(Math.sin(f.t / 8)) * 4;
  const im = IMG[`img/baby_${f.id}`];
  if (im) { ctx.drawImage(im, Math.round(x - im.width / 2), Math.round(y - im.height - bounce)); }
  else {
    ctx.fillStyle = f.def.gi; ctx.fillRect(x - 12, y - 22 - bounce, 10, 16); ctx.fillRect(x + 2, y - 22 - bounce, 10, 16);
    ctx.fillStyle = f.def.gi; ctx.fillRect(x - 11, y - 44 - bounce, 22, 24);
    ctx.fillStyle = '#e3a97f'; ctx.beginPath(); ctx.arc(x, y - 56 - bounce, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f.def.hair; ctx.fillRect(x - 4, y - 72 - bounce, 8, 4);
    ctx.fillStyle = '#000'; ctx.fillRect(x - 6, y - 58 - bounce, 3, 3); ctx.fillRect(x + 3, y - 58 - bounce, 3, 3);
    ctx.fillStyle = '#7fc8ff'; if (f.t % 20 < 12) { ctx.fillRect(x - 7, y - 54 - bounce + (f.t % 20), 2, 4); ctx.fillRect(x + 5, y - 54 - bounce + (f.t % 20), 2, 4); }
  }
  if (f.t % 40 < 26) text('BUÁÁÁ!', x, y - 84, 10, 'center', '#7fc8ff');
}
function drawStars(f) {
  const cx = f.x, cy = f.y - Math.round((f.def.height || 140) * (f.def.scale || 1) + 6);   // nad hlavou aj pri bossovi či Rockym
  for (let i = 0; i < 3; i++) {
    const a = f.t / 9 + i * Math.PI * 2 / 3, x = cx + Math.cos(a) * 14, y = cy + Math.sin(a) * 4;
    ctx.fillStyle = '#ffe23a'; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 3, 3, 7); ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 7, 3);
  }
}
function drawRocky(r) {
  const im = IMG[`rocky/${r.state}`], a = A.rocky && A.rocky.anims && A.rocky.anims[r.state];
  const x = Math.round(r.x), y = r.y ?? GROUND;
  if (im && a) {
    const fr = Math.floor(r.t * (a.fps || 12) / 60) % a.frames, sc = a.scale || 1;
    ctx.save(); ctx.translate(x, y); if (r.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, fr * a.w, 0, a.w, a.h, Math.round(-a.ax * sc), Math.round(-a.ay * sc), Math.round(a.w * sc), Math.round(a.h * sc));
    ctx.restore(); return;
  }
  const d = r.dir, run = r.state === 'run', ph = r.t / 4;
  const by = y - 30 - (run ? Math.abs(Math.sin(ph)) * 3 : 0) - (r.state === 'lick' ? 14 : 0);
  ctx.fillStyle = '#d9a441';
  ctx.beginPath(); ctx.ellipse(x, by, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c48f2f'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) { const lx = x + (i < 2 ? 12 : -14) * 1 + (i % 2) * 5 - 2, sw = run ? Math.sin(ph + i * 1.6) * 6 : 0; ctx.beginPath(); ctx.moveTo(lx, by + 6); ctx.lineTo(lx + sw * d, by + 22); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x - 20 * d, by - 3); ctx.lineTo(x - 32 * d, by - 12 + Math.sin(r.t / 3) * 6); ctx.stroke();
  ctx.fillStyle = '#e0b04f'; ctx.beginPath(); ctx.arc(x + 24 * d, by - 10, 9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 32 * d, by - 7, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b07a26'; ctx.beginPath(); ctx.ellipse(x + 19 * d, by - 8, 4, 8, 0.3 * d, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(x + 37 * d - 2, by - 9, 3, 3); ctx.fillRect(x + 26 * d - 1, by - 14, 2, 2);
  if (r.state === 'lick' && r.t % 18 < 10) { ctx.fillStyle = '#ff7aa8'; ctx.fillRect(x + 36 * d - 2, by - 3, 4, 7); }
}

// ===================================================================== kreslenie: scéna
// rozhýbané pozadie arény ako v MK2: slučka z AI videa (assets/stages/<id>.mp4); kým nie je pripravené, kreslí sa obrázok
const STAGE_VIDEO = {};
function stageVideo(st) {
  if (!st.video) return null;
  let v = STAGE_VIDEO[st.id];
  if (!v) {
    v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.src = st.video;
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v); STAGE_VIDEO[st.id] = v;
  }
  if (v.paused) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
  return v.readyState >= 2 ? v : null;
}
function pauseStageVideos(except) { for (const [id, v] of Object.entries(STAGE_VIDEO)) if (id !== except && !v.paused) v.pause(); }
function drawStage(st) {
  pauseStageVideos(st.id);
  const vid = stageVideo(st);
  if (vid) { ctx.drawImage(vid, 0, 0, W, H); return; }
  const im = IMG['stage/' + st.id];
  if (im) { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; ctx.drawImage(im, 0, 0, W, H); ctx.imageSmoothingEnabled = sm; return; }   // aréna 960×540 → hladko aj pri RES 1
  const t = performance.now() / 1000;
  if (st.id === 'potok') {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f6b26b'); g.addColorStop(0.55, '#9fc5e8'); g.addColorStop(1, '#3d5a2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4d6b35'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(i * 60 - 20, 190); ctx.lineTo(i * 60 + 20, 110 + (i % 3) * 18); ctx.lineTo(i * 60 + 60, 190); ctx.fill(); }
    ctx.fillStyle = '#3f87c7'; ctx.fillRect(0, 196, W, 26);
    ctx.fillStyle = '#9ecbf0'; for (let i = 0; i < 16; i++) ctx.fillRect((i * 37 + t * 30) % W, 200 + (i % 4) * 5, 10, 2);
    ctx.fillStyle = '#5b5348'; ctx.fillRect(0, 222, W, H - 222);
    ctx.fillStyle = '#6f6658'; for (let i = 0; i < 12; i++) ctx.fillRect(i * 44 + 6, 230 + (i % 3) * 8, 20, 8);
  } else if (st.id === 'dojo') {
    ctx.fillStyle = '#6b3f1e'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f3e3c3'; for (let i = 0; i < 6; i++) ctx.fillRect(18 + i * 78, 40, 62, 120);
    ctx.fillStyle = '#4a2a12'; for (let i = 0; i < 6; i++) { ctx.fillRect(18 + i * 78 + 30, 40, 2, 120); ctx.fillRect(18 + i * 78, 98, 62, 2); }
    ctx.fillStyle = '#b3281e'; ctx.fillRect(196, 12, 88, 22); text('OSU!', 240, 30, 16, 'center', '#ffe9a8');
    ctx.fillStyle = '#a5743f'; ctx.fillRect(0, 170, W, H - 170);
    ctx.fillStyle = '#8c5f30'; for (let i = 0; i < 12; i++) ctx.fillRect(0, 176 + i * 8, W, 1);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070b22'); g.addColorStop(0.7, '#1d2a52'); g.addColorStop(1, '#0d0d0d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e8e6c8'; ctx.beginPath(); ctx.arc(390, 46, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % W, (i * 53) % 110, 1, 1);
    ctx.fillStyle = '#0b1a12'; for (let i = 0; i < 14; i++) { const x = i * 36 - 10, h = 70 + (i * 29) % 50; ctx.beginPath(); ctx.moveTo(x, 214); ctx.lineTo(x + 18, 214 - h); ctx.lineTo(x + 36, 214); ctx.fill(); }
    ctx.fillStyle = '#3a4d2c'; [[70, 214], [330, 214]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40, y - 46); ctx.lineTo(x + 80, y); ctx.fill(); });
    ctx.fillStyle = '#20180f'; ctx.fillRect(0, 214, W, H - 214);
    const fl = Math.sin(t * 13) * 3;
    ctx.fillStyle = '#ff7b1a'; ctx.beginPath(); ctx.moveTo(228, 222); ctx.lineTo(240, 194 + fl); ctx.lineTo(252, 222); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(234, 222); ctx.lineTo(240, 204 - fl); ctx.lineTo(246, 222); ctx.fill();
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(226, 222, 28, 4);
  }
}
function drawShadow(f) {
  if (f.state === 'baby') return;
  const h = GROUND - f.y, w = clamp(26 - h / 6, 10, 26);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(f.x, GROUND + 1, w, 4, 0, 0, Math.PI * 2); ctx.fill();
}
function drawNotes() {
  for (const n of F.notes) {
    for (let i = 0; i < 3; i++) {
      const x = n.x - n.vx * i * 4, y = n.y + Math.sin((n.t + i * 7) / 5) * 8 - i * 4;
      text(i % 2 ? '♫' : '♪', x, y, 16, 'center', ['#ffe23a', '#7dfcff', '#ff8af0'][i]);
    }
  }
  for (const f of F.fighters) {            // nabíjanie energie v dlaniach
    if (f.state !== 'kiai' || f.t >= MOVE.kiai.startup) continue;
    const r = 3 + f.t * 0.7, x = f.x + f.facing * 30, y = f.y - 100;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(120,210,255,0.9)'); g.addColorStop(1, 'rgba(40,120,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
  }
  for (const bm of F.beams) {
    const a = bm.t < 24 ? 1 : Math.max(0, 1 - (bm.t - 24) / 10), x0 = bm.x, x1 = bm.x + bm.dir * bm.len;
    const lx = Math.min(x0, x1), w = Math.abs(x1 - x0), wob = Math.sin(bm.t * 1.7) * 1.5;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(60,150,255,0.35)'; ctx.fillRect(lx, bm.y - 13 - wob, w, 26 + wob * 2);
    ctx.fillStyle = 'rgba(140,215,255,0.85)'; ctx.fillRect(lx, bm.y - 7, w, 14);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(lx, bm.y - 3, w, 6);
    const g = ctx.createRadialGradient(x1, bm.y, 0, x1, bm.y, 20);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(130,210,255,0.95)'); g.addColorStop(1, 'rgba(40,120,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x1, bm.y, 20, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (bm.t < 26) text('KIAI!', bm.owner.x, bm.owner.y - 156, 14, 'center', '#7fd4ff');
  }
}
function drawFx() {
  for (const p of F.fx) {
    const a = 1 - p.t / p.life;
    if (p.kind === 'spark') { ctx.fillStyle = p.c; ctx.globalAlpha = a; ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 3); ctx.globalAlpha = 1; }
    else if (p.kind === 'heart') { ctx.globalAlpha = a; text('♥', p.x, p.y, 12, 'center', '#ff5d8f'); ctx.globalAlpha = 1; }
    else if (p.kind === 'note') { ctx.globalAlpha = a; text(p.t % 20 < 10 ? '♪' : '♫', p.x, p.y, 14, 'center', '#ffe23a'); ctx.globalAlpha = 1; }
    else if (p.kind === 'confetti') { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 3, 4); }
    else if (p.kind === 'block') { ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x) - 3, Math.round(p.y) - 3, 6, 6); ctx.globalAlpha = 1; }
  }
}
function drawCracks() {
  for (const c of F.cracks) {
    const a = c.t < 120 ? 1 : 1 - (c.t - 120) / 50;
    ctx.save(); ctx.globalAlpha = a;
    if (c.t < 6) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, 0, W, H); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'miter';
    for (const pts of c.lines) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + 1, y + 1) : ctx.moveTo(x + 1, y + 1)); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(235,250,255,0.95)'; ctx.lineWidth = 1.2;
    for (const pts of c.lines) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(c.cx, c.cy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
function drawHUD() {
  const [a, b] = F.fighters;
  const bar = (x, f, right) => {
    ctx.fillStyle = '#000'; ctx.fillRect(x - 2, 8, 194, 16);
    ctx.fillStyle = '#b3241b'; ctx.fillRect(x, 10, 190, 12);
    const w = Math.round(190 * clamp(f.shownHp, 0, f.maxHp) / f.maxHp);
    ctx.fillStyle = '#2fbf3a'; right ? ctx.fillRect(x + 190 - w, 10, w, 12) : ctx.fillRect(x, 10, w, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; right ? ctx.fillRect(x + 190 - w, 10, w, 3) : ctx.fillRect(x, 10, w, 3);
    text(f.def.name, right ? x + 186 : x + 4, 20, 9, right ? 'right' : 'left', '#ffe066');
    const meters = [[keyHint(f.side, 'kiai') + (f.def.kiaiName || 'KIAI'), 1 - f.cd.kiai / KIAI_CD, '#ff9f1a'], [keyHint(f.side, 'special') + f.def.specialName, 1 - f.cd.special / SPECIAL_CD, '#7dfcff']];
    meters.forEach(([lbl, v, col], i) => {
      const mx = right ? x + 190 - 60 - i * 66 : x + i * 66, my = 27;
      ctx.fillStyle = '#000'; ctx.fillRect(mx - 1, my - 1, 62, 6);
      ctx.fillStyle = v >= 1 ? col : '#555'; ctx.fillRect(mx, my, Math.round(60 * clamp(v, 0, 1)), 4);
      text(lbl, mx + (right ? 60 : 0), my + 13, 7, right ? 'right' : 'left', v >= 1 ? col : '#999');
    });
  };
  bar(12, a, false); bar(W - 12 - 190, b, true);
  text(String(Math.max(0, Math.ceil(F.timer / 60))).padStart(2, '0'), W / 2, 25, 18, 'center', '#ffd200');
  for (let i = 0; i < F.wins[0]; i++) medal(18 + i * 13, 50);
  for (let i = 0; i < F.wins[1]; i++) medal(W - 18 - i * 13, 50);
}
function medal(x, y) {
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b07a00'; ctx.fillRect(x - 1, y - 3, 2, 6);
}
function drawBanners() {
  for (const bn of F.banners) {
    const k = Math.min(1, bn.t / 8), size = Math.round(bn.size * (1.6 - 0.6 * k));
    ctx.save(); ctx.globalAlpha = bn.t > bn.life - 10 ? (bn.life - bn.t) / 10 : 1;
    bigText(bn.text, W / 2, bn.y, size, bn.sub);
    ctx.restore();
  }
}
function drawFight() {
  ctx.save();
  if (F.shake > 0) ctx.translate(Math.round(rnd(-F.shake, F.shake)), Math.round(rnd(-F.shake, F.shake) * 0.6));
  drawStage(F.stage);
  callAll(hooks.drawBack, F.stage, F);
  if (F.phase === 'finisher' || F.phase === 'finish') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, W, H); }
  for (const f of F.fighters) drawShadow(f);
  const order = [...F.fighters].sort((p, q) => (p.attacking ? 1 : 0) - (q.attacking ? 1 : 0));
  for (const f of order) drawFighter(f);
  if (F.rocky) drawRocky(F.rocky);
  if (F.creeper && F.creeper.state !== 'gone') drawCreeper(F.creeper);
  drawNotes(); drawFx();
  callAll(hooks.drawFront, F.stage, F);
  ctx.restore();
  drawCracks();
  drawHUD();
  drawBanners();
  if (F.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${F.flash / 20})`; ctx.fillRect(0, 0, W, H); }
  if (F.round === 1 && (F.phase === 'intro' || (F.phase === 'fight' && F.t < 240))) {
    if (inputKind(0) === 'touch') text(legend(0, F.fighters[0].id), W / 2, 264, 7, 'center', '#cfe6ff');
    else text(legend(0, F.fighters[0].id), 8, 264, 7, 'left', '#cfe6ff');
    text(legend(1, F.fighters[1].id), W - 8, 264, 7, 'right', '#ffd0d0');
  }
  if (F.phase === 'finish') {
    const w = F.fighters[F.winner];
    if (!hooks.finisher.length && !(w.ctl instanceof CPU) && F.t > 40 && F.t % 60 < 45) {   // bez finishers.js platia staré jednotlačidlové zakončenia
      text('KIAI = ROCKYALITY   ŠPECIÁL = ' + w.def.finisher.toUpperCase() + '   KOP = CREEPERALITY   ÚDER = FRIENDSHIP', W / 2, 250, 8, 'center', '#fff');
    }
  }
  if (F.ending === 'achievement') drawAchievement(F.endT, F.endText);
  if (F.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    bigText('PAUZA', W / 2, 120, 40);
    if (inputKind(0) === 'touch') text('START = pokračovať     ťukni sem = menu', W / 2, 150, 10, 'center');
    else text('ESC = pokračovať    Q = koniec    H = hudba    M = všetok zvuk', W / 2, 150, 10, 'center');
  }
}

// ===================================================================== scény
let scene = 'loading', sceneT = 0;
const toast = { text: '', t: 0 };
function showToast(t) { toast.text = t; toast.t = 100; }
const confetti = [];
function setScene(s) { if (scene === 'title' && s !== 'title') stopTitleVoice(); scene = s; sceneT = 0; if (s === 'select') { game.locked = [false, false]; game.picks = [null, null]; game.vsAt = 0; } if (s === 'result') music('result'); }

MENU.push(
  { label: '1 HRÁČ', act() { game.mode = 1; setScene('select'); } },
  { label: '2 HRÁČI', act() {
      if (hasTouch && !keyboardSeen && pads().length < 2) { game.msg = 'Na 2 hráčov treba klávesnicu alebo 2 ovládače'; game.msgT = 180; return; }
      game.mode = 2; setScene('select'); } },
  { label: 'OVLÁDANIE', act() { setScene('controls'); } },
  { label: () => musicOn ? 'HUDBA: ZAP' : 'HUDBA: VYP', act() { toggleMusic(); } },
);
function menuLayout() {                  // pri 6+ položkách sa znak a nápis posunú vyššie (drawTitle) a menu má viac miesta
  const n = MENU.length;
  if (n > 7) return { y0: 172, step: 11, compact: true };             // 8+ položiek (napr. SIEŇ SLÁVY)
  if (n > 5) return { y0: 174, step: 12, compact: true };
  return { y0: n > 4 ? 196 : 202, step: n > 4 ? Math.max(10, Math.floor(60 / n)) : 15 };
}
function updateTitle() {
  const n = MENU.length, L = menuLayout();
  const cur = curMenu(), m = cur.length, y0 = menuItemsY0();
  if (menu.tapPos) {
    const i = Math.floor((menu.tapPos.y - (y0 - 11)) / L.step);
    if (i >= 0 && i < m && Math.abs(menu.tapPos.x - W / 2) < 90) game.menuIdx = i;
    else menu.ok = false;                                 // ťuk mimo položiek nič nespustí
  }
  if (menu.up) { game.menuIdx = (game.menuIdx + m - 1) % m; sfx('select'); }
  if (menu.down) { game.menuIdx = (game.menuIdx + 1) % m; sfx('select'); }
  if (game.msgT > 0) game.msgT--;
  if (menu.back && game.submenu) { closeSubmenu(); sfx('select'); return; }
  if (menu.ok && sceneT > 20) {
    sfx('confirm');
    const it = cur[clamp(game.menuIdx, 0, m - 1)];
    if (it.back) closeSubmenu();
    else if (it.sub) openSubmenu(it.sub);
    else { if (game.submenu) closeSubmenu(); it.act(); }
  }
}
// podmenu SINGLE PLAYER / MULTIPLAYER (Peťo 2. 10.: menu bolo neprehľadné)
const SUBMENU = {};
function curMenu() { return (game.submenu && SUBMENU[game.submenu]) || MENU; }
function menuItemsY0() { const L = menuLayout(); return game.submenu ? L.y0 + L.step + 4 : L.y0; }   // v podmenu je nad položkami nadpis
function openSubmenu(id) { game.subParent = game.menuIdx; game.submenu = id; game.menuIdx = 0; }
function closeSubmenu() { game.submenu = null; game.menuIdx = game.subParent || 0; }
function groupMenu() {                    // po načítaní modulov: položky hier presunie do podmenu
  const lab = it => (typeof it.label === 'function' ? it.label() : it.label);
  const take = l => { const i = MENU.findIndex(it => lab(it) === l); return i >= 0 ? MENU.splice(i, 1)[0] : null; };
  const hora = take('HORA (1 HRÁČ)'), one = take('1 HRÁČ'), two = take('2 HRÁČI'), net = take('HRA CEZ SIEŤ');
  SUBMENU.single = [hora && { label: 'HORA — výstup na vrchol', act: hora.act, hint: 'Vyber si vežu a choď súper za súperom až k bossovi MASTER STORM' },
    one && { label: 'JEDEN ZÁPAS', act: one.act, hint: 'Zápas proti počítaču' }, { label: '◀ SPÄŤ', back: true, hint: '' }].filter(Boolean);
  SUBMENU.multi = [two && { label: 'NA JEDNOM POČÍTAČI', act: two.act, hint: 'Dvaja na jednej klávesnici alebo s dvoma ovládačmi PS' },
    net && { label: 'CEZ SIEŤ', act: net.act, hint: 'Každý na svojom mobile alebo počítači (treba internet)' }, { label: '◀ SPÄŤ', back: true, hint: '' }].filter(Boolean);
  MENU.unshift({ label: 'MULTIPLAYER', sub: 'multi', act() { openSubmenu('multi'); } });
  MENU.unshift({ label: 'SINGLE PLAYER', sub: 'single', act() { openSubmenu('single'); } });
  const ov = MENU.find(it => it.label === 'OVLÁDANIE');
  if (ov) { ov.label = 'OVLÁDANIE A ÚDERY'; ov.hint = 'Klávesy, ovládač, mobil, špeciálne údery a schopnosti postáv'; }   // Peťo: špeciálne údery hneď nenašiel
  game.menuIdx = 0;
}
// blahoželanie len týždeň pred a týždeň po Matúšových narodeninách (3. 10. → 26. 9.–10. 10., Peťo), každý rok so správnym vekom;
// zvyšok roka je len v CREDITS v menu — hra sa dá hrať celý rok
function birthday(now = new Date()) {
  if (game.forceBirthday === false) return null;
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const on = game.forceBirthday === true || (m === 8 && d >= 26) || (m === 9 && d <= 10);
  return on ? { age: y - 2014, name: 'MATÚŠKO' } : null;
}
function drawTitle() {
  const g = ctx.createRadialGradient(W / 2, 110, 10, W / 2, 110, 300);
  g.addColorStop(0, '#5a0d0d'); g.addColorStop(1, '#0a0000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const em = IMG['img/emblem'], compact = menuLayout().compact, eh = compact ? 94 : 120;
  if (em) { const s = eh / em.height; ctx.globalAlpha = 0.9; ctx.drawImage(em, W / 2 - em.width * s / 2, compact ? 4 : 8, em.width * s, eh); ctx.globalAlpha = 1; }
  else {
    ctx.strokeStyle = '#c99a2e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(W / 2, 64, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#7a5a12'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W / 2, 64, 42, 0, Math.PI * 2); ctx.stroke();
    drawRocky({ x: W / 2 - 4, y: 94, dir: 1, state: 'sit', t: sceneT });
  }
  drawLogoTitle(W / 2, compact ? 124 : 150, compact ? 36 : 40, sceneT);
  bigText('XII', W / 2, compact ? 156 : 186, compact ? 28 : 34, true);
  const L = menuLayout(), fs = MENU.length > 4 ? 10 : 11, cur = curMenu(), y0 = menuItemsY0();
  if (game.submenu) text(MENU.find(it => it.sub === game.submenu).label, W / 2, L.y0, 11, 'center', '#ff9f1a');
  cur.forEach((it, i) => { const lb = typeof it.label === 'function' ? it.label() : it.label;
    text((i === game.menuIdx ? '▶ ' : '  ') + lb, W / 2 - (game.submenu ? 70 : 44), y0 + i * L.step, fs, 'left', i === game.menuIdx ? '#ffd200' : '#bbb'); });
  const bd = birthday(), hint = cur[game.menuIdx] && cur[game.menuIdx].hint;
  if (game.msgT > 0) text(game.msg, W / 2, 264, 9, 'center', '#ffcf6e');
  else if (!audioUnlocked && (padUsed || sceneT > 240)) text('ZVUK: klikni myšou alebo stlač kláves', W / 2, 264, 9, 'center', '#9fd8ff');
  else if (hint) text(hint, W / 2, 264, 9, 'center', '#cfe6ff');
  else if (bd && sceneT % 60 < 40) text(`Všetko najlepšie k ${bd.age}. narodeninám, Matúško!`, W / 2, 264, 9, 'center', '#ffb3b3');
}
function controlPages() {                  // 1. strana základ, ďalšie z pomocníkov modulov ([pohyb, P1, P2, PS, dotyk])
  const pages = [{ title: 'OVLÁDANIE' }];
  if (api.moves && api.moves.help) pages.push({ title: 'ŠPECIÁLNE ÚDERY', rows: api.moves.help });
  const secret = [], mods = [api.glitch, api.vodnik, api.rocky, api.impostor, api.bananac, api.blocky].filter(m => m && m.help);
  for (const m of mods) {                  // riadky jednej postavy ostanú spolu, najviac 10 riadkov na stranu
    if (!secret.length || secret[secret.length - 1].length + m.help.length > 10) secret.push([]);
    secret[secret.length - 1].push(...m.help);
  }
  secret.forEach((rows, i) => pages.push({ title: secret.length > 1 ? `TAJNÉ POSTAVY ${i + 1}/${secret.length}` : 'TAJNÉ POSTAVY', rows }));
  if (api.enemies && api.enemies.help) pages.push({ title: 'SÚPERI Z HORY', rows: api.enemies.help });
  return pages;
}
function updateControls() {
  if (sceneT === 1) game.controlsPage = 0;
  const n = controlPages().length;
  if ((menu.left || menu.right) && n > 1) { game.controlsPage = ((game.controlsPage || 0) + (menu.right ? 1 : n - 1)) % n; sfx('select'); }
  else if (menu.tapPos && n > 1 && (game.controlsPage || 0) < n - 1) { game.controlsPage = (game.controlsPage || 0) + 1; sfx('select'); }   // ťuk = ďalšia strana
  else if ((menu.ok || menu.back) && sceneT > 10) { sfx('confirm'); setScene('title'); }
}
function drawControls() {
  ctx.fillStyle = '#0b0b14'; ctx.fillRect(0, 0, W, H);
  const pages = controlPages(), n = pages.length, page = Math.min(game.controlsPage || 0, n - 1), pg = pages[page];
  if (!pg.rows) {
    bigText('OVLÁDANIE', W / 2, 34, 26);
    const rows = [['', 'HRÁČ 1', 'HRÁČ 2', 'OVLÁDAČ PS'], ['pohyb', 'A / D', '← / →', 'páčka / šípky'], ['skok', 'W', '↑', 'hore'],
      ['blok', 'S', '↓', 'L1 / R1'], ['úder', 'F', 'K / num 1', '□'], ['kop', 'G', 'L / num 2', '✕'], ['KIAI', 'R', 'I / num 4', '○'], ['špeciál', 'T', 'O / num 5', '△']];
    rows.forEach((r, i) => r.forEach((c, j) => text(c, [70, 170, 270, 380][j], 64 + i * 18, 10, 'center', i === 0 ? '#ffd200' : '#fff')));
    text('HRÁČ 2: šípky + numerická klávesnica 1 2 4 5 (aj pri vypnutom NumLocku)', W / 2, 210, 8, 'center', '#9fd8ff');
    text('FINISH HIM: kombá sa ukážu na obrazovke, na mobile ich stačí ťuknúť', W / 2, 222, 8, 'center', '#ff9f9f');
  } else {
    bigText(pg.title, W / 2, 34, 22);
    const rows = [['', 'HRÁČ 1', 'HRÁČ 2', 'OVLÁDAČ PS'], ...pg.rows.map(r => [r[0], r[1], r[2], r[3]])];
    const step = Math.min(20, Math.floor(150 / rows.length)), fs = rows.length > 8 ? 8 : 9;
    rows.forEach((r, i) => r.forEach((c, j) => text(c, [92, 215, 305, 405][j], 60 + i * step, fs, 'center', i === 0 ? '#ffd200' : j === 0 ? '#9fd8ff' : '#fff')));
    text('VPRED = smerom k súperovi    S / ↓ / L1 = dole    mobil: páčka + tlačidlá', W / 2, 218, 8, 'center', '#cfe6ff');
  }
  if (n > 1) text(`◀ ▶  strana ${page + 1}/${n}`, W / 2, 234, 9, 'center', '#ffd200');
  text('ESC = pauza    M = zvuk    Enter = späť', W / 2, 252, 9, 'center', '#aaa');
}
const SEL = { pw: 96, ph: 120, gap: 24, y: 50, cols: 1, rows: 1, rowH: 0 };
function selectFit() {                     // viac bojovníkov = menšie portréty; od 7 políčok (s ???) dva riadky
  const n = ORDER.length + 1;
  SEL.rows = n <= 6 ? 1 : 2; SEL.cols = Math.ceil(n / SEL.rows); SEL.gap = SEL.cols > 3 ? 10 : 24;
  SEL.pw = Math.min(96, Math.floor((W - 24 - (SEL.cols - 1) * SEL.gap) / SEL.cols));
  if (SEL.rows > 1) SEL.pw = Math.min(SEL.pw, 54);
  SEL.ph = Math.round(SEL.pw * (SEL.rows > 1 ? 1.2 : 1.25)); SEL.rowH = SEL.ph + 19; SEL.y = SEL.rows > 1 ? 44 : 50;
}
function selPos(i) {                       // ľavý horný roh políčka i (i = ORDER.length je ???); riadky sú centrované
  selectFit();
  const n = ORDER.length + 1, r = Math.floor(i / SEL.cols), c = i % SEL.cols, rowN = Math.min(SEL.cols, n - r * SEL.cols);
  return { x: W / 2 - (rowN * SEL.pw + (rowN - 1) * SEL.gap) / 2 + c * (SEL.pw + SEL.gap), y: SEL.y + r * SEL.rowH };
}
function selectX0() { return selPos(0).x; }
function updateSelect() {
  const n = ORDER.length;
  if (menu.tapPos && !game.locked[0]) {                 // ťuk na portrét vyberie tú postavu (nie tú pod kurzorom)
    const { x, y } = menu.tapPos;
    let i = -1;
    for (let k = 0; k <= n; k++) { const q = selPos(k); if (x >= q.x && x <= q.x + SEL.pw && y >= q.y && y <= q.y + SEL.ph) { i = k; break; } }
    if (i >= 0 && i < n) game.cursor[0] = i;
    else if (i === n) { menu.ok = false; sfx('bark'); game.rockyMsg = 120; }
    else menu.ok = false;                               // ťuk mimo portrétov nič nepotvrdí
  }
  for (let p = 0; p < 2; p++) {
    if (p === 1 && game.mode === 1) continue;
    if (game.locked[p]) continue;
    const c = ctls[p];
    const src = game.mode === 1 ? menu : { left: c.pressed.left, right: c.pressed.right, ok: c.pressed.punch || c.pressed.kick || c.pressed.start || (p === 0 && touchTap) };
    if (src.left) { game.cursor[p] = (game.cursor[p] + n - 1) % n; sfx('select'); }
    if (src.right) { game.cursor[p] = (game.cursor[p] + 1) % n; sfx('select'); }
    if (src.ok && sceneT > 15) {
      const id = ORDER[game.cursor[p]];
      if (game.locked[1 - p] && game.picks[1 - p] === id) { sfx('block'); showToast(ROSTER[id].name + ' UŽ MÁ HRÁČ ' + (2 - p)); }   // bratia proti sebe, nie zrkadlo
      else { game.locked[p] = true; game.picks[p] = id; sfx('confirm'); }
    }
  }
  if (game.mode === 1 && game.locked[0] && !game.locked[1]) {
    game.picks[1] = ORDER.find(id => id !== game.picks[0]) || game.picks[0]; game.locked[1] = true;
  }
  if (sceneT === 12 && !NET.role) say('destiny');                    // „Choose your destiny!“ ako v MK
  if (typed.join('').endsWith('ROCKY')) { typed.length = 0; sfx('bark'); game.rockyMsg = 120; }
  if (game.rockyMsg > 0) game.rockyMsg--;
  if (menu.back || (menu.tapPos && inBtn(menu.tapPos, SELECT_BACK))) setScene('title');
  if (game.locked[0] && game.locked[1]) { if (!game.vsAt) game.vsAt = sceneT + 30; if (sceneT >= game.vsAt) { game.vsAt = 0; setScene('vs'); } }
}
function portrait(id, x, y, w, h, hl) {
  ctx.fillStyle = '#111'; ctx.fillRect(x, y, w, h);
  const im = IMG['img/portrait_' + id];
  if (im) ctx.drawImage(im, x, y, w, h);
  else {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#2b1d3d'); g.addColorStop(1, '#0c0c18'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    drawFigure(x + w / 2, y + h + 46, 1, POSES.stand, ROSTER[id], { scale: 1.25 });
    ctx.restore();
  }
  if (hl) { ctx.strokeStyle = hl; ctx.lineWidth = 3; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2); }
}
const SELECT_BACK = { x: 6, y: 6, w: 64, h: 18 };
function drawSelect() {
  ctx.fillStyle = '#0d0b18'; ctx.fillRect(0, 0, W, H);
  bigText('VYBER SI BOJOVNÍKA', W / 2, 32, 24);
  selectFit();
  const pw = SEL.pw, ph = SEL.ph, grid = SEL.rows > 1;
  ORDER.forEach((id, i) => {
    const { x, y } = selPos(i);
    const hl = game.cursor[0] === i ? '#3fa9ff' : (game.mode === 2 && game.cursor[1] === i ? '#ff4040' : null);
    portrait(id, x, y, pw, ph, hl);
    if (game.mode === 2 && game.cursor[0] === i && game.cursor[1] === i) { ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + 3, pw - 6, ph - 6); }
    text(ROSTER[id].name, x + pw / 2, y + ph + (grid ? 11 : 16), grid ? 7 : pw < 80 ? 9 : 12, 'center', '#ffd200');
    if (pw >= 80) (ROSTER[id].blurb || []).forEach((l, k) => text(l, x + pw / 2, y + ph + 30 + k * 11, 7, 'center', '#ccc'));
    if (game.cursor[0] === i) text(game.locked[0] ? '1P ✔' : '1P', x + 12, y + 14, 10, 'center', '#3fa9ff');
    if (game.mode === 2 && game.cursor[1] === i) text(game.locked[1] ? '2P ✔' : '2P', x + pw - 12, y + 14, 10, 'center', '#ff4040');
  });
  const { x, y } = selPos(ORDER.length);
  ctx.fillStyle = '#16121f'; ctx.fillRect(x, y, pw, ph); text('?', x + pw / 2, y + ph * 0.6, Math.round(pw * 0.42), 'center', '#3a3350');
  text('???', x + pw / 2, y + ph + (grid ? 11 : 16), grid ? 7 : pw < 80 ? 9 : 12, 'center', '#555');
  if (grid) {                                          // pri dvoch riadkoch: popis postavy pod kurzorom hráča 1 dole v strede
    const cur = ROSTER[ORDER[game.cursor[0]]];
    if (cur) (cur.blurb || []).forEach((l, k) => text(l, W / 2, SEL.y + 2 * SEL.rowH + 4 + k * 9, 7, 'center', '#ccc'));
  }
  if (game.rockyMsg > 0) text('ROCKY EŠTE TRÉNUJE…', W / 2, 252, 12, 'center', '#ffcf6e');
  else text(game.mode === 1 ? '← → výber   ÚDER/ENTER potvrdiť' : 'Každý hráč si vyberie svojimi klávesmi', W / 2, 252, 9, 'center', '#888');
  if (inputKind(0) === 'touch') {                         // mobil: späť do menu bez klávesu Esc
    const b = SELECT_BACK; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    text('◀ MENU', b.x + b.w / 2, b.y + 13, 10, 'center', '#ffd200');
  }
}
function updateVS() {
  if (sceneT === 1) {                                    // náhodná aréna, nie dvakrát po sebe tá istá
    sfx('confirm');
    const pool = STAGES.map((s, i) => i).filter(i => STAGES.length < 2 || STAGES[i].id !== game.lastStage);
    game.stageSel = pool[Math.floor(Math.random() * pool.length)];
  }
  if (sceneT === 40 && game.picks.includes('boss')) say('bosslaugh');     // MASTER STORM sa vysmeje už na VS obrazovke
  if (menu.up || menu.down) { game.stageSel = (game.stageSel + (menu.up ? STAGES.length - 1 : 1)) % STAGES.length; sfx('select'); }
  if (sceneT > 180 || (menu.ok && sceneT > 30)) startMatch();
}
function drawVS() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const k = Math.min(1, sceneT / 20);
  portrait(game.picks[0], Math.round(-120 + 150 * k), 40, 140, 170, '#3fa9ff');
  portrait(game.picks[1], Math.round(W + 20 - 190 * k), 40, 140, 170, '#ff4040');
  text(ROSTER[game.picks[0]].name, 100, 228, 16, 'center', '#3fa9ff');
  text(ROSTER[game.picks[1]].name, W - 100, 228, 16, 'center', '#ff4040');
  text(legend(0, game.picks[0]), 100, 242, 7, 'center', '#cfe6ff');
  text(legend(1, game.picks[1]), W - 100, 242, 7, 'center', '#ffd0d0');
  if (sceneT > 20) bigText('VS', W / 2, 140, 54);
  const st = STAGES[game.stageSel ?? 0] || STAGES[0];
  text('ARÉNA: ▲ ' + st.name + ' ▼', W / 2, 262, 9, 'center', '#ccc');
}
function updateEject() {
  if (sceneT === 1) { game.stars = Array.from({ length: 70 }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(0.3, 1.6) })); sfx('whoosh', 0.6); }
  for (const st of game.stars) { st.x -= st.s; if (st.x < 0) st.x += W; }
  if (sceneT > 330 || (menu.ok && sceneT > 40)) setScene('result');
}
function achievementText(F) {
  const w = F.fighters[F.winner], l = F.fighters[F.loser >= 0 ? F.loser : 1 - F.winner];
  if (w.damageTaken === 0) return 'Ani škrabanec!';
  if (F.finisher === 'futbality') return 'Gól do brány!';
  if (F.finisher) return F.finisher.toUpperCase() + ' predvedená!';
  const bro = { matusko: 1, simon: 1 };
  if (bro[w.id] && bro[l.id] && w.id !== l.id) return 'Bratský súboj vyhratý!';
  const pool = ['Diamantová päsť', 'Majster karate', 'Silnejší ako creeper', 'Nový level!', 'Bojovník roka'];
  return pool[Math.floor(Math.random() * pool.length)];
}
function drawAchievement(t, msg) {                        // ako toast v Minecrafte: vyjde zhora, chvíľu svieti, odíde
  const k = t < 20 ? t / 20 : t > 170 ? Math.max(0, 1 - (t - 170) / 20) : 1, w = 228, h = 40, x = Math.round(W / 2 - w / 2), y = Math.round(-h + k * (h + 52));
  ctx.fillStyle = '#212121'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#555'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
  const d = [[3, 0], [4, 0], [2, 1], [5, 1], [1, 2], [6, 2], [0, 3], [7, 3], [1, 4], [6, 4], [2, 5], [5, 5], [3, 6], [4, 6]];   // diamant 8×8
  for (const [gx, gy] of d) { ctx.fillStyle = '#1b8f8a'; ctx.fillRect(x + 12 + gx * 3, y + 8 + gy * 3, 3, 3); }
  ctx.fillStyle = '#7ef7ef'; for (const [gx, gy] of [[3, 1], [4, 1], [2, 2], [3, 2], [4, 2], [5, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [5, 4], [3, 5], [4, 5]]) ctx.fillRect(x + 12 + gx * 3, y + 8 + gy * 3, 3, 3);
  text('Achievement get!', x + 44, y + 17, 10, 'left', '#ffff55');
  text(msg || '', x + 44, y + 31, 10, 'left', '#ffffff');
}
function drawCrewmate(x, y, rot, body, dark) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = dark; ctx.fillRect(-24, -14, 12, 26);
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-14, 26); ctx.lineTo(-14, -12); ctx.quadraticCurveTo(-14, -30, 2, -30); ctx.quadraticCurveTo(18, -30, 18, -12); ctx.lineTo(18, 26); ctx.lineTo(8, 26); ctx.lineTo(8, 16); ctx.lineTo(-4, 16); ctx.lineTo(-4, 26); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#8fd3ff'; ctx.beginPath(); ctx.ellipse(10, -14, 11, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(10, -18, 6, 3);
  ctx.restore();
}
function drawEject() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  for (const st of game.stars || []) { ctx.fillStyle = st.s > 1.1 ? '#fff' : '#888'; ctx.fillRect(Math.round(st.x), Math.round(st.y), 1, 1); }
  const loser = game.picks[1 - game.lastWinner], def = ROSTER[loser];
  const k = Math.min(1, sceneT / 260), x = -40 + k * (W + 80);
  drawCrewmate(x, 120 + Math.sin(sceneT / 30) * 10, sceneT / 40, def.gi, def.giDark);
  const msg = loser === 'matusko' ? 'MATÚŠKO WAS NOT THE IMPOSTOR.' : def.name + ' WAS THE IMPOSTOR.';
  const n = Math.max(0, Math.min(msg.length, Math.floor((sceneT - 60) / 4)));
  text(msg.slice(0, n), W / 2, 200, 16, 'center', '#ffffff');
  if (sceneT > 60 + msg.length * 4 + 20) text(loser === 'matusko' ? 'Má predsa narodeniny.' : '1 Impostor remains', W / 2, 222, 10, 'center', '#bbbbbb');
}
const RESULT_BTNS = { next: { x: W / 2 - 150, y: 236, w: 140, h: 24, label: 'ĎALŠÍ ZÁPAS' }, menu: { x: W / 2 + 10, y: 236, w: 140, h: 24, label: 'MENU' } };
const inBtn = (p, b) => p && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function updateResult() {
  if (menu.tapPos && inBtn(menu.tapPos, RESULT_BTNS.menu) && sceneT > 30) { sfx('confirm'); setScene('title'); music('title'); return; }   // mobil: späť do menu (aj v sieťovej hre)
  if (sceneT % 4 === 0) confetti.push({ x: rnd(0, W), y: -5, vy: rnd(0.8, 2), vx: rnd(-0.5, 0.5), c: ['#ff4d4d', '#ffd200', '#4dd2ff', '#7dff6a', '#ff7ae0'][Math.floor(rnd(0, 5))] });
  for (const c of confetti) { c.x += c.vx; c.y += c.vy; }
  while (confetti.length && confetti[0].y > H + 10) confetti.shift();
  if (menu.ok && sceneT > 60) { sfx('confirm'); setScene('select'); music('title'); }
  if (menu.back) { setScene('title'); music('title'); }
}
function drawResult() {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b0b2e'); g.addColorStop(1, '#3b0d0d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const c of confetti) { ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x), Math.round(c.y), 3, 4); }
  const wname = ROSTER[game.picks[game.lastWinner]] ? ROSTER[game.picks[game.lastWinner]].name : '';
  victoryRoyale(W / 2, 48);
  bigText(`${wname} WINS`, W / 2, 84, 24);
  text(`${ROSTER[game.picks[0]].name}  ${game.score[0]} : ${game.score[1]}  ${ROSTER[game.picks[1]].name}`, W / 2, 100, 14, 'center', '#fff');
  const bd = birthday();
  if (bd) { bigText('VŠETKO NAJLEPŠIE', W / 2, 152, 30); bigText(`K ${bd.age}. NARODENINÁM, ${bd.name}!`, W / 2, 184, 22); }
  else bigText('ODVETA?', W / 2, 170, 34);
  if (inputKind(0) === 'touch') for (const b of Object.values(RESULT_BTNS)) {      // na mobile tlačidlá (klávesnica: ÚDER/ENTER, ESC)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,210,0,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    text(b.label, b.x + b.w / 2, b.y + 16, 11, 'center', '#ffd200');
  }
  else if (sceneT % 60 < 40) text('ÚDER / ENTER = ďalší zápas     ESC = menu', W / 2, 250, 9, 'center', '#ccc');
}
function victoryRoyale(x, y) {
  ctx.font = 'bold 30px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  const g = ctx.createLinearGradient(0, y - 26, 0, y); g.addColorStop(0, '#fff7c2'); g.addColorStop(0.5, '#ffd23a'); g.addColorStop(1, '#ff9a1a');
  ctx.lineWidth = 8; ctx.strokeStyle = '#3a1d8f'; ctx.strokeText('#1 VICTORY ROYALE', x, y);
  ctx.lineWidth = 3; ctx.strokeStyle = '#1aa7ff'; ctx.strokeText('#1 VICTORY ROYALE', x, y);
  ctx.fillStyle = g; ctx.fillText('#1 VICTORY ROYALE', x, y);
}
function drawCreeper(c) {
  const u = 5, x = Math.round(c.x), y = GROUND, swell = c.state === 'hiss' ? 1 + c.t / 260 : 1;
  const white = c.state === 'hiss' && Math.floor(c.t / 6) % 2 === 0;
  const pal = ['#3fae3f', '#5fcf5f', '#2a7d2a', '#4cbf4c'];
  const cell = (gx, gy) => white ? '#f4fff4' : pal[(gx * 7 + gy * 13 + gx * gy) % 4];
  ctx.save(); ctx.translate(x, y); ctx.scale(swell, swell);
  const step = c.state === 'walk' ? (Math.floor(c.t / 8) % 2) * 2 : 0;
  for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 6; gy++) { ctx.fillStyle = cell(gx, gy); ctx.fillRect(-10 + gx * u - (gx < 2 ? step : -step), -30 + gy * u, u, u); }
  for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 12; gy++) { ctx.fillStyle = cell(gx + 3, gy + 1); ctx.fillRect(-10 + gx * u, -90 + gy * u, u, u); }
  for (let gx = 0; gx < 8; gx++) for (let gy = 0; gy < 8; gy++) { ctx.fillStyle = cell(gx + 1, gy + 5); ctx.fillRect(-20 + gx * u, -130 + gy * u, u, u); }
  if (!white) {
    ctx.fillStyle = '#111';
    [[1, 2], [2, 2], [1, 3], [2, 3], [5, 2], [6, 2], [5, 3], [6, 3], [3, 4], [4, 4], [3, 5], [4, 5], [2, 5], [5, 5], [2, 6], [5, 6], [2, 7], [5, 7]].forEach(([gx, gy]) => ctx.fillRect(-20 + gx * u, -130 + gy * u, u, u));
  }
  ctx.restore();
  if (c.state === 'hiss') text('sssss…', x, y - 140 * swell, 10, 'center', '#c8ffc8');
}
function drawLoading() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  drawLogoTitle(W / 2, 110, 28); bigText('XII', W / 2, 138, 20, true);
  ctx.fillStyle = '#333'; ctx.fillRect(140, 150, 200, 8);
  ctx.fillStyle = '#ffc21a'; ctx.fillRect(140, 150, Math.round(200 * (loadTotal ? loadDone / loadTotal : 1)), 8);
}

// ===================================================================== hlavná slučka
function update() {
  frameNo++;
  syncTouch();
  if (scene !== 'fight') pauseStageVideos();
  if (NET.role === 'guest') {                           // sieťový hosť: len vstup + odoslanie, stav príde od hostiteľa
    pollInput(); callAll(hooks.frame); if (NET.onGuestFrame) NET.onGuestFrame();
    if (toast.t > 0) toast.t--;
    if (keysHit.has('KeyM')) toggleMute();
    keysHit.clear(); return;
  }
  pollInput();
  callAll(hooks.frame);
  const canToggle = scene !== 'fight' || (F && F.paused);   // počas boja sú H/M príliš blízko kláves útokov
  if (canToggle && keysHit.has('KeyM')) toggleMute();
  if (canToggle && keysHit.has('KeyH')) toggleMusic();
  if (toast.t > 0) toast.t--;
  sceneT++;
  switch (scene) {
    case 'title': updateTitle(); break;
    case 'controls': updateControls(); break;
    case 'select': updateSelect(); break;
    case 'vs': updateVS(); break;
    case 'fight': updateFight(); break;
    case 'eject': updateEject(); break;
    case 'result': updateResult(); break;
    default: if (SCENES[scene] && SCENES[scene].update) SCENES[scene].update();
  }
  keysHit.clear();
}
function draw() {
  if (cv.width !== 480 * RES) fitRes();
  if (RES > 1 && !loadHires.started && scene !== 'loading') loadHires();
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.imageSmoothingEnabled = RES > 1; ctx.imageSmoothingQuality = 'high';
  switch (scene) {
    case 'loading': drawLoading(); break;
    case 'title': drawTitle(); break;
    case 'controls': drawControls(); break;
    case 'select': drawSelect(); break;
    case 'vs': drawVS(); break;
    case 'fight': drawFight(); break;
    case 'eject': drawEject(); break;
    case 'result': drawResult(); break;
    default: if (SCENES[scene] && SCENES[scene].draw) SCENES[scene].draw();
  }
  if (F && scene === 'fight') callAll(hooks.drawHud, F);
  if (toast.t > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, toast.t / 20); text(toast.text, W / 2, 62, 14, 'center', '#ffd200'); ctx.restore(); }
}
let last = performance.now(), acc = 0;
function frame(now) {
  acc += Math.min(250, now - last); last = now;
  while (acc >= STEP) { update(); acc -= STEP; }
  draw();
  requestAnimationFrame(frame);
}
const api = {
  W, H, GROUND, MAX_HP, MOVE, ROSTER, ORDER, STAGES, IMG, FA, A, POSES, KEYS, BUTTONS, game, hooks, SCENES, FINISHERS, PALETTES,
  ATTACK_STATES, HIT_STATES, ctls, cpu, CPU, Fighter, ctx, NO_INPUT,
  get fight() { return F; }, get scene() { return scene; }, get sceneT() { return sceneT; }, get frame() { return frameNo; }, get menu() { return menu; },
  applyHit, banner, say, sfx, synth, spark, shake, text, bigText, drawFigure, drawFighter, animFor, frameOf, silhouette, paletteStrip,
  setScene, startMatch, nextRound, startFinisher, endFinisher, decides, music, showToast, matchSeq, keyHint, inputKind, legend,
  rnd, chance, clamp, drawRocky, drawStars,
  registerFighter(id, def, selectable = true) { ROSTER[id] = def; if (selectable && !ORDER.includes(id)) ORDER.push(id); },
  registerScene(name, sc) { SCENES[name] = sc; },
  registerFinisher(kind, def) { FINISHERS[kind] = def; },
  registerPalette(name, fn) { PALETTES[name] = fn; },
  addMenuItem(item, index = MENU.length) { MENU.splice(index, 0, item); },
  animFallback(state, anim) { ANIM_FALLBACK[state] = anim; },
  MENU, SUBMENU, birthday, RESULT_BTNS, SELECT_BACK, inBtn, MUSIC_POOL, ANIM_FALLBACK, NET, BUTTONS_LIST: BUTTONS,
  setFight(obj) { F = obj; }, setSceneRaw(name, t) { scene = name; sceneT = t; },
  get toast() { return toast; },
};
for (const m of MODULES) { try { m.init(api); } catch (e) { console.error('Modul ' + m.name, e); } }
groupMenu();
setupTouch();
setupMusicButton();
loadImages(() => { setScene('title'); music('title'); });
fitRes();
requestAnimationFrame(frame);

// háčik na automatické testy (headless prehliadač)
window.__MK = { get scene() { return scene; }, get fight() { return F; }, game, setScene, startMatch, api, ctls, hooks };
})();
