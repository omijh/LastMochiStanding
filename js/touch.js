const STICK_MAX_RADIUS = 44;
const DASH_RING_CIRCUMFERENCE = 175.93;

export class TouchControls {
  constructor({
    zoneLeft,
    zoneRight,
    stickBase,
    stickNub,
    actionBtn,
    dashBtn,
    dashCdArc,
    input,
    onFirstGesture = null,
  }) {
    this.zoneLeft = zoneLeft;
    this.zoneRight = zoneRight;
    this.stickBase = stickBase;
    this.stickNub = stickNub;
    this.actionBtn = actionBtn;
    this.dashBtn = dashBtn;
    this.dashCdArc = dashCdArc;
    this.input = input;
    this.onFirstGesture = onFirstGesture;

    this.visible = false;
    this.stickPointerId = null;
    this.originX = 0;
    this.originY = 0;
    this.actionPointers = new Set();
    this.dashPointers = new Set();

    this.boundStickDown = (e) => this.onStickDown(e);
    this.boundStickMove = (e) => this.onStickMove(e);
    this.boundStickUp = (e) => this.onStickUp(e);

    this.boundActionDown = (e) => this.onButtonDown(e, 'action');
    this.boundActionUp = (e) => this.onButtonUp(e, 'action');
    this.boundDashDown = (e) => this.onButtonDown(e, 'dash');
    this.boundDashUp = (e) => this.onButtonUp(e, 'dash');

    this.boundReset = () => this.reset();
    this.boundVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.reset();
      }
    };

    if (this.zoneLeft) {
      this.zoneLeft.addEventListener('pointerdown', this.boundStickDown);
      this.zoneLeft.addEventListener('pointermove', this.boundStickMove);
      this.zoneLeft.addEventListener('pointerup', this.boundStickUp);
      this.zoneLeft.addEventListener('pointercancel', this.boundStickUp);
      this.zoneLeft.addEventListener('lostpointercapture', this.boundStickUp);
    }
    if (this.actionBtn) {
      this.actionBtn.addEventListener('pointerdown', this.boundActionDown);
      this.actionBtn.addEventListener('pointerup', this.boundActionUp);
      this.actionBtn.addEventListener('pointercancel', this.boundActionUp);
      this.actionBtn.addEventListener('lostpointercapture', this.boundActionUp);
    }
    if (this.dashBtn) {
      this.dashBtn.addEventListener('pointerdown', this.boundDashDown);
      this.dashBtn.addEventListener('pointerup', this.boundDashUp);
      this.dashBtn.addEventListener('pointercancel', this.boundDashUp);
      this.dashBtn.addEventListener('lostpointercapture', this.boundDashUp);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.boundReset);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
    }
  }

  destroy() {
    if (this.zoneLeft) {
      this.zoneLeft.removeEventListener('pointerdown', this.boundStickDown);
      this.zoneLeft.removeEventListener('pointermove', this.boundStickMove);
      this.zoneLeft.removeEventListener('pointerup', this.boundStickUp);
      this.zoneLeft.removeEventListener('pointercancel', this.boundStickUp);
      this.zoneLeft.removeEventListener('lostpointercapture', this.boundStickUp);
    }
    if (this.actionBtn) {
      this.actionBtn.removeEventListener('pointerdown', this.boundActionDown);
      this.actionBtn.removeEventListener('pointerup', this.boundActionUp);
      this.actionBtn.removeEventListener('pointercancel', this.boundActionUp);
      this.actionBtn.removeEventListener('lostpointercapture', this.boundActionUp);
    }
    if (this.dashBtn) {
      this.dashBtn.removeEventListener('pointerdown', this.boundDashDown);
      this.dashBtn.removeEventListener('pointerup', this.boundDashUp);
      this.dashBtn.removeEventListener('pointercancel', this.boundDashUp);
      this.dashBtn.removeEventListener('lostpointercapture', this.boundDashUp);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.boundReset);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    }
  }

  setVisible(visible) {
    const next = Boolean(visible);
    this.visible = next;
    if (this.zoneLeft) this.zoneLeft.hidden = !next;
    if (this.zoneRight) this.zoneRight.hidden = !next;
    if (!next) {
      this.reset();
    }
  }

  reset() {
    this.stickPointerId = null;
    this.actionPointers.clear();
    this.dashPointers.clear();
    if (this.stickBase) {
      this.stickBase.style.transform = '';
      this.stickBase.classList.remove('is-active');
    }
    if (this.stickNub) {
      this.stickNub.style.transform = '';
    }
    if (this.actionBtn) this.actionBtn.classList.remove('is-pressed');
    if (this.dashBtn) this.dashBtn.classList.remove('is-pressed');
    this.input?.resetTouch?.();
  }

  updateDashCooldown(ratio) {
    if (!this.dashBtn || !this.dashCdArc) return;
    const clamped = Math.max(0, Math.min(1, ratio || 0));
    if (clamped <= 0.01) {
      this.dashBtn.classList.remove('is-cooling');
      this.dashCdArc.style.strokeDashoffset = String(DASH_RING_CIRCUMFERENCE);
    } else {
      this.dashBtn.classList.add('is-cooling');
      this.dashCdArc.style.strokeDashoffset = String(
        (DASH_RING_CIRCUMFERENCE * (1 - clamped)).toFixed(2)
      );
    }
  }

  onStickDown(e) {
    if (!this.visible) return;
    e.preventDefault();
    this.onFirstGesture?.();
    if (this.stickPointerId !== null) return;

    this.stickPointerId = e.pointerId;
    try {
      this.zoneLeft.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture is unsupported
    }

    const rect = this.zoneLeft.getBoundingClientRect();
    const margin = Math.min(54, Math.min(rect.width, rect.height) * 0.42);
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const clampedX = Math.max(margin, Math.min(rect.width - margin, localX));
    const clampedY = Math.max(margin, Math.min(rect.height - margin, localY));

    this.originX = rect.left + clampedX;
    this.originY = rect.top + clampedY;

    if (this.stickBase) {
      const shiftX = clampedX - rect.width / 2;
      const shiftY = clampedY - rect.height / 2;
      this.stickBase.style.transform = `translate3d(${shiftX.toFixed(1)}px, ${shiftY.toFixed(1)}px, 0)`;
      this.stickBase.classList.add('is-active');
    }

    this._updateStickFromPoint(e.clientX, e.clientY);
  }

  onStickMove(e) {
    if (!this.visible || e.pointerId !== this.stickPointerId) return;
    e.preventDefault();
    this._updateStickFromPoint(e.clientX, e.clientY);
  }

  onStickUp(e) {
    if (e.pointerId !== this.stickPointerId) return;
    this.stickPointerId = null;
    if (this.stickBase) {
      this.stickBase.style.transform = '';
      this.stickBase.classList.remove('is-active');
    }
    if (this.stickNub) {
      this.stickNub.style.transform = '';
    }
    this.input?.setTouchVector?.(0, 0);
  }

  _updateStickFromPoint(clientX, clientY) {
    const dx = clientX - this.originX;
    const dy = clientY - this.originY;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, STICK_MAX_RADIUS);
    const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
    const nubX = dist > 0 ? Math.cos(angle) * clamped : 0;
    const nubY = dist > 0 ? Math.sin(angle) * clamped : 0;

    if (this.stickNub) {
      this.stickNub.style.transform = `translate3d(${nubX.toFixed(1)}px, ${nubY.toFixed(1)}px, 0)`;
    }

    const ax = nubX / STICK_MAX_RADIUS;
    const ay = nubY / STICK_MAX_RADIUS;
    this.input?.setTouchVector?.(ax, ay);
  }

  onButtonDown(e, kind) {
    if (!this.visible) return;
    e.preventDefault();
    this.onFirstGesture?.();

    const btn = kind === 'action' ? this.actionBtn : this.dashBtn;
    const set = kind === 'action' ? this.actionPointers : this.dashPointers;
    const wasEmpty = set.size === 0;
    set.add(e.pointerId);

    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture is unsupported
    }

    btn.classList.add('is-pressed');
    if (wasEmpty) {
      if (kind === 'action') {
        this.input?.setTouchAction?.(true);
      } else {
        this.input?.setTouchDash?.(true);
      }
    }
  }

  onButtonUp(e, kind) {
    const btn = kind === 'action' ? this.actionBtn : this.dashBtn;
    const set = kind === 'action' ? this.actionPointers : this.dashPointers;
    if (!set.has(e.pointerId)) return;
    set.delete(e.pointerId);

    if (set.size === 0) {
      btn?.classList.remove('is-pressed');
      if (kind === 'action') {
        this.input?.setTouchAction?.(false);
      } else {
        this.input?.setTouchDash?.(false);
      }
    }
  }
}
