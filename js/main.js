import { CHARACTERS, KEYMAPS, TRANSLATIONS } from './constants.js';
import { GameEngine } from './game.js';
import { InputManager } from './input.js';
import { GameRenderer } from './renderer.js';
import { SoundEngine } from './sound.js';

const SLOT_CYCLE = ['human', 'bot_chill', 'bot_clever', 'off'];
const ANIMAL_EMOJIS = { mochi: '🐕', tama: '🐱', yuzu: '🦫', poko: '🐰' };

const sound = new SoundEngine();
const input = new InputManager();
const canvas = document.getElementById('game-canvas');
const renderer = new GameRenderer(canvas);

let currentLang = (() => {
  try {
    const saved = localStorage.getItem('cuteBomberLang');
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    // ignore
  }
  return (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
})();

const lobbyState = {
  slots: ['human', 'bot_chill', 'bot_chill', 'bot_chill'],
  charIndices: [0, 1, 2, 3],
  bestOf: 3,
};

let game = null;
let rafId = null;
let lastFrameTime = 0;
let accumulator = 0;
let resultShownForRound = 0;
let lastHudSignature = '';
let activeWinnerCanvases = [];

function t() {
  return TRANSLATIONS[currentLang] || TRANSLATIONS.en;
}

function slotModeLabel(mode) {
  const tr = t();
  if (mode === 'human') return tr.slotHuman;
  if (mode === 'bot_chill') return tr.slotBotChill;
  if (mode === 'bot_clever') return tr.slotBotClever;
  return tr.slotOff;
}

function slotModeColor(mode, charColor) {
  if (mode === 'human') return charColor;
  if (mode === 'bot_chill') return '#0ea5e9';
  if (mode === 'bot_clever') return '#8b5cf6';
  return '#94a3b8';
}

function applyLanguageUI() {
  const tr = t();
  document.documentElement.lang = currentLang;
  document.title = `${tr.title} 🍡`;
  document.getElementById('lobby-title').textContent = tr.title;
  document.getElementById('lobby-subtitle').textContent = tr.subtitle;
  document.getElementById('howto-step1-title').textContent = tr.howStep1Title;
  document.getElementById('howto-step1-desc').textContent = tr.howStep1Desc;
  document.getElementById('howto-step2-title').textContent = tr.howStep2Title;
  document.getElementById('howto-step2-desc').textContent = tr.howStep2Desc;
  document.getElementById('howto-step3-title').textContent = tr.howStep3Title;
  document.getElementById('howto-step3-desc').textContent = tr.howStep3Desc;
  document.getElementById('best-of-label').textContent = tr.bestOfLabel;
  document.getElementById('best-of-3').textContent = tr.bestOf3;
  document.getElementById('best-of-5').textContent = tr.bestOf5;
  document.getElementById('start-btn').textContent = tr.playBtn;
  document.getElementById('paused-title').textContent = tr.pausedTitle;
  document.getElementById('paused-sub').textContent = tr.pausedSub;
  document.getElementById('resume-btn').textContent = tr.resumeLabel;
  document.getElementById('pause-lobby-btn').textContent = tr.backLobbyBtn;
  document.getElementById('result-lobby-btn').textContent = tr.backLobbyBtn;
  document.getElementById('awards-title').textContent = tr.awardsTitle;
  document.getElementById('mute-btn').textContent = sound.muted ? '🔇' : '🔊';
  updateMusicButtonUI();
  document.getElementById('coach-keys').textContent =
    currentLang === 'ja'
      ? '移動: WASD/矢印 · 攻撃: Space/Enter · ダッシュ: Shift/E'
      : 'Move: WASD/Arrows · Snack: Space/Enter · Dash: Shift/E';

  renderLobbySlots();
  if (game) {
    game.setLang(currentLang);
    lastHudSignature = '';
    updateHUD();
    if (game.roundResultReady) {
      showResultOverlay();
    }
  }
}

function buildPatternGridElement(ch) {
  const wrap = document.createElement('div');
  wrap.className = 'pattern-mini-grid';
  const grid = ch.patternGrid || [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const val = grid[r]?.[c] || 0;
      const cell = document.createElement('span');
      cell.className = 'pattern-cell' + (val === 2 ? ' is-origin' : '');
      if (val === 2) {
        cell.style.background = ch.color;
      } else if (val === 1) {
        cell.style.background = ch.splash;
      } else if (val === 3) {
        cell.style.background = ch.badgeColor || ch.color;
      }
      wrap.appendChild(cell);
    }
  }
  return wrap;
}

