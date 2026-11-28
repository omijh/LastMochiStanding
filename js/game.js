import {
  BOMB_FUSE,
  CHARACTERS,
  COLS,
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED,
  EXPLOSION_DURATION,
  GHOST_COOLDOWN,
  JELLY_DURATION,
  KAITEN_DURATION,
  KAITEN_START_AT,
  MOCHI_BALL_DURATION,
  POWERUP_KEYS,
  ROUND_SECONDS,
  ROWS,
  SNACK_COOLDOWN,
  STEAMER_INTERVAL,
  SUDDEN_DEATH_AT,
  SUGAR_RUSH_DURATION,
  TILE,
  TILE_TYPE,
  TRANSLATIONS,
} from './constants.js';
import { computeBotInput } from './bot.js';
import { getMapConfig, pickMapId } from './maps.js';

function buildSpiralOrder() {
  const order = [];
  let top = 1;
  let bottom = ROWS - 2;
  let left = 1;
  let right = COLS - 2;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) order.push({ c, r: top });
    top++;
    for (let r = top; r <= bottom; r++) order.push({ c: right, r });
    right--;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) order.push({ c, r: bottom });
      bottom--;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r--) order.push({ c: left, r });
      left++;
    }
  }
  return order;
}

const SPIRAL_COORDS = buildSpiralOrder();

export class GameEngine {
  constructor(sound, options = {}) {
    this.sound = sound;
    this.bestOf = options.bestOf || 3;
    this.winsNeeded = Math.ceil(this.bestOf / 2);
    this.slotConfigs = options.slots || [
      'human',
      'bot_chill',
      'bot_chill',
      'bot_chill',
    ];
    this.charIds = options.charIds || CHARACTERS.map((c) => c.id);
    this.gamepadIndices = Array.isArray(options.gamepadIndices)
      ? options.gamepadIndices.slice(0, 4)
      : [null, null, null, null];
    this.lang = options.lang || 'en';
    this.mapSelection = options.mapSelection || 'random';
    this.forcedMapId = options.forcedMapId || null;
    this.mapId = null;
    this.mapConfig = getMapConfig('cafe');
    this.humanSlotCount = this.slotConfigs.filter((s) => s === 'human').length;

    this.matchStats = CHARACTERS.map((defaultCh, idx) => {
      const charId = this.charIds[idx];
      const ch = CHARACTERS.find((c) => c.id === charId) || defaultCh;
      return {
        id: idx,
        char: ch,
        wins: 0,
        cratesBroken: 0,
        bowls: 0,
        combos: 0,
        ghostHits: 0,
        timesPuffed: 0,
      };
    });

    this.roundNumber = 0;
    this.matchOver = false;
    this.matchWinner = null;
    this.roundWinner = null;
    this.roundResultReady = false;
    this.paused = false;

    this.startRound();
  }

  setLang(lang) {
    this.lang = lang;
    this.updateLiveHint();
  }

  startRound() {
    this.roundNumber += 1;
    this.elapsed = 0;
    this.timeLeft = ROUND_SECONDS;
    this.roundOver = false;
    this.roundResultReady = false;
    this.roundWinner = null;
    this.roundResolveTimer = -1;

    this.mapId = this.forcedMapId || pickMapId(this.mapSelection, this.mapId);
    this.forcedMapId = null;
    this.mapConfig = getMapConfig(this.mapId);

    this.grid = this.generateGrid();
    this.bombs = [];
    this.explosions = [];
    this.powerups = [];
    this.bobaPearls = [];
    this.jellyPads = [];
    this.caramelZones = [];
    this.floorSmashes = [];
    this.spikeTraps = [];
    this.pendingSpikeWaves = [];
    this.laneSwoops = [];
    this.eventWaveQueue = [];
    this.particles = [];
    this.popups = [];
    this.ghostProjectiles = [];
    this.suddenWarnings = [];

    this.goldenMochi = null;
    this.steamerTimer = STEAMER_INTERVAL;
    this.botBombGapTimer = 0;
    this.kaitenTriggered = false;
    this.kaitenTimer = 0;
    this.suddenStarted = false;
    this.suddenIndex = 0;
    this.suddenTickTimer = 0;
    this.activeBanner = null;
    this.bannerTimer = 0;
    this.screenShake = 0;
    this.liveHint = '';

    this.players = [];
    this.slotConfigs.forEach((controlType, idx) => {
      if (controlType === 'off') return;
      const charId = this.charIds[idx];
      const ch = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[idx];
      const cornerSpawn = CHARACTERS[idx].spawn;
      const spawnX = (cornerSpawn.c + 0.5) * TILE;
      const spawnY = (cornerSpawn.r + 0.5) * TILE;
      this.matchStats[idx].char = ch;

      this.players.push({
        id: idx,
        slotIndex: idx,
        controlType,
        char: ch,
        flavor: ch.flavor,
        x: spawnX,
        y: spawnY,
        facingX: 0,
        facingY: 1,
        walkPhase: 0,
        state: 'alive', // 'alive' | 'mochi_ball' | 'ghost'
        maxBombs: 1,
        activeBombs: 0,
        range: 2,
        speed: 184,
        canKick: false,
        hasShield: false,
        invulnTimer: 0,
        mochiTimer: 0,
        mochiMaxTimer: MOCHI_BALL_DURATION,
        bowlVx: 0,
        bowlVy: 0,
        bowlTimer: 0,
        bowledBy: null,
        ghostCooldown: 0,
        dashCooldown: 0,
        bombCooldown: 0,
        wiggleCooldown: 0,
        prevWiggleDx: 0,
        prevWiggleDy: 0,
        botSnackTimer: 0,
        dashTimer: 0,
        dashVx: 0,
        dashVy: 0,
        sugarRushTimer: 0,
        wiggleFeedbackTimer: 0,
        isCelebrating: false,
        celebrateSparkleTimer: 0,
        jumpTimer: 0,
        jumpDuration: 0.36,
        jumpStartX: spawnX,
        jumpStartY: spawnY,
        jumpEndX: spawnX,
        jumpEndY: spawnY,
        botThinkTimer: Math.random() * 0.12,
        botCachedInput: { dx: 0, dy: 0, actionPressed: false, dashPressed: false },
        botCommitTileKey: null,
        stats: this.matchStats[idx],
      });
    });

    this.updateLiveHint();
  }

