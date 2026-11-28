import { COLS, ROWS, TILE, TILE_TYPE } from './constants.js';

function isTileWalkableForBot(game, c, r, playerId) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
  const tile = game.grid[r][c];
  if (tile !== TILE_TYPE.EMPTY) return false;
  const bomb = game.getBombAtTile(c, r);
  if (bomb && !bomb.passableBy.has(playerId)) return false;
  return true;
}

export function buildDangerSet(game, ignoreOwnerId = null) {
  const danger = new Set();
  const mark = (c, r) => {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
      danger.add(`${c},${r}`);
    }
  };

  for (const exp of game.explosions) {
    if (ignoreOwnerId !== null && exp.ownerId === ignoreOwnerId && !exp.isGhostShot) continue;
    for (const cell of exp.cells) {
      mark(cell.c, cell.r);
    }
  }

  for (const warn of game.suddenWarnings) {
    mark(warn.c, warn.r);
  }

  if (game.suddenStarted && typeof game.getUpcomingSuddenTiles === 'function') {
    for (const t of game.getUpcomingSuddenTiles(2)) {
      mark(t.c, t.r);
    }
  }

  for (const b of game.bombs) {
    if (ignoreOwnerId !== null && b.ownerId === ignoreOwnerId && !b.isGhostShot) continue;
    const cells = game.computeBombBlastCells(b);
    for (const cell of cells) {
      mark(cell.c, cell.r);
    }
  }

  for (const sm of game.floorSmashes || []) {
    if (ignoreOwnerId !== null && sm.ownerId === ignoreOwnerId) continue;
    for (const cell of sm.cells) {
      mark(cell.c, cell.r);
    }
  }

  for (const sp of game.spikeTraps || []) {
    if (ignoreOwnerId !== null && sp.ownerId === ignoreOwnerId) continue;
    mark(sp.c, sp.r);
  }

  for (const sw of game.laneSwoops || []) {
    if (ignoreOwnerId !== null && sw.ownerId === ignoreOwnerId) continue;
    for (const cell of sw.cells) {
      mark(cell.c, cell.r);
    }
  }

  for (const pearl of game.bobaPearls) {
    if (ignoreOwnerId !== null && pearl.ownerId === ignoreOwnerId) continue;
    const pc = Math.floor(pearl.x / TILE);
    const pr = Math.floor(pearl.y / TILE);
    mark(pc, pr);
    const pvx = Math.sign(pearl.vx);
    const pvy = Math.sign(pearl.vy);
    const nc = pc + pvx;
    const nr = pr + pvy;
    if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && game.grid[nr][nc] === TILE_TYPE.EMPTY) {
      mark(nc, nr);
    }
  }

  return danger;
}

function bfsFirstStep(
  game,
  startC,
  startR,
  danger,
  playerId,
  isGoalFn,
  avoidDanger = true,
  maxDepth = 14,
  preferDir = null
) {
  const startKey = `${startC},${startR}`;
  if (isGoalFn(startC, startR)) return { reached: true, dir: null, dist: 0 };

  const queue = [{ c: startC, r: startR, firstDir: null, dist: 0 }];
  const visited = new Set([startKey]);
  const dirs = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  const offset = playerId % 4;
  let orderedDirs = [
    dirs[offset],
    dirs[(offset + 1) % 4],
    dirs[(offset + 2) % 4],
    dirs[(offset + 3) % 4],
  ];

  if (preferDir && (preferDir.dx !== 0 || preferDir.dy !== 0)) {
    const match = orderedDirs.find((d) => d.dx === preferDir.dx && d.dy === preferDir.dy);
    const opposite = orderedDirs.find((d) => d.dx === -preferDir.dx && d.dy === -preferDir.dy);
    orderedDirs = [
      ...(match ? [match] : []),
      ...orderedDirs.filter((d) => d !== match && d !== opposite),
      ...(opposite ? [opposite] : []),
    ];
  }

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.dist >= maxDepth) continue;

    for (const d of orderedDirs) {
      const nc = cur.c + d.dx;
      const nr = cur.r + d.dy;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (!isTileWalkableForBot(game, nc, nr, playerId)) continue;
      if (avoidDanger && danger.has(key) && !(nc === startC && nr === startR)) continue;

      const firstDir = cur.firstDir || d;
      if (isGoalFn(nc, nr)) {
        return { reached: true, dir: firstDir, dist: cur.dist + 1 };
      }
      visited.add(key);
      queue.push({ c: nc, r: nr, firstDir, dist: cur.dist + 1 });
    }
  }

  return { reached: false, dir: null, dist: Infinity };
}

