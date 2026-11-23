/** Sonnerie d'appel (style téléphone) générée en Web Audio — aucun fichier requis.
 *  - Sonnerie double ton pendant la connexion (1,2s sonne / 1,8s silence)
 *  - Bip "décroché" quand l'IA est prête
 *  - Bip court "raccroché" à la fin de l'appel */
export class Ringtone {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private active: OscillatorNode[] = [];

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Un "ping" de durée fixe (décroché / raccroché). */
  blip(kind: "pickup" | "hangup") {
    const ctx = this.ensure();
    const t = ctx.currentTime;
    const notes = kind === "pickup" ? [660, 880] : [520, 390];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.setValueAtTime(0.18, start + 0.08);
      gain.gain.linearRampToValueAtTime(0, start + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  /** Sonnerie continue (double ton 440+480 Hz façon fixe, cycle 1,2s / 1,8s). */
  start() {
    this.stop();
    const ctx = this.ensure();
    const ringOnce = () => {
      if (!this.ctx || this.ctx.state === "closed") return;
      const t = ctx.currentTime;
      [440, 480].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.03);
        gain.gain.setValueAtTime(0.12, t + 1.1);
        gain.gain.linearRampToValueAtTime(0, t + 1.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 1.25);
        this.active.push(osc);
        osc.onended = () => {
          this.active = this.active.filter((o) => o !== osc);
        };
      });
    };
    ringOnce();
    this.timer = window.setInterval(ringOnce, 3000); // 1,2s sonne + 1,8s silence
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const osc of this.active) {
      try {
        osc.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    this.active = [];
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