function renderLobbySlots() {
  const grid = document.getElementById('slots-grid');
  grid.textContent = '';

  lobbyState.slots.forEach((mode, idx) => {
    const charIdx = lobbyState.charIndices[idx] ?? idx;
    const ch = CHARACTERS[charIdx];
    const card = document.createElement('div');
    card.className = 'slot-card' + (mode === 'off' ? ' is-off' : '');
    card.style.borderColor = mode === 'off' ? 'rgba(120,60,40,0.1)' : ch.accent;

    // Portrait + Left/Right Character Swap Buttons
    const portraitWrap = document.createElement('div');
    portraitWrap.className = 'slot-portrait-wrap';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'char-swap-btn';
    prevBtn.textContent = '◀';
    prevBtn.title = 'Previous Character';
    prevBtn.addEventListener('click', () => {
      lobbyState.charIndices[idx] = (charIdx - 1 + CHARACTERS.length) % CHARACTERS.length;
      renderLobbySlots();
    });

    const portraitCanvas = document.createElement('canvas');
    portraitCanvas.className = 'slot-portrait-canvas';
    renderer.renderAvatarCanvas(portraitCanvas, ch, 68);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'char-swap-btn';
    nextBtn.textContent = '▶';
    nextBtn.title = 'Next Character';
    nextBtn.addEventListener('click', () => {
      lobbyState.charIndices[idx] = (charIdx + 1) % CHARACTERS.length;
      renderLobbySlots();
    });

    portraitWrap.appendChild(prevBtn);
    portraitWrap.appendChild(portraitCanvas);
    portraitWrap.appendChild(nextBtn);

    const name = document.createElement('div');
    name.className = 'slot-name';
    name.textContent = `P${idx + 1} · ${currentLang === 'ja' ? ch.nameJa : ch.nameEn}`;

    const role = document.createElement('div');
    role.className = 'slot-role-badge';
    role.style.background = ch.color;
    role.textContent = currentLang === 'ja' ? ch.roleJa : ch.roleEn;

    const animal = document.createElement('div');
    animal.className = 'slot-animal';
    animal.textContent = `${currentLang === 'ja' ? ch.animalJa : ch.animalEn} · ${currentLang === 'ja' ? ch.bombNameJa : ch.bombNameEn}`;

    const patternEl = buildPatternGridElement(ch);

    const ability = document.createElement('div');
    ability.className = 'slot-ability';
    ability.textContent = currentLang === 'ja' ? ch.abilityJa : ch.abilityEn;

    const keys = document.createElement('div');
    keys.className = 'slot-keys';
    keys.textContent = currentLang === 'ja' ? KEYMAPS[idx].labelJa : KEYMAPS[idx].labelEn;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-mode-btn';
    btn.style.background = slotModeColor(mode, ch.color);
    btn.textContent = slotModeLabel(mode);
    btn.addEventListener('click', () => {
      const nextIdx = (SLOT_CYCLE.indexOf(mode) + 1) % SLOT_CYCLE.length;
      lobbyState.slots[idx] = SLOT_CYCLE[nextIdx];
      document.getElementById('lobby-error').hidden = true;
      renderLobbySlots();
    });

    card.appendChild(portraitWrap);
    card.appendChild(name);
    card.appendChild(role);
    card.appendChild(animal);
    card.appendChild(patternEl);
    card.appendChild(ability);
    card.appendChild(keys);
    card.appendChild(btn);
    grid.appendChild(card);
  });
}

