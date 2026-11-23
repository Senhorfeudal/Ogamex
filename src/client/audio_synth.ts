class SciFiAudioSynth {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(freqStart: number, freqEnd: number, durationSec: number, type: OscillatorType, gainVal: number): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainVal, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.02);
    } catch {
      // Ignore audio failures when blocked by autoplay policies
    }
  }

  playClick(): void {
    this.tone(720, 480, 0.065, "triangle", 0.045);
  }

  playBuildStart(): void {
    this.tone(240, 520, 0.14, "sawtooth", 0.055);
    window.setTimeout(() => this.tone(520, 780, 0.16, "triangle", 0.05), 85);
  }

  playFleetLaunch(): void {
    this.tone(180, 740, 0.28, "sawtooth", 0.06);
    window.setTimeout(() => this.tone(420, 980, 0.24, "sine", 0.045), 110);
  }

  playAlert(): void {
    this.tone(440, 310, 0.14, "square", 0.05);
    window.setTimeout(() => this.tone(390, 260, 0.16, "square", 0.05), 150);
  }
}

export const audioSynth = new SciFiAudioSynth();
