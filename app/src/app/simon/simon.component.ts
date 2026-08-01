import { Component, OnInit } from '@angular/core';
import { GameHistoryService } from '../services/history/game-history.service';
import { ProfileService } from '../services/profile/profile.service';
import { ISimonResult, SimonColor } from './simon.models';

const HISTORY_GAME_KEY = 'simon';
const COLORS: SimonColor[] = ['green', 'red', 'yellow', 'blue'];
const STEP_DELAY_MS = 600;
const TONE_FREQUENCIES: Record<SimonColor, number> = {
  green: 329.63,  // E4
  red: 220.00,    // A3
  yellow: 392.00, // G4
  blue: 261.63,   // C4
};

@Component({
  selector: 'app-simon',
  templateUrl: './simon.component.html',
  styleUrls: ['./simon.component.scss']
})
export class SimonComponent implements OnInit {

  constructor(private history: GameHistoryService, private profile: ProfileService) { }

  name = '';
  joined = false;
  recentProfiles: string[] = [];

  playing = false;
  showingSequence = false;
  activeColor?: SimonColor;
  score = 0;
  message = 'Druk op start om te beginnen';

  results: ISimonResult[] = [];

  private sequence: SimonColor[] = [];
  private playerStep = 0;
  private audioCtx?: AudioContext;

  ngOnInit(): void {
    this.results = this.loadResults();
    this.recentProfiles = this.profile.getRecentProfiles();
    const active = this.profile.getActiveProfile();
    if (active) {
      this.joinAs(active);
    }
  }

  join() {
    if (!this.name.trim()) return;
    this.joinAs(this.name.trim());
  }

  joinAs(name: string) {
    this.name = name;
    this.profile.setActiveProfile(name);
    this.recentProfiles = this.profile.getRecentProfiles();
    this.joined = true;
  }

  switchProfile() {
    this.profile.clearActiveProfile();
    this.name = '';
    this.joined = false;
    this.playing = false;
  }

  start() {
    this.ensureAudioContext();
    this.sequence = [];
    this.score = 0;
    this.playerStep = 0;
    this.playing = true;
    this.nextRound();
  }

  async pick(color: SimonColor) {
    if (!this.playing || this.showingSequence) return;

    this.flash(color, 150);

    if (color === this.sequence[this.playerStep]) {
      this.playerStep++;
      if (this.playerStep === this.sequence.length) {
        this.score++;
        setTimeout(() => this.nextRound(), STEP_DELAY_MS);
      }
      return;
    }

    this.endGame();
  }

  private async nextRound() {
    this.sequence.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
    this.playerStep = 0;
    await this.playSequence();
  }

  private async playSequence() {
    this.showingSequence = true;
    this.message = 'Kijk goed...';
    for (const color of this.sequence) {
      await this.sleep(STEP_DELAY_MS / 2);
      await this.flash(color, STEP_DELAY_MS / 2);
    }
    this.showingSequence = false;
    this.message = 'Jouw beurt';
  }

  private async flash(color: SimonColor, duration: number) {
    this.activeColor = color;
    this.playTone(color, duration);
    await this.sleep(duration);
    this.activeColor = undefined;
  }

  private endGame() {
    this.playing = false;
    this.message = `Game over! Score: ${this.score}`;
    this.playFailureSound();
    this.reportResult(this.score);
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextCtor();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  private playTone(color: SimonColor, durationMs: number) {
    const ctx = this.ensureAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = TONE_FREQUENCIES[color];
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);
  }

  private playFailureSound() {
    const ctx = this.ensureAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 110;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
  }

  private reportResult(score: number) {
    const result: ISimonResult = {
      name: this.name || 'Onbekend',
      score,
      completedAt: Date.now(),
    };
    this.history.add<ISimonResult>({
      game: HISTORY_GAME_KEY,
      name: result.name,
      summary: `Score ${result.score}`,
      data: result,
      completedAt: result.completedAt,
    });
    this.results = this.loadResults();
  }

  private loadResults(): ISimonResult[] {
    return this.history.get<ISimonResult>(HISTORY_GAME_KEY)
      .map(entry => entry.data)
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 50);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
