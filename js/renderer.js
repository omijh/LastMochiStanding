import {
  COLS,
  DASH_COOLDOWN,
  GHOST_COOLDOWN,
  ROWS,
  STEAMER_INTERVAL,
  TILE,
  TILE_TYPE,
} from './constants.js';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = COLS * TILE;
    this.height = ROWS * TILE;
    this.setupHiDPI();
  }

  setupHiDPI() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  renderAvatarCanvas(canvasEl, ch, size = 76, isCelebrating = false, elapsed = 0) {
    if (!canvasEl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetPx = Math.round(size * dpr);
    if (canvasEl.width !== targetPx || canvasEl.height !== targetPx) {
      canvasEl.width = targetPx;
      canvasEl.height = targetPx;
      canvasEl.style.width = `${size}px`;
      canvasEl.style.height = `${size}px`;
    }
    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Rounded-square patisserie portrait frame (fits cleanly inside any outer mask)
    const inset = size * 0.085;
    const boxSize = size - inset * 2;
    const rad = size * 0.25;
    ctx.save();
    ctx.fillStyle = ch.accent;
    this.roundRect(ctx, inset, inset, boxSize, boxSize, rad);
    ctx.fill();
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, inset + 3, inset + 3, boxSize - 6, boxSize - 6, Math.max(4, rad - 3));
    ctx.stroke();

    ctx.clip();
    this.drawCharacterAvatar(
      ctx,
      ch,
      size / 2,
      size / 2 + (isCelebrating ? 6 : 4),
      (size / 68) * (isCelebrating ? 0.9 : 1),
      isCelebrating,
      elapsed
    );
    ctx.restore();
  }

  drawCharacterAvatar(ctx, ch, cx, cy, scale = 1, isCelebrating = false, elapsed = 0) {
    ctx.save();
    const bob = isCelebrating ? Math.abs(Math.sin(elapsed * 9)) * 4.5 : 0;
    const tilt = isCelebrating ? Math.sin(elapsed * 9) * 0.11 : 0;
    ctx.translate(cx, cy - bob);
    ctx.scale(scale, scale);
    if (tilt !== 0) ctx.rotate(tilt);
    this.drawAnimalSprite(ctx, ch, 0, 0.25, isCelebrating ? elapsed * 9 : 0, false, elapsed, isCelebrating);
    ctx.restore();
  }

  render(game) {
    const ctx = this.ctx;
    ctx.save();

    if (game.screenShake > 0.2) {
      const sx = (Math.random() - 0.5) * game.screenShake;
      const sy = (Math.random() - 0.5) * game.screenShake;
      ctx.translate(sx, sy);
    }

    this.drawFloor(ctx, game);
    this.drawSteamerCenter(ctx, game);
    this.drawKaitenBelts(ctx, game);
    this.drawCaramelZones(ctx, game);
    this.drawJellyPads(ctx, game);
    this.drawBombTelegraphs(ctx, game);
    this.drawSuddenWarnings(ctx, game);
    this.drawGridObjects(ctx, game);
    this.drawPowerups(ctx, game);
    this.drawBombs(ctx, game);
    this.drawExplosions(ctx, game);
    this.drawBobaPearls(ctx, game);
    this.drawGhostProjectiles(ctx, game);
    this.drawPlayers(ctx, game);
    this.drawParticles(ctx, game);
    this.drawPopups(ctx, game);

    ctx.restore();
  }

  // ---------- Shape Helpers ----------

  roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  drawStar(ctx, cx, cy, outerR, innerR, points = 4) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const ang = (Math.PI * i) / points - Math.PI / 2;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  drawDiamond(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
  }

  drawShieldPath(ctx, cx, cy, w, h) {
    const hw = w / 2;
    const hh = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.quadraticCurveTo(cx + hw * 0.65, cy - hh * 0.92, cx + hw, cy - hh * 0.58);
    ctx.lineTo(cx + hw * 0.88, cy + hh * 0.15);
    ctx.quadraticCurveTo(cx + hw * 0.55, cy + hh * 0.72, cx, cy + hh);
    ctx.quadraticCurveTo(cx - hw * 0.55, cy + hh * 0.72, cx - hw * 0.88, cy + hh * 0.15);
    ctx.lineTo(cx - hw, cy - hh * 0.58);
    ctx.quadraticCurveTo(cx - hw * 0.65, cy - hh * 0.92, cx, cy - hh);
    ctx.closePath();
  }

  drawDaifukuPath(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.75, cy + ry * 0.88);
    ctx.bezierCurveTo(
      cx - rx * 1.12,
      cy + ry * 0.55,
      cx - rx * 1.02,
      cy - ry * 0.65,
      cx - rx * 0.28,
      cy - ry * 0.86
    );
    ctx.quadraticCurveTo(cx, cy - ry * 1.04, cx + rx * 0.28, cy - ry * 0.86);
    ctx.bezierCurveTo(
      cx + rx * 1.02,
      cy - ry * 0.65,
      cx + rx * 1.12,
      cy + ry * 0.55,
      cx + rx * 0.75,
      cy + ry * 0.88
    );
    ctx.quadraticCurveTo(cx, cy + ry * 0.98, cx - rx * 0.75, cy + ry * 0.88);
    ctx.closePath();
  }

  drawLeafPath(ctx, cx, cy, w, h) {
    const hw = w / 2;
    const hh = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.quadraticCurveTo(cx, cy - hh * 1.3, cx + hw, cy);
    ctx.quadraticCurveTo(cx, cy + hh * 1.3, cx - hw, cy);
    ctx.closePath();
  }

  // ---------- Environment & Furniture ----------

  drawFloor(ctx) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const isBorder = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;

        if (isBorder) {
          // 2.5D Wooden Café Counter Perimeter
          ctx.fillStyle = (r + c) % 2 === 0 ? '#d8b084' : '#cfa476';
          ctx.fillRect(x, y, TILE, TILE);

          // Wood grain plank lines
          ctx.strokeStyle = 'rgba(120, 72, 32, 0.14)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 16);
          ctx.lineTo(x + TILE - 4, y + 16);
          ctx.moveTo(x + 8, y + 36);
          ctx.lineTo(x + TILE - 6, y + 36);
          ctx.stroke();

          // Subtle tile seam
          ctx.strokeStyle = 'rgba(130, 82, 42, 0.22)';
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);

          // 2.5D inner counter edge bevel
          if (r === 0 && c > 0 && c < COLS - 1) {
            ctx.fillStyle = '#9c6b3f';
            ctx.fillRect(x, y + TILE - 7, TILE, 7);
            ctx.fillStyle = 'rgba(255, 244, 224, 0.4)';
            ctx.fillRect(x, y + TILE - 9, TILE, 2);
            // Cute placemat accents along top counter
            if (c === 2 || c === 4 || c === 8 || c === 10) {
              ctx.fillStyle = '#fdf2f8';
              this.roundRect(ctx, x + 10, y + 10, TILE - 20, TILE - 24, 5);
              ctx.fill();
              ctx.strokeStyle = '#f472b6';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          } else if (r === ROWS - 1 && c > 0 && c < COLS - 1) {
            ctx.fillStyle = 'rgba(255, 244, 224, 0.45)';
            ctx.fillRect(x, y, TILE, 4);
            ctx.fillStyle = '#a47449';
            ctx.fillRect(x, y + TILE - 5, TILE, 5);
          } else if (c === 0 && r > 0 && r < ROWS - 1) {
            ctx.fillStyle = '#a9794c';
            ctx.fillRect(x + TILE - 6, y, 6, TILE);
          } else if (c === COLS - 1 && r > 0 && r < ROWS - 1) {
            ctx.fillStyle = '#a9794c';
            ctx.fillRect(x, y, 6, TILE);
          }
        } else {
          const inTatami = c >= 5 && c <= 7 && r >= 4 && r <= 6;
          if (inTatami) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#eef5dc' : '#e4efd0';
            ctx.fillRect(x, y, TILE, TILE);
            // Fine tatami reed weave lines
            ctx.strokeStyle = 'rgba(132, 169, 92, 0.16)';
            ctx.lineWidth = 1;
            for (let ly = y + 7; ly < y + TILE; ly += 8) {
              ctx.beginPath();
              ctx.moveTo(x + 2, ly);
              ctx.lineTo(x + TILE - 2, ly);
              ctx.stroke();
            }
          } else {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#fffaf3' : '#ffefe1';
            ctx.fillRect(x, y, TILE, TILE);
            ctx.strokeStyle = 'rgba(195, 148, 108, 0.14)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          }
        }
      }
    }

    // Woven dark-green & gold tatami border around the center 3x3 zone
    ctx.save();
    ctx.strokeStyle = '#65a30d';
    ctx.lineWidth = 3;
    ctx.strokeRect(5 * TILE + 1.5, 4 * TILE + 1.5, 3 * TILE - 3, 3 * TILE - 3);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(5 * TILE + 4.5, 4 * TILE + 4.5, 3 * TILE - 9, 3 * TILE - 9);
    ctx.restore();

    // Subtle Ghost Waiter perimeter track dashed guideline
    ctx.save();
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.24)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    this.roundRect(ctx, TILE * 0.5, TILE * 0.5, (COLS - 1) * TILE, (ROWS - 1) * TILE, 10);
    ctx.stroke();
    ctx.restore();
  }

  drawSteamerCenter(ctx, game) {
    const cx = 6.5 * TILE;
    const cy = 5.5 * TILE;
    const box = 46;
    const half = box / 2;

    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(100, 60, 20, 0.18)';
    this.roundRect(ctx, cx - half, cy - half + 4, box, box, 7);
    ctx.fill();

    // 2.5D Cedar lower wall
    ctx.fillStyle = '#92400e';
    this.roundRect(ctx, cx - half, cy - half + 2, box, box, 7);
    ctx.fill();

    // Top Hinoki wood steamer frame
    ctx.fillStyle = '#d97706';
    this.roundRect(ctx, cx - half, cy - half - 2, box, box - 2, 7);
    ctx.fill();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner bamboo steamer cavity & slatted grate bars
    ctx.fillStyle = '#fef3c7';
    this.roundRect(ctx, cx - half + 6, cy - half + 4, box - 12, box - 14, 4);
    ctx.fill();

    ctx.strokeStyle = '#e5b869';
    ctx.lineWidth = 2;
    for (let sy = cy - 12; sy <= cy + 10; sy += 7) {
      ctx.beginPath();
      ctx.moveTo(cx - half + 8, sy);
      ctx.lineTo(cx + half - 8, sy);
      ctx.stroke();
    }

    // Corner mortise joints
    ctx.fillStyle = '#78350f';
    [
      [cx - half + 1, cy - half - 1],
      [cx + half - 6, cy - half - 1],
      [cx - half + 1, cy + half - 8],
      [cx + half - 6, cy + half - 8],
    ].forEach(([jx, jy]) => {
      ctx.fillRect(jx, jy, 5, 5);
    });

    if (!game.goldenMochi) {
      // Rectangular progress bar along top & perimeter rim
      const pct = Math.max(0, Math.min(1, 1 - game.steamerTimer / STEAMER_INTERVAL));
      const barW = box - 10;
      ctx.fillStyle = 'rgba(120, 53, 15, 0.28)';
      this.roundRect(ctx, cx - barW / 2, cy + half - 7, barW, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      this.roundRect(ctx, cx - barW / 2, cy + half - 7, barW * pct, 4, 2);
      ctx.fill();

      // Rising wavy steam ribbons (no circles!)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const phase = (game.elapsed * 0.9 + (i + 1) * 0.33) % 1;
        const sx = cx + i * 9;
        const sy = cy + 4 - phase * 22;
        const sway = Math.sin(game.elapsed * 4 + i * 2) * 3;
        ctx.globalAlpha = (1 - phase) * 0.85;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 7);
        ctx.quadraticCurveTo(sx + sway, sy, sx - sway * 0.6, sy - 7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      // Black lacquer tray + green bamboo leaf + Golden Daifuku with crown!
      const bob = Math.sin(game.goldenMochi.bobPhase) * 3;

      // Soft pulsing diamond glow
      const glow = 0.6 + 0.4 * Math.sin(game.elapsed * 7);
      ctx.fillStyle = `rgba(250, 204, 21, ${0.28 * glow})`;
      this.drawDiamond(ctx, cx, cy - 2, 26, 22);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, cy - 2 + bob);

      // Lacquer tray
      ctx.fillStyle = '#1e293b';
      this.roundRect(ctx, -18, 4, 36, 10, 4);
      ctx.fill();
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Bamboo leaf
      ctx.fillStyle = '#22c55e';
      this.drawLeafPath(ctx, 0, 6, 32, 9);
      ctx.fill();

      // Golden Daifuku silhouette
      ctx.fillStyle = '#fde047';
      this.drawDaifukuPath(ctx, 0, 0, 14, 11);
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Curved glaze highlight
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-7, -5);
      ctx.quadraticCurveTo(-4, -8, -1, -7);
      ctx.stroke();

      // Royal crown
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(-7, -9);
      ctx.lineTo(-9, -17);
      ctx.lineTo(-3, -13);
      ctx.lineTo(0, -19);
      ctx.lineTo(3, -13);
      ctx.lineTo(9, -17);
      ctx.lineTo(7, -9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 4-point star sparkles
      ctx.fillStyle = '#ffffff';
      this.drawStar(ctx, -14, -10, 4.5, 1.4, 4);
      ctx.fill();
      this.drawStar(ctx, 14, -8, 4, 1.2, 4);
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }

  drawKaitenBelts(ctx, game) {
    if (game.kaitenTimer <= 0) return;
    const belts = [
      { r: 3, dir: 1 },
      { r: 7, dir: -1 },
    ];
    for (const belt of belts) {
      const y = belt.r * TILE;
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.fillRect(TILE, y + 4, (COLS - 2) * TILE, TILE - 8);
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(TILE, y + 4, (COLS - 2) * TILE, TILE - 8);

      const phase = (((game.elapsed * 48 * belt.dir) % 36) + 36) % 36;
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.6)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let x = TILE + phase - 18; x < (COLS - 1) * TILE; x += 36) {
        if (x < TILE + 6 || x > (COLS - 1) * TILE - 6) continue;
        const cy = y + TILE / 2;
        ctx.beginPath();
        ctx.moveTo(x - belt.dir * 5, cy - 6);
        ctx.lineTo(x + belt.dir * 5, cy);
        ctx.lineTo(x - belt.dir * 5, cy + 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawCaramelZones(ctx, game) {
    for (const z of game.caramelZones) {
      const cx = (z.c + 0.5) * TILE;
      const cy = (z.r + 0.5) * TILE;
      const alpha = Math.min(1, z.timer / 0.8);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.translate(cx, cy);

      // Wavy glossy caramel spill (rounded irregular blob, not a plain circle)
      ctx.fillStyle = 'rgba(217, 119, 6, 0.48)';
      ctx.beginPath();
      ctx.moveTo(-20, -6);
      ctx.quadraticCurveTo(-22, -18, -4, -17);
      ctx.quadraticCurveTo(18, -19, 21, -5);
      ctx.quadraticCurveTo(22, 16, 4, 17);
      ctx.quadraticCurveTo(-20, 18, -20, -6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Glossy angled shine streak & diamond bubble
      ctx.strokeStyle = 'rgba(254, 243, 199, 0.78)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-12, -8);
      ctx.quadraticCurveTo(-5, -12, 3, -10);
      ctx.stroke();

      ctx.fillStyle = '#fef3c7';
      const s = 2.5 + Math.sin(game.elapsed * 5 + z.c) * 0.8;
      this.drawDiamond(ctx, 8, 5, s, s);
      ctx.fill();
      ctx.restore();
    }
  }

  drawJellyPads(ctx, game) {
    for (const pad of game.jellyPads) {
      const cx = (pad.c + 0.5) * TILE;
      const cy = (pad.r + 0.5) * TILE;
      const wobble = 1 + Math.sin(game.elapsed * 8) * 0.06;
      const alpha = Math.min(1, pad.timer / 1.2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.scale(wobble, 2 - wobble);

      // 2.5D yuzu jelly block cushion
      ctx.fillStyle = '#ca8a04';
      this.roundRect(ctx, -19, -11, 38, 28, 9);
      ctx.fill();

      ctx.fillStyle = 'rgba(253, 224, 71, 0.88)';
      this.roundRect(ctx, -19, -15, 38, 26, 9);
      ctx.fill();
      ctx.strokeStyle = '#0d9488';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11, -8);
      ctx.lineTo(-2, -8);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawBombTelegraphs(ctx, game) {
    for (const b of game.bombs) {
      const cells = game.computeBombBlastCells(b);
      const urgency = 1 - Math.max(0, b.fuse / b.maxFuse);
      const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * (10 + urgency * 18));
      const inset = 4 + (1 - urgency) * 3;
      const len = 10;

      ctx.save();
      for (const cell of cells) {
        const x = cell.c * TILE;
        const y = cell.r * TILE;
        ctx.fillStyle = b.char.color;
        ctx.globalAlpha = 0.05 + urgency * 0.14 + pulse * 0.03;
        this.roundRect(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 8);
        ctx.fill();

        // Crisp corner L-brackets [ ] (no cluttered full loops or circles)
        ctx.globalAlpha = 0.45 + urgency * 0.45;
        ctx.strokeStyle = urgency > 0.78 ? '#e11d48' : b.char.color;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const l = x + inset;
        const r = x + TILE - inset;
        const t = y + inset;
        const bt = y + TILE - inset;

        ctx.beginPath();
        // Top-left
        ctx.moveTo(l, t + len);
        ctx.lineTo(l, t);
        ctx.lineTo(l + len, t);
        // Top-right
        ctx.moveTo(r - len, t);
        ctx.lineTo(r, t);
        ctx.lineTo(r, t + len);
        // Bottom-right
        ctx.moveTo(r, bt - len);
        ctx.lineTo(r, bt);
        ctx.lineTo(r - len, bt);
        // Bottom-left
        ctx.moveTo(l + len, bt);
        ctx.lineTo(l, bt);
        ctx.lineTo(l, bt - len);
        ctx.stroke();
      }

      // Sleek linear fuse countdown bar directly under the bomb (no circle rings!)
      const barW = 28;
      const barH = 4.5;
      ctx.globalAlpha = 0.94;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.roundRect(ctx, b.x - barW / 2 - 1, b.y + 16, barW + 2, barH + 2, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
      this.roundRect(ctx, b.x - barW / 2, b.y + 17, barW, barH, 2);
      ctx.fill();
      ctx.fillStyle = urgency > 0.72 ? '#e11d48' : b.char.color;
      this.roundRect(ctx, b.x - barW / 2, b.y + 17, barW * urgency, barH, 2);
      ctx.fill();

      ctx.restore();
    }
  }

  drawSuddenWarnings(ctx, game) {
    for (const w of game.suddenWarnings) {
      const cx = (w.c + 0.5) * TILE;
      const cy = (w.r + 0.5) * TILE;
      const x = w.c * TILE;
      const y = w.r * TILE;
      const pulse = 0.5 + 0.5 * Math.sin(game.elapsed * 20);
      ctx.save();
      ctx.fillStyle = `rgba(244, 63, 94, ${0.2 + pulse * 0.25})`;
      this.roundRect(ctx, x + 5, y + 5, TILE - 10, TILE - 10, 8);
      ctx.fill();
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Warning triangle
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 13);
      ctx.lineTo(cx + 13, cy + 10);
      ctx.lineTo(cx - 13, cy + 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#e11d48';
      ctx.font = '800 13px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, cy + 3);
      ctx.restore();
    }
  }

  drawGridObjects(ctx, game) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = game.grid[r][c];
        if (tile === TILE_TYPE.EMPTY) continue;
        const x = c * TILE;
        const y = r * TILE;
        const isBorder = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;

        if (tile === TILE_TYPE.WALL) {
          if (isBorder) {
            if ((r === 0 || r === ROWS - 1) && (c === 0 || c === COLS - 1)) {
              // Wooden corner counter post
              ctx.fillStyle = '#b48356';
              this.roundRect(ctx, x + 6, y + 6, TILE - 12, TILE - 12, 8);
              ctx.fill();
              ctx.strokeStyle = '#8b5e34';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          } else {
            this.drawPillar(ctx, x, y);
          }
        } else if (tile === TILE_TYPE.BUMPER) {
          this.drawBumper(ctx, x, y, game);
        } else if (tile === TILE_TYPE.CRATE) {
          this.drawCrate(ctx, x, y, (r + c) % 2 === 0);
        } else if (tile === TILE_TYPE.SUDDEN_WALL) {
          this.drawSuddenBox(ctx, x, y);
        }
      }
    }
  }

  drawPillar(ctx, x, y) {
    // 2.5D Cozy Café Table with table runner & rectangular bonsai tray
    ctx.save();
    // Floor shadow
    ctx.fillStyle = 'rgba(110, 75, 45, 0.16)';
    this.roundRect(ctx, x + 5, y + 11, TILE - 10, TILE - 11, 10);
    ctx.fill();

    // 2.5D Dark wood front apron
    ctx.fillStyle = '#92400e';
    this.roundRect(ctx, x + 6, y + 8, TILE - 12, TILE - 12, 9);
    ctx.fill();

    // Tabletop surface
    ctx.fillStyle = '#e7ddd3';
    this.roundRect(ctx, x + 6, y + 5, TILE - 12, TILE - 16, 9);
    ctx.fill();
    ctx.strokeStyle = '#c5b09a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draped café table runner strip
    ctx.fillStyle = '#fdf2f8';
    ctx.fillRect(x + 20, y + 6, 16, TILE - 17);
    ctx.fillStyle = '#f9a8d4';
    ctx.fillRect(x + 20, y + 6, 2.5, TILE - 17);
    ctx.fillRect(x + 33.5, y + 6, 2.5, TILE - 17);

    // Rectangular bonsai planter pot + faceted leaves
    ctx.fillStyle = '#b45309';
    this.roundRect(ctx, x + 18, y + 21, 20, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    this.drawLeafPath(ctx, x + 23, y + 16, 11, 6);
    ctx.fill();
    this.drawLeafPath(ctx, x + 33, y + 16, 11, 6);
    ctx.fill();
    ctx.fillStyle = '#4ade80';
    this.drawLeafPath(ctx, x + 28, y + 13, 8, 5);
    ctx.fill();
    ctx.restore();
  }

  drawBumper(ctx, x, y, game) {
    // 2.5D Quilted Sakura Zabuton Cushion (replaces circle bumper!)
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const pulse = 1 + Math.sin(game.elapsed * 4.5) * 0.035;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);

    // Floor shadow
    ctx.fillStyle = 'rgba(190, 24, 93, 0.18)';
    this.roundRect(ctx, -20, -14, 40, 36, 9);
    ctx.fill();

    // 2.5D Cushion side base
    ctx.fillStyle = '#be185d';
    this.roundRect(ctx, -19, -15, 38, 34, 9);
    ctx.fill();

    // Cushion plush top
    ctx.fillStyle = '#fbcfe8';
    this.roundRect(ctx, -19, -19, 38, 33, 9);
    ctx.fill();
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Inner quilted border
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.35)';
    ctx.lineWidth = 1.2;
    this.roundRect(ctx, -13, -13, 26, 21, 5);
    ctx.stroke();

    // 4 Golden corner tassels (small diamonds at corners)
    ctx.fillStyle = '#facc15';
    [
      [-18, -18],
      [18, -18],
      [-18, 13],
      [18, 13],
    ].forEach(([tx, ty]) => {
      this.drawDiamond(ctx, tx, ty, 3.5, 3.5);
      ctx.fill();
    });

    // 5-petal pointed sakura emblem in center
    ctx.fillStyle = '#ec4899';
    for (let i = 0; i < 5; i++) {
      const ang = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      ctx.save();
      ctx.translate(Math.cos(ang) * 6, -2.5 + Math.sin(ang) * 6);
      ctx.rotate(ang);
      this.drawLeafPath(ctx, 0, 0, 9, 4.5);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#facc15';
    this.drawDiamond(ctx, 0, -2.5, 3, 3);
    ctx.fill();

    ctx.restore();
  }

  drawCrate(ctx, x, y, isPastry) {
    ctx.save();
    ctx.fillStyle = 'rgba(120, 85, 60, 0.16)';
    this.roundRect(ctx, x + 6, y + 10, TILE - 12, TILE - 11, 10);
    ctx.fill();

    if (isPastry) {
      // 2.5D Strawberry Patisserie Cake Box with ribbon bow
      ctx.fillStyle = '#db2777';
      this.roundRect(ctx, x + 6, y + 8, TILE - 12, TILE - 12, 9);
      ctx.fill();

      ctx.fillStyle = '#fbcfe8';
      this.roundRect(ctx, x + 6, y + 5, TILE - 12, TILE - 16, 9);
      ctx.fill();
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crossed cream ribbon
      ctx.fillStyle = '#fdf2f8';
      ctx.fillRect(x + 24, y + 6, 8, TILE - 18);
      ctx.fillRect(x + 7, y + 20, TILE - 14, 7);

      // Cute 2-loop bow on top
      ctx.fillStyle = '#f472b6';
      this.drawLeafPath(ctx, x + 23, y + 23, 10, 6);
      ctx.fill();
      this.drawLeafPath(ctx, x + 33, y + 23, 10, 6);
      ctx.fill();
      ctx.fillStyle = '#fdf2f8';
      this.drawDiamond(ctx, x + 28, y + 23, 3, 3);
      ctx.fill();
    } else {
      // 2.5D Slatted Wooden Delivery Crate with red shop seal
      ctx.fillStyle = '#b45309';
      this.roundRect(ctx, x + 6, y + 8, TILE - 12, TILE - 12, 9);
      ctx.fill();

      ctx.fillStyle = '#f3cba5';
      this.roundRect(ctx, x + 6, y + 5, TILE - 12, TILE - 16, 9);
      ctx.fill();
      ctx.strokeStyle = '#c28550';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(160, 95, 45, 0.38)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 11, y + 17);
      ctx.lineTo(x + TILE - 11, y + 17);
      ctx.moveTo(x + 11, y + 28);
      ctx.lineTo(x + TILE - 11, y + 28);
      ctx.stroke();

      // Tiny crimson shop stamp
      ctx.fillStyle = '#e11d48';
      this.roundRect(ctx, x + 35, y + 10, 8, 10, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSuddenBox(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#be123c';
    this.roundRect(ctx, x + 4, y + 6, TILE - 8, TILE - 8, 9);
    ctx.fill();

    ctx.fillStyle = '#fca5a5';
    this.roundRect(ctx, x + 4, y + 3, TILE - 8, TILE - 11, 9);
    ctx.fill();
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.fillRect(x + 24, y + 4, 8, TILE - 13);
    ctx.fillRect(x + 5, y + 21, TILE - 10, 7);
    ctx.restore();
  }

  drawPowerups(ctx, game) {
    for (const pu of game.powerups) {
      const cx = (pu.c + 0.5) * TILE;
      const cy = (pu.r + 0.5) * TILE + Math.sin(pu.bobPhase) * 3;
      const colors = {
        bomb: '#16a34a',
        range: '#f59e0b',
        speed: '#ec4899',
        kick: '#06b6d4',
        shield: '#8b5cf6',
      };
      const col = colors[pu.type] || '#f59e0b';

      ctx.save();
      ctx.translate(cx, cy);

      // Soft shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
      this.roundRect(ctx, -16, -12, 32, 31, 8);
      ctx.fill();

      // 2.5D colored coaster base lip
      ctx.fillStyle = col;
      this.roundRect(ctx, -16, -14, 32, 31, 8);
      ctx.fill();

      // White square doily coaster top (NO circles!)
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, -16, -17, 32, 30, 8);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Custom Vector Icon inside coaster
      if (pu.type === 'bomb') {
        // Mini Matcha Boba Cup
        ctx.fillStyle = '#a3e635';
        ctx.beginPath();
        ctx.moveTo(-7, -5);
        ctx.lineTo(7, -5);
        ctx.lineTo(5, 8);
        ctx.lineTo(-5, 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(1, -11, 2.5, 6);
        ctx.fillStyle = '#365314';
        ctx.fillRect(-3, 3, 2, 2);
        ctx.fillRect(1, 3, 2, 2);
      } else if (pu.type === 'range') {
        // 4-point Golden Star Wand
        ctx.fillStyle = '#f59e0b';
        this.drawStar(ctx, 0, -3, 10, 3.8, 4);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        this.drawStar(ctx, 0, -3, 5, 2, 4);
        ctx.fill();
      } else if (pu.type === 'speed') {
        // Winged Roller Skate / Boot
        ctx.fillStyle = '#ec4899';
        this.roundRect(ctx, -8, -8, 10, 11, 3);
        ctx.fill();
        this.roundRect(ctx, -8, -1, 16, 6, 3);
        ctx.fill();
        // Little wing
        ctx.fillStyle = '#fef08a';
        this.drawLeafPath(ctx, -10, -4, 8, 4);
        ctx.fill();
        // Square skate blocks
        ctx.fillStyle = '#334155';
        ctx.fillRect(-6, 6, 4, 3);
        ctx.fillRect(2, 6, 4, 3);
      } else if (pu.type === 'kick') {
        // Striker Boot + Motion Chevron
        ctx.fillStyle = '#06b6d4';
        this.roundRect(ctx, -8, -9, 9, 12, 2.5);
        ctx.fill();
        this.roundRect(ctx, -8, -1, 15, 7, 3);
        ctx.fill();
        ctx.strokeStyle = '#0e7490';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(8, -7);
        ctx.lineTo(12, -4);
        ctx.lineTo(8, -1);
        ctx.stroke();
      } else {
        // Pointed Heraldic Shield
        ctx.fillStyle = '#a78bfa';
        this.drawShieldPath(ctx, 0, -2, 18, 20);
        ctx.fill();
        ctx.strokeStyle = '#6d28d9';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        this.drawStar(ctx, 0, -3, 5, 2, 4);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  drawBombs(ctx, game) {
    for (const b of game.bombs) {
      const urgency = 1 - Math.max(0, b.fuse / b.maxFuse);
      const pulse = 1 + Math.sin(game.elapsed * (8 + urgency * 18)) * (0.06 + urgency * 0.08);
      const baseScale = b.isMini ? 0.72 : 1;

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(baseScale * pulse, baseScale * (2 - pulse));

      // Ground shadow
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      this.roundRect(ctx, -14, 10, 28, 8, 4);
      ctx.fill();

      if (b.flavor === 'boba') {
        ctx.fillStyle = '#a3e635';
        ctx.beginPath();
        ctx.moveTo(-12, -10);
        ctx.lineTo(12, -10);
        ctx.lineTo(9, 13);
        ctx.lineTo(-9, 13);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(2, -20, 4, 11);
        ctx.fillStyle = '#ecfccb';
        this.roundRect(ctx, -13, -13, 26, 5, 3);
        ctx.fill();
        ctx.fillStyle = '#365314';
        [-5, 0, 5, -2.5, 3].forEach((px, idx) => {
          this.drawDiamond(ctx, px, idx < 3 ? 9 : 4, 2.5, 2.5);
          ctx.fill();
        });
      } else if (b.flavor === 'cream') {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(-13, 12);
        ctx.lineTo(13, 12);
        ctx.lineTo(9, -9);
        ctx.lineTo(-9, -9);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#9333ea';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = '#78350f';
        this.roundRect(ctx, -9.5, -11, 19, 6, 3);
        ctx.fill();
        ctx.fillStyle = '#e11d48';
        this.drawDiamond(ctx, 0, -14, 4.5, 4.5);
        ctx.fill();
      } else if (b.flavor === 'mochi') {
        ctx.fillStyle = '#fef08a';
        this.drawDaifukuPath(ctx, 0, 1, 15, 12);
        ctx.fill();
        ctx.strokeStyle = '#0d9488';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.fillStyle = '#22c55e';
        this.drawLeafPath(ctx, 4, -12, 12, 6);
        ctx.fill();
      } else {
        // Berry Cream Puff Tart
        ctx.fillStyle = '#f9a8d4';
        this.roundRect(ctx, -14, -9, 28, 22, 10);
        ctx.fill();
        ctx.strokeStyle = '#db2777';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        this.roundRect(ctx, -11, -11, 22, 9, 4);
        ctx.fill();
        ctx.fillStyle = '#38bdf8';
        this.drawDiamond(ctx, 0, -13, 4.5, 4.5);
        ctx.fill();
      }

      // 4-point fuse spark
      const sparkAlpha = 0.55 + 0.45 * Math.sin(game.elapsed * 26);
      ctx.fillStyle = `rgba(255, 255, 255, ${sparkAlpha})`;
      this.drawStar(ctx, 0, -19, 5, 1.8, 4);
      ctx.fill();

      ctx.restore();
    }
  }

  drawExplosions(ctx, game) {
    for (const exp of game.explosions) {
      const alpha = Math.min(1, (exp.timer / exp.maxTimer) * 1.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      for (const cell of exp.cells) {
        const cx = (cell.c + 0.5) * TILE;
        const cy = (cell.r + 0.5) * TILE;
        ctx.fillStyle = exp.color;
        this.roundRect(ctx, cx - TILE * 0.43, cy - TILE * 0.43, TILE * 0.86, TILE * 0.86, 12);
        ctx.fill();
        ctx.strokeStyle = exp.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        this.drawStar(ctx, cx, cy, 11, 4, 4);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawBobaPearls(ctx, game) {
    for (const pearl of game.bobaPearls) {
      ctx.save();
      const ang = Math.atan2(pearl.vy, pearl.vx);
      ctx.translate(pearl.x, pearl.y);
      ctx.rotate(ang);

      // Motion streak tail
      ctx.fillStyle = 'rgba(132, 204, 22, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-18, 0);
      ctx.lineTo(0, 6);
      ctx.closePath();
      ctx.fill();

      // Faceted matcha tapioca gem
      ctx.fillStyle = '#365314';
      this.roundRect(ctx, -8, -8, 16, 16, 5);
      ctx.fill();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      this.drawStar(ctx, -2, -2, 3.5, 1.2, 4);
      ctx.fill();
      ctx.restore();
    }
  }

  drawGhostProjectiles(ctx, game) {
    for (const gp of game.ghostProjectiles) {
      const t = gp.progress;
      const x = gp.startX + (gp.endX - gp.startX) * t;
      const arcY = Math.sin(t * Math.PI) * 38;
      const y = gp.startY + (gp.endY - gp.startY) * t - arcY;

      ctx.save();
      ctx.translate(x, y);
      // 2.5D Silver Dessert Cloche on a Flat Tray
      ctx.fillStyle = '#94a3b8';
      this.roundRect(ctx, -13, 3, 26, 4.5, 2);
      ctx.fill();
      ctx.fillStyle = gp.char.accent;
      ctx.strokeStyle = gp.char.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 3);
      ctx.quadraticCurveTo(-10, -10, 0, -10);
      ctx.quadraticCurveTo(10, -10, 10, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = gp.char.color;
      this.drawDiamond(ctx, 0, -12, 3, 3);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- Characters & States ----------

  drawPlayers(ctx, game) {
    const sorted = [...game.players].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      if (p.state === 'mochi_ball') {
        this.drawMochiBall(ctx, p, game);
      } else if (p.state === 'ghost') {
        this.drawGhostWaiter(ctx, p, game);
      } else {
        this.drawAliveAnimal(ctx, p, game);
      }
    }
  }

  drawAliveAnimal(ctx, p, game) {
    const celebratePhase = game.elapsed * 11;
    const celebrateHop = p.isCelebrating ? Math.abs(Math.sin(celebratePhase)) * 15 : 0;
    const bob =
      (p.jumpTimer > 0
        ? Math.sin((1 - p.jumpTimer / p.jumpDuration) * Math.PI) * 28
        : Math.abs(Math.sin(p.walkPhase)) * 3.5) + celebrateHop;

    ctx.save();
    if (p.invulnTimer > 0 && Math.floor(game.elapsed * 16) % 2 === 0) {
      ctx.globalAlpha = 0.58;
    }

    // Soft ground shadow (NO floor ring circles!)
    const shadowScale = Math.max(0.5, 1 - bob / 45);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    this.roundRect(
      ctx,
      p.x - 14 * shadowScale,
      p.y + 13,
      28 * shadowScale,
      8 * shadowScale,
      4
    );
    ctx.fill();

    // Directional Aim Chevron pointer ahead of feet
    const fx = p.facingX || 0;
    const fy = p.facingY || (fx === 0 ? 1 : 0);
    const tipX = p.x + fx * 22;
    const tipY = p.y + 13 + fy * 12;
    const ang = Math.atan2(fy, fx);
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(ang);
    ctx.fillStyle = p.char.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, -5.5);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, 5.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Sugar Rush 4-point star sparkles (NO circle halos!)
    if (p.sugarRushTimer > 0) {
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const a = game.elapsed * 4.5 + (i * Math.PI) / 2;
        const sx = p.x + Math.cos(a) * 25;
        const sy = p.y - bob + Math.sin(a) * 22;
        ctx.fillStyle = i % 2 === 0 ? '#facc15' : '#ffffff';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1;
        this.drawStar(ctx, sx, sy, 6, 2.2, 4);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Pointed Heraldic Cream Shield Crest aura (NO circle halo!)
    if (p.hasShield) {
      ctx.save();
      ctx.fillStyle = 'rgba(237, 233, 254, 0.34)';
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.85)';
      ctx.lineWidth = 2.4;
      this.drawShieldPath(ctx, p.x, p.y - bob - 1, 48, 52);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Dash speed streaks
    if (p.dashTimer > 0) {
      ctx.save();
      ctx.strokeStyle = p.char.color;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let s = -1; s <= 1; s++) {
        const offX = (p.facingY !== 0 ? s * 8 : 0) - p.facingX * 14;
        const offY = (p.facingX !== 0 ? s * 8 : 0) - p.facingY * 14;
        ctx.beginPath();
        ctx.moveTo(p.x + offX, p.y - bob + offY);
        ctx.lineTo(p.x + offX - p.facingX * 16, p.y - bob + offY - p.facingY * 16);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Sculpted Chibi Sprite
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    if (p.isCelebrating) {
      const sq = 1 + Math.cos(celebratePhase * 2) * 0.07;
      ctx.rotate(Math.sin(celebratePhase) * 0.13);
      ctx.scale(2 - sq, sq);
    } else if (p.dashTimer > 0) {
      ctx.scale(p.facingX !== 0 ? 1.16 : 0.92, p.facingY !== 0 ? 1.16 : 0.92);
    }
    this.drawAnimalSprite(
      ctx,
      p.char,
      p.facingX,
      p.facingY,
      p.isCelebrating ? celebratePhase : p.walkPhase,
      p.dashTimer > 0,
      game.elapsed,
      Boolean(p.isCelebrating)
    );
    ctx.restore();

    // Overhead Nameplate Pill with integrated Dash Ready/Cooldown bar
    const tagY = p.y - bob - 37;
    let label = `P${p.slotIndex + 1}`;
    if (p.controlType === 'human') {
      label = game.humanSlotCount === 1 ? `YOU · P${p.slotIndex + 1}` : `P${p.slotIndex + 1}`;
    } else {
      label = `P${p.slotIndex + 1} BOT`;
    }

    ctx.save();
    ctx.font = '800 10px Fredoka, sans-serif';
    const textW = ctx.measureText(label).width;
    const pillW = Math.max(36, textW + 14);
    const pillH = 20;

    ctx.fillStyle = p.controlType === 'human' ? p.char.color : 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = p.controlType === 'human' ? '#ffffff' : p.char.color;
    ctx.lineWidth = 1.8;
    this.roundRect(ctx, p.x - pillW / 2, tagY - pillH / 2, pillW, pillH, 7);
    ctx.fill();
    ctx.stroke();

    // Integrated Dash bar along bottom edge inside pill
    const dashPct = p.dashCooldown <= 0 ? 1 : Math.max(0, 1 - p.dashCooldown / DASH_COOLDOWN);
    const barW = pillW - 10;
    ctx.fillStyle = p.controlType === 'human' ? 'rgba(0, 0, 0, 0.22)' : 'rgba(148, 163, 184, 0.3)';
    this.roundRect(ctx, p.x - barW / 2, tagY + 4, barW, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = dashPct >= 1 ? '#22d3ee' : '#cbd5e1';
    this.roundRect(ctx, p.x - barW / 2, tagY + 4, barW * dashPct, 3, 1.5);
    ctx.fill();

    // Down caret
    ctx.fillStyle = p.char.color;
    ctx.beginPath();
    ctx.moveTo(p.x - 4, tagY + pillH / 2 - 1);
    ctx.lineTo(p.x + 4, tagY + pillH / 2 - 1);
    ctx.lineTo(p.x, tagY + pillH / 2 + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = p.controlType === 'human' ? '#ffffff' : p.char.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, tagY - 2);
    ctx.restore();

    ctx.restore();
  }

  drawAnimalSprite(
    ctx,
    ch,
    fx,
    fy,
    walkPhase = 0,
    isDashing = false,
    elapsed = 0,
    isCelebrating = false
  ) {
    const lookX = fx * 2.4;
    const lookY = fy * 1.8;
    const leftStep = isCelebrating ? 0 : Math.sin(walkPhase) * 2.6;
    const rightStep = isCelebrating ? 0 : -Math.sin(walkPhase) * 2.6;
    const propLift = isCelebrating ? -5.5 - Math.sin(elapsed * 16) * 2.5 : 0;

    if (ch.id === 'mochi') {
      // Fluffy curled Shiba tail
      ctx.fillStyle = ch.fur;
      ctx.beginPath();
      ctx.moveTo(9, 8);
      ctx.quadraticCurveTo(22, 10, 19, -2);
      ctx.quadraticCurveTo(15, -6, 11, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ch.furLight;
      ctx.beginPath();
      ctx.moveTo(13, 5);
      ctx.quadraticCurveTo(18, 4, 17, 0);
      ctx.quadraticCurveTo(14, 0, 13, 3);
      ctx.fill();

      // Walking paws
      ctx.fillStyle = ch.furLight;
      this.roundRect(ctx, -10, 13 + leftStep, 7, 5, 2.5);
      ctx.fill();
      this.roundRect(ctx, 3, 13 + rightStep, 7, 5, 2.5);
      ctx.fill();

      // 2.5D Barista Apron torso
      ctx.fillStyle = ch.fur;
      this.roundRect(ctx, -12, 3, 24, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      this.roundRect(ctx, -10, 5, 20, 10, 4);
      ctx.fill();
      ctx.fillStyle = '#15803d';
      ctx.fillRect(-5, 9, 10, 4); // apron pocket

      // Pointed Shiba ears with cream inner triangles
      ctx.fillStyle = ch.fur;
      ctx.beginPath();
      ctx.moveTo(-15, -6);
      ctx.lineTo(-18, -24);
      ctx.lineTo(-4, -15);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(15, -6);
      ctx.lineTo(18, -24);
      ctx.lineTo(4, -15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ch.furLight;
      ctx.beginPath();
      ctx.moveTo(-13, -10);
      ctx.lineTo(-15, -20);
      ctx.lineTo(-7, -14);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(13, -10);
      ctx.lineTo(15, -20);
      ctx.lineTo(7, -14);
      ctx.closePath();
      ctx.fill();

      // Sculpted puffy Shiba head (wide fluffy jowls, NOT a plain circle!)
      ctx.fillStyle = ch.fur;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.bezierCurveTo(13, -18, 17, -9, 18, -1);
      ctx.bezierCurveTo(19, 8, 11, 10, 0, 10);
      ctx.bezierCurveTo(-11, 10, -19, 8, -18, -1);
      ctx.bezierCurveTo(-17, -9, -13, -18, 0, -18);
      ctx.closePath();
      ctx.fill();

      // Cream Shiba cheeks
      ctx.fillStyle = ch.furLight;
      ctx.beginPath();
      ctx.moveTo(-16, 1);
      ctx.quadraticCurveTo(-8, -3, 0, -1);
      ctx.quadraticCurveTo(8, -3, 16, 1);
      ctx.bezierCurveTo(16, 9, 9, 10, 0, 10);
      ctx.bezierCurveTo(-9, 10, -16, 9, -16, 1);
      ctx.closePath();
      ctx.fill();

      // White Shiba eyebrow beans
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, -9 + lookX * 0.7, -10 + lookY * 0.6, 5.5, 3, 1.5);
      ctx.fill();
      this.roundRect(ctx, 3.5 + lookX * 0.7, -10 + lookY * 0.6, 5.5, 3, 1.5);
      ctx.fill();

      // Red Shiba neckerchief
      ctx.fillStyle = '#ef4444';
      this.roundRect(ctx, -11, 7, 22, 4.5, 2);
      ctx.fill();

      // Held Matcha Boba Cup
      ctx.save();
      if (propLift !== 0) ctx.translate(0, propLift);
      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(22, 0);
      ctx.lineTo(20, 12);
      ctx.lineTo(14, 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(16, -6, 2.2, 6);
      ctx.restore();
    } else if (ch.id === 'tama') {
      // S-curved calico tail
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-12, 10);
      ctx.quadraticCurveTo(-22, 4, -17, -5);
      ctx.stroke();

      // Walking paws
      ctx.fillStyle = '#fff7ed';
      ctx.strokeStyle = '#fed7aa';
      ctx.lineWidth = 1;
      this.roundRect(ctx, -10, 13 + leftStep, 7, 5, 2.5);
      ctx.fill();
      ctx.stroke();
      this.roundRect(ctx, 3, 13 + rightStep, 7, 5, 2.5);
      ctx.fill();
      ctx.stroke();

      // Pleated Royal Violet Café Maid Dress + White Pinafore
      ctx.fillStyle = '#9333ea';
      ctx.beginPath();
      ctx.moveTo(-11, 4);
      ctx.lineTo(11, 4);
      ctx.lineTo(14, 15);
      ctx.lineTo(-14, 15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, -7, 6, 14, 8, 3);
      ctx.fill();

      // Cat ears
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.moveTo(-15, -6);
      ctx.lineTo(-17, -23);
      ctx.lineTo(-4, -15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(15, -6);
      ctx.lineTo(17, -23);
      ctx.lineTo(4, -15);
      ctx.closePath();
      ctx.fill();

      // Sculpted tufted-cheek Cat head (NOT a plain circle!)
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.quadraticCurveTo(14, -17, 16, -6);
      ctx.lineTo(18, -1);
      ctx.lineTo(15, 3);
      ctx.quadraticCurveTo(13, 10, 0, 10);
      ctx.quadraticCurveTo(-13, 10, -15, 3);
      ctx.lineTo(-18, -1);
      ctx.lineTo(-16, -6);
      ctx.quadraticCurveTo(-14, -17, 0, -17);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fed7aa';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Calico ear & cheek patches
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-14, -12);
      ctx.quadraticCurveTo(-5, -14, -5, -7);
      ctx.quadraticCurveTo(-11, -5, -15, -7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(14, -11);
      ctx.quadraticCurveTo(5, -13, 6, -6);
      ctx.quadraticCurveTo(11, -5, 15, -7);
      ctx.closePath();
      ctx.fill();

      // Royal Violet Maid Headband with scalloped frills
      ctx.fillStyle = '#9333ea';
      this.roundRect(ctx, -11, -19, 22, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#f3e8ff';
      this.drawDiamond(ctx, -5, -17, 2.5, 2.5);
      ctx.fill();
      this.drawDiamond(ctx, 0, -17.5, 2.8, 2.8);
      ctx.fill();
      this.drawDiamond(ctx, 5, -17, 2.5, 2.5);
      ctx.fill();

      // Red collar & golden bell
      ctx.fillStyle = '#ef4444';
      this.roundRect(ctx, -10, 7, 20, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      this.drawDiamond(ctx, 0, 11.5, 4, 4);
      ctx.fill();

      // Silver tray + Caramel Flan
      ctx.save();
      if (propLift !== 0) ctx.translate(0, propLift);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(11, 9, 13, 2.5);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(13, 9);
      ctx.lineTo(22, 9);
      ctx.lineTo(20, 2);
      ctx.lineTo(15, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.fillRect(15, 1, 5, 2);
      ctx.restore();
    } else if (ch.id === 'yuzu') {
      // Walking paws
      ctx.fillStyle = '#78350f';
      this.roundRect(ctx, -10, 13 + leftStep, 7.5, 5, 2.5);
      ctx.fill();
      this.roundRect(ctx, 2.5, 13 + rightStep, 7.5, 5, 2.5);
      ctx.fill();

      // Onsen Teal Happi Coat
      ctx.fillStyle = '#b45309';
      this.roundRect(ctx, -13, 3, 26, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#0d9488';
      this.roundRect(ctx, -11, 5, 22, 10, 4);
      ctx.fill();
      ctx.fillStyle = '#ccfbf1';
      ctx.fillRect(-1, 6, 2, 9); // kimono lapel

      // Rounded-square Capybara ears
      ctx.fillStyle = '#78350f';
      this.roundRect(ctx, -16, -17, 7, 7, 3);
      ctx.fill();
      this.roundRect(ctx, 9, -17, 7, 7, 3);
      ctx.fill();

      // Boxy 2.5D Capybara head + snout block
      ctx.fillStyle = '#b45309';
      this.roundRect(ctx, -17, -15, 34, 25, 10);
      ctx.fill();
      ctx.fillStyle = '#d97706';
      this.roundRect(ctx, -10, -2, 20, 11, 5);
      ctx.fill();

      // Folded Teal Onsen Towel + Pinched Yuzu Fruit
      ctx.fillStyle = '#0d9488';
      this.roundRect(ctx, -12, -18, 24, 5.5, 2.5);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      this.drawDaifukuPath(ctx, 0, -22, 6.5, 5);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      this.drawLeafPath(ctx, 4, -27, 8, 4);
      ctx.fill();

      // Held Wooden Mochi Mallet (Kine)
      ctx.save();
      if (propLift !== 0) ctx.translate(0, propLift);
      ctx.fillStyle = '#a16207';
      ctx.fillRect(14, -4, 3, 17);
      ctx.fillStyle = '#fde68a';
      this.roundRect(ctx, 10, -9, 11, 7, 2.5);
      ctx.fill();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    } else {
      // Poko Lop Bunny
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, -16, 5, 7, 7, 3.5);
      ctx.fill();
      ctx.strokeStyle = '#fbcfe8';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Walking paws
      ctx.fillStyle = '#fff1f2';
      ctx.strokeStyle = '#f9a8d4';
      ctx.lineWidth = 1;
      this.roundRect(ctx, -10, 13 + leftStep, 7, 5, 2.5);
      ctx.fill();
      ctx.stroke();
      this.roundRect(ctx, 3, 13 + rightStep, 7, 5, 2.5);
      ctx.fill();
      ctx.stroke();

      // Berry Pink Patissier Coat + Sky-Blue Bowtie
      ctx.fillStyle = '#ec4899';
      this.roundRect(ctx, -12, 3, 24, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(-6, 6);
      ctx.lineTo(6, 11);
      ctx.lineTo(6, 6);
      ctx.lineTo(-6, 11);
      ctx.closePath();
      ctx.fill();

      // Long swaying drooping Lop Ears
      const earSway = Math.sin(walkPhase) * 0.1;
      ctx.save();
      ctx.translate(-15, -4);
      ctx.rotate(0.22 + earSway);
      ctx.fillStyle = '#f9a8d4';
      this.roundRect(ctx, -5, -5, 10, 23, 5);
      ctx.fill();
      ctx.fillStyle = '#fff1f2';
      this.roundRect(ctx, -2.5, -1, 5, 16, 2.5);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(15, -4);
      ctx.rotate(-0.22 - earSway);
      ctx.fillStyle = '#f9a8d4';
      this.roundRect(ctx, -5, -5, 10, 23, 5);
      ctx.fill();
      ctx.fillStyle = '#fff1f2';
      this.roundRect(ctx, -2.5, -1, 5, 16, 2.5);
      ctx.fill();
      ctx.restore();

      // Sculpted pear-cheeked Bunny head (NOT a plain circle!)
      ctx.fillStyle = '#fff1f2';
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.bezierCurveTo(12, -17, 15, -9, 16, -2);
      ctx.bezierCurveTo(18, 6, 13, 10, 0, 10);
      ctx.bezierCurveTo(-13, 10, -18, 6, -16, -2);
      ctx.bezierCurveTo(-15, -9, -12, -17, 0, -17);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f9a8d4';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pleated White Patissier Toque/Beret + Berry Diamond Pom-Pom
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, -13, -21, 24, 9, 5);
      ctx.fill();
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#ec4899';
      this.drawDiamond(ctx, -1, -24, 4, 4);
      ctx.fill();

      // Held Fluted Berry Soda Cup
      ctx.save();
      if (propLift !== 0) ctx.translate(0, propLift);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(22, 0);
      ctx.lineTo(20, 12);
      ctx.lineTo(14, 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#f472b6';
      this.drawDiamond(ctx, 17, -2, 3.5, 3.5);
      ctx.fill();
      ctx.restore();
    }

    // Expressive eyes
    ctx.fillStyle = '#1e293b';
    if (isCelebrating) {
      // Happy ^ ^ squinting arc eyes
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(-6 + lookX, -3.2 + lookY, 3.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6 + lookX, -3.2 + lookY, 3.2, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (ch.id === 'yuzu') {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-9 + lookX, -5 + lookY);
      ctx.lineTo(-4 + lookX, -5 + lookY);
      ctx.moveTo(4 + lookX, -5 + lookY);
      ctx.lineTo(9 + lookX, -5 + lookY);
      ctx.stroke();
    } else {
      // Pill eyes with white sparkle gleam
      this.roundRect(ctx, -8 + lookX, -7 + lookY, 4.2, 5.2, 2);
      ctx.fill();
      this.roundRect(ctx, 3.8 + lookX, -7 + lookY, 4.2, 5.2, 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-7.3 + lookX, -6.2 + lookY, 1.8, 1.8);
      ctx.fillRect(4.5 + lookX, -6.2 + lookY, 1.8, 1.8);
    }

    // Rosy angled blush streaks
    ctx.fillStyle = isCelebrating ? 'rgba(251, 113, 133, 0.78)' : 'rgba(251, 113, 133, 0.6)';
    this.roundRect(ctx, -12.5 + lookX, -0.5 + lookY, 5.5, 2.8, 1.4);
    ctx.fill();
    this.roundRect(ctx, 7 + lookX, -0.5 + lookY, 5.5, 2.8, 1.4);
    ctx.fill();

    // Cute triangle nose
    ctx.fillStyle = ch.id === 'poko' ? '#ec4899' : '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-2 + lookX, -1 + lookY);
    ctx.lineTo(2 + lookX, -1 + lookY);
    ctx.lineTo(lookX, 1.6 + lookY);
    ctx.closePath();
    ctx.fill();

    // Mouth & whiskers
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    if (isCelebrating) {
      // Big joyful cheering open smile
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(-4.2 + lookX, 2.2 + lookY);
      ctx.lineTo(4.2 + lookX, 2.2 + lookY);
      ctx.arc(lookX, 2.2 + lookY, 4.2, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fecdd3';
      ctx.beginPath();
      ctx.arc(lookX, 5.6 + lookY, 2.1, Math.PI, 0);
      ctx.fill();

      if (ch.id === 'tama') {
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-12, -1);
        ctx.lineTo(-17, -2);
        ctx.moveTo(-12, 2);
        ctx.lineTo(-17, 3);
        ctx.moveTo(12, -1);
        ctx.lineTo(17, -2);
        ctx.moveTo(12, 2);
        ctx.lineTo(17, 3);
        ctx.stroke();
      }
    } else if (ch.id === 'tama') {
      ctx.beginPath();
      ctx.arc(-2 + lookX, 2.5 + lookY, 2, 0, Math.PI);
      ctx.arc(2 + lookX, 2.5 + lookY, 2, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-12, -1);
      ctx.lineTo(-17, -2);
      ctx.moveTo(-12, 2);
      ctx.lineTo(-17, 3);
      ctx.moveTo(12, -1);
      ctx.lineTo(17, -2);
      ctx.moveTo(12, 2);
      ctx.lineTo(17, 3);
      ctx.stroke();
    } else if (ch.id === 'mochi' || ch.id === 'poko') {
      ctx.beginPath();
      ctx.moveTo(-2.5 + lookX, 2.5 + lookY);
      ctx.quadraticCurveTo(lookX, 5 + lookY, 2.5 + lookX, 2.5 + lookY);
      ctx.stroke();
    }

    if (isCelebrating) {
      // Raised cheering paws waving joyfully
      const cheerWave = Math.sin(elapsed * 16) * 3;
      const pawColors = {
        mochi: { fill: ch.furLight, stroke: ch.fur },
        tama: { fill: '#fff7ed', stroke: '#f97316' },
        yuzu: { fill: '#92400e', stroke: '#451a03' },
        poko: { fill: '#fff1f2', stroke: '#f472b6' },
      };
      const pc = pawColors[ch.id] || pawColors.mochi;

      ctx.save();
      ctx.translate(-16, -3.5 + cheerWave);
      ctx.rotate(-0.48);
      ctx.fillStyle = pc.fill;
      ctx.strokeStyle = pc.stroke;
      ctx.lineWidth = 1.4;
      this.roundRect(ctx, -3.5, -6, 7, 10, 3.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(14, 2 + propLift);
      ctx.rotate(0.28);
      ctx.fillStyle = pc.fill;
      ctx.strokeStyle = pc.stroke;
      ctx.lineWidth = 1.4;
      this.roundRect(ctx, -3.5, -5, 7, 9, 3.5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Floating Golden Victory Crown
      const crownBaseY = ch.id === 'yuzu' ? -27 : ch.id === 'poko' ? -24 : -22;
      const crownBob = Math.sin(elapsed * 10) * 1.5;
      ctx.save();
      ctx.translate(0, crownBaseY + crownBob);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-9, 3);
      ctx.lineTo(-10.5, -6);
      ctx.lineTo(-4, -1.5);
      ctx.lineTo(0, -8);
      ctx.lineTo(4, -1.5);
      ctx.lineTo(10.5, -6);
      ctx.lineTo(9, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      this.drawDiamond(ctx, 0, -1, 2.2, 2.2);
      ctx.fill();
      ctx.restore();

      // Twinkling 4-point celebration star sparkles
      for (let s = 0; s < 3; s++) {
        const ang = elapsed * 4.5 + (s * Math.PI * 2) / 3;
        const sx = Math.cos(ang) * 22;
        const sy = -10 + Math.sin(ang * 1.3) * 10;
        ctx.fillStyle = s % 2 === 0 ? '#facc15' : '#f472b6';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        this.drawStar(ctx, sx, sy, 4.6, 1.7, 4);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  drawMochiBall(ctx, p, game) {
    const rolling = p.bowlVx !== 0 || p.bowlVy !== 0;
    const wobble = 1 + Math.sin(game.elapsed * 16 + p.walkPhase) * 0.07;

    ctx.save();
    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    this.roundRect(ctx, p.x - 20, p.y + 13, 40, 8, 4);
    ctx.fill();

    // Green bamboo leaf underneath when stationary
    if (!rolling) {
      ctx.fillStyle = '#22c55e';
      this.drawLeafPath(ctx, p.x, p.y + 14, 46, 12);
      ctx.fill();
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    if (rolling) {
      ctx.rotate(game.elapsed * 14);
    } else {
      ctx.scale(wobble, 2 - wobble);
    }

    // Character ears/headwear peeking out
    if (p.char.id === 'mochi') {
      ctx.fillStyle = p.char.fur;
      ctx.beginPath();
      ctx.moveTo(-16, -11);
      ctx.lineTo(-21, -26);
      ctx.lineTo(-6, -17);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(16, -11);
      ctx.lineTo(21, -26);
      ctx.lineTo(6, -17);
      ctx.fill();
    } else if (p.char.id === 'tama') {
      ctx.fillStyle = '#fff7ed';
      ctx.beginPath();
      ctx.moveTo(-15, -12);
      ctx.lineTo(-19, -27);
      ctx.lineTo(-5, -18);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(15, -12);
      ctx.lineTo(19, -27);
      ctx.lineTo(5, -18);
      ctx.fill();
      ctx.fillStyle = '#9333ea';
      this.roundRect(ctx, -9, -23, 18, 4.5, 2);
      ctx.fill();
    } else if (p.char.id === 'yuzu') {
      ctx.fillStyle = '#facc15';
      this.drawDaifukuPath(ctx, 0, -22, 6, 5);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      this.drawLeafPath(ctx, 4, -27, 8, 4);
      ctx.fill();
    } else {
      ctx.fillStyle = '#f9a8d4';
      this.roundRect(ctx, -25, -4, 9, 19, 4.5);
      ctx.fill();
      this.roundRect(ctx, 16, -4, 9, 19, 4.5);
      ctx.fill();
    }

    // Flat-bottomed, pinched-top Daifuku Rice Cake body (NO plain circle!)
    ctx.fillStyle = p.char.accent;
    this.drawDaifukuPath(ctx, 0, -1, 22, 18);
    ctx.fill();
    ctx.strokeStyle = p.char.color;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Specular dough curved highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -9);
    ctx.quadraticCurveTo(-7, -14, -2, -13);
    ctx.stroke();

    // Dizzy X_X eyes & wavy mouth
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-10, -5);
    ctx.lineTo(-4, 1);
    ctx.moveTo(-4, -5);
    ctx.lineTo(-10, 1);
    ctx.moveTo(4, -5);
    ctx.lineTo(10, 1);
    ctx.moveTo(10, -5);
    ctx.lineTo(4, 1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, 7);
    ctx.quadraticCurveTo(0, 10, 4, 7);
    ctx.stroke();

    // 4-point dizzy stars (no circles!)
    for (let i = 0; i < 2; i++) {
      const ang = game.elapsed * 5 + i * Math.PI;
      ctx.fillStyle = '#facc15';
      this.drawStar(ctx, Math.cos(ang) * 20, -23 + Math.sin(ang) * 3, 5, 1.8, 4);
      ctx.fill();
    }
    ctx.restore();

    // Callout pill with integrated Recovery Progress bar inside (NO circular ring!)
    if (!rolling) {
      const isSelfHuman = p.controlType === 'human' && game.humanSlotCount === 1;
      const msg = isSelfHuman
        ? game.lang === 'ja'
          ? '連打で脱出！'
          : 'TAP SPACE: WIGGLE!'
        : game.lang === 'ja'
          ? '🎳 体当たりでKO!'
          : '🎳 BUMP / DASH TO KO!';
      ctx.font = '800 10.5px Fredoka, sans-serif';
      const w = Math.max(88, ctx.measureText(msg).width + 16);
      const y = p.y - 40;
      const pct = Math.max(0, Math.min(1, 1 - p.mochiTimer / (p.mochiMaxTimer || 4)));

      ctx.fillStyle = isSelfHuman ? '#16a34a' : '#e11d48';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      this.roundRect(ctx, p.x - w / 2, y - 11, w, 22, 8);
      ctx.fill();
      ctx.stroke();

      // Integrated recovery progress bar inside bottom of pill
      const barW = w - 12;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      this.roundRect(ctx, p.x - barW / 2, y + 4.5, barW, 3.5, 2);
      ctx.fill();
      ctx.fillStyle = pct > 0.6 ? '#86efac' : '#fde047';
      this.roundRect(ctx, p.x - barW / 2, y + 4.5, barW * pct, 3.5, 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, p.x, y - 2);
    }

    ctx.restore();
  }

  drawGhostWaiter(ctx, p, game) {
    const floatY = Math.sin(game.elapsed * 4 + p.id) * 4;

    // Diamond target reticle for human Ghost Waiters ready to lob (NO circles!)
    if (p.controlType === 'human' && p.ghostCooldown <= 0 && typeof game.computeGhostTarget === 'function') {
      const target = game.computeGhostTarget(p);
      if (target) {
        const tx = (target.c + 0.5) * TILE;
        const ty = (target.r + 0.5) * TILE;
        const r = 15 + Math.sin(game.elapsed * 8) * 2;
        ctx.save();
        ctx.strokeStyle = p.char.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + floatY);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.82;
        this.drawDiamond(ctx, tx, ty, r, r);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx - r - 4, ty);
        ctx.lineTo(tx + r + 4, ty);
        ctx.moveTo(tx, ty - r - 4);
        ctx.lineTo(tx, ty + r + 4);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.translate(p.x, p.y + floatY);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = p.char.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -19);
    ctx.quadraticCurveTo(15, -18, 15, -4);
    ctx.lineTo(15, 13);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 14);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-15, 13);
    ctx.lineTo(-15, -4);
    ctx.quadraticCurveTo(-15, -18, 0, -19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Waiter bowtie
    ctx.fillStyle = p.char.color;
    ctx.beginPath();
    ctx.moveTo(-6, 5);
    ctx.lineTo(6, 10);
    ctx.lineTo(6, 5);
    ctx.lineTo(-6, 10);
    ctx.closePath();
    ctx.fill();

    // Expressive eyes
    ctx.fillStyle = '#1e293b';
    this.roundRect(ctx, -6.5, -7, 3.2, 4.5, 1.5);
    ctx.fill();
    this.roundRect(ctx, 3.3, -7, 3.2, 4.5, 1.5);
    ctx.fill();

    // Linear cooldown bar above ghost head (no circle ring!)
    if (p.ghostCooldown > 0) {
      const pct = Math.max(0, Math.min(1, 1 - p.ghostCooldown / GHOST_COOLDOWN));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      this.roundRect(ctx, -11, -26, 22, 4.5, 2);
      ctx.fill();
      ctx.fillStyle = p.char.color;
      this.roundRect(ctx, -11, -26, 22 * pct, 4.5, 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.char.color;
      this.drawDiamond(ctx, 0, -24, 4.5, 4.5);
      ctx.fill();
    }

    ctx.restore();
  }

  drawParticles(ctx, game) {
    game.particles.forEach((pt, idx) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.translate(pt.x, pt.y);
      ctx.fillStyle = pt.color;
      if (idx % 2 === 0) {
        this.drawStar(ctx, 0, 0, pt.size * 1.45, pt.size * 0.55, 4);
        ctx.fill();
      } else {
        ctx.rotate(pt.life * 8 + idx);
        ctx.fillRect(-pt.size, -pt.size * 0.55, pt.size * 2, pt.size * 1.1);
      }
      ctx.restore();
    });
  }

  drawPopups(ctx, game) {
    for (const pop of game.popups) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, pop.life / 0.35);
      ctx.font = '800 15px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(pop.text, pop.x, pop.y);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }
}
