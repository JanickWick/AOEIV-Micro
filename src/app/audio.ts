/**
 * Einfacher synthetischer Ton (Web Audio, keine Samples): Bogensehne, Nahkampftreffer, Tod,
 * Befehlsbestätigung. Abschaltbar; Lautstärke einstellbar. Der AudioContext startet erst nach einer
 * Nutzeraktion (Browser-Regel).
 */
import type { SimEvent, World } from '../sim/types';

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  volume = 0.5;
  private lastPlayed = new Map<string, number>();

  /** Nach einem Klick/Tastendruck aufrufen. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private canPlay(key: string, minGapMs: number, nowMs: number): boolean {
    const last = this.lastPlayed.get(key) ?? -1e9;
    if (nowMs - last < minGapMs) return false;
    this.lastPlayed.set(key, nowMs);
    return true;
  }

  private noise(duration: number, gain: number, filterHz: number, type: BiquadFilterType = 'lowpass'): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterHz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  private tone(freqFrom: number, freqTo: number, duration: number, gain: number, type: OscillatorType = 'sine'): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  bowTwang(): void {
    this.tone(220, 90, 0.12, 0.25, 'triangle');
    this.noise(0.06, 0.15, 3000, 'highpass');
  }

  meleeHit(): void {
    this.noise(0.09, 0.5, 600);
    this.tone(160, 60, 0.08, 0.2, 'square');
  }

  arrowHit(): void {
    this.noise(0.05, 0.3, 1500);
  }

  death(): void {
    this.tone(300, 80, 0.35, 0.25, 'sawtooth');
    this.noise(0.2, 0.2, 500);
  }

  ack(): void {
    this.tone(660, 660, 0.05, 0.12, 'sine');
    setTimeout(() => this.tone(880, 880, 0.06, 0.1, 'sine'), 55);
  }

  siegeShot(): void {
    this.noise(0.25, 0.5, 300);
    this.tone(90, 40, 0.3, 0.3, 'sawtooth');
  }

  /** Ereignisse eines Frames vertonen (gedrosselt, damit Salven nicht übersteuern). */
  consume(world: World, events: readonly SimEvent[], nowMs: number): void {
    if (!this.enabled || !this.ctx) return;
    for (const e of events) {
      switch (e.kind) {
        case 'projectileLaunched': {
          const u = world.units[e.attackerId - 1];
          const siege = u && world.defs.get(u.defId).kind === 'siege';
          if (siege) {
            if (this.canPlay('siege', 150, nowMs)) this.siegeShot();
          } else if (this.canPlay('bow', 70, nowMs)) this.bowTwang();
          break;
        }
        case 'hit':
          if (e.weaponType === 'melee') {
            if (this.canPlay('melee', 60, nowMs)) this.meleeHit();
          } else if (this.canPlay('arrow', 50, nowMs)) this.arrowHit();
          break;
        case 'died':
          if (this.canPlay('death', 120, nowMs)) this.death();
          break;
        default:
          break;
      }
    }
  }
}