  generateGrid() {
    const grid = [];
    const safeZones = new Set();

    // 4-tile corner spawn safety L-zones
    CHARACTERS.forEach((ch) => {
      const { c, r } = ch.spawn;
      safeZones.add(`${c},${r}`);
      safeZones.add(`${c + (c === 1 ? 1 : -1)},${r}`);
      safeZones.add(`${c},${r + (r === 1 ? 1 : -1)}`);
    });

    // Clear 3x3 center steamer arena
    for (let r = 4; r <= 6; r++) {
      for (let c = 5; c <= 7; c++) {
        safeZones.add(`${c},${r}`);
      }
    }

    const wallList = this.mapConfig?.walls || [];
    const bumperList = this.mapConfig?.bumpers || [];
    const crateDensity = this.mapConfig?.crateDensity ?? 0.45;
    const tableSet = new Set(wallList.map(([c, r]) => `${c},${r}`));
    const bumperSet = new Set(bumperList.map(([c, r]) => `${c},${r}`));

    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const key = `${c},${r}`;
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
          row.push(TILE_TYPE.WALL);
        } else if (tableSet.has(key)) {
          row.push(TILE_TYPE.WALL);
        } else if (bumperSet.has(key)) {
          row.push(TILE_TYPE.BUMPER);
        } else if (safeZones.has(key)) {
          row.push(TILE_TYPE.EMPTY);
        } else {
          row.push(Math.random() < crateDensity ? TILE_TYPE.CRATE : TILE_TYPE.EMPTY);
        }
      }
      grid.push(row);
    }
    return grid;
  }

  getBombAtTile(c, r) {
    return this.bombs.find((b) => b.c === c && b.r === r && b.vx === 0 && b.vy === 0) || null;
  }

  isSolidTile(tile) {
    return tile === TILE_TYPE.WALL || tile === TILE_TYPE.SUDDEN_WALL || tile === TILE_TYPE.BUMPER;
  }

  isTilePassableForPlayer(c, r, playerId) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    if (this.grid[r][c] !== TILE_TYPE.EMPTY) return false;
    const bomb = this.getBombAtTile(c, r);
    if (bomb && !bomb.passableBy.has(playerId)) return false;
    return true;
  }

  computeBombBlastCells(bomb) {
    const cells = [];
    const seen = new Set();
    const pushCell = (c, r, stopsCrate = false) => {
      const key = `${c},${r}`;
      if (!seen.has(key)) {
        seen.add(key);
        cells.push({ c, r, stopsCrate });
      }
    };

    const inBounds = (c, r) => c >= 1 && c < COLS - 1 && r >= 1 && r < ROWS - 1;
    const isSolidAt = (c, r) => !inBounds(c, r) || this.isSolidTile(this.grid[r][c]);
    const pattern = bomb.isMini ? 'cross_slide' : bomb.attackPattern || 'cross_slide';

    if (pattern === 'square_3x3') {
      const blockedCardinal = { '1,0': false, '-1,0': false, '0,1': false, '0,-1': false };
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nc = bomb.c + dc;
          const nr = bomb.r + dr;
          if (!inBounds(nc, nr)) continue;
          if (
            Math.abs(dc) === 1 &&
            Math.abs(dr) === 1 &&
            isSolidAt(bomb.c + dc, bomb.r) &&
            isSolidAt(bomb.c, bomb.r + dr)
          ) {
            continue;
          }
          const t = this.grid[nr][nc];
          if (this.isSolidTile(t)) {
            if (Math.abs(dc) + Math.abs(dr) === 1) {
              blockedCardinal[`${dc},${dr}`] = true;
            }
            continue;
          }
          const isCrate = t === TILE_TYPE.CRATE;
          pushCell(nc, nr, isCrate);
          if (isCrate && Math.abs(dc) + Math.abs(dr) === 1) {
            blockedCardinal[`${dc},${dr}`] = true;
          }
        }
      }
      if (bomb.range >= 4) {
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (blockedCardinal[`${dc},${dr}`]) continue;
          for (let step = 2; step <= bomb.range - 2; step++) {
            const nc = bomb.c + dc * step;
            const nr = bomb.r + dr * step;
            if (!inBounds(nc, nr)) break;
            const t = this.grid[nr][nc];
            if (this.isSolidTile(t)) break;
            const isCrate = t === TILE_TYPE.CRATE;
            pushCell(nc, nr, isCrate);
            if (isCrate) break;
          }
        }
      }
      return cells;
    }

    if (pattern === 'starburst') {
      pushCell(bomb.c, bomb.r, false);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        for (let step = 1; step <= bomb.range; step++) {
          const nc = bomb.c + dc * step;
          const nr = bomb.r + dr * step;
          if (!inBounds(nc, nr)) break;
          const t = this.grid[nr][nc];
          if (this.isSolidTile(t)) break;
          const isCrate = t === TILE_TYPE.CRATE;
          pushCell(nc, nr, isCrate);
          if (isCrate) break;
        }
      }
      const diagRange = 1;
      for (const [dc, dr] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        for (let step = 1; step <= diagRange; step++) {
          const prevC = bomb.c + dc * (step - 1);
          const prevR = bomb.r + dr * (step - 1);
          if (isSolidAt(prevC + dc, prevR) && isSolidAt(prevC, prevR + dr)) break;
          const nc = bomb.c + dc * step;
          const nr = bomb.r + dr * step;
          if (!inBounds(nc, nr)) break;
          const t = this.grid[nr][nc];
          if (this.isSolidTile(t)) break;
          const isCrate = t === TILE_TYPE.CRATE;
          pushCell(nc, nr, isCrate);
          if (isCrate) break;
        }
      }
      return cells;
    }

    if (pattern === 'cone_wave') {
      let fx = bomb.facingX || 0;
      let fy = bomb.facingY || 0;
      if (fx === 0 && fy === 0) fy = 1;
      const lx = fy !== 0 ? 1 : 0;
      const ly = fx !== 0 ? 1 : 0;
      const forwardSteps = Math.min(4, bomb.range);

      pushCell(bomb.c, bomb.r, false);

      // 1-tile back splash so Poko has no close-range blind spot behind the bomb
      const backC = bomb.c - fx;
      const backR = bomb.r - fy;
      if (inBounds(backC, backR)) {
        const bt = this.grid[backR][backC];
        if (!this.isSolidTile(bt)) {
          pushCell(backC, backR, bt === TILE_TYPE.CRATE);
        }
      }

      // Walk center forward ray and flare laterally at each step so obstacles at origin don't kill the whole wing
      for (const lat of [-1, 1]) {
        const wingC = bomb.c + lx * lat;
        const wingR = bomb.r + ly * lat;
        if (inBounds(wingC, wingR)) {
          const wt = this.grid[wingR][wingC];
          if (!this.isSolidTile(wt)) {
            pushCell(wingC, wingR, wt === TILE_TYPE.CRATE);
          }
        }
      }

      for (let step = 1; step <= forwardSteps; step++) {
        const centerC = bomb.c + fx * step;
        const centerR = bomb.r + fy * step;
        if (!inBounds(centerC, centerR)) break;
        const ct = this.grid[centerR][centerC];
        if (this.isSolidTile(ct)) break;
        const centerCrate = ct === TILE_TYPE.CRATE;
        pushCell(centerC, centerR, centerCrate);
        for (const lat of [-1, 1]) {
          const wc = centerC + lx * lat;
          const wr = centerR + ly * lat;
          if (!inBounds(wc, wr)) continue;
          const wt = this.grid[wr][wc];
          if (this.isSolidTile(wt)) continue;
          pushCell(wc, wr, wt === TILE_TYPE.CRATE);
        }
        if (centerCrate) break;
      }
      return cells;
    }

    // Default: 'cross_slide'
    pushCell(bomb.c, bomb.r, false);
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      for (let step = 1; step <= bomb.range; step++) {
        const nc = bomb.c + dc * step;
        const nr = bomb.r + dr * step;
        if (!inBounds(nc, nr)) break;
        const t = this.grid[nr][nc];
        if (this.isSolidTile(t)) break;
        const isCrate = t === TILE_TYPE.CRATE;
        pushCell(nc, nr, isCrate);
        if (isCrate) break;
      }
    }
    return cells;
  }

  showBanner(text, duration = 4) {
    this.activeBanner = text;
    this.bannerTimer = duration;
  }

  addPopup(x, y, text, color = '#ffffff') {
    this.popups.push({
      x,
      y,
      text,
      color,
      life: 0.95,
      maxLife: 0.95,
    });
  }

  spawnConfetti(x, y, colors, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = 65 + Math.random() * 145;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 35,
        size: 3 + Math.random() * 4,
        color: colors[i % colors.length],
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
      });
    }
  }

  step(dt, inputManager) {
    if (this.paused || this.roundResultReady) return;

    this.elapsed += dt;
    if (this.roundResolveTimer < 0) {
      const humansAllGhosts =
        this.humanSlotCount > 0 &&
        this.players.filter((p) => p.controlType === 'human').every((p) => p.state === 'ghost') &&
        this.players.filter((p) => p.controlType !== 'human' && p.state !== 'ghost').length >= 2;
      const timeMult = humansAllGhosts && this.timeLeft > SUDDEN_DEATH_AT ? 1.8 : 1;
      this.timeLeft = Math.max(0, this.timeLeft - dt * timeMult);
      if (this.botBombGapTimer > 0) this.botBombGapTimer = Math.max(0, this.botBombGapTimer - dt);

      // Center Golden Steamer event
      this.updateSteamer(dt);

      // Trigger Map-specific Mid-Round Event
      if (!this.kaitenTriggered && this.timeLeft <= KAITEN_START_AT) {
        this.kaitenTriggered = true;
        this.triggerMapEvent();
      }

      // Trigger Sudden Death inward spiral crates
      if (!this.suddenStarted && this.timeLeft <= SUDDEN_DEATH_AT) {
        this.suddenStarted = true;
        this.suddenTickTimer = 0.25;
        this.sound?.playEventBell();
        const tr = TRANSLATIONS[this.lang] || TRANSLATIONS.en;
        this.showBanner(tr.eventSuddenDeath, 3.2);
      }

      if (this.suddenStarted && this.suddenIndex < SPIRAL_COORDS.length) {
        this.suddenTickTimer -= dt;
        if (this.suddenTickTimer <= 0) {
          this.suddenTickTimer = humansAllGhosts ? 0.38 : 0.62;
          this.advanceSuddenDeath();
        }
      }
    }

    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 28);
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.activeBanner = null;
    }
    if (this.kaitenTimer > 0) {
      this.kaitenTimer = Math.max(0, this.kaitenTimer - dt);
    }

    // Map human players to bound hardware gamepads, falling back sequentially for unbound slots
    let gamepadCounter = 0;
    const boundPadSet = new Set(
      this.gamepadIndices.filter((idx) => idx !== null && idx !== undefined && idx >= 0)
    );
    const keyboardHumans = this.players.filter(
      (p) =>
        p.controlType === 'human' &&
        !(
          this.gamepadIndices[p.slotIndex] !== null &&
          this.gamepadIndices[p.slotIndex] !== undefined &&
          this.gamepadIndices[p.slotIndex] >= 0
        )
    );
    const touchTargetSlot =
      keyboardHumans[0]?.slotIndex ??
      (this.humanSlotCount === 1
        ? (this.players.find((p) => p.controlType === 'human')?.slotIndex ?? -1)
        : -1);

    // Update players
    for (const p of this.players) {
      if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
      if (p.ghostCooldown > 0) p.ghostCooldown = Math.max(0, p.ghostCooldown - dt);
      if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
      if (p.bombCooldown > 0) p.bombCooldown = Math.max(0, p.bombCooldown - dt);
      if (p.wiggleCooldown > 0) p.wiggleCooldown = Math.max(0, p.wiggleCooldown - dt);
      if (p.botSnackTimer > 0) p.botSnackTimer = Math.max(0, p.botSnackTimer - dt);
      if (p.sugarRushTimer > 0) p.sugarRushTimer = Math.max(0, p.sugarRushTimer - dt);
      if (p.wiggleFeedbackTimer > 0) p.wiggleFeedbackTimer = Math.max(0, p.wiggleFeedbackTimer - dt);

      let input = { dx: 0, dy: 0, actionPressed: false, dashPressed: false };
      if (p.controlType === 'human') {
        const boundPadIdx = this.gamepadIndices[p.slotIndex] ?? null;
        const hasBoundPad = boundPadIdx !== null && boundPadIdx >= 0;
        const gpIdx = hasBoundPad ? -1 : gamepadCounter++;
        const kbOrder = hasBoundPad ? -1 : keyboardHumans.indexOf(p);
        const keyboardKeymapIndex = hasBoundPad
          ? keyboardHumans.length > 0
            ? -1
            : p.slotIndex
          : kbOrder;
        const allowSecondaryForPlayer = hasBoundPad
          ? keyboardHumans.length === 0 && this.humanSlotCount === 1
          : keyboardHumans.length === 1;
        const curC = Math.floor(p.x / TILE);
        const curR = Math.floor(p.y / TILE);
        const canMoveDirFn =
          p.state === 'alive'
            ? (dx, dy) => this.isTilePassableForPlayer(curC + dx, curR + dy, p.id)
            : null;
        input = inputManager
          ? inputManager.readPlayerInput(
              p.slotIndex,
              gpIdx,
              allowSecondaryForPlayer,
              canMoveDirFn,
              hasBoundPad ? boundPadIdx : null,
              hasBoundPad ? null : boundPadSet,
              keyboardKeymapIndex,
              p.slotIndex === touchTargetSlot
            )
          : input;
      } else {
        input = computeBotInput(this, p, dt);
      }

      if (p.isCelebrating) {
        p.facingX = 0;
        p.facingY = 1;
        p.celebrateSparkleTimer -= dt;
        if (p.celebrateSparkleTimer <= 0) {
          p.celebrateSparkleTimer = 0.28;
          this.spawnConfetti(
            p.x,
            p.y - 18,
            [p.char.color, '#facc15', '#ffffff', p.char.splash],
            6
          );
        }
      } else if (p.state === 'alive') {
        this.updateAlivePlayer(p, input, dt);
      } else if (p.state === 'mochi_ball') {
        this.updateMochiBallPlayer(p, input, dt);
      } else if (p.state === 'ghost') {
        this.updateGhostPlayer(p, input, dt);
      }

      if ((p.state === 'alive' || p.state === 'mochi_ball') && !p.isCelebrating && p.jumpTimer <= 0) {
        const curTile = this.grid[Math.floor(p.y / TILE)]?.[Math.floor(p.x / TILE)];
        if (curTile === TILE_TYPE.SUDDEN_WALL) {
          this.addPopup(p.x, p.y - 22, 'CLOSING KO! 📦', '#e11d48');
          this.convertToGhost(p);
        }
      }
    }

    // Check alive-to-mochi-ball collisions (Mochi Bowling!)
    this.checkMochiBowlingBumps();

    // Apply Kaiten-Zushi belt conveyances
    if (this.kaitenTimer > 0) {
      this.applyKaitenBelt(dt);
    }

    // Update bombs, projectiles, zones, map powers, explosions, warnings, particles
    this.updateBombs(dt);
    this.updateBobaPearls(dt);
    this.updateGhostProjectiles(dt);
    this.updateJellyPads(dt);
    this.updateCaramelZones(dt);
    this.updateEventWaveQueue(dt);
    this.updatePendingSpikeWaves(dt);
    this.updateFloorSmashes(dt);
    this.updateSpikeTraps(dt);
    this.updateLaneSwoops(dt);
    this.updateExplosions(dt);
    this.updateSuddenWarnings(dt);
    this.updateParticlesAndPopups(dt);

    // Update contextual live coach hint
    this.updateLiveHint();

    // Check round resolution
    this.checkRoundOutcome(dt);
  }

  updateSteamer(dt) {
    if (this.goldenMochi) {
      this.goldenMochi.bobPhase += dt * 5;
      return;
    }
    if (this.suddenStarted) return;

    this.steamerTimer -= dt;
    if (this.steamerTimer <= 0) {
      this.steamerTimer = STEAMER_INTERVAL;
      // Clear any crate/bomb at (6, 5) just in case
      if (this.grid[5][6] === TILE_TYPE.CRATE) this.grid[5][6] = TILE_TYPE.EMPTY;
      if (this.grid[5][6] === TILE_TYPE.EMPTY) {
        this.goldenMochi = { c: 6, r: 5, bobPhase: 0 };
        this.sound?.playEventBell();
        const tr = TRANSLATIONS[this.lang] || TRANSLATIONS.en;
        const msg =
          this.mapId === 'prehistoric'
            ? tr.eventSteamerPrehistoric
            : this.mapId === 'night'
              ? tr.eventSteamerNight
              : this.mapId === 'space'
                ? tr.eventSteamerSpace
                : tr.eventSteamer;
        this.showBanner(msg, 2.8);
      }
    }
  }

  updateCaramelZones(dt) {
    for (let i = this.caramelZones.length - 1; i >= 0; i--) {
      this.caramelZones[i].timer -= dt;
      if (this.caramelZones[i].timer <= 0) {
        this.caramelZones.splice(i, 1);
      }
    }
  }

  updateLiveHint() {
    const tr = TRANSLATIONS[this.lang] || TRANSLATIONS.en;
    const humans = this.players.filter((p) => p.controlType === 'human');

    if (humans.length === 0) {
      if (this.players.some((p) => p.state === 'mochi_ball')) {
        this.liveHint = tr.hintEnemyPuffed;
      } else if (this.goldenMochi) {
        this.liveHint = tr.hintSteamerReady;
      } else {
        this.liveHint = tr.hintStart;
      }
      return;
    }

    if (humans.length === 1) {
      const primaryHuman = humans[0];
      if (primaryHuman.state === 'mochi_ball') {
        this.liveHint = tr.hintSelfPuffed;
      } else if (primaryHuman.state === 'ghost') {
        this.liveHint = tr.hintGhost;
      } else if (this.players.some((p) => p.id !== primaryHuman.id && p.state === 'mochi_ball')) {
        this.liveHint = tr.hintEnemyPuffed;
      } else if (this.goldenMochi) {
        this.liveHint = tr.hintSteamerReady;
      } else {
        this.liveHint = tr.hintStart;
      }
      return;
    }

    // 2+ human players
    if (humans.every((p) => p.state === 'ghost')) {
      this.liveHint = tr.hintGhost;
    } else if (this.players.some((p) => p.state === 'mochi_ball')) {
      this.liveHint = tr.hintEnemyPuffed;
    } else if (humans.some((p) => p.state === 'ghost')) {
      this.liveHint = tr.hintGhost;
    } else if (this.goldenMochi) {
      this.liveHint = tr.hintSteamerReady;
    } else {
      this.liveHint = tr.hintStart;
    }
  }

  getUpcomingSuddenTiles(limit = 2) {
    const res = [];
    for (let idx = this.suddenIndex; idx < SPIRAL_COORDS.length && res.length < limit; idx++) {
      const target = SPIRAL_COORDS[idx];
      const t = this.grid[target.r][target.c];
      if (t !== TILE_TYPE.WALL && t !== TILE_TYPE.BUMPER) {
        res.push(target);
      }
    }
    return res;
  }

  advanceSuddenDeath() {
    while (this.suddenIndex < SPIRAL_COORDS.length) {
      const target = SPIRAL_COORDS[this.suddenIndex++];
      const t = this.grid[target.r][target.c];
      if (t !== TILE_TYPE.WALL && t !== TILE_TYPE.BUMPER) {
        this.suddenWarnings.push({ c: target.c, r: target.r, timer: 0.6 });
        break;
      }
    }
  }

  updateSuddenWarnings(dt) {
    for (let i = this.suddenWarnings.length - 1; i >= 0; i--) {
      const w = this.suddenWarnings[i];
      w.timer -= dt;
      if (w.timer <= 0) {
        this.suddenWarnings.splice(i, 1);
        this.dropSuddenCrate(w.c, w.r);
      }
    }
  }

  dropSuddenCrate(c, r) {
    this.grid[r][c] = TILE_TYPE.SUDDEN_WALL;
    this.powerups = this.powerups.filter((pu) => !(pu.c === c && pu.r === r));
    this.spikeTraps = this.spikeTraps.filter((sp) => !(sp.c === c && sp.r === r));
    if (this.goldenMochi && this.goldenMochi.c === c && this.goldenMochi.r === r) {
      this.goldenMochi = null;
    }
    this.bombs = this.bombs.filter((b) => {
      if (b.c === c && b.r === r) {
        const owner = this.players.find((p) => p.id === b.ownerId);
        if (owner && !b.isMini) owner.activeBombs = Math.max(0, owner.activeBombs - 1);
        return false;
      }
      return true;
    });

    const cx = (c + 0.5) * TILE;
    const cy = (r + 0.5) * TILE;
    for (const p of this.players) {
      if (p.state !== 'alive' && p.state !== 'mochi_ball') continue;
      const sameTile = Math.floor(p.x / TILE) === c && Math.floor(p.y / TILE) === r;
      const dist = Math.hypot(p.x - cx, p.y - cy);
      if (sameTile || dist < TILE * 0.52) {
        this.addPopup(p.x, p.y - 22, 'CLOSING KO! 📦', '#e11d48');
        this.screenShake = Math.max(this.screenShake, 5);
        this.convertToGhost(p);
      } else if (dist < TILE * 0.85) {
        const pc = Math.floor(p.x / TILE);
        const pr = Math.floor(p.y / TILE);
        if (this.grid[pr]?.[pc] === TILE_TYPE.EMPTY) {
          p.x = (pc + 0.5) * TILE;
          p.y = (pr + 0.5) * TILE;
        }
      }
    }
    this.spawnConfetti(cx, cy, ['#fbcfe8', '#fde68a', '#fed7aa'], 8);
  }

  startDash(p, input) {
    let dashDx = input.dx;
    let dashDy = input.dy;
    if (dashDx === 0 && dashDy === 0) {
      dashDx = p.facingX;
      dashDy = p.facingY;
    }
    if (dashDx === 0 && dashDy === 0) dashDy = 1;

    p.facingX = dashDx;
    p.facingY = dashDy;
    p.dashTimer = DASH_DURATION;
    p.dashCooldown = p.sugarRushTimer > 0 ? DASH_COOLDOWN * 0.55 : DASH_COOLDOWN;
    p.dashVx = dashDx * DASH_SPEED;
    p.dashVy = dashDy * DASH_SPEED;
    this.sound?.playDash();
    this.addPopup(p.x, p.y - 20, 'DASH! 💨', p.char.color);
    this.spawnConfetti(p.x, p.y, [p.char.color, '#ffffff', p.char.splash], 8);
  }

  updateAlivePlayer(p, input, dt) {
    // Handle bounce jump arc from Yuzu's jelly pad or harmless self-hop
    if (p.jumpTimer > 0) {
      p.jumpTimer = Math.max(0, p.jumpTimer - dt);
      const t = 1 - p.jumpTimer / p.jumpDuration;
      p.x = p.jumpStartX + (p.jumpEndX - p.jumpStartX) * t;
      p.y = p.jumpStartY + (p.jumpEndY - p.jumpStartY) * t;
      return;
    }

    // Trigger Belly-Dash!
    if (input.dashPressed && p.dashCooldown <= 0 && p.dashTimer <= 0) {
      this.startDash(p, input);
    }

    const curC = Math.floor(p.x / TILE);
    const curR = Math.floor(p.y / TILE);

    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
      const dirX = Math.sign(p.dashVx);
      const dirY = Math.sign(p.dashVy);

      // Check crate smash / bomb kick / rival bump ahead
      const aheadC = Math.floor((p.x + dirX * (TILE * 0.52)) / TILE);
      const aheadR = Math.floor((p.y + dirY * (TILE * 0.52)) / TILE);
      if (aheadC >= 1 && aheadC < COLS - 1 && aheadR >= 1 && aheadR < ROWS - 1) {
        if (this.grid[aheadR][aheadC] === TILE_TYPE.CRATE) {
          this.breakCrate(aheadC, aheadR, p);
          this.addPopup((aheadC + 0.5) * TILE, aheadR * TILE, 'SMASH! 💥', '#f59e0b');
          this.screenShake = Math.max(this.screenShake, 4);
          p.dashTimer = 0;
        }
        const aheadBomb = this.getBombAtTile(aheadC, aheadR) || this.getBombAtTile(curC, curR);
        if (aheadBomb && !aheadBomb.passableBy.has(p.id)) {
          this.tryKickBomb(aheadBomb, dirX, dirY, p);
        }
      }

      // Bump living rivals back during dash
      for (const other of this.players) {
        if (other.id !== p.id && other.state === 'alive' && !other.isCelebrating && other.jumpTimer <= 0) {
          if (Math.hypot(other.x - p.x, other.y - p.y) < TILE * 0.65) {
            for (let step = 0; step < 3; step++) {
              other.x += dirX * 9;
              other.y += dirY * 9;
              this.resolveTileCollision(other, dirX, dirY);
            }
            this.addPopup(other.x, other.y - 20, 'BUMP! 💥', p.char.color);
            this.sound?.playKick();
            this.screenShake = Math.max(this.screenShake, 4);
            p.dashTimer = 0;
            break;
          }
        }
      }

      if (p.dashTimer > 0) {
        p.x += p.dashVx * dt;
        p.y += p.dashVy * dt;
        this.resolveTileCollision(p, dirX, dirY);
        p.walkPhase += dt * 22;
      }
    } else {
      const { dx, dy } = input;
      if (dx !== 0 || dy !== 0) {
        p.facingX = dx;
        p.facingY = dy;

        let speedMult = 1;
        if (p.sugarRushTimer > 0) speedMult *= 1.25;
        if (this.caramelZones.some((z) => z.c === curC && z.r === curR && z.ownerId !== p.id)) {
          speedMult *= 0.8;
        }

        const effectiveSpeed = p.speed * speedMult;
        p.walkPhase += dt * (effectiveSpeed / 18);

        const moveDist = effectiveSpeed * dt;
        const centerX = (curC + 0.5) * TILE;
        const centerY = (curR + 0.5) * TILE;

        if (dx !== 0) {
          const nextC = curC + dx;
          const canEnterNext = this.isTilePassableForPlayer(nextC, curR, p.id);
          const offsetY = Math.abs(p.y - centerY);

          if (canEnterNext && offsetY > 1 && offsetY <= TILE * 0.5) {
            const pull = Math.min(offsetY, moveDist);
            p.y += p.y < centerY ? pull : -pull;
          }

          const aheadBomb = this.getBombAtTile(nextC, curR);
          if (aheadBomb && !aheadBomb.passableBy.has(p.id) && p.canKick) {
            const edgeDist = Math.abs(p.x - centerX);
            if (edgeDist > TILE * 0.05) {
              this.tryKickBomb(aheadBomb, dx, 0, p);
            }
          }

          p.x += dx * moveDist;
          this.resolveTileCollision(p, dx, 0);
        } else if (dy !== 0) {
          const nextR = curR + dy;
          const canEnterNext = this.isTilePassableForPlayer(curC, nextR, p.id);
          const offsetX = Math.abs(p.x - centerX);

          if (canEnterNext && offsetX > 1 && offsetX <= TILE * 0.5) {
            const pull = Math.min(offsetX, moveDist);
            p.x += p.x < centerX ? pull : -pull;
          }

          const aheadBomb = this.getBombAtTile(curC, nextR);
          if (aheadBomb && !aheadBomb.passableBy.has(p.id) && p.canKick) {
            const edgeDist = Math.abs(p.y - centerY);
            if (edgeDist > TILE * 0.05) {
              this.tryKickBomb(aheadBomb, 0, dy, p);
            }
          }

          p.y += dy * moveDist;
          this.resolveTileCollision(p, 0, dy);
        }
      }
    }

    // Check pickups (Powerups & Golden Daifuku)
    const pc = Math.floor(p.x / TILE);
    const pr = Math.floor(p.y / TILE);
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      if (pu.c === pc && pu.r === pr) {
        this.applyPowerup(p, pu);
        this.powerups.splice(i, 1);
      }
    }

    if (this.goldenMochi && this.goldenMochi.c === pc && this.goldenMochi.r === pr) {
      this.goldenMochi = null;
      this.steamerTimer = STEAMER_INTERVAL;
      p.sugarRushTimer = SUGAR_RUSH_DURATION;
      p.hasShield = true;
      this.sound?.playPickup();
      this.addPopup(p.x, p.y - 24, 'SUGAR RUSH! 🌟', '#f59e0b');
      this.spawnConfetti(p.x, p.y, ['#facc15', '#fef08a', '#ffffff', '#ec4899'], 18);
    }

    // Check Yuzu jelly pad bounce!
    if ((input.dx !== 0 || input.dy !== 0) && p.jumpTimer <= 0 && p.dashTimer <= 0) {
      const pad = this.jellyPads.find((j) => j.c === pc && j.r === pr);
      if (pad && (pad.cooldownMap.get(p.id) || 0) <= 0) {
        const bdx = input.dx || p.facingX;
        const bdy = input.dy || p.facingY;
        this.tryJellyBounce(p, bdx, bdy, pad);
      }
    }

    // Drop snack bomb
    if (
      input.actionPressed &&
      p.bombCooldown <= 0 &&
      p.activeBombs < p.maxBombs &&
      !this.getBombAtTile(pc, pr)
    ) {
      this.placeBomb(p, pc, pr);
    }
  }

  resolveTileCollision(p, dirX, dirY) {
    const r = TILE * 0.34;
    const curC = Math.floor(p.x / TILE);
    const curR = Math.floor(p.y / TILE);

    if (dirX > 0) {
      const rightEdge = p.x + r;
      const checkC = Math.floor(rightEdge / TILE);
      if (checkC !== curC && !this.isTilePassableForPlayer(checkC, curR, p.id)) {
        p.x = checkC * TILE - r - 0.1;
      }
      const topR = Math.floor((p.y - r + 2) / TILE);
      const botR = Math.floor((p.y + r - 2) / TILE);
      if (topR !== curR && checkC !== curC && !this.isTilePassableForPlayer(checkC, topR, p.id)) {
        p.x = Math.min(p.x, checkC * TILE - r - 0.1);
      }
      if (botR !== curR && checkC !== curC && !this.isTilePassableForPlayer(checkC, botR, p.id)) {
        p.x = Math.min(p.x, checkC * TILE - r - 0.1);
      }
    } else if (dirX < 0) {
      const leftEdge = p.x - r;
      const checkC = Math.floor(leftEdge / TILE);
      if (checkC !== curC && !this.isTilePassableForPlayer(checkC, curR, p.id)) {
        p.x = (checkC + 1) * TILE + r + 0.1;
      }
      const topR = Math.floor((p.y - r + 2) / TILE);
      const botR = Math.floor((p.y + r - 2) / TILE);
      if (topR !== curR && checkC !== curC && !this.isTilePassableForPlayer(checkC, topR, p.id)) {
        p.x = Math.max(p.x, (checkC + 1) * TILE + r + 0.1);
      }
      if (botR !== curR && checkC !== curC && !this.isTilePassableForPlayer(checkC, botR, p.id)) {
        p.x = Math.max(p.x, (checkC + 1) * TILE + r + 0.1);
      }
    }

    if (dirY > 0) {
      const botEdge = p.y + r;
      const checkR = Math.floor(botEdge / TILE);
      if (checkR !== curR && !this.isTilePassableForPlayer(curC, checkR, p.id)) {
        p.y = checkR * TILE - r - 0.1;
      }
      const leftC = Math.floor((p.x - r + 2) / TILE);
      const rightC = Math.floor((p.x + r - 2) / TILE);
      if (leftC !== curC && checkR !== curR && !this.isTilePassableForPlayer(leftC, checkR, p.id)) {
        p.y = Math.min(p.y, checkR * TILE - r - 0.1);
      }
      if (rightC !== curC && checkR !== curR && !this.isTilePassableForPlayer(rightC, checkR, p.id)) {
        p.y = Math.min(p.y, checkR * TILE - r - 0.1);
      }
    } else if (dirY < 0) {
      const topEdge = p.y - r;
      const checkR = Math.floor(topEdge / TILE);
      if (checkR !== curR && !this.isTilePassableForPlayer(curC, checkR, p.id)) {
        p.y = (checkR + 1) * TILE + r + 0.1;
      }
      const leftC = Math.floor((p.x - r + 2) / TILE);
      const rightC = Math.floor((p.x + r - 2) / TILE);
      if (leftC !== curC && checkR !== curR && !this.isTilePassableForPlayer(leftC, checkR, p.id)) {
        p.y = Math.max(p.y, (checkR + 1) * TILE + r + 0.1);
      }
      if (rightC !== curC && checkR !== curR && !this.isTilePassableForPlayer(rightC, checkR, p.id)) {
        p.y = Math.max(p.y, (checkR + 1) * TILE + r + 0.1);
      }
    }
  }

  tryKickBomb(bomb, dx, dy, kicker = null) {
    const nextC = bomb.c + dx;
    const nextR = bomb.r + dy;
    if (nextC < 1 || nextC >= COLS - 1 || nextR < 1 || nextR >= ROWS - 1) return false;
    if (this.grid[nextR][nextC] !== TILE_TYPE.EMPTY) return false;
    if (this.getBombAtTile(nextC, nextR)) return false;
    if (
      this.players.some(
        (pl) => pl.state === 'alive' && Math.floor(pl.x / TILE) === nextC && Math.floor(pl.y / TILE) === nextR
      )
    ) {
      return false;
    }
    bomb.vx = dx * 360;
    bomb.vy = dy * 360;
    bomb.slideDistLeft = undefined;
    bomb.passableBy.clear();
    if (kicker) {
      this.addPopup(bomb.x, bomb.y - 16, 'KICK!', '#06b6d4');
      this.sound?.playKick();
    }
    return true;
  }

  tryJellyBounce(p, dx, dy, pad) {
    const step2C = pad.c + dx * 2;
    const step2R = pad.r + dy * 2;
    const step1C = pad.c + dx;
    const step1R = pad.r + dy;

    let landC = null;
    let landR = null;
    if (
      step2C >= 1 &&
      step2C < COLS - 1 &&
      step2R >= 1 &&
      step2R < ROWS - 1 &&
      this.grid[step2R][step2C] === TILE_TYPE.EMPTY &&
      !this.getBombAtTile(step2C, step2R)
    ) {
      landC = step2C;
      landR = step2R;
    } else if (
      step1C >= 1 &&
      step1C < COLS - 1 &&
      step1R >= 1 &&
      step1R < ROWS - 1 &&
      this.grid[step1R][step1C] === TILE_TYPE.EMPTY &&
      !this.getBombAtTile(step1C, step1R)
    ) {
      landC = step1C;
      landR = step1R;
    }

    if (landC === null) return;
    pad.cooldownMap.set(p.id, 1.4);
    p.jumpTimer = p.jumpDuration;
    p.jumpStartX = p.x;
    p.jumpStartY = p.y;
    p.jumpEndX = (landC + 0.5) * TILE;
    p.jumpEndY = (landR + 0.5) * TILE;
    this.sound?.playBounce();
    this.addPopup(p.x, p.y - 20, 'BOING!', '#f59e0b');
  }

  applyPowerup(p, pu) {
    this.sound?.playPickup();
    this.spawnConfetti(p.x, p.y, ['#fef08a', '#fbcfe8', '#a7f3d0'], 10);
    if (pu.type === 'bomb') {
      p.maxBombs = Math.min(2, p.maxBombs + 1);
      this.addPopup(p.x, p.y - 18, '+1 🧋', '#84cc16');
    } else if (pu.type === 'range') {
      p.range = Math.min(6, p.range + 1);
      this.addPopup(p.x, p.y - 18, '+1 ✨', '#f59e0b');
    } else if (pu.type === 'speed') {
      p.speed = Math.min(265, p.speed + 24);
      this.addPopup(p.x, p.y - 18, 'ZOOM 🛼', '#ec4899');
    } else if (pu.type === 'kick') {
      p.canKick = true;
      this.addPopup(p.x, p.y - 18, 'KICK 🥾', '#06b6d4');
    } else if (pu.type === 'shield') {
      p.hasShield = true;
      this.addPopup(p.x, p.y - 18, 'SHIELD 🛡️', '#8b5cf6');
    } else if (pu.type === 'floor_smash') {
      this.triggerFloorSmash(p);
    } else if (pu.type === 'rival_spikes') {
      this.triggerRivalSpikes(p);
    } else if (pu.type === 'lane_swoop') {
      this.triggerLaneSwoop(p);
    }
  }

  _collectAreaCells(centerC, centerR, radius = 1) {
    const cells = [];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const nc = centerC + dc;
        const nr = centerR + dr;
        if (nc < 1 || nc >= COLS - 1 || nr < 1 || nr >= ROWS - 1) continue;
        if (this.isSolidTile(this.grid[nr][nc])) continue;
        cells.push({ c: nc, r: nr });
      }
    }
    return cells;
  }

  _pickNearestRival(p, includeMochi = false) {
    let best = null;
    let bestDist = Infinity;
    for (const pl of this.players) {
      if (pl.id === p.id || pl.isCelebrating) continue;
      if (pl.state !== 'alive' && !(includeMochi && pl.state === 'mochi_ball')) continue;
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (d < bestDist) {
        bestDist = d;
        best = pl;
      }
    }
    return best;
  }

  triggerFloorSmash(p) {
    const target = this._pickNearestRival(p, true);
    const tc = target ? Math.max(1, Math.min(COLS - 2, Math.floor(target.x / TILE))) : 6;
    const tr = target ? Math.max(1, Math.min(ROWS - 2, Math.floor(target.y / TILE))) : 5;
    const style = this.mapConfig?.smashStyle || 'dino';
    this.addPopup(
      p.x,
      p.y - 22,
      style === 'meteor' ? 'METEOR! ☄️' : 'DINO STOMP! 🦖',
      style === 'meteor' ? '#a855f7' : '#ea580c'
    );
    this.spawnFloorSmashAt(tc, tr, p.id, p.char, style, 0.85);
  }

  spawnFloorSmashAt(c, r, ownerId, char, style = 'dino', telegraph = 0.85) {
    const cells = this._collectAreaCells(c, r, 1);
    if (cells.length === 0) return;
    this.sound?.playSmashTelegraph();
    this.floorSmashes.push({
      ownerId,
      char: char || { color: style === 'meteor' ? '#a855f7' : '#ea580c', accent: '#fef3c7' },
      c,
      r,
      cells,
      phase: 'telegraph',
      timer: telegraph,
      maxTelegraph: telegraph,
      impactTimer: 0.45,
      maxImpact: 0.45,
      style,
      hitPlayers: new Set(),
    });
  }

  updateFloorSmashes(dt) {
    for (let i = this.floorSmashes.length - 1; i >= 0; i--) {
      const sm = this.floorSmashes[i];
      if (sm.phase === 'telegraph') {
        sm.timer -= dt;
        if (sm.timer <= 0) {
          sm.phase = 'impact';
          sm.timer = sm.impactTimer;
          if (this.roundResolveTimer >= 0) continue;
          const cx = (sm.c + 0.5) * TILE;
          const cy = (sm.r + 0.5) * TILE;
          const owner = sm.ownerId !== null ? this.players.find((pl) => pl.id === sm.ownerId) : null;
          this.sound?.playFloorSmash();
          this.screenShake = Math.max(this.screenShake, 8);
          this.spawnConfetti(
            cx,
            cy,
            sm.style === 'meteor'
              ? ['#a855f7', '#38bdf8', '#fde047', '#ffffff']
              : ['#ea580c', '#84cc16', '#fde047', '#fed7aa'],
            18
          );
          for (const cell of sm.cells) {
            if (this.grid[cell.r][cell.c] === TILE_TYPE.CRATE) {
              this.breakCrate(cell.c, cell.r, owner);
            }
          }
          const keySet = new Set(sm.cells.map((cell) => `${cell.c},${cell.r}`));
          for (const pl of this.players) {
            if (sm.hitPlayers.has(pl.id) || pl.jumpTimer > 0 || pl.isCelebrating) continue;
            const pc = Math.floor(pl.x / TILE);
            const pr = Math.floor(pl.y / TILE);
            if (!keySet.has(`${pc},${pr}`)) continue;
            if (pl.state === 'alive') {
              if (sm.ownerId !== null && pl.id === sm.ownerId) {
                sm.hitPlayers.add(pl.id);
                this.triggerSelfHop(pl);
              } else if (pl.invulnTimer <= 0) {
                sm.hitPlayers.add(pl.id);
                this.puffPlayer(pl, owner, false);
              }
            } else if (
              pl.state === 'mochi_ball' &&
              pl.bowlVx === 0 &&
              pl.bowlVy === 0 &&
              pl.mochiMaxTimer - pl.mochiTimer > 0.45
            ) {
              sm.hitPlayers.add(pl.id);
              let dc = Math.sign(pc - sm.c);
              let dr = Math.sign(pr - sm.r);
              if (dc === 0 && dr === 0) dr = 1;
              if (dc !== 0 && dr !== 0) dr = 0;
              this.launchMochiBall(
                pl,
                dc,
                dr,
                sm.ownerId,
                sm.style === 'meteor' ? 'METEOR BOWL! ☄️' : 'STOMP BOWL! 🦖'
              );
            }
          }
        }
      } else {
        sm.timer -= dt;
        if (sm.timer <= 0) {
          this.floorSmashes.splice(i, 1);
        }
      }
    }
  }

  triggerRivalSpikes(p) {
    const rivals = this.players.filter((pl) => pl.id !== p.id && pl.state === 'alive' && !pl.isCelebrating);
    const style = this.mapConfig?.spikeStyle || 'magma';
    const label =
      style === 'thorn' ? 'THORN SPIKES! 🌿' : style === 'plasma' ? 'PLASMA SPIKES! ⚡' : 'MAGMA SPIKES! 🌋';
    this.addPopup(p.x, p.y - 22, label, '#e11d48');
    this.sound?.playSpikeWarn();

    if (rivals.length === 0) {
      this.spawnSpikeAt(6, 5, p.id, p.char, style, 0.75);
      return;
    }

    for (const rival of rivals) {
      const rc = Math.max(1, Math.min(COLS - 2, Math.floor(rival.x / TILE)));
      const rr = Math.max(1, Math.min(ROWS - 2, Math.floor(rival.y / TILE)));
      this.spawnSpikeAt(rc, rr, p.id, p.char, style, 0.75);
      this.pendingSpikeWaves.push({
        delay: 0.45,
        targetId: rival.id,
        ownerId: p.id,
        char: p.char,
        style,
      });
    }
  }

  spawnSpikeAt(c, r, ownerId, char, style = 'magma', telegraph = 0.75) {
    if (c < 1 || c >= COLS - 1 || r < 1 || r >= ROWS - 1) return false;
    if (this.grid[r][c] !== TILE_TYPE.EMPTY) return false;
    if (this.spikeTraps.some((sp) => sp.c === c && sp.r === r)) return false;
    this.spikeTraps.push({
      ownerId,
      char: char || { color: '#e11d48', accent: '#ffe4e6' },
      c,
      r,
      phase: 'telegraph',
      timer: telegraph,
      maxTelegraph: telegraph,
      activeDuration: 4.2,
      style,
      hitPlayers: new Set(),
    });
    return true;
  }

  updatePendingSpikeWaves(dt) {
    for (let i = this.pendingSpikeWaves.length - 1; i >= 0; i--) {
      const wave = this.pendingSpikeWaves[i];
      wave.delay -= dt;
      if (wave.delay > 0) continue;
      this.pendingSpikeWaves.splice(i, 1);

      const rival = this.players.find((pl) => pl.id === wave.targetId);
      if (!rival || rival.state !== 'alive' || rival.isCelebrating) continue;
      const rc = Math.max(1, Math.min(COLS - 2, Math.floor(rival.x / TILE)));
      const rr = Math.max(1, Math.min(ROWS - 2, Math.floor(rival.y / TILE)));
      if (!this.spawnSpikeAt(rc, rr, wave.ownerId, wave.char, wave.style, 0.75)) {
        const fx = rival.facingX || 0;
        const fy = rival.facingY || 0;
        const candidates = [
          [rc + fx, rr + fy],
          [rc - fx, rr - fy],
          [rc + 1, rr],
          [rc - 1, rr],
          [rc, rr + 1],
          [rc, rr - 1],
        ];
        for (const [nc, nr] of candidates) {
          if (this.spawnSpikeAt(nc, nr, wave.ownerId, wave.char, wave.style, 0.75)) break;
        }
      }
      this.sound?.playSpikeWarn();
    }
  }

  updateSpikeTraps(dt) {
    for (let i = this.spikeTraps.length - 1; i >= 0; i--) {
      const sp = this.spikeTraps[i];
      sp.timer -= dt;
      if (sp.phase === 'telegraph') {
        if (sp.timer <= 0) {
          sp.phase = 'active';
          sp.timer = sp.activeDuration;
          this.sound?.playSpikeErupt();
          const cx = (sp.c + 0.5) * TILE;
          const cy = (sp.r + 0.5) * TILE;
          this.spawnConfetti(
            cx,
            cy,
            sp.style === 'thorn'
              ? ['#16a34a', '#a3e635', '#fef08a']
              : sp.style === 'plasma'
                ? ['#a855f7', '#22d3ee', '#ffffff']
                : ['#f97316', '#e11d48', '#fde047'],
            8
          );
        }
        continue;
      }

      if (this.roundResolveTimer < 0) {
        const owner = sp.ownerId !== null ? this.players.find((pl) => pl.id === sp.ownerId) : null;
        for (const pl of this.players) {
          if (pl.id === sp.ownerId || pl.isCelebrating || pl.jumpTimer > 0) continue;
          if (Math.floor(pl.x / TILE) !== sp.c || Math.floor(pl.y / TILE) !== sp.r) continue;
          if (pl.state === 'alive' && pl.invulnTimer <= 0) {
            this.puffPlayer(pl, owner, false);
          } else if (
            pl.state === 'mochi_ball' &&
            pl.bowlVx === 0 &&
            pl.bowlVy === 0 &&
            !sp.hitPlayers.has(pl.id) &&
            pl.mochiMaxTimer - pl.mochiTimer > 0.45
          ) {
            sp.hitPlayers.add(pl.id);
            const dc = pl.facingX || 0;
            const dr = pl.facingY || (dc === 0 ? 1 : 0);
            this.launchMochiBall(pl, dc, dr, sp.ownerId, 'SPIKE BOWL! ⚡');
          }
        }
      }

      if (sp.timer <= 0) {
        this.spikeTraps.splice(i, 1);
      }
    }
  }

  triggerLaneSwoop(p) {
    const style = this.mapConfig?.swoopStyle || 'owl';
    const rival = this._pickNearestRival(p, true);
    const pc = Math.max(1, Math.min(COLS - 2, Math.floor(p.x / TILE)));
    const pr = Math.max(1, Math.min(ROWS - 2, Math.floor(p.y / TILE)));
    let axis = 'row';
    let index = 5;
    let dir = 1;
    if (rival) {
      const rc = Math.max(1, Math.min(COLS - 2, Math.floor(rival.x / TILE)));
      const rr = Math.max(1, Math.min(ROWS - 2, Math.floor(rival.y / TILE)));
      if (pc === rc && pr !== rr) {
        axis = 'col';
        index = rc;
        dir = rr >= pr ? 1 : -1;
      } else {
        axis = 'row';
        index = rr;
        dir = rc >= pc ? 1 : -1;
      }
    }
    this.addPopup(
      p.x,
      p.y - 22,
      style === 'ufo' ? 'UFO SWEEP! 🛸' : 'OWL SWOOP! 🦉',
      style === 'ufo' ? '#38bdf8' : '#6366f1'
    );
    this.spawnLaneSwoop(axis, index, dir, p.id, p.char, style, 0.8);
  }

  spawnLaneSwoop(axis, index, dir, ownerId, char, style = 'owl', telegraph = 0.8) {
    const cells = [];
    if (axis === 'row') {
      const start = dir >= 0 ? 1 : COLS - 2;
      const end = dir >= 0 ? COLS - 1 : 0;
      for (let c = start; c !== end; c += dir >= 0 ? 1 : -1) {
        if (!this.isSolidTile(this.grid[index][c])) {
          cells.push({ c, r: index });
        }
      }
    } else {
      const start = dir >= 0 ? 1 : ROWS - 2;
      const end = dir >= 0 ? ROWS - 1 : 0;
      for (let r = start; r !== end; r += dir >= 0 ? 1 : -1) {
        if (!this.isSolidTile(this.grid[r][index])) {
          cells.push({ c: index, r });
        }
      }
    }
    if (cells.length === 0) return;
    this.sound?.playSpikeWarn();
    this.laneSwoops.push({
      ownerId,
      char: char || { color: style === 'ufo' ? '#38bdf8' : '#6366f1', accent: '#e0e7ff' },
      axis,
      index,
      dir: dir >= 0 ? 1 : -1,
      cells,
      phase: 'telegraph',
      timer: telegraph,
      maxTelegraph: telegraph,
      sweepDuration: 0.52,
      progress: 0,
      appliedCount: 0,
      style,
      hitPlayers: new Set(),
    });
  }

  updateLaneSwoops(dt) {
    for (let i = this.laneSwoops.length - 1; i >= 0; i--) {
      const sw = this.laneSwoops[i];
      if (sw.phase === 'telegraph') {
        sw.timer -= dt;
        if (sw.timer <= 0) {
          sw.phase = 'sweep';
          sw.progress = 0;
          sw.appliedCount = 0;
          this.sound?.playSwoop(sw.style);
        }
        continue;
      }

      sw.progress = Math.min(1, sw.progress + dt / sw.sweepDuration);
      const targetCount = Math.min(sw.cells.length, Math.ceil(sw.progress * sw.cells.length));
      const owner = sw.ownerId !== null ? this.players.find((pl) => pl.id === sw.ownerId) : null;

      while (sw.appliedCount < targetCount) {
        const cell = sw.cells[sw.appliedCount++];
        if (this.roundResolveTimer >= 0) continue;
        if (this.grid[cell.r][cell.c] === TILE_TYPE.CRATE) {
          this.breakCrate(cell.c, cell.r, owner);
        }
        for (const pl of this.players) {
          if (sw.hitPlayers.has(pl.id) || pl.jumpTimer > 0 || pl.isCelebrating) continue;
          if (Math.floor(pl.x / TILE) !== cell.c || Math.floor(pl.y / TILE) !== cell.r) continue;
          if (pl.state === 'alive') {
            if (sw.ownerId !== null && pl.id === sw.ownerId) {
              sw.hitPlayers.add(pl.id);
              this.triggerSelfHop(pl);
            } else if (pl.invulnTimer <= 0) {
              sw.hitPlayers.add(pl.id);
              this.puffPlayer(pl, owner, false);
            }
          } else if (
            pl.state === 'mochi_ball' &&
            pl.bowlVx === 0 &&
            pl.bowlVy === 0 &&
            pl.mochiMaxTimer - pl.mochiTimer > 0.45
          ) {
            sw.hitPlayers.add(pl.id);
            const dx = sw.axis === 'row' ? sw.dir : 0;
            const dy = sw.axis === 'col' ? sw.dir : 0;
            this.launchMochiBall(
              pl,
              dx,
              dy,
              sw.ownerId,
              sw.style === 'ufo' ? 'BEAM BOWL! 🛸' : 'SWOOP BOWL! 🦉'
            );
          }
        }
      }

      if (sw.progress >= 1) {
        this.laneSwoops.splice(i, 1);
      }
    }
  }

  _pickRandomOpenTile() {
    const candidates = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!this.isSolidTile(this.grid[r][c])) {
          candidates.push({ c, r });
        }
      }
    }
    if (candidates.length === 0) return { c: 6, r: 5 };
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  triggerMapEvent() {
    const tr = TRANSLATIONS[this.lang] || TRANSLATIONS.en;
    const eventType = this.mapConfig?.eventType || 'kaiten';
    this.sound?.playEventBell();

    if (eventType === 'stampede') {
      this.showBanner(tr.eventStampede, 3.2);
      [0.05, 1.85, 3.65, 5.45].forEach((delay) => {
        this.eventWaveQueue.push({ delay, kind: 'smash', style: 'dino' });
      });
    } else if (eventType === 'owl_swoop') {
      this.showBanner(tr.eventOwlSwoop, 3.2);
      [0.05, 3.6].forEach((delay) => {
        this.eventWaveQueue.push({ delay, kind: 'swoop', axis: 'row', index: 3, dir: 1, style: 'owl' });
        this.eventWaveQueue.push({ delay: delay + 0.12, kind: 'swoop', axis: 'row', index: 7, dir: -1, style: 'owl' });
      });
    } else if (eventType === 'meteor_shower') {
      this.kaitenTimer = 10;
      this.showBanner(tr.eventMeteorShower, 3.2);
      [0.6, 3.0, 5.4].forEach((delay) => {
        this.eventWaveQueue.push({ delay, kind: 'smash', style: 'meteor' });
      });
    } else {
      this.kaitenTimer = KAITEN_DURATION;
      this.showBanner(tr.eventKaiten, 3.2);
    }
  }

  updateEventWaveQueue(dt) {
    for (let i = this.eventWaveQueue.length - 1; i >= 0; i--) {
      const ev = this.eventWaveQueue[i];
      ev.delay -= dt;
      if (ev.delay > 0) continue;
      this.eventWaveQueue.splice(i, 1);
      if (this.roundResolveTimer >= 0) continue;

      if (ev.kind === 'smash') {
        const tile = this._pickRandomOpenTile();
        this.spawnFloorSmashAt(tile.c, tile.r, null, null, ev.style || 'dino', 0.95);
      } else if (ev.kind === 'swoop') {
        this.spawnLaneSwoop(ev.axis, ev.index, ev.dir, null, null, ev.style || 'owl', 0.95);
      }
    }
  }

  placeBomb(p, c, r) {
    const targetC = c;
    const targetR = r;
    const fx = p.facingX || 0;
    const fy = p.facingY || (fx === 0 ? 1 : 0);
    const pattern = p.char.attackPattern || 'cross_slide';

    const passableBy = new Set();
    for (const pl of this.players) {
      if (pl.state === 'alive') {
        const dist = Math.hypot(pl.x - (targetC + 0.5) * TILE, pl.y - (targetR + 0.5) * TILE);
        if (dist < TILE * 0.78) {
          passableBy.add(pl.id);
        }
      }
    }

    const effectiveRange = p.range + (p.sugarRushTimer > 0 ? 2 : 0);
    const fuse = p.char.fuse || BOMB_FUSE;
    let vx = 0;
    let vy = 0;
    let slideDistLeft = undefined;

    // Mochi slides Matcha Boba forward up to 2 tiles!
    if (pattern === 'cross_slide') {
      const nextC = targetC + fx;
      const nextR = targetR + fy;
      const playerAhead = this.players.some(
        (pl) =>
          pl.id !== p.id &&
          pl.state === 'alive' &&
          pl.jumpTimer <= 0 &&
          Math.floor(pl.x / TILE) === nextC &&
          Math.floor(pl.y / TILE) === nextR
      );
      if (
        nextC >= 1 &&
        nextC < COLS - 1 &&
        nextR >= 1 &&
        nextR < ROWS - 1 &&
        this.grid[nextR][nextC] === TILE_TYPE.EMPTY &&
        !this.getBombAtTile(nextC, nextR) &&
        !playerAhead
      ) {
        vx = fx * 380;
        vy = fy * 380;
        slideDistLeft = 2 * TILE;
        passableBy.clear();
      }
    }

    p.activeBombs += 1;
    p.bombCooldown = p.sugarRushTimer > 0 ? SNACK_COOLDOWN * 0.75 : SNACK_COOLDOWN;
    if (p.controlType !== 'human') {
      this.botBombGapTimer = 0.55;
    }
    this.bombs.push({
      c: targetC,
      r: targetR,
      x: (targetC + 0.5) * TILE,
      y: (targetR + 0.5) * TILE,
      vx,
      vy,
      slideDistLeft,
      ownerId: p.id,
      chainTriggerOwnerId: null,
      char: p.char,
      flavor: p.flavor,
      attackPattern: pattern,
      range: effectiveRange,
      fuse,
      maxFuse: fuse,
      facingX: fx,
      facingY: fy,
      passableBy,
      isMini: false,
      isGhostShot: false,
    });
    this.sound?.playDrop();
  }

  updateBombs(dt) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (!b) continue;

      // Update passableBy
      for (const pid of Array.from(b.passableBy)) {
        const pl = this.players.find((x) => x.id === pid);
        if (!pl || pl.state !== 'alive' || Math.hypot(pl.x - b.x, pl.y - b.y) > TILE * 0.85) {
          b.passableBy.delete(pid);
        }
      }

      // Update sliding movement
      if (b.vx !== 0 || b.vy !== 0) {
        const nextX = b.x + b.vx * dt;
        const nextY = b.y + b.vy * dt;
        const dirX = Math.sign(b.vx);
        const dirY = Math.sign(b.vy);
        const probeC = Math.floor((nextX + dirX * (TILE * 0.42)) / TILE);
        const probeR = Math.floor((nextY + dirY * (TILE * 0.42)) / TILE);

        const inBounds = probeC >= 1 && probeC < COLS - 1 && probeR >= 1 && probeR < ROWS - 1;
        const probeTile = inBounds ? this.grid[probeR][probeC] : TILE_TYPE.WALL;

        if (probeTile === TILE_TYPE.BUMPER && (probeC !== b.c || probeR !== b.r)) {
          // Bounce sliding bomb off pink bumper!
          b.vx = -b.vx;
          b.vy = -b.vy;
          b.x = (b.c + 0.5) * TILE;
          b.y = (b.r + 0.5) * TILE;
          this.sound?.playBumper();
          this.addPopup(b.x, b.y - 16, 'BOING! 🌸', '#ec4899');
        } else {
          const blockedByTile = !inBounds || probeTile !== TILE_TYPE.EMPTY;
          const blockedByBomb = this.bombs.some((other) => other !== b && other.c === probeC && other.r === probeR);
          const blockedByPlayer = this.players.some(
            (pl) =>
              pl.state === 'alive' &&
              pl.jumpTimer <= 0 &&
              Math.floor(pl.x / TILE) === probeC &&
              Math.floor(pl.y / TILE) === probeR &&
              (probeC !== b.c || probeR !== b.r)
          );

          let stopped = false;
          if (blockedByTile || blockedByBomb || blockedByPlayer) {
            stopped = true;
          } else {
            const stepDist = Math.hypot(b.vx * dt, b.vy * dt);
            b.x = nextX;
            b.y = nextY;
            b.c = Math.floor(b.x / TILE);
            b.r = Math.floor(b.y / TILE);
            if (b.slideDistLeft !== undefined) {
              b.slideDistLeft -= stepDist;
              if (b.slideDistLeft <= 0) {
                stopped = true;
              }
            }
          }

          if (stopped) {
            b.vx = 0;
            b.vy = 0;
            b.slideDistLeft = undefined;
            b.x = (b.c + 0.5) * TILE;
            b.y = (b.r + 0.5) * TILE;
            for (const pl of this.players) {
              if (pl.state === 'alive' && Math.hypot(pl.x - b.x, pl.y - b.y) < TILE * 0.78) {
                b.passableBy.add(pl.id);
              }
            }
          }
        }
      }

      b.fuse -= dt;
      if (b.fuse <= 0) {
        this.detonateBomb(b, b.chainTriggerOwnerId ?? null);
      }
    }
  }

  triggerSelfHop(p) {
    if (p.state !== 'alive' || p.jumpTimer > 0 || p.isCelebrating) return;
    p.jumpTimer = 0.22;
    p.jumpDuration = 0.22;
    p.jumpStartX = p.x;
    p.jumpStartY = p.y;
    p.jumpEndX = p.x;
    p.jumpEndY = p.y;
    this.addPopup(p.x, p.y - 20, 'HOP! 💨', p.char.color);
  }

  detonateBomb(bomb, chainTriggerOwnerId = null) {
    const idx = this.bombs.indexOf(bomb);
    if (idx === -1) return;
    this.bombs.splice(idx, 1);

    const owner = this.players.find((p) => p.id === bomb.ownerId);
    if (owner && !bomb.isMini) {
      owner.activeBombs = Math.max(0, owner.activeBombs - 1);
    }

    const isCombo = chainTriggerOwnerId !== null && chainTriggerOwnerId !== bomb.ownerId && !bomb.isMini;
    if (isCombo) {
      const triggerPlayer = this.players.find((p) => p.id === chainTriggerOwnerId);
      if (triggerPlayer) triggerPlayer.stats.combos += 1;
      if (owner) owner.stats.combos += 1;
      this.addPopup(bomb.x, bomb.y - 24, 'FLAVOR COMBO! ✨', '#f43f5e');
      this.spawnConfetti(bomb.x, bomb.y, ['#fb7185', '#fbbf24', '#38bdf8', '#a78bfa'], 18);
      if (Math.random() < 0.85 && !this.powerups.some((pu) => pu.c === bomb.c && pu.r === bomb.r)) {
        const pool = this.mapConfig?.powerPool || POWERUP_KEYS;
        const randType = pool[Math.floor(Math.random() * pool.length)];
        this.powerups.push({ c: bomb.c, r: bomb.r, type: randType, bobPhase: 0 });
      }
    }

    this.sound?.playPop(isCombo);
    this.screenShake = Math.max(this.screenShake, isCombo ? 7 : 4);

    const cells = this.computeBombBlastCells(bomb);
    for (const cell of cells) {
      if (this.grid[cell.r][cell.c] === TILE_TYPE.CRATE) {
        this.breakCrate(cell.c, cell.r, owner);
      }
    }

    const cellKeys = new Set(cells.map((cell) => `${cell.c},${cell.r}`));

    // Collect bombs caught in blast for chain detonation
    const hitBombs = [];
    for (const other of [...this.bombs]) {
      if (cellKeys.has(`${other.c},${other.r}`) && other.vx === 0 && other.vy === 0) {
        hitBombs.push(other);
      }
    }

    const hoppedPlayers = new Set();
    this.explosions.push({
      cells,
      originC: bomb.c,
      originR: bomb.r,
      color: bomb.char.splash,
      accent: bomb.char.color,
      ownerId: bomb.ownerId,
      isGhostShot: bomb.isGhostShot,
      hoppedPlayers,
      timer: EXPLOSION_DURATION,
      maxTimer: EXPLOSION_DURATION,
    });

    this.spawnConfetti(bomb.x, bomb.y, [bomb.char.splash, bomb.char.accent, '#ffffff'], 10);

    // 1. Apply blast hits / puffs / mochi-bowl BEFORE pull & push effects!
    for (const p of this.players) {
      const pc = Math.floor(p.x / TILE);
      const pr = Math.floor(p.y / TILE);
      if (!cellKeys.has(`${pc},${pr}`)) continue;

      if (p.state === 'alive' && p.jumpTimer <= 0) {
        if (p.id === bomb.ownerId && !bomb.isGhostShot) {
          hoppedPlayers.add(p.id);
          this.triggerSelfHop(p);
        } else {
          this.puffPlayer(p, owner, bomb.isGhostShot);
        }
      } else if (
        p.state === 'mochi_ball' &&
        p.bowlVx === 0 &&
        p.bowlVy === 0 &&
        p.mochiMaxTimer - p.mochiTimer > 0.45 &&
        !(bomb.flavor === 'soda' && !bomb.isMini)
      ) {
        let dc = Math.sign(pc - bomb.c);
        let dr = Math.sign(pr - bomb.r);
        if (dc === 0 && dr === 0) {
          dc = bomb.facingX || 0;
          dr = bomb.facingY || 1;
        }
        if (dc !== 0 && dr !== 0) dr = 0;
        this.launchMochiBall(p, dc, dr, bomb.ownerId, 'SMASHED! 💥');
      }
    }

    // 2. Tama Cream Pull (only pulls rivals OUTSIDE blast cells into the caramel zone!)
    if (bomb.flavor === 'cream' && !bomb.isMini) {
      let pulledAny = false;
      for (const pu of this.powerups) {
        const dist = Math.abs(pu.c - bomb.c) + Math.abs(pu.r - bomb.r);
        if (dist > 0 && dist <= 4) {
          const stepC = pu.c + Math.sign(bomb.c - pu.c);
          const stepR = pu.c !== bomb.c ? pu.r : pu.r + Math.sign(bomb.r - pu.r);
          if (
            this.grid[stepR][stepC] === TILE_TYPE.EMPTY &&
            !this.powerups.some((other) => other.c === stepC && other.r === stepR)
          ) {
            pu.c = stepC;
            pu.r = stepR;
            pulledAny = true;
          }
        }
      }
      for (const rival of this.players) {
        if (rival.id !== bomb.ownerId && rival.state === 'alive' && !rival.isCelebrating && rival.jumpTimer <= 0) {
          const rc = Math.floor(rival.x / TILE);
          const rr = Math.floor(rival.y / TILE);
          if (cellKeys.has(`${rc},${rr}`)) continue;
          const mDist = Math.abs(rc - bomb.c) + Math.abs(rr - bomb.r);
          if (mDist >= 2 && mDist <= 3) {
            const dx = bomb.x - rival.x;
            const dy = bomb.y - rival.y;
            const len = Math.hypot(dx, dy) || 1;
            const pullX = rival.x + (dx / len) * TILE * 0.22;
            const pullY = rival.y + (dy / len) * TILE * 0.22;
            const tc = Math.floor(pullX / TILE);
            const tr = Math.floor(pullY / TILE);
            if (this.isTilePassableForPlayer(tc, tr, rival.id)) {
              rival.x = pullX;
              rival.y = pullY;
              this.resolveTileCollision(rival, Math.sign(dx), 0);
              this.resolveTileCollision(rival, 0, Math.sign(dy));
              pulledAny = true;
            }
          }
        }
      }
      if (pulledAny) {
        this.addPopup(bomb.x, bomb.y - 18, 'CREAM PULL! ✨', '#9333ea');
      }

      const existingZone = this.caramelZones.find((z) => z.c === bomb.c && z.r === bomb.r);
      if (existingZone) {
        existingZone.timer = 2.2;
        existingZone.ownerId = bomb.ownerId;
      } else {
        this.caramelZones.push({ c: bomb.c, r: bomb.r, timer: 2.2, maxTimer: 2.2, ownerId: bomb.ownerId });
      }
    }

    // 3. Flavor-specific post-explosion effects
    if (!bomb.isMini) {
      if (bomb.flavor === 'boba') {
        this.spawnBobaPearls(bomb, owner);
      } else if (bomb.flavor === 'mochi') {
        const existingPad = this.jellyPads.find((j) => j.c === bomb.c && j.r === bomb.r);
        if (existingPad) {
          existingPad.timer = JELLY_DURATION;
        } else {
          this.jellyPads.push({ c: bomb.c, r: bomb.r, timer: JELLY_DURATION, cooldownMap: new Map() });
        }
      } else if (bomb.flavor === 'soda') {
        this.applySodaPush(bomb, cellKeys);
      }
    }

    for (const chained of hitBombs) {
      chained.fuse = Math.min(chained.fuse, 0.16);
      if (chained.chainTriggerOwnerId === null || chained.chainTriggerOwnerId === undefined) {
        chained.chainTriggerOwnerId = bomb.ownerId;
      }
    }
  }

  applySodaPush(bomb, cellKeys) {
    let fx = bomb.facingX || 0;
    let fy = bomb.facingY || 0;
    if (fx === 0 && fy === 0) fy = 1;

    for (const other of this.bombs) {
      if (cellKeys.has(`${other.c},${other.r}`)) {
        let dc = Math.sign(other.c - bomb.c);
        let dr = Math.sign(other.r - bomb.r);
        if (dc === 0 && dr === 0) {
          dc = fx;
          dr = fy;
        }
        if (dc !== 0 || dr !== 0) {
          this.tryKickBomb(other, dc, dr, null);
        }
      }
    }

    for (const p of this.players) {
      const pc = Math.floor(p.x / TILE);
      const pr = Math.floor(p.y / TILE);
      if (!cellKeys.has(`${pc},${pr}`)) continue;

      if (p.state === 'alive' && p.id !== bomb.ownerId && !p.isCelebrating && p.jumpTimer <= 0) {
        const nextC = pc + fx;
        const nextR = pr + fy;
        if (this.isTilePassableForPlayer(nextC, nextR, p.id)) {
          p.x = (nextC + 0.5) * TILE;
          p.y = (nextR + 0.5) * TILE;
          this.addPopup(p.x, p.y - 20, 'WHOOSH! 🫧', '#38bdf8');
        }
      } else if (
        p.state === 'mochi_ball' &&
        p.bowlVx === 0 &&
        p.bowlVy === 0 &&
        p.mochiMaxTimer - p.mochiTimer > 0.45
      ) {
        this.launchMochiBall(p, fx, fy, bomb.ownerId, 'FIZZ BOWL! 🫧');
      }
    }
  }

  spawnBobaPearls(bomb, owner = null) {
    let dc = bomb.facingX;
    let dr = bomb.facingY;
    if (dc === 0 && dr === 0) dr = 1;

    // 1 aimed forward pearl normally, 2 during Sugar Rush
    const candidates =
      owner && owner.sugarRushTimer > 0
        ? [
            [dc, dr],
            [-dr, dc],
          ]
        : [[dc, dr]];

    for (const [vxDir, vyDir] of candidates) {
      let useDc = vxDir;
      let useDr = vyDir;
      const nextC = bomb.c + useDc;
      const nextR = bomb.r + useDr;
      if (
        nextC < 1 ||
        nextC >= COLS - 1 ||
        nextR < 1 ||
        nextR >= ROWS - 1 ||
        this.isSolidTile(this.grid[nextR][nextC])
      ) {
        const openDir = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].find(([x, y]) => {
          const tc = bomb.c + x;
          const tr = bomb.r + y;
          return tc >= 1 && tc < COLS - 1 && tr >= 1 && tr < ROWS - 1 && !this.isSolidTile(this.grid[tr][tc]);
        });
        if (!openDir) continue;
        [useDc, useDr] = openDir;
      }

      this.bobaPearls.push({
        x: bomb.x + useDc * 16,
        y: bomb.y + useDr * 16,
        vx: useDc * 310,
        vy: useDr * 310,
        ownerId: bomb.ownerId,
        bouncesLeft: 1,
        life: 1.65,
      });
    }
  }

  updateBobaPearls(dt) {
    for (let i = this.bobaPearls.length - 1; i >= 0; i--) {
      const pearl = this.bobaPearls[i];
      pearl.life -= dt;
      if (pearl.life <= 0) {
        this.bobaPearls.splice(i, 1);
        continue;
      }

      const nextX = pearl.x + pearl.vx * dt;
      const nextY = pearl.y + pearl.vy * dt;
      const nc = Math.floor(nextX / TILE);
      const nr = Math.floor(nextY / TILE);
      const tile = nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS ? this.grid[nr][nc] : TILE_TYPE.WALL;

      if (this.isSolidTile(tile)) {
        if (pearl.bouncesLeft > 0 || tile === TILE_TYPE.BUMPER) {
          if (tile !== TILE_TYPE.BUMPER) pearl.bouncesLeft -= 1;
          pearl.vx = -pearl.vx;
          pearl.vy = -pearl.vy;
          if (tile === TILE_TYPE.BUMPER) this.sound?.playBumper();
          else this.sound?.playBounce();
        } else {
          this.spawnConfetti(pearl.x, pearl.y, ['#365314', '#84cc16'], 6);
          this.bobaPearls.splice(i, 1);
          continue;
        }
      } else if (tile === TILE_TYPE.CRATE) {
        const owner = this.players.find((p) => p.id === pearl.ownerId);
        this.breakCrate(nc, nr, owner);
        this.spawnConfetti(nextX, nextY, ['#84cc16', '#fde68a'], 8);
        this.bobaPearls.splice(i, 1);
        continue;
      } else {
        pearl.x = nextX;
        pearl.y = nextY;
      }

      // Check player hit (never hits own owner, invulnerable, or celebrating players!)
      let hit = false;
      for (const p of this.players) {
        if (p.id !== pearl.ownerId && p.jumpTimer <= 0 && Math.hypot(p.x - pearl.x, p.y - pearl.y) < TILE * 0.48) {
          if (p.state === 'alive' && p.invulnTimer <= 0 && !p.isCelebrating) {
            const owner = this.players.find((pl) => pl.id === pearl.ownerId);
            this.puffPlayer(p, owner, false);
            this.spawnConfetti(pearl.x, pearl.y, ['#84cc16', '#365314'], 8);
            hit = true;
            break;
          } else if (
            p.state === 'mochi_ball' &&
            p.bowlVx === 0 &&
            p.bowlVy === 0 &&
            p.mochiMaxTimer - p.mochiTimer > 0.45
          ) {
            this.launchMochiBall(
              p,
              Math.sign(pearl.vx),
              Math.sign(pearl.vy),
              pearl.ownerId,
              'BOBA BOWL! 🧋'
            );
            this.spawnConfetti(pearl.x, pearl.y, ['#84cc16', '#365314'], 8);
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        this.bobaPearls.splice(i, 1);
      }
    }
  }

  breakCrate(c, r, owner = null) {
    if (this.grid[r][c] !== TILE_TYPE.CRATE) return;
    this.grid[r][c] = TILE_TYPE.EMPTY;
    if (owner) owner.stats.cratesBroken += 1;
    this.spawnConfetti((c + 0.5) * TILE, (r + 0.5) * TILE, ['#fde68a', '#fbcfe8', '#fed7aa'], 9);

    if (Math.random() < 0.38) {
      const pool = this.mapConfig?.powerPool || POWERUP_KEYS;
      const randType = pool[Math.floor(Math.random() * pool.length)];
      this.powerups.push({ c, r, type: randType, bobPhase: Math.random() * Math.PI * 2 });
    }
  }

  puffPlayer(p, attacker = null, isGhostShot = false) {
    if (p.state !== 'alive' || p.invulnTimer > 0 || p.isCelebrating || this.roundResolveTimer >= 0) return;

    if (p.hasShield) {
      p.hasShield = false;
      p.invulnTimer = 1.1;
      this.sound?.playBounce();
      this.addPopup(p.x, p.y - 22, 'SAVED! 🛡️', '#8b5cf6');
      this.spawnConfetti(p.x, p.y, ['#ffffff', '#ddd6fe'], 14);
      return;
    }

    p.state = 'mochi_ball';
    p.dashTimer = 0;
    p.mochiTimer = MOCHI_BALL_DURATION;
    p.mochiMaxTimer = MOCHI_BALL_DURATION;
    p.bowlVx = 0;
    p.bowlVy = 0;
    p.bowlTimer = 0;
    p.bowledBy = null;
    p.prevWiggleDx = 0;
    p.prevWiggleDy = 0;
    p.stats.timesPuffed += 1;
    if (isGhostShot && attacker && attacker.id !== p.id) {
      attacker.stats.ghostHits += 1;
    }
    this.sound?.playMochiPuff();
    this.addPopup(p.x, p.y - 20, 'PUFF! 🍡', '#f472b6');
    this.spawnConfetti(p.x, p.y, [p.char.accent, '#ffffff', '#fbcfe8'], 14);
  }

  launchMochiBall(ball, dirX, dirY, bowlerId, label = 'BOWLED! 🎳', speed = 440) {
    let vx = dirX;
    let vy = dirY;
    if (vx === 0 && vy === 0) vy = 1;
    ball.bowlVx = vx * speed;
    ball.bowlVy = vy * speed;
    ball.bowlTimer = 0;
    ball.bowlBounces = 0;
    ball.bowledBy = bowlerId;
    const bowler = this.players.find((b) => b.id === bowlerId);
    if (bowler) bowler.stats.bowls += 1;
    this.sound?.playBowlHit();
    this.addPopup(ball.x, ball.y - 22, label, '#f59e0b');
  }

  checkMochiBowlingBumps() {
    for (const ball of this.players) {
      if (ball.state !== 'mochi_ball' || ball.bowlVx !== 0 || ball.bowlVy !== 0) continue;
      for (const p of this.players) {
        if (p.id === ball.id || p.state !== 'alive' || p.jumpTimer > 0) continue;
        if (Math.hypot(p.x - ball.x, p.y - ball.y) < TILE * 0.78) {
          let vx = p.facingX;
          let vy = p.facingY;
          if (vx === 0 && vy === 0) {
            const dx = ball.x - p.x;
            const dy = ball.y - p.y;
            if (Math.abs(dx) >= Math.abs(dy)) vx = Math.sign(dx) || 1;
            else vy = Math.sign(dy) || 1;
          }
          const isDashing = p.dashTimer > 0;
          const speed = isDashing ? 520 : 440;
          const label = isDashing ? 'MEGA BOWL! 💥' : 'BOWLED! 🎳';
          if (isDashing) p.dashTimer = 0;
          this.launchMochiBall(ball, vx, vy, p.id, label, speed);
          break;
        }
      }
    }
  }

  updateMochiBallPlayer(p, input, dt) {
    if (p.bowlVx === 0 && p.bowlVy === 0) {
      p.mochiTimer -= dt;

      const dirTap =
        p.controlType === 'human' &&
        (input.dx !== 0 || input.dy !== 0) &&
        (input.dx !== (p.prevWiggleDx || 0) || input.dy !== (p.prevWiggleDy || 0));
      p.prevWiggleDx = input.dx;
      p.prevWiggleDy = input.dy;

      // Mash action/dash or directional keys to wiggle free faster (rate-limited so bots don't unpuff instantly)
      if ((input.actionPressed || input.dashPressed || dirTap) && p.wiggleCooldown <= 0) {
        const isHuman = p.controlType === 'human';
        p.wiggleCooldown = isHuman ? 0.12 : 0.48;
        p.mochiTimer -= isHuman ? 0.24 : 0.16;
        p.walkPhase += 1.4;
        if (p.wiggleFeedbackTimer <= 0) {
          this.addPopup(p.x, p.y - 22, 'WIGGLE! 🍡', '#16a34a');
          p.wiggleFeedbackTimer = 0.45;
        }
      }

      // Slow waddle while puffed
      if (input.dx !== 0 || input.dy !== 0) {
        const waddleDist = p.speed * 0.22 * dt;
        p.facingX = input.dx;
        p.facingY = input.dy;
        p.walkPhase += dt * 7;
        p.x += input.dx * waddleDist;
        p.y += input.dy * waddleDist;
        this.resolveTileCollision(p, input.dx, input.dy);
      }

      // Recover back to normal if not bowled in time!
      if (p.mochiTimer <= 0) {
        p.state = 'alive';
        p.invulnTimer = 1.6;
        p.bowlVx = 0;
        p.bowlVy = 0;
        p.bowlTimer = 0;
        p.bowledBy = null;
        this.sound?.playRecover();
        this.addPopup(p.x, p.y - 22, 'RECOVERED! ✨', '#16a34a');
        this.spawnConfetti(p.x, p.y, ['#86efac', '#fef08a', '#ffffff'], 14);
      }
      return;
    }

    // Bowled & rolling across arena!
    p.bowlTimer += dt;
    const nextX = p.x + p.bowlVx * dt;
    const nextY = p.y + p.bowlVy * dt;
    const dirX = Math.sign(p.bowlVx);
    const dirY = Math.sign(p.bowlVy);
    const probeX = nextX + dirX * (TILE * 0.36);
    const probeY = nextY + dirY * (TILE * 0.36);
    const nc = Math.floor(probeX / TILE);
    const nr = Math.floor(probeY / TILE);
    const inBounds = nc >= 1 && nc < COLS - 1 && nr >= 1 && nr < ROWS - 1;
    const tile = inBounds ? this.grid[nr][nc] : TILE_TYPE.WALL;

    const curC = Math.floor(p.x / TILE);
    const curR = Math.floor(p.y / TILE);

    if (inBounds && tile === TILE_TYPE.BUMPER) {
      // Ricochet 90 degrees off pink bumper into an open lane if possible
      const cand1 = [-p.bowlVy, p.bowlVx];
      const cand2 = [p.bowlVy, -p.bowlVx];
      const c1Open = this.grid[curR + Math.sign(cand1[1])]?.[curC + Math.sign(cand1[0])] === TILE_TYPE.EMPTY;
      const c2Open = this.grid[curR + Math.sign(cand2[1])]?.[curC + Math.sign(cand2[0])] === TILE_TYPE.EMPTY;
      if (c1Open) {
        p.bowlVx = cand1[0] || 0;
        p.bowlVy = cand1[1] || 0;
      } else if (c2Open) {
        p.bowlVx = cand2[0] || 0;
        p.bowlVy = cand2[1] || 0;
      } else {
        p.bowlVx = -p.bowlVx || 0;
        p.bowlVy = -p.bowlVy || 0;
      }
      p.x = (curC + 0.5) * TILE;
      p.y = (curR + 0.5) * TILE;
      p.bowlBounces = (p.bowlBounces || 0) + 1;
      if (p.bowlBounces <= 3) {
        p.bowlTimer = Math.max(0, p.bowlTimer - 0.3);
      }
      this.sound?.playBumper();
      this.addPopup(p.x, p.y - 20, 'BOING! 🌸', '#ec4899');
      return;
    }

    const hitOtherBomb = (nc !== curC || nr !== curR) && this.getBombAtTile(nc, nr);
    const blocked = !inBounds || tile !== TILE_TYPE.EMPTY || hitOtherBomb || p.bowlTimer >= 1.35;

    if (blocked) {
      this.addPopup(p.x, p.y - 24, 'KO! 👑', '#e11d48');
      this.screenShake = Math.max(this.screenShake, 6);
      this.spawnConfetti(p.x, p.y, ['#ffffff', p.char.accent, p.char.color], 16);
      this.convertToGhost(p);
      return;
    }

    p.x = nextX;
    p.y = nextY;

    for (const other of this.players) {
      if (
        other.id !== p.id &&
        other.id !== p.bowledBy &&
        other.state === 'alive' &&
        other.invulnTimer <= 0 &&
        !other.isCelebrating &&
        other.jumpTimer <= 0
      ) {
        if (Math.hypot(other.x - p.x, other.y - p.y) < TILE * 0.58) {
          const bowler = this.players.find((b) => b.id === p.bowledBy);
          if (bowler) bowler.stats.bowls += 1;
          this.puffPlayer(other, bowler, false);
        }
      }
    }
  }

  convertToGhost(p) {
    p.state = 'ghost';
    p.isCelebrating = false;
    p.bowlVx = 0;
    p.bowlVy = 0;
    p.bowlTimer = 0;
    p.dashTimer = 0;
    p.ghostCooldown = 1.6;
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(p.x / TILE)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / TILE)));
    const dists = [
      { edge: 'top', d: r, x: (c + 0.5) * TILE, y: 0.5 * TILE },
      { edge: 'bottom', d: ROWS - 1 - r, x: (c + 0.5) * TILE, y: (ROWS - 0.5) * TILE },
      { edge: 'left', d: c, x: 0.5 * TILE, y: (r + 0.5) * TILE },
      { edge: 'right', d: COLS - 1 - c, x: (COLS - 0.5) * TILE, y: (r + 0.5) * TILE },
    ];
    dists.sort((a, b) => a.d - b.d);
    p.x = dists[0].x;
    p.y = dists[0].y;
    this.addPopup(p.x, p.y - 16, '👻', '#e2e8f0');
  }

  computeGhostTarget(p) {
    const minX = 0.5 * TILE;
    const maxX = (COLS - 0.5) * TILE;
    const minY = 0.5 * TILE;
    const maxY = (ROWS - 0.5) * TILE;
    const snapEps = 16;

    const onTop = Math.abs(p.y - minY) < snapEps;
    const onBottom = Math.abs(p.y - maxY) < snapEps;
    const onLeft = Math.abs(p.x - minX) < snapEps;
    const onRight = Math.abs(p.x - maxX) < snapEps;

    const c = Math.max(1, Math.min(COLS - 2, Math.round(p.x / TILE - 0.5)));
    const r = Math.max(1, Math.min(ROWS - 2, Math.round(p.y / TILE - 0.5)));

    const contenders = this.players.filter(
      (pl) => pl.id !== p.id && (pl.state === 'alive' || pl.state === 'mochi_ball')
    );

    const pickValidInLane = (fixedIdx, desiredVar, isHorizontalLane) => {
      const limit = isHorizontalLane ? COLS - 2 : ROWS - 2;
      const isOk = (tc, tr) =>
        this.grid[tr]?.[tc] === TILE_TYPE.EMPTY && !this.getBombAtTile(tc, tr);

      for (let off = 0; off <= limit; off++) {
        const candidates = off === 0 ? [desiredVar] : [desiredVar + off, desiredVar - off];
        for (const v of candidates) {
          if (v < 1 || v > limit) continue;
          const tc = isHorizontalLane ? v : fixedIdx;
          const tr = isHorizontalLane ? fixedIdx : v;
          if (isOk(tc, tr)) return { c: tc, r: tr };
        }
      }
      return null;
    };

    if (onTop || onBottom) {
      let desiredR = 5;
      let bestDist = Infinity;
      for (const pl of contenders) {
        const pc = Math.floor(pl.x / TILE);
        const pr = Math.floor(pl.y / TILE);
        if (Math.abs(pc - c) <= 2) {
          const d = Math.hypot(pl.x - p.x, pl.y - p.y);
          if (d < bestDist) {
            bestDist = d;
            desiredR = Math.max(1, Math.min(ROWS - 2, pr));
          }
        }
      }
      return pickValidInLane(c, desiredR, false);
    }

    if (onLeft || onRight) {
      let desiredC = 6;
      let bestDist = Infinity;
      for (const pl of contenders) {
        const pc = Math.floor(pl.x / TILE);
        const pr = Math.floor(pl.y / TILE);
        if (Math.abs(pr - r) <= 2) {
          const d = Math.hypot(pl.x - p.x, pl.y - p.y);
          if (d < bestDist) {
            bestDist = d;
            desiredC = Math.max(1, Math.min(COLS - 2, pc));
          }
        }
      }
      return pickValidInLane(r, desiredC, true);
    }

    return null;
  }

  updateGhostPlayer(p, input, dt) {
    const speed = 220;
    const minX = 0.5 * TILE;
    const maxX = (COLS - 0.5) * TILE;
    const minY = 0.5 * TILE;
    const maxY = (ROWS - 0.5) * TILE;
    const snapEps = 14;

    const onTop = Math.abs(p.y - minY) < snapEps;
    const onBottom = Math.abs(p.y - maxY) < snapEps;
    const onLeft = Math.abs(p.x - minX) < snapEps;
    const onRight = Math.abs(p.x - maxX) < snapEps;

    if (input.dx !== 0) {
      if (onTop || onBottom) {
        p.y = onTop ? minY : maxY;
        p.x = Math.max(minX, Math.min(maxX, p.x + input.dx * speed * dt));
        p.facingX = input.dx;
        p.facingY = 0;
      } else if (onLeft || onRight) {
        const cornerDir = p.y < (minY + maxY) / 2 ? -1 : 1;
        p.y = Math.max(minY, Math.min(maxY, p.y + cornerDir * speed * dt));
        p.facingX = 0;
        p.facingY = cornerDir;
      }
    } else if (input.dy !== 0) {
      if (onLeft || onRight) {
        p.x = onLeft ? minX : maxX;
        p.y = Math.max(minY, Math.min(maxY, p.y + input.dy * speed * dt));
        p.facingX = 0;
        p.facingY = input.dy;
      } else if (onTop || onBottom) {
        const cornerDir = p.x < (minX + maxX) / 2 ? -1 : 1;
        p.x = Math.max(minX, Math.min(maxX, p.x + cornerDir * speed * dt));
        p.facingX = cornerDir;
        p.facingY = 0;
      }
    }

    if (input.actionPressed && p.ghostCooldown <= 0 && this.roundResolveTimer < 0) {
      const target = this.computeGhostTarget(p);
      if (!target) return;

      p.ghostCooldown = GHOST_COOLDOWN;
      this.sound?.playGhostToss();
      this.ghostProjectiles.push({
        startX: p.x,
        startY: p.y,
        endX: (target.c + 0.5) * TILE,
        endY: (target.r + 0.5) * TILE,
        targetC: target.c,
        targetR: target.r,
        ownerId: p.id,
        char: p.char,
        progress: 0,
      });
    }
  }

  updateGhostProjectiles(dt) {
    for (let i = this.ghostProjectiles.length - 1; i >= 0; i--) {
      const gp = this.ghostProjectiles[i];
      gp.progress += dt * 2.5;
      if (gp.progress >= 1) {
        this.ghostProjectiles.splice(i, 1);
        const owner = this.players.find((p) => p.id === gp.ownerId);
        if (
          this.roundResolveTimer < 0 &&
          !this.isSolidTile(this.grid[gp.targetR][gp.targetC]) &&
          !this.getBombAtTile(gp.targetC, gp.targetR)
        ) {
          this.bombs.push({
            c: gp.targetC,
            r: gp.targetR,
            x: gp.endX,
            y: gp.endY,
            vx: 0,
            vy: 0,
            ownerId: gp.ownerId,
            chainTriggerOwnerId: null,
            char: gp.char,
            flavor: owner ? owner.flavor : 'boba',
            attackPattern: 'cross_slide',
            range: 1,
            fuse: 1.05,
            maxFuse: 1.05,
            facingX: 0,
            facingY: 1,
            passableBy: new Set(),
            isMini: true,
            isGhostShot: true,
          });
        }
      }
    }
  }

  applyKaitenBelt(dt) {
    const beltRows = [
      { r: 3, dir: 1 },
      { r: 7, dir: -1 },
    ];
    const beltSpeed = 48;

    for (const belt of beltRows) {
      for (const p of this.players) {
        if (
          (p.state === 'alive' || p.state === 'mochi_ball') &&
          !p.isCelebrating &&
          p.jumpTimer <= 0 &&
          p.dashTimer <= 0
        ) {
          const pr = Math.floor(p.y / TILE);
          if (pr === belt.r) {
            const curC = Math.floor(p.x / TILE);
            const nextX = p.x + belt.dir * beltSpeed * dt;
            const probeC = Math.floor((nextX + belt.dir * TILE * 0.35) / TILE);
            const passable =
              probeC === curC
                ? this.grid[belt.r]?.[probeC] === TILE_TYPE.EMPTY
                : this.isTilePassableForPlayer(probeC, belt.r, p.id);
            if (passable) {
              p.x = nextX;
              this.resolveTileCollision(p, belt.dir, 0);
            }
          }
        }
      }
      for (const b of this.bombs) {
        if (b.r === belt.r && b.vx === 0 && b.vy === 0) {
          const nextX = b.x + belt.dir * beltSpeed * dt;
          const probeC = Math.floor((nextX + belt.dir * TILE * 0.4) / TILE);
          const canMoveTile =
            probeC >= 1 &&
            probeC < COLS - 1 &&
            this.grid[belt.r][probeC] === TILE_TYPE.EMPTY &&
            (probeC === b.c ||
              (!this.getBombAtTile(probeC, belt.r) &&
                !this.players.some(
                  (pl) =>
                    pl.state === 'alive' &&
                    Math.floor(pl.x / TILE) === probeC &&
                    Math.floor(pl.y / TILE) === belt.r
                )));
          if (canMoveTile) {
            b.x = nextX;
            b.c = Math.floor(b.x / TILE);
          }
        }
      }
    }
  }

  updateJellyPads(dt) {
    for (let i = this.jellyPads.length - 1; i >= 0; i--) {
      const pad = this.jellyPads[i];
      pad.timer -= dt;
      for (const [pid, cd] of pad.cooldownMap.entries()) {
        if (cd - dt <= 0) pad.cooldownMap.delete(pid);
        else pad.cooldownMap.set(pid, cd - dt);
      }
      if (pad.timer <= 0) {
        this.jellyPads.splice(i, 1);
      }
    }
  }

  updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.timer -= dt;
      for (const cell of exp.cells) {
        for (const p of this.players) {
          if (Math.floor(p.x / TILE) !== cell.c || Math.floor(p.y / TILE) !== cell.r) continue;
          if (p.state === 'alive' && p.jumpTimer <= 0) {
            if (p.id === exp.ownerId && !exp.isGhostShot) {
              if (!exp.hoppedPlayers.has(p.id)) {
                exp.hoppedPlayers.add(p.id);
                this.triggerSelfHop(p);
              }
            } else {
              const owner = this.players.find((pl) => pl.id === exp.ownerId);
              this.puffPlayer(p, owner, exp.isGhostShot);
            }
          } else if (
            p.state === 'mochi_ball' &&
            p.bowlVx === 0 &&
            p.bowlVy === 0 &&
            p.mochiMaxTimer - p.mochiTimer > 0.45
          ) {
            let dc = Math.sign(cell.c - (exp.originC ?? cell.c));
            let dr = Math.sign(cell.r - (exp.originR ?? cell.r));
            if (dc === 0 && dr === 0) dr = 1;
            if (dc !== 0 && dr !== 0) dr = 0;
            this.launchMochiBall(p, dc, dr, exp.ownerId, 'SMASHED! 💥');
          }
        }
      }
      if (exp.timer <= 0) {
        this.explosions.splice(i, 1);
      }
    }
  }

  updateParticlesAndPopups(dt) {
    for (const pu of this.powerups) {
      pu.bobPhase += dt * 4;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 260 * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y -= 28 * dt;
      pop.life -= dt;
      if (pop.life <= 0) this.popups.splice(i, 1);
    }
  }

  checkRoundOutcome(dt) {
    if (this.roundResultReady) return;
    // Both 'alive' and 'mochi_ball' (who can still recover!) count as contenders; only 'ghost' is knocked out!
    // Wait: if only 1 player is NOT 'ghost', or wait - what if 1 is 'alive' and 1 is 'mochi_ball' rolling into a wall?
    // Let's keep checking alive + non-ghost carefully:
    const nonGhosts = this.players.filter((p) => p.state !== 'ghost');
    const alive = this.players.filter((p) => p.state === 'alive');

    if (nonGhosts.length <= 1) {
      if (this.roundResolveTimer < 0) {
        this.roundResolveTimer = 1.65;
        if (nonGhosts.length === 1) {
          const winner = nonGhosts[0];
          winner.state = 'alive';
          winner.mochiTimer = 0;
          winner.bowlVx = 0;
          winner.bowlVy = 0;
          winner.dashTimer = 0;
          winner.isCelebrating = true;
          winner.celebrateSparkleTimer = 0.22;
          winner.facingX = 0;
          winner.facingY = 1;
          this.spawnConfetti(
            winner.x,
            winner.y - 14,
            [winner.char.color, '#facc15', '#ffffff', winner.char.splash],
            20
          );
          this.addPopup(
            winner.x,
            winner.y - 34,
            this.lang === 'ja' ? 'やったー！🎉' : 'YAY! WINNER! 🎉',
            winner.char.color
          );
          this.sound?.playWin();
        }
      } else {
        this.roundResolveTimer -= dt;
        if (this.roundResolveTimer <= 0) {
          this.roundResultReady = true;
          this.roundOver = true;
          const survivors = this.players.filter((p) => p.state !== 'ghost');
          if (survivors.length === 1) {
            survivors[0].state = 'alive';
            survivors[0].isCelebrating = true;
            this.roundWinner = survivors[0];
            this.matchStats[survivors[0].id].wins += 1;
            if (this.matchStats[survivors[0].id].wins >= this.winsNeeded) {
              this.matchOver = true;
              this.matchWinner = survivors[0];
            }
          } else {
            this.roundWinner = null; // Draw!
          }
        }
      }
    } else if (this.timeLeft <= 0) {
      this.roundResultReady = true;
      this.roundOver = true;
      const candidates = alive.length > 0 ? alive : nonGhosts;
      let topScore = -1;
      let topPlayer = null;
      let tied = false;
      for (const p of candidates) {
        const s = p.stats.cratesBroken + p.stats.bowls * 3;
        if (s > topScore) {
          topScore = s;
          topPlayer = p;
          tied = false;
        } else if (s === topScore) {
          tied = true;
        }
      }
      if (!tied && topPlayer) {
        topPlayer.state = 'alive';
        topPlayer.isCelebrating = true;
        topPlayer.facingX = 0;
        topPlayer.facingY = 1;
        this.roundWinner = topPlayer;
        this.matchStats[topPlayer.id].wins += 1;
        if (this.matchStats[topPlayer.id].wins >= this.winsNeeded) {
          this.matchOver = true;
          this.matchWinner = topPlayer;
        }
        this.sound?.playWin();
      } else {
        this.roundWinner = null;
      }
    }
  }

  getAwards() {
    const activeStats = this.players.map((p) => this.matchStats[p.id]);
    const pickMax = (key) => {
      let best = null;
      for (const st of activeStats) {
        if (st[key] > 0 && (!best || st[key] > best[key])) best = st;
      }
      return best;
    };
    return {
      bowling: pickMax('bowls'),
      combo: pickMax('combos'),
      ghost: pickMax('ghostHits'),
      boxes: pickMax('cratesBroken'),
      clumsy: pickMax('timesPuffed'),
    };
  }
}
