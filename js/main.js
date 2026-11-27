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
  gamepadIndices: [null, null, null, null],
  ready: [false, false, false, false],
  startCountdown: null,
};

let game = null;
let rafId = null;
let lastFrameTime = 0;
let accumulator = 0;
let resultShownForRound = 0;
let lastHudSignature = '';
let activeWinnerCanvases = [];
let overlayInputGuard = 0;
let lastCountdownCeil = null;

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

function getPadShortName(padIdx) {
  const pad = input.getConnectedGamepads().find((p) => p.index === padIdx);
  const id = pad?.id || '';
  if (/xbox|xinput|045e/i.test(id)) return `Xbox ${padIdx + 1}`;
  if (/dualsense|dualshock|054c|playstation|wireless controller/i.test(id)) return `PS ${padIdx + 1}`;
  if (/switch|joy-con|pro controller|057e/i.test(id)) return `Switch ${padIdx + 1}`;
  return `${t().gpPadLabel} ${padIdx + 1}`;
}

function getDefaultBotFillMode() {
  for (const s of lobbyState.slots) {
    if (s !== 'human') return s;
  }
  return 'bot_chill';
}

function createCoachPill(text, dotColor = null, isLegend = false) {
  const pill = document.createElement('span');
  pill.className = 'coach-key-pill' + (isLegend ? ' is-gp-legend' : '');
  if (dotColor) {
    const dot = document.createElement('span');
    dot.className = 'coach-dot';
    dot.style.background = dotColor;
    pill.appendChild(dot);
  }
  pill.appendChild(document.createTextNode(text));
  return pill;
}

function getKeyboardHumanSlots(slots = lobbyState.slots, gpIndices = lobbyState.gamepadIndices) {
  const kb = [];
  for (let i = 0; i < 4; i++) {
    if (slots[i] === 'human' && (gpIndices[i] === null || gpIndices[i] < 0)) {
      kb.push(i);
    }
  }
  return kb;
}

function updateCoachKeysUI() {
  const tr = t();
  const el = document.getElementById('coach-keys');
  const bar = document.getElementById('coach-bar');
  if (!el) return;

  const lobbyEl = document.getElementById('lobby-overlay');
  const inMatch = Boolean(game && lobbyEl && lobbyEl.hidden);

  const humans = [];
  if (inMatch) {
    for (const p of game.players) {
      if (p.controlType !== 'human') continue;
      humans.push({
        slotIdx: p.slotIndex,
        char: p.char,
        padIdx: game.gamepadIndices?.[p.slotIndex] ?? null,
      });
    }
  } else {
    lobbyState.slots.forEach((mode, idx) => {
      if (mode !== 'human') return;
      const charIdx = lobbyState.charIndices[idx] ?? idx;
      humans.push({
        slotIdx: idx,
        char: CHARACTERS[charIdx],
        padIdx: lobbyState.gamepadIndices[idx] ?? null,
      });
    });
  }

  el.textContent = '';
  bar?.classList.toggle('is-multi', humans.length >= 2);

  if (humans.length === 0) {
    el.appendChild(createCoachPill(tr.botMatchCoach));
    return;
  }

  const kbHumans = humans.filter((h) => !(h.padIdx !== null && h.padIdx >= 0));

  if (humans.length === 1) {
    const h = humans[0];
    const hasPad = h.padIdx !== null && h.padIdx >= 0;
    const label = hasPad
      ? `P${h.slotIdx + 1} 🎮 ${getPadShortName(h.padIdx)} · ${tr.gpCoachLegend}`
      : `P${h.slotIdx + 1} · ${tr.kbSoloShort}`;
    el.appendChild(createCoachPill(label, h.char.color));
    return;
  }

  let anyPad = false;
  for (const h of humans) {
    const hasPad = h.padIdx !== null && h.padIdx >= 0;
    if (hasPad) anyPad = true;
    let label;
    if (hasPad) {
      label = `P${h.slotIdx + 1} 🎮 ${getPadShortName(h.padIdx)}`;
    } else if (kbHumans.length === 1) {
      label = `P${h.slotIdx + 1} ⌨️ ${tr.kbSoloShort}`;
    } else {
      const kbOrder = kbHumans.indexOf(h);
      const km = KEYMAPS[kbOrder >= 0 ? kbOrder : h.slotIdx];
      label = `P${h.slotIdx + 1} · ${currentLang === 'ja' ? km.shortJa : km.shortEn}`;
    }
    el.appendChild(createCoachPill(label, h.char.color));
  }

  if (anyPad) {
    el.appendChild(createCoachPill(`🎮 ${tr.gpCoachLegend}`, null, true));
  }
}

