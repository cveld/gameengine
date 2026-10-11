import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { GameHistoryService } from '../services/history/game-history.service';
import { ProfileService } from '../services/profile/profile.service';
import { CoopService } from './coop.service';
import { moveAll, newState, SHIP_R, stepHost } from './coop.logic';
import { COOP_H, COOP_W, ICoopResult, ICoopState } from './coop.models';

const HISTORY_GAME_KEY = 'coop';
const BROADCAST_INTERVAL_MS = 100;

// Tandem Ruimteschip: two players steer ONE ship. The horizontal player only
// controls left/right, the vertical player only up/down. Catch stars together
// and dodge rocks. The host simulates; the guest sends its steering input and
// renders the host's state (extrapolated between updates).
@Component({
  selector: 'app-coop',
  templateUrl: './coop.component.html',
  styleUrls: ['./coop.component.scss']
})
export class CoopComponent implements OnInit, OnDestroy {

  constructor(public coop: CoopService, private profile: ProfileService, private history: GameHistoryService) { }

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  name = '';
  roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  recentProfiles: string[] = [];
  joined = false;

  state: ICoopState = newState({ h: '', v: '' }, 'waiting');
  peerName?: string;
  roomFull = false;
  // coarse pointer = phone/tablet: show touch hints instead of keyboard keys
  readonly isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  private subs = new Subscription();
  private raf?: number;
  private lastFrame = 0;
  private lastBroadcast = 0;
  private myDir = 0;
  private resultSaved = false;

