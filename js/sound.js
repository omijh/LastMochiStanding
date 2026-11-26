const MELODY_STEPS = [
  // Bar 1: Fmaj7
  76, 0, 79, 76, 72, 0, 74, 76,
  // Bar 2: G7
  74, 0, 77, 74, 71, 0, 72, 74,
  // Bar 3: Em7
  76, 79, 83, 0, 79, 0, 76, 74,
  // Bar 4: Am7
  72, 0, 76, 79, 76, 0, 74, 72,
  // Bar 5: Dm7
  74, 0, 77, 74, 69, 0, 72, 74,
  // Bar 6: G7
  79, 77, 74, 0, 76, 74, 71, 0,
  // Bar 7: Cmaj7
  72, 0, 76, 79, 84, 0, 79, 76,
  // Bar 8: C7 turnaround
  79, 0, 76, 72, 74, 76, 79, 0,
];

const CHORD_BARS = [
  [65, 69, 72], // Fmaj7
  [62, 65, 71], // G7
  [64, 67, 71], // Em7
  [60, 64, 69], // Am7
  [62, 65, 69], // Dm7
  [62, 65, 71], // G7
  [60, 64, 71], // Cmaj7
  [60, 64, 70], // C7
];

const BASS_BARS = [
  [41, 48, 45, 48], // F2 C3 A2 C3
  [43, 50, 47, 50], // G2 D3 B2 D3
  [40, 47, 43, 47], // E2 B2 G2 B2
  [45, 52, 48, 52], // A2 E3 C3 E3
  [38, 45, 41, 45], // D2 A2 F2 A2
  [43, 50, 47, 43], // G2 D3 B2 G2
  [36, 43, 40, 43], // C2 G2 E2 G2
  [48, 43, 40, 36], // C3 G2 E2 C2
];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicEnabled = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.bgmMode = 'lobby';
    this.nextNoteTime = 0;
    this.noiseBuffer = null;

    try {
      this.muted = localStorage.getItem('cuteBomberMuted') === '1';
      this.musicEnabled = localStorage.getItem('cuteBomberMusic') !== '0';
    } catch {
      this.muted = false;
      this.musicEnabled = true;
    }
  }

  setMuted(muted) {
    this.muted = !!muted;
    try {
      localStorage.setItem('cuteBomberMuted', this.muted ? '1' : '0');
    } catch {
      // Ignore storage errors
    }
    if (this.muted) {
      this.stopMusic();
    } else if (this.musicEnabled) {
      this.startMusic(this.bgmMode);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = !!enabled;
    try {
      localStorage.setItem('cuteBomberMusic', this.musicEnabled ? '1' : '0');
    } catch {
      // Ignore storage errors
    }
    if (!this.musicEnabled) {
      this.stopMusic();
    } else if (!this.muted) {
      this.startMusic(this.bgmMode);
    }
  }

  toggleMusic() {
    this.setMusicEnabled(!this.musicEnabled);
    return this.musicEnabled;
  }

  ensureContext() {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  _getNoiseBuffer(ctx) {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  _playVoiceAt(freq, time, duration, type, volume) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freq), time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  _playShakerAt(time, volume) {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this._getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(5200, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(time);
    src.stop(time + 0.055);
  }

  _scheduleStep(stepIdx, time) {
    if (this.muted || !this.musicEnabled || !this.ctx) return;
    const bar = Math.floor(stepIdx / 8) % 8;
    const inBar = stepIdx % 8;
    const volScale = this.bgmMode === 'lobby' ? 0.58 : 1;

    // 1. Marimba / Rhodes Melody
    const melodyMidi = MELODY_STEPS[stepIdx % MELODY_STEPS.length];
    if (melodyMidi > 0) {
      const freq = midiToFreq(melodyMidi);
      this._playVoiceAt(freq, time, 0.19, 'triangle', 0.036 * volScale);
      this._playVoiceAt(freq * 2, time, 0.08, 'sine', 0.011 * volScale);
    }

    // 2. Walking Bass on beats (even steps)
    if (inBar % 2 === 0) {
      const bassMidi = BASS_BARS[bar][inBar / 2];
      this._playVoiceAt(midiToFreq(bassMidi), time, 0.22, 'triangle', 0.044 * volScale);
    }

    // 3. Soft Café Chords on steps 0, 3, 6
    if (inBar === 0 || inBar === 3 || inBar === 6) {
      const chord = CHORD_BARS[bar];
      const dur = inBar === 0 ? 0.28 : 0.18;
      for (const m of chord) {
        this._playVoiceAt(midiToFreq(m), time, dur, 'sine', 0.014 * volScale);
      }
    }

    // 4. Soft Café Shaker during active match
    if (this.bgmMode !== 'lobby') {
      const shakerVol = inBar % 2 === 1 ? 0.018 : 0.009;
      this._playShakerAt(time, shakerVol);
    }
  }

  _scheduleLoop() {
    if (this.muted || !this.musicEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const bpm = this.bgmMode === 'urgent' ? 140 : this.bgmMode === 'lobby' ? 112 : 124;
    const stepDur = 60 / bpm / 2; // Eighth-note step

    if (this.nextNoteTime < ctx.currentTime - 0.25) {
      this.nextNoteTime = ctx.currentTime + 0.02;
    }

    while (this.nextNoteTime < ctx.currentTime + 0.14) {
      this._scheduleStep(this.bgmStep, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.bgmStep = (this.bgmStep + 1) % MELODY_STEPS.length;
    }
  }

  setMusicMode(mode) {
    if (mode) this.bgmMode = mode;
  }

  startMusic(mode = 'match') {
    this.bgmMode = mode;
    if (this.muted || !this.musicEnabled || typeof window === 'undefined') return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (this.bgmTimer) return;
    this.nextNoteTime = ctx.currentTime + 0.03;
    this.bgmTimer = window.setInterval(() => this._scheduleLoop(), 60);
  }

  stopMusic() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  tone(freqStart, freqEnd, duration, type = 'sine', volume = 0.14, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(40, freqStart), now);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playDrop() {
    this.tone(360, 210, 0.11, 'sine', 0.12);
  }

  playPop(isCombo = false) {
    this.tone(240, 85, 0.18, 'triangle', 0.18);
    this.tone(520, 290, 0.14, 'sine', 0.08, 0.02);
    if (isCombo) {
      this.tone(523, 784, 0.16, 'sine', 0.12, 0.04);
      this.tone(784, 1046, 0.18, 'sine', 0.11, 0.11);
    }
  }

  playPickup() {
    this.tone(587, 659, 0.08, 'sine', 0.11, 0);
    this.tone(784, 987, 0.12, 'sine', 0.11, 0.06);
  }

  playKick() {
    this.tone(220, 480, 0.12, 'sine', 0.13);
  }

  playDash() {
    this.tone(260, 680, 0.12, 'triangle', 0.13, 0);
    this.tone(520, 880, 0.09, 'sine', 0.08, 0.03);
  }

  playBounce() {
    this.tone(280, 640, 0.16, 'triangle', 0.14);
  }

  playBumper() {
    this.tone(330, 740, 0.14, 'sine', 0.14, 0);
    this.tone(520, 880, 0.12, 'triangle', 0.09, 0.04);
  }

  playRecover() {
    this.tone(440, 587, 0.1, 'sine', 0.12, 0);
    this.tone(587, 880, 0.14, 'triangle', 0.12, 0.07);
  }

  playMochiPuff() {
    this.tone(440, 220, 0.14, 'sine', 0.14, 0);
    this.tone(330, 520, 0.12, 'triangle', 0.1, 0.08);
  }

  playBowlHit() {
    this.tone(180, 520, 0.15, 'triangle', 0.16);
  }

  playGhostToss() {
    this.tone(660, 440, 0.11, 'sine', 0.09);
  }

  playEventBell() {
    this.tone(784, 784, 0.18, 'sine', 0.11, 0);
    this.tone(1046, 1046, 0.25, 'sine', 0.11, 0.11);
  }

  playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.tone(n, n, 0.2, 'triangle', 0.12, idx * 0.09);
    });
  }
}
