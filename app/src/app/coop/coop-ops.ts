// Namespaced SignalR message types for Tandem Ruimteschip. Every message
// carries the room code in `gameid`; handlers ignore other rooms.
export enum CoopOps {
  announce = 'coop.announce', // a player announces themselves (join, or reply to a query)
  query = 'coop.query',       // a new player asks "who's in this room?"
  leave = 'coop.leave',       // a player left
  input = 'coop.input',       // a player's steering direction changed
  state = 'coop.state',       // the host's authoritative game state
  restart = 'coop.restart',   // a player asks for a new game
}
