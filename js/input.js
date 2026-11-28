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
    this.prevPadButtons = new Map();
    this.prevPadPauseDown = new Map();
    this.padHorizState = new Map();
    this.prevPadStickActive = new Map();
    this.touch = {
      ax: 0,
      ay: 0,
      actionHeld: false,
      dashHeld: false,
      queuedAction: false,
      queuedDash: false,
    };
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
    this.resetTouch();
  }

  setTouchVector(ax, ay) {
    this.touch.ax = Math.max(-1, Math.min(1, ax || 0));
    this.touch.ay = Math.max(-1, Math.min(1, ay || 0));
  }

  setTouchAction(held) {
    const next = Boolean(held);
    if (next && !this.touch.actionHeld) {
      this.touch.queuedAction = true;
    }
    this.touch.actionHeld = next;
  }

  setTouchDash(held) {
    const next = Boolean(held);
    if (next && !this.touch.dashHeld) {
      this.touch.queuedDash = true;
    }
    this.touch.dashHeld = next;
  }

  resetTouch() {
    this.touch.ax = 0;
    this.touch.ay = 0;
    this.touch.actionHeld = false;
    this.touch.dashHeld = false;
    this.touch.queuedAction = false;
    this.touch.queuedDash = false;
  }

  onKeyDown(e) {
    if (!this.captureKeys) return;
    if (e.target && typeof e.target.closest === 'function' && e.target.closest('button, input, select, textarea')) {
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Slash'].includes(e.code)) {
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

  readPlayerInput(
    slotIdx,
    gamepadSlotIndex = -1,
    allowSecondaryKeymap = false,
    canMoveDirFn = null,
    padHardwareIndex = null,
    excludedPadIndices = null,
    keyboardKeymapIndex = slotIdx,
    allowTouch = false
  ) {
    let dx = 0;
    let dy = 0;
    let actionHeld = false;
    let dashHeld = false;
    let queuedAction = false;
    let queuedDash = false;

    if (keyboardKeymapIndex !== null && keyboardKeymapIndex !== undefined && keyboardKeymapIndex >= 0) {
      const keymapIndices = allowSecondaryKeymap
        ? Array.from(new Set([keyboardKeymapIndex, 0, 1]))
        : [keyboardKeymapIndex];

      // Build ordered direction stack (most recently pressed last)
      let stack = [];
      if (keymapIndices.length === 1) {
        stack = [...(this.dirStacks[keyboardKeymapIndex] || [])];
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
    }

    let pad = null;
    if (padHardwareIndex !== null && padHardwareIndex !== undefined && padHardwareIndex >= 0) {
      pad = this.getConnectedGamepads().find((p) => p.index === padHardwareIndex) || null;
    } else if (gamepadSlotIndex >= 0) {
      const connectedPads = this.getConnectedGamepads().filter(
        (p) => !excludedPadIndices || !excludedPadIndices.has(p.index)
      );
      pad = connectedPads[gamepadSlotIndex] || null;
    }

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
        pad.buttons?.[5]?.pressed ||
        pad.buttons?.[6]?.pressed ||
        pad.buttons?.[7]?.pressed
      );
      if (padAction) actionHeld = true;
      if (padDash) dashHeld = true;
    }

    if (allowTouch) {
      const tax = this.touch.ax;
      const tay = this.touch.ay;
      if (Math.abs(tax) > 0.22 || Math.abs(tay) > 0.22) {
        let tx = 0;
        let ty = 0;
        if (tax < -0.22) tx = -1;
        else if (tax > 0.22) tx = 1;
        if (tay < -0.22) ty = -1;
        else if (tay > 0.22) ty = 1;

        if (tx !== 0 && ty !== 0) {
          const xDominant = Math.abs(tax) >= Math.abs(tay);
          const primary = xDominant ? { x: tx, y: 0 } : { x: 0, y: ty };
          const secondary = xDominant ? { x: 0, y: ty } : { x: tx, y: 0 };
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
          dx = tx;
          dy = ty;
        }
      }
      if (this.touch.actionHeld) actionHeld = true;
      if (this.touch.dashHeld) dashHeld = true;
      if (this.touch.queuedAction) {
        queuedAction = true;
        this.touch.queuedAction = false;
      }
      if (this.touch.queuedDash) {
        queuedDash = true;
        this.touch.queuedDash = false;
      }
    }

    const actionPressed = queuedAction || (actionHeld && !this.prevActionDown[slotIdx]);
    const dashPressed = queuedDash || (dashHeld && !this.prevDashDown[slotIdx]);
    this.prevActionDown[slotIdx] = actionHeld;
    this.prevDashDown[slotIdx] = dashHeld;

    return { dx, dy, actionPressed, dashPressed };
  }

  /**
   * Returns all valid connected gamepads, filtering out dummy/virtual HID entries.
   */
  getConnectedGamepads() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return [];
    }
    const raw = navigator.getGamepads() || [];
    const result = [];
    for (const pad of raw) {
      if (!pad || pad.connected === false) continue;
      const btnCount = pad.buttons ? pad.buttons.length : 0;
      const axisCount = pad.axes ? pad.axes.length : 0;
      if (btnCount >= 4 || axisCount >= 2) {
        result.push(pad);
      }
    }
    return result;
  }

  /**
   * Snapshots currently held gamepad buttons so transitions between screens never leak inputs.
   */
  syncGamepadButtons() {
    const pads = this.getConnectedGamepads();
    const activeIndices = new Set();
    let anyAction = false;
    let anyDash = false;

    for (const pad of pads) {
      activeIndices.add(pad.index);
      const btns = Array.from(pad.buttons || [], (b) => Boolean(b && b.pressed));
      this.prevPadButtons.set(pad.index, btns);
      this.prevPadPauseDown.set(pad.index, Boolean(btns[9]));

      const ax = pad.axes?.[0] || 0;
      const ay = pad.axes?.[1] || 0;
      const dir = btns[14] || ax < -0.5 ? -1 : btns[15] || ax > 0.5 ? 1 : 0;
      this.padHorizState.set(pad.index, { dir, timer: dir !== 0 ? 0.32 : 0 });
      this.prevPadStickActive.set(pad.index, Math.abs(ax) > 0.55 || Math.abs(ay) > 0.55);

      if (btns[0] || btns[2]) anyAction = true;
      if (btns[1] || btns[3] || btns[4] || btns[5] || btns[6] || btns[7]) anyDash = true;
    }

    this._prunePadMaps(activeIndices);
    for (let i = 0; i < 4; i++) {
      this.prevActionDown[i] = anyAction;
      this.prevDashDown[i] = anyDash;
    }
  }

  /**
   * Polls connected gamepads for menu navigation, rising-edge actions, and stick repeat.
   */
  pollMenuGamepads(dt = 0) {
    const pads = this.getConnectedGamepads();
    const activeIndices = new Set();
    const snapshots = [];

    for (const pad of pads) {
      activeIndices.add(pad.index);
      const btns = Array.from(pad.buttons || [], (b) => Boolean(b && b.pressed));
      const prevBtns = this.prevPadButtons.get(pad.index) || [];

      let anyButtonRising = false;
      const rising = (idx) => Boolean(btns[idx] && !prevBtns[idx]);
      for (let i = 0; i < btns.length; i++) {
        if (btns[i] && !prevBtns[i]) {
          anyButtonRising = true;
          break;
        }
      }

      const ax = pad.axes?.[0] || 0;
      const ay = pad.axes?.[1] || 0;
      const stickNow = Math.abs(ax) > 0.55 || Math.abs(ay) > 0.55;
      const stickPrev = this.prevPadStickActive.get(pad.index) || false;
      const stickFresh = stickNow && !stickPrev;
      this.prevPadStickActive.set(pad.index, stickNow);

      const dir = btns[14] || ax < -0.5 ? -1 : btns[15] || ax > 0.5 ? 1 : 0;
      const horiz = this.padHorizState.get(pad.index) || { dir: 0, timer: 0 };
      let leftPressed = false;
      let rightPressed = false;

      if (dir !== 0) {
        if (dir !== horiz.dir) {
          leftPressed = dir === -1;
          rightPressed = dir === 1;
          horiz.dir = dir;
          horiz.timer = 0.32;
        } else {
          horiz.timer -= dt;
          if (horiz.timer <= 0) {
            leftPressed = dir === -1;
            rightPressed = dir === 1;
            horiz.timer = 0.18;
          }
        }
      } else {
        horiz.dir = 0;
        horiz.timer = 0;
      }

      this.padHorizState.set(pad.index, horiz);
      this.prevPadButtons.set(pad.index, btns);
      this.prevPadPauseDown.set(pad.index, Boolean(btns[9]));

      snapshots.push({
        index: pad.index,
        id: pad.id || '',
        isStandard: pad.mapping === 'standard',
        anyPressed: anyButtonRising || stickFresh,
        leftPressed,
        rightPressed,
        confirmPressed: rising(0),
        cancelPressed: rising(1),
        botsPressed: rising(2),
        lengthPressed: rising(3),
        prevSlotPressed: rising(4),
        nextSlotPressed: rising(5),
        prevMapPressed: rising(6),
        nextMapPressed: rising(7),
        startPressed: rising(9),
      });
    }

    this._prunePadMaps(activeIndices);
    return snapshots;
  }

  /**
   * Returns true if any connected gamepad pressed Options/Start (buttons[9]) this frame.
   */
  pollPausePressed() {
    const pads = this.getConnectedGamepads();
    const activeIndices = new Set();
    let triggered = false;
    for (const pad of pads) {
      activeIndices.add(pad.index);
      const down = Boolean(pad.buttons?.[9]?.pressed);
      const prev = this.prevPadPauseDown.get(pad.index) || false;
      if (down && !prev) triggered = true;
      this.prevPadPauseDown.set(pad.index, down);
    }
    for (const key of this.prevPadPauseDown.keys()) {
      if (!activeIndices.has(key)) this.prevPadPauseDown.delete(key);
    }
    return triggered;
  }

  _prunePadMaps(activeIndices) {
    for (const key of this.prevPadButtons.keys()) {
      if (!activeIndices.has(key)) this.prevPadButtons.delete(key);
    }
    for (const key of this.prevPadPauseDown.keys()) {
      if (!activeIndices.has(key)) this.prevPadPauseDown.delete(key);
    }
    for (const key of this.padHorizState.keys()) {
      if (!activeIndices.has(key)) this.padHorizState.delete(key);
    }
    for (const key of this.prevPadStickActive.keys()) {
      if (!activeIndices.has(key)) this.prevPadStickActive.delete(key);
    }
  }
}
