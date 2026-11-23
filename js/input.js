import { KEYMAPS } from './constants.js';

const DIR_VECTORS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export class InputManager {
  constructor() {
    this.heldCodes = new Set();
    this.dirStacks = [[], [], [], []];
    this.dirSeq = 0;
    this.dirOrder = [{}, {}, {}, {}];
    this.prevActionDown = [false, false, false, false];
    this.queuedActions = [false, false, false, false];
    this.prevDashDown = [false, false, false, false];
    this.queuedDashes = [false, false, false, false];
    this.captureKeys = false;
    this.boundKeyDown = (e) => this.onKeyDown(e);
    this.boundKeyUp = (e) => this.onKeyUp(e);
    this.boundBlur = () => this.resetAll();

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
      window.addEventListener('blur', this.boundBlur);
    }
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('blur', this.boundBlur);
    }
  }

  setCaptureKeys(enabled) {
    this.captureKeys = !!enabled;
  }

  resetAll() {
    this.heldCodes.clear();
    this.dirStacks = [[], [], [], []];
    this.dirOrder = [{}, {}, {}, {}];
    this.prevActionDown = [false, false, false, false];
    this.queuedActions = [false, false, false, false];
    this.prevDashDown = [false, false, false, false];
    this.queuedDashes = [false, false, false, false];
  }

  onKeyDown(e) {
    if (
      this.captureKeys &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Slash'].includes(e.code)
    ) {
      e.preventDefault();
    }
    if (this.heldCodes.has(e.code)) return;
    this.heldCodes.add(e.code);

    KEYMAPS.forEach((map, idx) => {
      ['up', 'down', 'left', 'right'].forEach((dir) => {
        if (map[dir].includes(e.code)) {
          const stack = this.dirStacks[idx];
          if (!stack.includes(dir)) stack.push(dir);
          this.dirOrder[idx][dir] = ++this.dirSeq;
        }
      });
      if (map.action.includes(e.code)) {
        this.queuedActions[idx] = true;
      }
      if (map.dash?.includes(e.code)) {
        this.queuedDashes[idx] = true;
      }
    });
  }

  onKeyUp(e) {
    this.heldCodes.delete(e.code);
    KEYMAPS.forEach((map, idx) => {
      ['up', 'down', 'left', 'right'].forEach((dir) => {
        if (map[dir].includes(e.code)) {
          const stillHeld = map[dir].some((c) => this.heldCodes.has(c));
          if (!stillHeld) {
            this.dirStacks[idx] = this.dirStacks[idx].filter((d) => d !== dir);
            delete this.dirOrder[idx][dir];
          }
        }
      });
    });
  }

  readPlayerInput(slotIdx, gamepadSlotIndex = -1, allowSecondaryKeymap = false, canMoveDirFn = null) {
    const keymapIndices = allowSecondaryKeymap && slotIdx === 0 ? [0, 1] : [slotIdx];

    // Build ordered direction stack (most recently pressed last)
    let stack = [];
    if (keymapIndices.length === 1) {
      stack = [...(this.dirStacks[slotIdx] || [])];
    } else {
      const entries = [];
      for (const kIdx of keymapIndices) {
        for (const d of this.dirStacks[kIdx]) {
          entries.push({ dir: d, seq: this.dirOrder[kIdx][d] || 0 });
        }
      }
      entries.sort((a, b) => a.seq - b.seq);
      for (const item of entries) {
        if (!stack.includes(item.dir)) stack.push(item.dir);
        else {
          stack = stack.filter((d) => d !== item.dir);
          stack.push(item.dir);
        }
      }
    }

    let dx = 0;
    let dy = 0;
    if (stack.length > 0) {
      let chosenDir = stack[stack.length - 1];
      if (canMoveDirFn) {
        for (let i = stack.length - 1; i >= 0; i--) {
          const cand = stack[i];
          const vec = DIR_VECTORS[cand];
          if (canMoveDirFn(vec.dx, vec.dy)) {
            chosenDir = cand;
            break;
          }
        }
      }
      dx = DIR_VECTORS[chosenDir].dx;
      dy = DIR_VECTORS[chosenDir].dy;
    }

    let actionHeld = false;
    let dashHeld = false;
    let queuedAction = false;
    let queuedDash = false;

    for (const kIdx of keymapIndices) {
      const map = KEYMAPS[kIdx];
      if (map?.action.some((c) => this.heldCodes.has(c))) actionHeld = true;
      if (map?.dash?.some((c) => this.heldCodes.has(c))) dashHeld = true;
      if (this.queuedActions[kIdx]) {
        queuedAction = true;
        this.queuedActions[kIdx] = false;
      }
      if (this.queuedDashes[kIdx]) {
        queuedDash = true;
        this.queuedDashes[kIdx] = false;
      }
    }

    if (gamepadSlotIndex >= 0 && typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads();
      const connectedPads = Array.from(pads || []).filter((p) => p && p.connected !== false);
      const pad = connectedPads[gamepadSlotIndex] || null;
      if (pad) {
        const ax = pad.axes?.[0] || 0;
        const ay = pad.axes?.[1] || 0;
        const dUp = pad.buttons?.[12]?.pressed;
        const dDown = pad.buttons?.[13]?.pressed;
        const dLeft = pad.buttons?.[14]?.pressed;
        const dRight = pad.buttons?.[15]?.pressed;

        let gx = 0;
        let gy = 0;
        if (dLeft || ax < -0.38) gx = -1;
        else if (dRight || ax > 0.38) gx = 1;
        if (dUp || ay < -0.38) gy = -1;
        else if (dDown || ay > 0.38) gy = 1;

        if (gx !== 0 || gy !== 0) {
          if (gx !== 0 && gy !== 0) {
            const xDominant = Math.abs(ax) >= Math.abs(ay);
            const primary = xDominant ? { x: gx, y: 0 } : { x: 0, y: gy };
            const secondary = xDominant ? { x: 0, y: gy } : { x: gx, y: 0 };
            if (
              canMoveDirFn &&
              !canMoveDirFn(primary.x, primary.y) &&
              canMoveDirFn(secondary.x, secondary.y)
            ) {
              dx = secondary.x;
              dy = secondary.y;
            } else {
              dx = primary.x;
              dy = primary.y;
            }
          } else {
            dx = gx;
            dy = gy;
          }
        }

        const padAction = Boolean(pad.buttons?.[0]?.pressed || pad.buttons?.[2]?.pressed);
        const padDash = Boolean(
          pad.buttons?.[1]?.pressed ||
          pad.buttons?.[3]?.pressed ||
          pad.buttons?.[4]?.pressed ||
          pad.buttons?.[5]?.pressed
        );
        if (padAction) actionHeld = true;
        if (padDash) dashHeld = true;
      }
    }

    const actionPressed = queuedAction || (actionHeld && !this.prevActionDown[slotIdx]);
    const dashPressed = queuedDash || (dashHeld && !this.prevDashDown[slotIdx]);
    this.prevActionDown[slotIdx] = actionHeld;
    this.prevDashDown[slotIdx] = dashHeld;

    return { dx, dy, actionPressed, dashPressed };
  }
}
