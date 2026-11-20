// Playing cards. Graphics taken from https://github.com/deck-of-cards/standard-deck
import { html, type TemplateResult } from "lit";

export enum Suit {
  undefined = "undefined",
  spades = "spades",
  hearts = "hearts",
  clubs = "clubs",
  diamonds = "diamonds"
}

export enum Special {
  undefined = "undefined",
  joker = "joker",
  covered = "covered"
}

export enum CardType {
  undefined = "undefined",
  regular = "regular",
  special = "special"
}

export enum CardColor {
  undefined = "undefined",
  red = "red",
  black = "black"
}

export interface Card {
  suit?: Suit;
  number?: number; // 0 = ace ... 12 = king
  type: CardType;
  special?: Special;
}

export const cardNumbers = ["A", 2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K"];
export const suits = [Suit.spades, Suit.hearts, Suit.diamonds, Suit.clubs];
export const coveredCard: Card = { type: CardType.special, special: Special.covered };

export function suitColor(suit: Suit): CardColor {
  switch (suit) {
    case Suit.clubs:
    case Suit.spades:
      return CardColor.black;
    case Suit.hearts:
    case Suit.diamonds:
      return CardColor.red;
    default:
      throw new Error(`argument out of range: suit = ${suit}`);
  }
}

// Image index: 0-12 spades, 13-25 hearts, 26-38 clubs, 39-51 diamonds, 52 black joker, 53 red joker.
export function cardImage(card: Card): string {
  if (card.special === Special.covered) return "back.png";
  if (card.special === Special.joker) return suitColor(card.suit!) === CardColor.black ? "front-52.png" : "front-53.png";
  switch (card.suit) {
    case Suit.spades: return `front-${card.number}.png`;
    case Suit.hearts: return `front-${13 + card.number!}.png`;
    case Suit.clubs: return `front-${26 + card.number!}.png`;
    case Suit.diamonds: return `front-${39 + card.number!}.png`;
    default: throw new Error(`Argument out of range: card.suit = ${card.suit}`);
  }
}

export function cardView(card: Card, onClick?: () => void): TemplateResult {
  return html`<img src="/assets/cards/${cardImage(card)}" alt="" @click=${onClick}
                   style="width: 60px; border: 1px solid black${onClick ? "; cursor: pointer" : ""}">`;
}