function updateHUD() {
  if (!game) return;
  const tr = t();

  document.getElementById('round-badge').textContent = `R${game.roundNumber}`;

  const secs = Math.ceil(game.timeLeft);
  const mins = Math.floor(secs / 60);
  const rem = String(secs % 60).padStart(2, '0');
  const timerEl = document.getElementById('hud-timer');
  timerEl.textContent = `${mins}:${rem}`;
  timerEl.classList.toggle('urgent', secs <= 25);

  const bannerEl = document.getElementById('event-banner');
  if (game.activeBanner) {
    bannerEl.textContent = game.activeBanner;
    bannerEl.hidden = false;
  } else {
    bannerEl.hidden = true;
  }

  const hintEl = document.getElementById('live-hint-text');
  if (hintEl && hintEl.textContent !== (game.liveHint || '')) {
    hintEl.textContent = game.liveHint || '';
  }

  const sig = game.players
    .map(
      (p) =>
        `${p.id}:${p.char.id}:${p.state}:${p.sugarRushTimer > 0 ? 1 : 0}:${game.matchStats[p.id].wins}`
    )
    .join('|');

  if (sig === lastHudSignature) return;
  lastHudSignature = sig;

  const playersEl = document.getElementById('hud-players');
  playersEl.textContent = '';

  for (const p of game.players) {
    const isRush = p.sugarRushTimer > 0;
    const card = document.createElement('div');
    card.className =
      'hud-player-card' +
      (p.state === 'ghost' ? ' is-ghost' : '') +
      (p.state === 'mochi_ball' ? ' is-mochi' : '') +
      (isRush ? ' is-rush' : '');
    card.style.borderColor = p.state === 'alive' ? p.char.color : 'rgba(255,255,255,0.65)';

    const dot = document.createElement('span');
    dot.className = 'hud-dot';
    dot.style.background = p.char.color;

    const info = document.createElement('div');
    info.className = 'hud-p-info';

    const pName = document.createElement('span');
    pName.className = 'hud-p-name';
    const youTag = p.controlType === 'human' && game.humanSlotCount === 1 ? ' ★' : '';
    pName.textContent = `${ANIMAL_EMOJIS[p.char.id]} ${currentLang === 'ja' ? p.char.nameJa : p.char.nameEn}${youTag}`;

    const pStatus = document.createElement('span');
    pStatus.className = 'hud-p-status';
    if (p.state === 'alive') {
      pStatus.textContent = isRush ? `🌟 ${tr.statusSugarRush}` : tr.statusAlive;
    } else if (p.state === 'mochi_ball') {
      pStatus.textContent = `🍡 ${tr.statusMochi}`;
    } else {
      pStatus.textContent = `👻 ${tr.statusGhost}`;
    }

    info.appendChild(pName);
    info.appendChild(pStatus);

    const crowns = document.createElement('span');
    crowns.className = 'hud-p-crowns';
    const winCount = game.matchStats[p.id].wins;
    crowns.textContent = winCount > 0 ? '👑'.repeat(winCount) : `0/${game.winsNeeded}`;

    card.appendChild(dot);
    card.appendChild(info);
    card.appendChild(crowns);
    playersEl.appendChild(card);
  }
}