function hasEscapeIfBombDropped(game, dropC, dropR, player, existingDanger) {
  const simDanger = new Set(existingDanger);
  const simBomb = {
    c: dropC,
    r: dropR,
    range: player.range + (player.sugarRushTimer > 0 ? 2 : 0),
    attackPattern: player.char.attackPattern || 'cross_slide',
    facingX: player.facingX,
    facingY: player.facingY,
    isMini: false,
  };
  for (const cell of game.computeBombBlastCells(simBomb)) {
    simDanger.add(`${cell.c},${cell.r}`);
  }

  const queue = [{ c: dropC, r: dropR, dist: 0 }];
  const visited = new Set([`${dropC},${dropR}`]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!simDanger.has(`${cur.c},${cur.r}`)) return true;
    if (cur.dist >= 5) continue;
    for (const [dc, dr] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const nc = cur.c + dc;
      const nr = cur.r + dr;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (game.grid[nr][nc] !== TILE_TYPE.EMPTY) continue;
      if (game.getBombAtTile(nc, nr) && !(nc === dropC && nr === dropR)) continue;
      visited.add(key);
      queue.push({ c: nc, r: nr, dist: cur.dist + 1 });
    }
  }
  return false;
}

function computeMochiBotInput(game, player, dt) {
  const actionPressed = player.wiggleCooldown <= 0 && Math.random() < 0.45;

  player.botThinkTimer -= dt;
  if (player.botThinkTimer > 0 && player.botCachedInput) {
    return {
      dx: player.botCachedInput.dx,
      dy: player.botCachedInput.dy,
      actionPressed,
      dashPressed: false,
    };
  }
  player.botThinkTimer = 0.25;

  const c = Math.max(1, Math.min(COLS - 2, Math.floor(player.x / TILE)));
  const r = Math.max(1, Math.min(ROWS - 2, Math.floor(player.y / TILE)));
  const threats = game.players.filter((p) => p.id !== player.id && p.state === 'alive');
  if (threats.length === 0) {
    player.botCachedInput = { dx: 0, dy: 0 };
    return { dx: 0, dy: 0, actionPressed, dashPressed: false };
  }

  let nearest = threats[0];
  let nearestDist = Infinity;
  for (const t of threats) {
    const d = Math.hypot(t.x - player.x, t.y - player.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = t;
    }
  }

  let bestDx = 0;
  let bestDy = 0;
  let bestScore = -Infinity;
  for (const [dc, dr] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ]) {
    const nc = c + dc;
    const nr = r + dr;
    if (!isTileWalkableForBot(game, nc, nr, player.id)) continue;
    const nx = (nc + 0.5) * TILE;
    const ny = (nr + 0.5) * TILE;
    const score = Math.hypot(nx - nearest.x, ny - nearest.y);
    if (score > bestScore) {
      bestScore = score;
      bestDx = dc;
      bestDy = dr;
    }
  }

  player.botCachedInput = { dx: bestDx, dy: bestDy };
  return { dx: bestDx, dy: bestDy, actionPressed, dashPressed: false };
}