  ngOnInit(): void {
    this.recentProfiles = this.profile.getRecentProfiles();
    const active = this.profile.getActiveProfile();
    if (active) this.name = active;

    this.subs.add(this.coop.peer$.subscribe(peer => this.onPeerChanged(peer?.name)));
    this.subs.add(this.coop.roomFull$.subscribe(full => {
      this.roomFull = full;
      if (full) this.leaveRoom();
    }));
    this.subs.add(this.coop.guestInput$.subscribe(dir => {
      // The guest is always the vertical player.
      if (this.coop.isHost) this.state.dirV = dir;
    }));
    this.subs.add(this.coop.remoteState$.subscribe(s => this.onRemoteState(s)));
    this.subs.add(this.coop.restartRequested$.subscribe(() => {
      if (this.coop.isHost) this.restartAsHost();
    }));

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  ngOnDestroy(): void {
    this.leaveRoom();
    this.subs.unsubscribe();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  get isHost() { return this.coop.isHost; }
  get myAxis(): 'h' | 'v' { return this.isHost ? 'h' : 'v'; }

  join() {
    const name = this.name.trim();
    const room = this.roomCode.trim().toUpperCase();
    if (!name || !room) return;
    this.roomCode = room;
    this.profile.setActiveProfile(name);
    this.recentProfiles = this.profile.getRecentProfiles();
    this.roomFull = false;
    this.joined = true;
    this.peerName = undefined;
    this.state = newState(this.names(), 'waiting');
    this.coop.join(room, name);
    // the canvas only exists once the template has rendered the joined view
    setTimeout(() => this.startLoop());
  }

  leaveRoom() {
    this.stopLoop();
    this.coop.leave();
    this.joined = false;
    this.peerName = undefined;
    this.myDir = 0;
  }

  restart() {
    if (this.isHost) this.restartAsHost();
    else this.coop.sendRestart();
  }

  // Pointer handlers for the on-screen buttons. Capturing the pointer keeps
  // the press alive when a thumb slides off the button; pointercancel (e.g. a
  // system gesture) always releases so the ship never keeps drifting.
  press(e: PointerEvent, dir: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.setDir(dir);
  }

  release(e: PointerEvent) {
    e.preventDefault();
    this.setDir(0);
  }

  // On-screen buttons (touch) call this; keyboard goes through setDir as well.
  setDir(dir: number) {
    if (dir === this.myDir) return;
    this.myDir = dir;
    if (this.isHost) {
      this.state.dirH = dir;
    } else {
      this.state.dirV = dir; // optimistic local feedback
      this.coop.sendInput(dir);
    }
  }

  private names() {
    const me = this.name.trim();
    const other = this.peerName ?? '...';
    return this.isHost ? { h: me, v: other } : { h: other, v: me };
  }

  private onPeerChanged(peerName?: string) {
    this.peerName = peerName;
    if (!this.joined) return;
    if (peerName) {
      if (this.isHost) this.restartAsHost();
    } else {
      // partner left: wait for a new one (we become host again)
      this.state = newState(this.names(), 'waiting');
      this.myDir = 0;
    }
  }

  private restartAsHost() {
    this.resultSaved = false;
    this.myDir = 0;
    this.state = newState(this.names(), 'countdown');
    this.coop.sendState(this.state);
  }

  private onRemoteState(s: ICoopState) {
    // keep our own steering immediately responsive
    s.dirV = this.myDir;
    this.state = s;
    this.maybeSaveResult();
  }

  private maybeSaveResult() {
    if (this.state.phase !== 'over' || this.resultSaved) return;
    this.resultSaved = true;
    const result: ICoopResult = {
      names: [this.state.names.h, this.state.names.v],
      score: this.state.score,
      completedAt: Date.now(),
    };
    this.history.add<ICoopResult>({
      game: HISTORY_GAME_KEY,
      name: this.name,
      summary: `Score ${result.score} met ${this.peerName ?? 'onbekend'}`,
      data: result,
      completedAt: result.completedAt,
    });
  }

  // ---- input ----

  private onKeyDown = (e: KeyboardEvent) => {
    const dir = this.keyToDir(e.key);
    if (dir === undefined) return;
    e.preventDefault();
    this.setDir(dir);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const dir = this.keyToDir(e.key);
    if (dir === undefined) return;
    // only stop if the released key matches the current direction
    if (dir === this.myDir) this.setDir(0);
  };

  private keyToDir(key: string): number | undefined {
    const k = key.toLowerCase();
    if (this.myAxis === 'h') {
      if (k === 'arrowleft' || k === 'a') return -1;
      if (k === 'arrowright' || k === 'd') return 1;
    } else {
      if (k === 'arrowup' || k === 'w') return -1;
      if (k === 'arrowdown' || k === 's') return 1;
    }
    return undefined;
  }

  // ---- loop ----

  private startLoop() {
    this.stopLoop();
    this.lastFrame = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.tick(dt, now);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopLoop() {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.raf = undefined;
  }

  private tick(dt: number, now: number) {
    if (this.isHost) {
      if (!this.peerName) return;
      stepHost(this.state, dt);
      this.maybeSaveResult();
      if (now - this.lastBroadcast >= BROADCAST_INTERVAL_MS) {
        this.lastBroadcast = now;
        this.coop.sendState(this.state);
      }
    } else if (this.state.phase === 'playing') {
      moveAll(this.state, dt);
    } else if (this.state.phase === 'countdown') {
      this.state.countdown -= dt;
    }
  }

  // ---- rendering ----

  private draw() {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const s = this.state;

    ctx.fillStyle = '#0b1026';
    ctx.fillRect(0, 0, COOP_W, COOP_H);

    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const item of s.items) {
      ctx.fillText(item.kind === 'star' ? '⭐' : '🪨', item.x, item.y);
    }

    // ship
    ctx.save();
    ctx.translate(s.shipX, s.shipY);
    ctx.fillStyle = s.hitFlash > 0 ? '#e74c3c' : '#ecf0f1';
    ctx.beginPath();
    ctx.moveTo(0, -SHIP_R - 4);
    ctx.lineTo(SHIP_R, SHIP_R);
    ctx.lineTo(0, SHIP_R - 6);
    ctx.lineTo(-SHIP_R, SHIP_R);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`⭐ ${s.score}`, 12, 24);
    ctx.textAlign = 'right';
    ctx.fillText('❤️'.repeat(Math.max(0, s.lives)), COOP_W - 12, 24);

    if (s.phase !== 'playing') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, COOP_W, COOP_H);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px sans-serif';
      if (s.phase === 'waiting') {
        ctx.fillText('Wachten op tweede speler...', COOP_W / 2, COOP_H / 2 - 10);
        ctx.font = '18px sans-serif';
        ctx.fillText(`Kamercode: ${this.coop.room ?? ''}`, COOP_W / 2, COOP_H / 2 + 28);
      } else if (s.phase === 'countdown') {
        ctx.font = 'bold 72px sans-serif';
        ctx.fillText(String(Math.max(1, Math.ceil(s.countdown))), COOP_W / 2, COOP_H / 2);
      } else {
        ctx.fillText('Game over!', COOP_W / 2, COOP_H / 2 - 10);
        ctx.font = '20px sans-serif';
        ctx.fillText(`Samen ${s.score} sterren gevangen`, COOP_W / 2, COOP_H / 2 + 30);
      }
    }
  }
}
