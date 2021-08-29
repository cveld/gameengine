export enum Game1Ops {
  undefined = 'undefined',
  querygames = 'game1.querygames',  // the player sends to all games
  join = 'game1.join', // the player sends this to the game
  querygamesresult = 'game1.querygamesresult', // the game broadscast this to all players
  playcard = 'game1.playcard', // the player sends this to the game
  drawcard = 'game1.drawcard', // the player sends this to the game
  updateplayer = 'game1.updateplayer' // the game engine sends every player a personalized payload
}

export interface IPlaycard {
  index: number;
  sayLastCard: boolean;
}