function computeGhostBotInput(game, player) {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor(player.x / TILE)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor(player.y / TILE)));

  const targets = game.players.filter(
    (p) => p.id !== player.id && (p.state === 'alive' || p.state === 'mochi_ball')
  );
  if (targets.length === 0) return { dx: 0, dy: 0, actionPressed: false, dashPressed: false };

  let bestTarget = targets[0];
  let bestDist = Infinity;
  for (const t of targets) {
    const d = Math.hypot(t.x - player.x, t.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      bestTarget = t;
    }
  }

  const tc = Math.floor(bestTarget.x / TILE);
  const tr = Math.floor(bestTarget.y / TILE);
  const diffX = bestTarget.x - player.x;
  const diffY = bestTarget.y - player.y;

  let dx = 0;
  let dy = 0;
  if (r === 0 || r === ROWS - 1) {
    if (Math.abs(diffX) > TILE * 0.4) dx = diffX > 0 ? 1 : -1;
  } else {
    if (Math.abs(diffY) > TILE * 0.4) dy = diffY > 0 ? 1 : -1;
  }

  const aligned =
    ((r === 0 || r === ROWS - 1) && Math.abs(c - tc) <= 1 && c >= 1 && c <= COLS - 2) ||
    ((c === 0 || c === COLS - 1) && Math.abs(r - tr) <= 1 && r >= 1 && r <= ROWS - 2);

  const actionPressed = player.ghostCooldown <= 0 && aligned && Math.random() < 0.14;
  return { dx, dy, actionPressed, dashPressed: false };
}

function isAlignedClearLine(game, c1, r1, c2, r2) {
  if (c1 !== c2 && r1 !== r2) return false;
  const dist = Math.abs(c1 - c2) + Math.abs(r1 - r2);
  if (dist === 0 || dist > 2) return false;
  const dc = Math.sign(c2 - c1);
  const dr = Math.sign(r2 - r1);
  for (let s = 1; s < dist; s++) {
    if (game.grid[r1 + dr * s][c1 + dc * s] !== TILE_TYPE.EMPTY) return false;
  }
  return true;
}

