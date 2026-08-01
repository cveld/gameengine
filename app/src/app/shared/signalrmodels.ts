export interface ISignalrMessage<T> {
  type: string,
  connectionid?: string,
  gameid?: string,
  usertype: UserTypeEnum
  payload?: T
}

export enum UserTypeEnum {
  undefined = 'undefined',
  player = 'player',
  game = 'game'
}
