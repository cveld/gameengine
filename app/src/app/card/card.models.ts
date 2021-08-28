export enum SuitEnum {
  undefined = 'undefined',
  spades = 'spades',
  hearts = 'hearts',
  clubs = 'clubs',
  diamonds = 'diamonds',
}

export enum SpecialEnum {
  undefined = 'undefined',
  joker = 'joker',
  covered = 'covered'
}

export const cardNumbers = ["A", 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'];

export enum CardTypeEnum {
  undefined = 'undefined',
  regular = 'regular',
  special = 'special'
}

export enum ColorEnum {
  undefined = 'undefined',
  red = 'red',
  black = 'black'
}
export function getSuitColor(suitEnum: SuitEnum) {
  switch (suitEnum) {
    case SuitEnum.clubs: return ColorEnum.black;
    case SuitEnum.hearts: return ColorEnum.red;
    case SuitEnum.diamonds: return ColorEnum.red;
    case SuitEnum.spades: return ColorEnum.black;
    default:
      throw `argument out of range: suitEnum = ${suitEnum}`;
  }
}

export function getCoveredCards(number: number) {
  const cards: ICard[] = [];
  for (let i = 0; i < number; i++) {
    cards.push({
      type: CardTypeEnum.special,
      special: SpecialEnum.covered
    });
  }
  return cards;
}

export const suits = [SuitEnum.spades, SuitEnum.hearts, SuitEnum.diamonds, SuitEnum.clubs];

export interface ICard {
  suit?: SuitEnum,
  number?: number,
  type: CardTypeEnum,
  special?: SpecialEnum
}