export function computeBotInput(game, player, dt) {
  if (player.state === 'ghost') {
    return computeGhostBotInput(game, player);
  }
  if (player.state === 'mochi_ball') {
    return computeMochiBotInput(game, player, dt);
  }
  if (player.state !== 'alive') {
    return { dx: 0, dy: 0, actionPressed: false, dashPressed: false };
  }

  const c = Math.max(1, Math.min(COLS - 2, Math.floor(player.x / TILE)));
  const r = Math.max(1, Math.min(ROWS - 2, Math.floor(player.y / TILE)));
  const danger = buildDangerSet(game, player.id);
  const inDanger = danger.has(`${c},${r}`);

  const stationaryBalls = game.players.filter(
    (p) => p.id !== player.id && p.state === 'mochi_ball' && p.bowlVx === 0 && p.bowlVy === 0
  );

  const hasAdjacentBall = stationaryBalls.some(
    (b) => Math.abs(Math.floor(b.x / TILE) - c) + Math.abs(Math.floor(b.y / TILE) - r) <= 1
  );

  const isClever = player.controlType === 'bot_clever';
  player.botThinkTimer -= dt;
  if (!inDanger && !hasAdjacentBall && player.botThinkTimer > 0 && player.botCachedInput) {
    const cdx = player.botCachedInput.dx;
    const cdy = player.botCachedInput.dy;
    const hasMotion = cdx !== 0 || cdy !== 0;
    const nextWalkable = hasMotion && isTileWalkableForBot(game, c + cdx, r + cdy, player.id);
    const nextKey = `${c + cdx},${r + cdy}`;
    if (
      (hasMotion || stationaryBalls.length === 0) &&
      (!hasMotion || nextWalkable) &&
      !danger.has(nextKey)
    ) {
      return { ...player.botCachedInput, actionPressed: false, dashPressed: false };
    }
  }
  player.botThinkTimer = stationaryBalls.length > 0 ? 0.06 : isClever ? 0.08 : 0.16;

  let dx = 0;
  let dy = 0;
  let actionPressed = false;
  let dashPressed = false;
  const preferDir = player.botCachedInput;

  if (inDanger) {
    const escape = bfsFirstStep(
      game,
      c,
      r,
      danger,
      player.id,
      (tc, tr) => !danger.has(`${tc},${tr}`),
      false,
      10,
      preferDir
    );
    if (escape.reached && escape.dir) {
      dx = escape.dir.dx;
      dy = escape.dir.dy;
    }
  } else {
    // 1. Prioritize chasing stationary puffed Mochi Balls to bowl them for a KO!
    let handledBall = false;
    if (stationaryBalls.length > 0) {
      let closestBall = stationaryBalls[0];
      let closestDist = Infinity;
      for (const b of stationaryBalls) {
        const d = Math.hypot(b.x - player.x, b.y - player.y);
        if (d < closestDist) {
          closestDist = d;
          closestBall = b;
        }
      }
      const bc = Math.floor(closestBall.x / TILE);
      const br = Math.floor(closestBall.y / TILE);
      const manhattan = Math.abs(bc - c) + Math.abs(br - r);

      if (manhattan <= 1) {
        const ddx = closestBall.x - player.x;
        const ddy = closestBall.y - player.y;
        if (Math.abs(ddx) >= Math.abs(ddy)) {
          dx = ddx >= 0 ? 1 : -1;
          dy = 0;
        } else {
          dx = 0;
          dy = ddy >= 0 ? 1 : -1;
        }
        if (player.dashCooldown <= 0) dashPressed = true;
        handledBall = true;
      } else {
        const ballGoal = bfsFirstStep(
          game,
          c,
          r,
          danger,
          player.id,
          (tc, tr) =>
            stationaryBalls.some(
              (p) => Math.floor(p.x / TILE) === tc && Math.floor(p.y / TILE) === tr
            ),
          true,
          12,
          preferDir
        );
        if (ballGoal.reached && ballGoal.dir) {
          dx = ballGoal.dir.dx;
          dy = ballGoal.dir.dy;
          if (player.dashCooldown <= 0) {
            const alignedBall = stationaryBalls.find((b) =>
              isAlignedClearLine(game, c, r, Math.floor(b.x / TILE), Math.floor(b.y / TILE))
            );
            if (alignedBall) {
              dx = Math.sign(Math.floor(alignedBall.x / TILE) - c);
              dy = Math.sign(Math.floor(alignedBall.y / TILE) - r);
              dashPressed = true;
            }
          }
          handledBall = true;
        }
      }
    }

    if (!handledBall) {
      // 2. Grab Golden Daifuku in center if ready & safe!
      const goldenGoal = game.goldenMochi
        ? bfsFirstStep(
            game,
            c,
            r,
            danger,
            player.id,
            (tc, tr) => tc === game.goldenMochi.c && tr === game.goldenMochi.r,
            true,
            10,
            preferDir
          )
        : { reached: false };

      if (goldenGoal.reached && goldenGoal.dir) {
        dx = goldenGoal.dir.dx;
        dy = goldenGoal.dir.dy;
      } else {
        // 3. Check for nearby power-up
        const puGoal = bfsFirstStep(
          game,
          c,
          r,
          danger,
          player.id,
          (tc, tr) => game.powerups.some((pu) => pu.c === tc && pu.r === tr),
          true,
          8,
          preferDir
        );

        if (puGoal.reached && puGoal.dir) {
          dx = puGoal.dir.dx;
          dy = puGoal.dir.dy;
        } else {
          // 4. Check if near a crate or rival player to launch a snack or dash-smash a crate
          const adjacentCrateDir = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].find(([dc, dr]) => {
            const nc = c + dc;
            const nr = r + dr;
            return nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && game.grid[nr][nc] === TILE_TYPE.CRATE;
          });

          const nearRival = game.players.some(
            (p) =>
              p.id !== player.id &&
              p.state === 'alive' &&
              Math.abs(Math.floor(p.x / TILE) - c) + Math.abs(Math.floor(p.y / TILE) - r) <= 2
          );

          const nearTarget = Boolean(adjacentCrateDir) || nearRival;

          if (adjacentCrateDir && player.dashCooldown <= 0 && Math.random() < (isClever ? 0.35 : 0.2)) {
            dx = adjacentCrateDir[0];
            dy = adjacentCrateDir[1];
            dashPressed = true;
          } else {
            const bombNearby = game.bombs.some(
              (b) => Math.abs(b.c - c) + Math.abs(b.r - r) <= 1
            );
            const canBotDropSnack =
              game.botBombGapTimer <= 0 &&
              player.bombCooldown <= 0 &&
              (player.botSnackTimer || 0) <= 0 &&
              !bombNearby;

            const safeToDrop =
              canBotDropSnack &&
              nearTarget &&
              player.activeBombs < player.maxBombs &&
              !game.getBombAtTile(c, r) &&
              hasEscapeIfBombDropped(game, c, r, player, danger);

            if (safeToDrop && (isClever || Math.random() < 0.92)) {
              // Aim directional snacks toward nearest living rival or adjacent crate
              let aimDx = player.facingX;
              let aimDy = player.facingY;
              let bestRival = null;
              let bestRivalDist = Infinity;
              for (const p of game.players) {
                if (p.id !== player.id && p.state === 'alive') {
                  const d = Math.hypot(p.x - player.x, p.y - player.y);
                  if (d < bestRivalDist && d <= TILE * 4.2) {
                    bestRivalDist = d;
                    bestRival = p;
                  }
                }
              }
              if (bestRival) {
                const ddx = Math.floor(bestRival.x / TILE) - c;
                const ddy = Math.floor(bestRival.y / TILE) - r;
                if (Math.abs(ddx) >= Math.abs(ddy) && ddx !== 0) {
                  aimDx = Math.sign(ddx);
                  aimDy = 0;
                } else if (ddy !== 0) {
                  aimDx = 0;
                  aimDy = Math.sign(ddy);
                }
              } else if (adjacentCrateDir) {
                aimDx = adjacentCrateDir[0];
                aimDy = adjacentCrateDir[1];
              }
              player.facingX = aimDx;
              player.facingY = aimDy;
              actionPressed = true;
              player.botSnackTimer = isClever ? 1.55 : 2.15;
            } else {
              // Path toward nearest crate or opponent
              const seek = bfsFirstStep(
                game,
                c,
                r,
                danger,
                player.id,
                (tc, tr) => {
                  if (
                    game.players.some(
                      (p) =>
                        p.id !== player.id &&
                        p.state === 'alive' &&
                        Math.abs(Math.floor(p.x / TILE) - tc) + Math.abs(Math.floor(p.y / TILE) - tr) <= 1
                    )
                  ) {
                    return true;
                  }
                  return [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                  ].some(([dc, dr]) => {
                    const cc = tc + dc;
                    const rr = tr + dr;
                    return cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && game.grid[rr][cc] === TILE_TYPE.CRATE;
                  });
                },
                true,
                14,
                preferDir
              );

              if (seek.reached && seek.dir) {
                dx = seek.dir.dx;
                dy = seek.dir.dy;
              }
            }
          }
        }
      }
    }
  }

  const curTileKey = `${c},${r}`;
  if (
    !inDanger &&
    player.botCommitTileKey === curTileKey &&
    preferDir &&
    (preferDir.dx !== 0 || preferDir.dy !== 0) &&
    dx === -preferDir.dx &&
    dy === -preferDir.dy
  ) {
    const prefC = c + preferDir.dx;
    const prefR = r + preferDir.dy;
    if (
      isTileWalkableForBot(game, prefC, prefR, player.id) &&
      !danger.has(`${prefC},${prefR}`)
    ) {
      dx = preferDir.dx;
      dy = preferDir.dy;
    }
  }

  if (
    player.botCommitTileKey !== curTileKey ||
    !preferDir ||
    preferDir.dx !== dx ||
    preferDir.dy !== dy
  ) {
    player.botCommitTileKey = curTileKey;
  }

  if (actionPressed || dashPressed) {
    player.botThinkTimer = 0;
  }
  player.botCachedInput = { dx, dy };
  return { dx, dy, actionPressed, dashPressed };
}