function showResultOverlay() {
  if (!game) return;
  const tr = t();
  const overlay = document.getElementById('result-overlay');
  const badgeEl = document.getElementById('result-badge');
  const titleEl = document.getElementById('result-title');
  const subEl = document.getElementById('result-sub');
  const boardEl = document.getElementById('result-scoreboard');
  const awardsSec = document.getElementById('awards-section');
  const awardsGrid = document.getElementById('awards-grid');
  const nextBtn = document.getElementById('next-round-btn');

  input.setCaptureKeys(false);

  if (game.matchOver && game.matchWinner) {
    const ch = game.matchWinner.char;
    badgeEl.textContent = ANIMAL_EMOJIS[ch.id] + ' 👑';
    titleEl.textContent = `${currentLang === 'ja' ? ch.nameJa : ch.nameEn} — ${tr.matchWinnerTitle}`;
    subEl.textContent = `${currentLang === 'ja' ? ch.animalJa : ch.animalEn}`;
    nextBtn.textContent = tr.rematchBtn;
  } else if (game.roundWinner) {
    const ch = game.roundWinner.char;
    badgeEl.textContent = ANIMAL_EMOJIS[ch.id] + ' ✨';
    titleEl.textContent = `${currentLang === 'ja' ? ch.nameJa : ch.nameEn} — ${tr.roundWinnerTitle}`;
    subEl.textContent = `${game.matchStats[game.roundWinner.id].wins} / ${game.winsNeeded} 👑`;
    nextBtn.textContent = tr.nextRoundBtn;
  } else {
    badgeEl.textContent = '🍡';
    titleEl.textContent = tr.roundDrawTitle;
    subEl.textContent = tr.roundDrawSub;
    nextBtn.textContent = tr.nextRoundBtn;
  }

  boardEl.textContent = '';
  activeWinnerCanvases = [];
  const tSec = performance.now() / 1000;
  for (const p of game.players) {
    const st = game.matchStats[p.id];
    const pill = document.createElement('div');
    const isWin = game.roundWinner
      ? game.roundWinner.id === p.id
      : Boolean(game.matchWinner && game.matchWinner.id === p.id);
    pill.className = 'score-pill' + (isWin ? ' is-winner' : '');
    const nm = currentLang === 'ja' ? p.char.nameJa : p.char.nameEn;

    const cEl = document.createElement('canvas');
    cEl.style.margin = '0 auto 4px';
    cEl.style.display = 'block';
    const avatarSize = isWin ? 56 : 46;
    renderer.renderAvatarCanvas(cEl, p.char, avatarSize, isWin, tSec);
    if (isWin) {
      activeWinnerCanvases.push({ canvas: cEl, char: p.char, size: avatarSize });
    }

    const nameEl = document.createElement('div');
    nameEl.style.fontWeight = '700';
    nameEl.textContent = `P${p.slotIndex + 1} · ${nm}`;

    const winsEl = document.createElement('div');
    winsEl.style.fontSize = '14px';
    winsEl.textContent = '👑'.repeat(st.wins) || '—';

    pill.appendChild(cEl);
    pill.appendChild(nameEl);
    pill.appendChild(winsEl);
    boardEl.appendChild(pill);
  }

  if (game.matchOver) {
    const awards = game.getAwards();
    awardsGrid.textContent = '';
    const entries = [
      [tr.awardBowling, awards.bowling, (s) => `${s.bowls}`],
      [tr.awardCombo, awards.combo, (s) => `${s.combos}`],
      [tr.awardGhost, awards.ghost, (s) => `${s.ghostHits}`],
      [tr.awardBoxes, awards.boxes, (s) => `${s.cratesBroken}`],
      [tr.awardClumsy, awards.clumsy, (s) => `${s.timesPuffed}`],
    ].filter(([, st]) => Boolean(st));

    if (entries.length > 0) {
      awardsSec.hidden = false;
      for (const [label, st, valFn] of entries) {
        const card = document.createElement('div');
        card.className = 'award-card';
        const nm = currentLang === 'ja' ? st.char.nameJa : st.char.nameEn;
        card.innerHTML = `<div style="font-weight:700">${label}</div><div>${ANIMAL_EMOJIS[st.char.id]} ${nm} (${valFn(st)})</div>`;
        awardsGrid.appendChild(card);
      }
    } else {
      awardsSec.hidden = true;
    }
  } else {
    awardsSec.hidden = true;
  }

  overlay.hidden = false;
}

function startMatch() {
  const activeCount = lobbyState.slots.filter((s) => s !== 'off').length;
  if (activeCount < 2) {
    const err = document.getElementById('lobby-error');
    err.textContent = t().needTwoPlayers;
    err.hidden = false;
    return;
  }

  sound.ensureContext();
  sound.startMusic('match');
  game = new GameEngine(sound, {
    slots: [...lobbyState.slots],
    charIds: lobbyState.charIndices.map((ci) => CHARACTERS[ci].id),
    bestOf: lobbyState.bestOf,
    lang: currentLang,
  });
  resultShownForRound = 0;
  lastHudSignature = '';
  activeWinnerCanvases = [];

  document.getElementById('lobby-overlay').hidden = true;
  document.getElementById('pause-overlay').hidden = true;
  document.getElementById('result-overlay').hidden = true;
  input.resetAll();
  input.setCaptureKeys(true);

  updateHUD();
  if (!rafId) {
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }
}

function returnToLobby() {
  if (game) game.paused = true;
  activeWinnerCanvases = [];
  sound.setMusicMode('lobby');
  input.setCaptureKeys(false);
  document.getElementById('pause-overlay').hidden = true;
  document.getElementById('result-overlay').hidden = true;
  document.getElementById('lobby-overlay').hidden = false;
  renderLobbySlots();
}

