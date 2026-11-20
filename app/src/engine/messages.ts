// Wire format of messages relayed by the API (/api/messages) to every SignalR client.
export enum UserType {
  undefined = "undefined",
  player = "player",
  game = "game"
}

export interface SignalrMessage<T = unknown> {
  type: string;
  connectionid?: string;
  gameid?: string;
  usertype: UserType;
  payload?: T;
}