function getJoinedGamepadSlots() {
  const joined = [];
  for (let i = 0; i < 4; i++) {
    if (lobbyState.gamepadIndices[i] !== null && lobbyState.gamepadIndices[i] >= 0) {
      joined.push(i);
    }
  }
  return joined;
}

function updateGamepadBarUI() {
  const tr = t();
  const barEl = document.getElementById('gamepad-bar');
  const statusEl = document.getElementById('gamepad-status');
  const legendEl = document.getElementById('gamepad-legend');
  if (!barEl || !statusEl || !legendEl) return;

  const joined = getJoinedGamepadSlots();
  const activeHumans = [0, 1, 2, 3].filter((i) => lobbyState.slots[i] === 'human');
  const readyHumans = activeHumans.filter((i) => lobbyState.ready[i]).length;
  const connectedCount = input.getConnectedGamepads().length;
  barEl.classList.toggle('has-pads', joined.length > 0 || connectedCount > 0);

  const nextStatus =
    joined.length > 0
      ? currentLang === 'ja'
        ? `🎮 ${joined.length}${tr.gpJoinedSuffix} · ${tr.gpReadyProgress} ${readyHumans}/${activeHumans.length}`
        : `🎮 ${joined.length} ${tr.gpJoinedSuffix} · ${readyHumans}/${activeHumans.length} ${tr.gpReadyProgress}`
      : tr.gpLobbyIdle;

  if (statusEl.textContent !== nextStatus) statusEl.textContent = nextStatus;
  if (legendEl.textContent !== tr.gpLobbyLegend) legendEl.textContent = tr.gpLobbyLegend;
}