function togglePause() {
  if (!game || !document.getElementById('lobby-overlay').hidden || !document.getElementById('result-overlay').hidden) {
    return;
  }
  game.paused = !game.paused;
  document.getElementById('pause-overlay').hidden = !game.paused;
  input.setCaptureKeys(!game.paused);
}

function gameLoop(now) {
  const delta = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  if (game && document.getElementById('lobby-overlay').hidden) {
    accumulator += delta;
    const STEP = 1 / 60;
    while (accumulator >= STEP) {
      game.step(STEP, input);
      accumulator -= STEP;
    }
    renderer.render(game);
    updateHUD();
    sound.setMusicMode(
      game.paused || game.roundResultReady
        ? 'lobby'
        : game.timeLeft <= 25
          ? 'urgent'
          : 'match'
    );

    if (game.roundResultReady && resultShownForRound !== game.roundNumber) {
      resultShownForRound = game.roundNumber;
      showResultOverlay();
    }

    if (activeWinnerCanvases.length > 0 && !document.getElementById('result-overlay').hidden) {
      const tSec = now / 1000;
      for (const item of activeWinnerCanvases) {
        renderer.renderAvatarCanvas(item.canvas, item.char, item.size, true, tSec);
      }
    }
  }

  rafId = requestAnimationFrame(gameLoop);
}

function toggleLang() {
  currentLang = currentLang === 'en' ? 'ja' : 'en';
  try {
    localStorage.setItem('cuteBomberLang', currentLang);
  } catch {
    // ignore
  }
  applyLanguageUI();
}

function updateMusicButtonUI() {
  const btn = document.getElementById('music-btn');
  if (!btn) return;
  btn.textContent = sound.musicEnabled ? '🎵' : '🎵✕';
  btn.style.opacity = sound.musicEnabled ? '1' : '0.55';
}

function toggleMusic() {
  sound.ensureContext();
  sound.toggleMusic();
  updateMusicButtonUI();
}

function toggleMute() {
  const muted = sound.toggleMute();
  document.getElementById('mute-btn').textContent = muted ? '🔇' : '🔊';
}

document.getElementById('start-btn').addEventListener('click', startMatch);
document.getElementById('lang-btn').addEventListener('click', toggleLang);
document.getElementById('lobby-lang-btn').addEventListener('click', toggleLang);
document.getElementById('music-btn').addEventListener('click', toggleMusic);
document.getElementById('mute-btn').addEventListener('click', toggleMute);
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('lobby-btn').addEventListener('click', returnToLobby);
document.getElementById('pause-lobby-btn').addEventListener('click', returnToLobby);
document.getElementById('result-lobby-btn').addEventListener('click', returnToLobby);

document.getElementById('next-round-btn').addEventListener('click', () => {
  if (!game) return;
  if (game.matchOver) {
    startMatch();
  } else {
    document.getElementById('result-overlay').hidden = true;
    activeWinnerCanvases = [];
    input.resetAll();
    input.setCaptureKeys(true);
    lastHudSignature = '';
    game.startRound();
    updateHUD();
  }
});

document.querySelectorAll('[data-best]').forEach((btn) => {
  btn.addEventListener('click', () => {
    lobbyState.bestOf = Number(btn.getAttribute('data-best')) || 3;
    document.querySelectorAll('[data-best]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
  });
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (document.getElementById('lobby-overlay').hidden && document.getElementById('result-overlay').hidden) {
      e.preventDefault();
      togglePause();
    }
  } else if (e.code === 'KeyM') {
    toggleMute();
  } else if (e.code === 'KeyB') {
    toggleMusic();
  }
});

window.addEventListener('resize', () => {
  renderer.setupHiDPI();
});

applyLanguageUI();
// Draw an initial preview board behind the lobby
game = new GameEngine(null, {
  slots: lobbyState.slots,
  charIds: lobbyState.charIndices.map((ci) => CHARACTERS[ci].id),
  bestOf: 3,
  lang: currentLang,
});
game.paused = true;
renderer.render(game);
lastHudSignature = '';
updateHUD();
