import { Component, OnDestroy, OnInit } from '@angular/core';
import { MemoryService } from './memory.service';
import { IMemoryCard } from './memory.models';
import { ProfileService } from '../services/profile/profile.service';

const SYMBOLS = ['🍎', '🍌', '🍇', '🍓', '🍒', '🍋', '🥝', '🍍'];

@Component({
  selector: 'app-memory',
  templateUrl: './memory.component.html',
  styleUrls: ['./memory.component.scss']
})
export class MemoryComponent implements OnInit, OnDestroy {

  constructor(public memoryService: MemoryService, private profile: ProfileService) { }

  name = '';
  joined = false;
  recentProfiles: string[] = [];

  presence$ = this.memoryService.presence$;
  results$ = this.memoryService.results$;

  cards: IMemoryCard[] = [];
  moves = 0;
  finished = false;

  private startedAt = 0;
  private selected: number[] = [];
  private lockBoard = false;

  ngOnInit(): void {
    this.newBoard();
    this.recentProfiles = this.profile.getRecentProfiles();
    const active = this.profile.getActiveProfile();
    if (active) {
      this.joinAs(active);
    }
  }

  ngOnDestroy(): void {
    this.memoryService.leave();
  }

  join() {
    if (!this.name.trim()) return;
    this.joinAs(this.name.trim());
  }

  joinAs(name: string) {
    this.name = name;
    this.profile.setActiveProfile(name);
    this.recentProfiles = this.profile.getRecentProfiles();
    this.memoryService.join(name);
    this.joined = true;
  }

  switchProfile() {
    this.memoryService.leave();
    this.profile.clearActiveProfile();
    this.name = '';
    this.joined = false;
  }

  newBoard() {
    const symbols = [...SYMBOLS, ...SYMBOLS]
      .map(symbol => ({ symbol, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ symbol }) => symbol);

    this.cards = symbols.map((symbol, index) => ({ index, symbol, flipped: false, matched: false }));
    this.moves = 0;
    this.finished = false;
    this.selected = [];
    this.lockBoard = false;
    this.startedAt = Date.now();
  }

  flip(card: IMemoryCard) {
    if (this.lockBoard || card.flipped || card.matched || !this.joined) return;

    card.flipped = true;
    this.selected.push(card.index);

    if (this.selected.length < 2) return;

    this.moves++;
    this.lockBoard = true;
    const [first, second] = this.selected.map(index => this.cards[index]);

    if (first.symbol === second.symbol) {
      first.matched = true;
      second.matched = true;
      this.selected = [];
      this.lockBoard = false;

      if (this.cards.every(c => c.matched)) {
        this.finished = true;
        this.memoryService.reportResult(this.moves, Date.now() - this.startedAt);
      }
    } else {
      setTimeout(() => {
        first.flipped = false;
        second.flipped = false;
        this.selected = [];
        this.lockBoard = false;
      }, 700);
    }
  }

  trackByIndex(_: number, card: IMemoryCard) {
    return card.index;
  }
}
