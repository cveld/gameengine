// graphics taken from https://github.com/deck-of-cards/standard-deck
import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { cardNumbers, ColorEnum, getSuitColor, ICard, SpecialEnum, SuitEnum } from './card.models';

@Component({
  selector: 'app-card',
  templateUrl: './card.component.html',
  styleUrls: ['./card.component.scss']
})
export class CardComponent implements OnInit, OnChanges {

  constructor() { }
  ngOnChanges(changes: SimpleChanges): void {
    const currentValue: ICard = changes['card'].currentValue;
    const imageName = this.calculateImageName(currentValue);
    this.imagePath = `/assets/cards/${imageName}`;
  }

  calculateImageName(card: ICard) {
    if (card.special === SpecialEnum.covered) {
      return 'back.png';
    }

    if (card.special === SpecialEnum.joker && getSuitColor(card.suit!) === ColorEnum.black) {
      return 'front-52.png';
    }
    if (card.special === SpecialEnum.joker && getSuitColor(card.suit!) === ColorEnum.red) {
      return 'front-53.png';
    }
    switch (card.suit) {
      case SuitEnum.spades: return `front-${card.number}.png`;
      case SuitEnum.hearts: return `front-${13+card.number!}.png`;
      case SuitEnum.clubs: return `front-${26+card.number!}.png`;
      case SuitEnum.diamonds: return `front-${39+card.number!}.png`;
    // 0-12: spades
    // 13-25: hearts
    // 26-38: clubs
    // 39-51: diamonds
    // 52: black joker
    // 53: red joker
      default:
        throw `Argument out of range: card.suit = ${card.suit}`
    }
  }

  ngOnInit(): void {
    //this.imagePath = "/assets/cards/back.png";
  }

  @Input() card?: ICard;

  imagePath?: string;
}
