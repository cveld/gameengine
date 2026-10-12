import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Guid } from 'guid-typescript';
import { BehaviorSubject, Subject } from 'rxjs';
import { SignalrService } from '../services/signalr/SignalrService';
import { UserTypeEnum } from '../shared/signalrmodels';
import { CoopOps } from './coop-ops';
import { ICoopPeer, ICoopState } from './coop.models';

// Two-player room on top of the shared SignalrService. Both clients broadcast
// to everyone, so every message carries the room code (gameid) and handlers
// filter on it. The peer with the earliest joinedAt is the host: it runs the
// simulation and broadcasts the state; the other one only sends its input.
@Injectable({
  providedIn: 'root'
})
export class CoopService implements OnDestroy {

  readonly clientId = Guid.create().toString();

  room?: string;
  name = '';
  private joinedAt = 0;

  peer$ = new BehaviorSubject<ICoopPeer | undefined>(undefined);
  roomFull$ = new BehaviorSubject(false);
  guestInput$ = new Subject<number>();
  remoteState$ = new Subject<ICoopState>();
  restartRequested$ = new Subject<void>();

  private others = new Map<string, ICoopPeer>();
  private helloTimer?: number;

  constructor(private signalr: SignalrService) {
    this.signalr.addHandler<ICoopPeer>(CoopOps.announce, m => this.onAnnounce(m.gameid, m.payload));
    this.signalr.addHandler<undefined>(CoopOps.query, m => {
      if (this.inRoom(m.gameid) && m.connectionid !== this.clientId) this.announce();
    });
    this.signalr.addHandler<{ clientId: string }>(CoopOps.leave, m => this.onLeave(m.gameid, m.payload?.clientId));
    this.signalr.addHandler<{ clientId: string; dir: number }>(CoopOps.input, m => {
      if (this.inRoom(m.gameid) && m.payload && m.payload.clientId === this.peer$.value?.clientId) {
        this.guestInput$.next(m.payload.dir);
      }
    });
    this.signalr.addHandler<ICoopState>(CoopOps.state, m => {
      if (this.inRoom(m.gameid) && m.payload && m.connectionid === this.peer$.value?.clientId && !this.isHost) {
        this.remoteState$.next(m.payload);
      }
    });
    this.signalr.addHandler<undefined>(CoopOps.restart, m => {
      if (this.inRoom(m.gameid) && m.connectionid !== this.clientId) this.restartRequested$.next();
    });

    // Messages are broadcast to whoever is connected at that moment, so a
    // "who's here?" sent before our own SignalR connection is up is never
    // answered. Say hello whenever we (re)connect, and keep asking until we
    // have found our partner.
    this.signalr.state$.subscribe(state => {
      if (state === signalR.HubConnectionState.Connected && this.room) this.hello();
    });

    window.addEventListener('beforeunload', this.leaveOnUnload);
  }

  private leaveOnUnload = () => this.leave();

  ngOnDestroy(): void {
    this.leave();
    window.removeEventListener('beforeunload', this.leaveOnUnload);
  }

  get isHost(): boolean {
    const peer = this.peer$.value;
    if (!peer) return true;
    return this.joinedAt < peer.joinedAt || (this.joinedAt === peer.joinedAt && this.clientId < peer.clientId);
  }

  join(room: string, name: string) {
    this.leave();
    this.room = room;
    this.name = name;
    this.joinedAt = Date.now();
    this.others.clear();
    this.peer$.next(undefined);
    this.roomFull$.next(false);
    this.hello();
    window.clearInterval(this.helloTimer);
    this.helloTimer = window.setInterval(() => {
      if (this.room && !this.peer$.value) this.hello();
    }, 2000);
  }

  private hello() {
    if (this.signalr.state$.value !== signalR.HubConnectionState.Connected) return;
    this.announce();
    this.send(CoopOps.query, undefined);
  }

  leave() {
    window.clearInterval(this.helloTimer);
    if (!this.room) return;
    this.send(CoopOps.leave, { clientId: this.clientId });
    this.room = undefined;
    this.others.clear();
    this.peer$.next(undefined);
  }

  sendInput(dir: number) {
    this.send(CoopOps.input, { clientId: this.clientId, dir });
  }

  sendState(state: ICoopState) {
    this.send(CoopOps.state, state);
  }

  sendRestart() {
    this.send(CoopOps.restart, undefined);
  }

  private inRoom(room?: string) {
    return !!this.room && room === this.room;
  }

  private announce() {
    this.send<ICoopPeer>(CoopOps.announce, { clientId: this.clientId, name: this.name, joinedAt: this.joinedAt });
  }

  private onAnnounce(room?: string, entry?: ICoopPeer) {
    if (!entry || !this.inRoom(room) || entry.clientId === this.clientId) return;
    this.others.set(entry.clientId, entry);
    if (!this.peer$.value) {
      this.peer$.next(entry);
      this.announce(); // make sure the newcomer learns about us
    }
    // A third player has joined after both existing players: turn them away.
    const entries = [...this.others.values()];
    if (entries.length >= 2 && entries.every(e => e.joinedAt < this.joinedAt)) {
      this.roomFull$.next(true);
    }
  }

  private onLeave(room?: string, clientId?: string) {
    if (!this.inRoom(room) || !clientId) return;
    this.others.delete(clientId);
    if (this.peer$.value?.clientId === clientId) this.peer$.next(undefined);
  }

  private send<T>(type: string, payload: T) {
    this.signalr.sendSignalrMessage<T>({
      type,
      usertype: UserTypeEnum.undefined,
      connectionid: this.clientId,
      gameid: this.room,
      payload,
    }).subscribe();
  }
}