function updateStartButtonUI() {
  const tr = t();
  const btn = document.getElementById('start-btn');
  if (!btn) return;
  if (lobbyState.startCountdown !== null) {
    const secs = Math.max(1, Math.ceil(lobbyState.startCountdown));
    btn.classList.add('is-countdown');
    btn.textContent = `${tr.gpStartingIn} ${secs}... (${tr.gpStartSkipHint})`;
    lastCountdownCeil = secs;
  } else {
    btn.classList.remove('is-countdown');
    btn.textContent = tr.playBtn;
    lastCountdownCeil = null;
  }
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
  document.getElementById('paused-title').textContent = tr.pausedTitle;
  document.getElementById('paused-sub').textContent = tr.pausedSub;
  document.getElementById('resume-btn').textContent = tr.resumeLabel;
  document.getElementById('pause-lobby-btn').textContent = tr.backLobbyBtn;
  document.getElementById('result-lobby-btn').textContent = tr.backLobbyBtn;
  document.getElementById('awards-title').textContent = tr.awardsTitle;
  document.getElementById('pause-gp-hint').textContent = tr.gpPauseHint;
  document.getElementById('result-gp-hint').textContent = tr.gpResultHint;
  document.getElementById('mute-btn').textContent = sound.muted ? '🔇' : '🔊';
  updateMusicButtonUI();
  updateCoachKeysUI();

  renderLobbySlots();
  if (game) {
    game.setLang(currentLang);
    lastHudSignature = '';
    updateHUD();
    if (game.roundResultReady && !document.getElementById('result-overlay').hidden) {
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
  const tr = t();
  const grid = document.getElementById('slots-grid');
  grid.textContent = '';
  const kbSlots = getKeyboardHumanSlots();
  const hasAnyGamepad = getJoinedGamepadSlots().length > 0;

  lobbyState.slots.forEach((mode, idx) => {
    const charIdx = lobbyState.charIndices[idx] ?? idx;
    const ch = CHARACTERS[charIdx];
    const boundPadIdx = lobbyState.gamepadIndices[idx];
    const hasGamepad = boundPadIdx !== null && boundPadIdx >= 0;
    const isKbHuman = mode === 'human' && !hasGamepad;
    const isReady = (hasGamepad || (isKbHuman && hasAnyGamepad)) && lobbyState.ready[idx];

    const card = document.createElement('div');
    card.className =
      'slot-card' +
      (mode === 'off' ? ' is-off' : '') +
      (hasGamepad ? ' has-gamepad' : '') +
      (isReady ? ' is-ready' : '');
    card.style.borderColor = isReady
      ? '#10b981'
      : mode === 'off'
        ? 'rgba(120,60,40,0.1)'
        : ch.accent;

    // Portrait + Left/Right Character Swap Buttons
    const portraitWrap = document.createElement('div');
    portraitWrap.className = 'slot-portrait-wrap';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'char-swap-btn';
    prevBtn.textContent = '◀';
    prevBtn.title = 'Previous Character';
    prevBtn.disabled = isReady;
    prevBtn.addEventListener('click', () => {
      if (lobbyState.ready[idx]) return;
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
    nextBtn.disabled = isReady;
    nextBtn.addEventListener('click', () => {
      if (lobbyState.ready[idx]) return;
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
    if (isKbHuman) {
      if (kbSlots.length === 1) {
        keys.textContent = tr.kbSoloFull;
      } else {
        const kbOrder = kbSlots.indexOf(idx);
        const km = KEYMAPS[kbOrder >= 0 ? kbOrder : idx];
        keys.textContent = currentLang === 'ja' ? km.labelJa : km.labelEn;
      }
    } else {
      keys.textContent = currentLang === 'ja' ? KEYMAPS[idx].labelJa : KEYMAPS[idx].labelEn;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-mode-btn';
    btn.style.background = slotModeColor(mode, ch.color);
    btn.textContent = slotModeLabel(mode);
    btn.addEventListener('click', () => {
      const nextIdx = (SLOT_CYCLE.indexOf(mode) + 1) % SLOT_CYCLE.length;
      const nextMode = SLOT_CYCLE[nextIdx];
      lobbyState.slots[idx] = nextMode;
      if (nextMode !== 'human') {
        lobbyState.gamepadIndices[idx] = null;
      }
      lobbyState.ready[idx] = false;
      lobbyState.startCountdown = null;
      evaluateStartCountdown();
      document.getElementById('lobby-error').hidden = true;
      renderLobbySlots();
    });

    card.appendChild(portraitWrap);
    card.appendChild(name);
    card.appendChild(role);
    card.appendChild(animal);
    card.appendChild(patternEl);
    card.appendChild(ability);
    if (hasGamepad) {
      const gpRow = document.createElement('div');
      gpRow.className = 'slot-gp-row';

      const gpBadge = document.createElement('span');
      gpBadge.className = 'slot-gp-badge';
      gpBadge.textContent = `🎮 ${getPadShortName(boundPadIdx)}`;

      const readyBadge = document.createElement('span');
      readyBadge.className = 'slot-ready-badge' + (isReady ? ' is-ready' : '');
      readyBadge.textContent = isReady ? tr.gpReadyBadge : tr.gpPickPrompt;

      gpRow.appendChild(gpBadge);
      gpRow.appendChild(readyBadge);
      card.appendChild(gpRow);
    } else if (isKbHuman && hasAnyGamepad) {
      const gpRow = document.createElement('div');
      gpRow.className = 'slot-gp-row';

      const kbBadge = document.createElement('span');
      kbBadge.className = 'slot-gp-badge';
      kbBadge.textContent = tr.kbBadge;

      const readyBadge = document.createElement('span');
      readyBadge.className = 'slot-ready-badge' + (isReady ? ' is-ready' : '');
      readyBadge.textContent = isReady ? tr.gpReadyBadge : tr.kbPickPrompt;

      gpRow.appendChild(kbBadge);
      gpRow.appendChild(readyBadge);
      card.appendChild(gpRow);
      card.appendChild(keys);
    } else {
      card.appendChild(keys);
    }
    card.appendChild(btn);
    grid.appendChild(card);
  });

  updateGamepadBarUI();
  updateStartButtonUI();
  updateCoachKeysUI();
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
        `${p.id}:${p.char.id}:${p.state}:${p.isCelebrating ? 1 : 0}:${p.sugarRushTimer > 0 ? 1 : 0}:${game.matchStats[p.id].wins}`
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
    if (p.isCelebrating) {
      pStatus.textContent = `👑 ${tr.statusWinner}`;
    } else if (p.state === 'alive') {
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
        const labelEl = document.createElement('div');
        labelEl.style.fontWeight = '700';
        labelEl.textContent = label;
        const valEl = document.createElement('div');
        valEl.textContent = `${ANIMAL_EMOJIS[st.char.id]} ${nm} (${valFn(st)})`;
        card.appendChild(labelEl);
        card.appendChild(valEl);
        awardsGrid.appendChild(card);
      }
    } else {
      awardsSec.hidden = true;
    }
  } else {
    awardsSec.hidden = true;
  }

  overlay.hidden = false;
  document.getElementById('result-gp-hint').hidden = input.getConnectedGamepads().length === 0;
  input.syncGamepadButtons();
  overlayInputGuard = 0.45;
}

function joinGamepadToSlot(padIndex) {
  const existing = lobbyState.gamepadIndices.indexOf(padIndex);
  if (existing !== -1) return existing;

  const hasJoinedPads = getJoinedGamepadSlots().length > 0;
  let slotIdx = -1;
  if (!hasJoinedPads) {
    slotIdx = lobbyState.slots.findIndex(
      (s, i) => s === 'human' && lobbyState.gamepadIndices[i] === null
    );
    if (slotIdx === -1) {
      slotIdx = lobbyState.gamepadIndices.findIndex((g) => g === null);
    }
  } else {
    slotIdx = lobbyState.slots.findIndex(
      (s, i) => s !== 'human' && lobbyState.gamepadIndices[i] === null
    );
    if (slotIdx === -1) {
      slotIdx = lobbyState.gamepadIndices.findIndex((g) => g === null);
    }
  }
  if (slotIdx === -1) return -1;

  lobbyState.slots[slotIdx] = 'human';
  lobbyState.gamepadIndices[slotIdx] = padIndex;
  lobbyState.ready[slotIdx] = false;
  lobbyState.startCountdown = null;
  document.getElementById('lobby-error').hidden = true;
  sound.playPickup();
  renderLobbySlots();
  return slotIdx;
}

function detachDisconnectedGamepadSlot(slotIdx) {
  lobbyState.gamepadIndices[slotIdx] = null;
  lobbyState.ready[slotIdx] = false;
  lobbyState.startCountdown = null;
  const otherHumanExists = lobbyState.slots.some((s, i) => i !== slotIdx && s === 'human');
  if (otherHumanExists || slotIdx > 0) {
    let vacatedMode = getDefaultBotFillMode();
    if (vacatedMode === 'off') {
      const activeOthers = lobbyState.slots.filter((s, i) => i !== slotIdx && s !== 'off').length;
      if (activeOthers < 1) vacatedMode = 'bot_chill';
    }
    lobbyState.slots[slotIdx] = vacatedMode;
  }
}

function leaveGamepadSlot(slotIdx) {
  detachDisconnectedGamepadSlot(slotIdx);
  evaluateStartCountdown();
  sound.playDrop();
  renderLobbySlots();
}

function moveGamepadSlot(fromSlotIdx, delta) {
  if (lobbyState.ready[fromSlotIdx]) return false;
  const padIdx = lobbyState.gamepadIndices[fromSlotIdx];
  if (padIdx === null || padIdx < 0) return false;

  let targetIdx = -1;
  for (let step = 1; step <= 3; step++) {
    const cand = (fromSlotIdx + delta * step + 4) % 4;
    if (lobbyState.gamepadIndices[cand] === null && lobbyState.slots[cand] !== 'human') {
      targetIdx = cand;
      break;
    }
  }
  if (targetIdx === -1) return false;

  let vacatedMode = getDefaultBotFillMode();
  if (vacatedMode === 'off') {
    const futureHumans = lobbyState.slots.filter(
      (s, i) => (i === targetIdx) || (i !== fromSlotIdx && s === 'human')
    ).length;
    if (futureHumans < 2) vacatedMode = 'bot_chill';
  }

  lobbyState.gamepadIndices[fromSlotIdx] = null;
  lobbyState.ready[fromSlotIdx] = false;
  lobbyState.slots[fromSlotIdx] = vacatedMode;

  lobbyState.gamepadIndices[targetIdx] = padIdx;
  lobbyState.ready[targetIdx] = false;
  lobbyState.slots[targetIdx] = 'human';
  lobbyState.startCountdown = null;

  document.getElementById('lobby-error').hidden = true;
  sound.playPickup();
  renderLobbySlots();
  return true;
}

function cycleBotFillMode() {
  const nonHumanSlots = [0, 1, 2, 3].filter((i) => lobbyState.slots[i] !== 'human');
  if (nonHumanSlots.length === 0) return;

  const humanCount = lobbyState.slots.filter((s) => s === 'human').length;
  const firstMode = lobbyState.slots[nonHumanSlots[0]];
  let nextMode = 'bot_chill';
  if (firstMode === 'bot_chill') {
    nextMode = 'bot_clever';
  } else if (firstMode === 'bot_clever') {
    nextMode = humanCount >= 2 ? 'off' : 'bot_chill';
  } else {
    nextMode = 'bot_chill';
  }

  for (const i of nonHumanSlots) {
    lobbyState.slots[i] = nextMode;
  }
  lobbyState.startCountdown = null;
  document.getElementById('lobby-error').hidden = true;
  sound.playDrop();
  renderLobbySlots();
}

function toggleBestOf() {
  lobbyState.bestOf = lobbyState.bestOf === 3 ? 5 : 3;
  document.querySelectorAll('[data-best]').forEach((b) => {
    b.classList.toggle('active', Number(b.getAttribute('data-best')) === lobbyState.bestOf);
  });
  lobbyState.startCountdown = null;
  sound.playDrop();
  updateStartButtonUI();
}

function pruneDisconnectedGamepads(connectedIndexSet) {
  let changed = false;
  for (let i = 0; i < 4; i++) {
    const gp = lobbyState.gamepadIndices[i];
    if (gp !== null && !connectedIndexSet.has(gp)) {
      detachDisconnectedGamepadSlot(i);
      changed = true;
    }
  }
  if (changed) {
    evaluateStartCountdown();
  }
  return changed;
}

function evaluateStartCountdown() {
  const joined = getJoinedGamepadSlots();
  const activeHumans = [0, 1, 2, 3].filter((i) => lobbyState.slots[i] === 'human');
  if (joined.length > 0 && activeHumans.length > 0 && activeHumans.every((i) => lobbyState.ready[i])) {
    const activeCount = lobbyState.slots.filter((s) => s !== 'off').length;
    if (activeCount < 2) {
      const err = document.getElementById('lobby-error');
      err.textContent = t().gpNeedTwoHint;
      err.hidden = false;
      lobbyState.startCountdown = null;
    } else if (lobbyState.startCountdown === null) {
      lobbyState.startCountdown = 2.0;
      sound.playEventBell();
    }
  } else {
    lobbyState.startCountdown = null;
  }
}

function pollLobbyGamepads(dt) {
  const snapshots = input.pollMenuGamepads(dt);
  const connectedIndexSet = new Set(snapshots.map((s) => s.index));
  if (pruneDisconnectedGamepads(connectedIndexSet)) {
    renderLobbySlots();
  } else {
    updateGamepadBarUI();
  }

  if (overlayInputGuard > 0) return;

  let needsRender = false;
  for (const pad of snapshots) {
    const slotIdx = lobbyState.gamepadIndices.indexOf(pad.index);
    if (slotIdx === -1) {
      if (pad.anyPressed) {
        joinGamepadToSlot(pad.index);
      }
      continue;
    }

    if (pad.prevSlotPressed && !lobbyState.ready[slotIdx]) {
      if (moveGamepadSlot(slotIdx, -1)) {
        needsRender = false;
        continue;
      }
    }
    if (pad.nextSlotPressed && !lobbyState.ready[slotIdx]) {
      if (moveGamepadSlot(slotIdx, 1)) {
        needsRender = false;
        continue;
      }
    }
    if (pad.leftPressed && !lobbyState.ready[slotIdx]) {
      lobbyState.charIndices[slotIdx] =
        (lobbyState.charIndices[slotIdx] - 1 + CHARACTERS.length) % CHARACTERS.length;
      sound.playDrop();
      needsRender = true;
    }
    if (pad.rightPressed && !lobbyState.ready[slotIdx]) {
      lobbyState.charIndices[slotIdx] = (lobbyState.charIndices[slotIdx] + 1) % CHARACTERS.length;
      sound.playDrop();
      needsRender = true;
    }
    if (pad.confirmPressed) {
      if (!lobbyState.ready[slotIdx]) {
        lobbyState.ready[slotIdx] = true;
        sound.playPickup();
        evaluateStartCountdown();
        needsRender = true;
      } else if (lobbyState.startCountdown !== null) {
        startMatch();
        return;
      }
    }
    if (pad.startPressed) {
      const activeHumans = [0, 1, 2, 3].filter((i) => lobbyState.slots[i] === 'human');
      if (
        lobbyState.startCountdown !== null ||
        (activeHumans.length > 0 && activeHumans.every((i) => lobbyState.ready[i]))
      ) {
        startMatch();
        return;
      } else if (!lobbyState.ready[slotIdx]) {
        lobbyState.ready[slotIdx] = true;
        sound.playPickup();
        evaluateStartCountdown();
        needsRender = true;
      }
    }
    if (pad.cancelPressed) {
      if (lobbyState.ready[slotIdx]) {
        lobbyState.ready[slotIdx] = false;
        lobbyState.startCountdown = null;
        sound.playDrop();
        needsRender = true;
      } else {
        leaveGamepadSlot(slotIdx);
        needsRender = false;
        continue;
      }
    }
    if (pad.botsPressed) {
      cycleBotFillMode();
      needsRender = false;
    }
    if (pad.lengthPressed) {
      toggleBestOf();
    }
  }

  if (needsRender) {
    renderLobbySlots();
  }

  if (lobbyState.startCountdown !== null) {
    lobbyState.startCountdown -= dt;
    if (lobbyState.startCountdown <= 0) {
      startMatch();
      return;
    }
    const secs = Math.max(1, Math.ceil(lobbyState.startCountdown));
    if (secs !== lastCountdownCeil) {
      updateStartButtonUI();
    }
  }
}

function pollPauseOverlayGamepads(dt) {
  const snapshots = input.pollMenuGamepads(dt);
  document.getElementById('pause-gp-hint').hidden = snapshots.length === 0;
  if (overlayInputGuard > 0) return;

  for (const pad of snapshots) {
    if (pad.confirmPressed || pad.startPressed) {
      togglePause();
      return;
    }
    if (pad.cancelPressed) {
      returnToLobby();
      return;
    }
  }
}

function pollResultOverlayGamepads(dt) {
  const snapshots = input.pollMenuGamepads(dt);
  document.getElementById('result-gp-hint').hidden = snapshots.length === 0;
  if (overlayInputGuard > 0) return;

  for (const pad of snapshots) {
    if (pad.confirmPressed || pad.startPressed) {
      document.getElementById('next-round-btn').click();
      return;
    }
    if (pad.cancelPressed) {
      returnToLobby();
      return;
    }
  }
}

function startMatch() {
  const activeCount = lobbyState.slots.filter((s) => s !== 'off').length;
  if (activeCount < 2) {
    const err = document.getElementById('lobby-error');
    err.textContent = t().needTwoPlayers;
    err.hidden = false;
    return;
  }

  lobbyState.startCountdown = null;
  sound.ensureContext();
  sound.startMusic('match');
  game = new GameEngine(sound, {
    slots: [...lobbyState.slots],
    charIds: lobbyState.charIndices.map((ci) => CHARACTERS[ci].id),
    gamepadIndices: [...lobbyState.gamepadIndices],
    bestOf: lobbyState.bestOf,
    lang: currentLang,
  });
  resultShownForRound = 0;
  lastHudSignature = '';
  activeWinnerCanvases = [];

  document.getElementById('lobby-overlay').hidden = true;
  document.getElementById('pause-overlay').hidden = true;
  document.getElementById('result-overlay').hidden = true;
  document.activeElement?.blur?.();
  accumulator = 0;
  input.resetAll();
  input.syncGamepadButtons();
  input.setCaptureKeys(true);
  overlayInputGuard = 0.45;
  updateCoachKeysUI();

  updateHUD();
  if (!rafId) {
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(gameLoop);
  }
}

function returnToLobby() {
  if (game) game.paused = true;
  activeWinnerCanvases = [];
  lobbyState.ready = [false, false, false, false];
  lobbyState.startCountdown = null;
  sound.setMusicMode('lobby');
  input.setCaptureKeys(false);
  input.syncGamepadButtons();
  overlayInputGuard = 0.45;
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
  document.getElementById('pause-gp-hint').hidden =
    !game.paused || input.getConnectedGamepads().length === 0;
  document.activeElement?.blur?.();
  accumulator = 0;
  input.resetAll();
  input.syncGamepadButtons();
  input.setCaptureKeys(!game.paused);
  overlayInputGuard = 0.45;
}

function gameLoop(now) {
  const delta = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (overlayInputGuard > 0) {
    overlayInputGuard = Math.max(0, overlayInputGuard - delta);
  }

  const lobbyVisible = !document.getElementById('lobby-overlay').hidden;
  const pauseVisible = !document.getElementById('pause-overlay').hidden;
  const resultVisible = !document.getElementById('result-overlay').hidden;

  if (lobbyVisible) {
    pollLobbyGamepads(delta);
  } else if (pauseVisible) {
    pollPauseOverlayGamepads(delta);
  } else if (resultVisible) {
    pollResultOverlayGamepads(delta);
    if (game && activeWinnerCanvases.length > 0) {
      const tSec = now / 1000;
      for (const item of activeWinnerCanvases) {
        renderer.renderAvatarCanvas(item.canvas, item.char, item.size, true, tSec);
      }
    }
  } else if (game) {
    if (input.pollPausePressed()) {
      togglePause();
    } else {
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
  document.activeElement?.blur?.();
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
  document.activeElement?.blur?.();
}

function toggleMute() {
  const muted = sound.toggleMute();
  document.getElementById('mute-btn').textContent = muted ? '🔇' : '🔊';
  document.activeElement?.blur?.();
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
    document.activeElement?.blur?.();
    accumulator = 0;
    input.resetAll();
    input.syncGamepadButtons();
    input.setCaptureKeys(true);
    overlayInputGuard = 0.45;
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
    lobbyState.startCountdown = null;
    updateStartButtonUI();
  });
});

window.addEventListener('gamepadconnected', (e) => {
  const pad = e.gamepad;
  if (!pad) return;
  const lobbyVisible = !document.getElementById('lobby-overlay').hidden;
  if (lobbyVisible && pad.mapping === 'standard') {
    joinGamepadToSlot(pad.index);
    input.syncGamepadButtons();
  }
  updateCoachKeysUI();
});

window.addEventListener('gamepaddisconnected', (e) => {
  const pad = e.gamepad;
  if (!pad) return;
  const idx = lobbyState.gamepadIndices.indexOf(pad.index);
  if (idx !== -1) {
    detachDisconnectedGamepadSlot(idx);
    evaluateStartCountdown();
    if (!document.getElementById('lobby-overlay').hidden) {
      renderLobbySlots();
    }
  }
  input.syncGamepadButtons();
  updateCoachKeysUI();
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const lobbyVisible = !document.getElementById('lobby-overlay').hidden;
  if (lobbyVisible && overlayInputGuard <= 0) {
    const isControlFocused =
      e.target && typeof e.target.closest === 'function' && e.target.closest('button, input, select, textarea');
    if (!isControlFocused && getJoinedGamepadSlots().length > 0) {
      const kbSlots = getKeyboardHumanSlots();
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (kbSlots.length === 0) {
          const openSlot = lobbyState.slots.findIndex((s) => s !== 'human');
          if (openSlot !== -1) {
            lobbyState.slots[openSlot] = 'human';
            lobbyState.ready[openSlot] = false;
            lobbyState.startCountdown = null;
            document.getElementById('lobby-error').hidden = true;
            sound.playPickup();
            renderLobbySlots();
          }
        } else {
          const kbSlot = kbSlots[0];
          if (!lobbyState.ready[kbSlot]) {
            lobbyState.ready[kbSlot] = true;
            sound.playPickup();
            evaluateStartCountdown();
            renderLobbySlots();
          } else if (lobbyState.startCountdown !== null) {
            startMatch();
          }
        }
        return;
      }
      if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && kbSlots.length > 0 && !lobbyState.ready[kbSlots[0]]) {
        e.preventDefault();
        const kbSlot = kbSlots[0];
        lobbyState.charIndices[kbSlot] =
          (lobbyState.charIndices[kbSlot] - 1 + CHARACTERS.length) % CHARACTERS.length;
        sound.playDrop();
        renderLobbySlots();
        return;
      }
      if ((e.code === 'ArrowRight' || e.code === 'KeyD') && kbSlots.length > 0 && !lobbyState.ready[kbSlots[0]]) {
        e.preventDefault();
        const kbSlot = kbSlots[0];
        lobbyState.charIndices[kbSlot] = (lobbyState.charIndices[kbSlot] + 1) % CHARACTERS.length;
        sound.playDrop();
        renderLobbySlots();
        return;
      }
      if ((e.code === 'Backspace' || e.code === 'Escape') && kbSlots.length > 0) {
        e.preventDefault();
        const kbSlot = kbSlots[0];
        if (lobbyState.ready[kbSlot]) {
          lobbyState.ready[kbSlot] = false;
          lobbyState.startCountdown = null;
          sound.playDrop();
          renderLobbySlots();
        } else if (lobbyState.slots.some((s, i) => i !== kbSlot && s === 'human')) {
          lobbyState.slots[kbSlot] = getDefaultBotFillMode();
          lobbyState.ready[kbSlot] = false;
          lobbyState.startCountdown = null;
          sound.playDrop();
          renderLobbySlots();
        }
        return;
      }
    }
  }
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
  if (game) renderer.render(game);
});

applyLanguageUI();
// Draw an initial preview board behind the lobby
game = new GameEngine(null, {
  slots: lobbyState.slots,
  charIds: lobbyState.charIndices.map((ci) => CHARACTERS[ci].id),
  gamepadIndices: [...lobbyState.gamepadIndices],
  bestOf: 3,
  lang: currentLang,
});
game.paused = true;
renderer.render(game);
lastHudSignature = '';
updateHUD();
lastFrameTime = performance.now();
rafId = requestAnimationFrame(gameLoop);
