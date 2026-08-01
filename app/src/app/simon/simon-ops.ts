// Namespaced SignalR message types for Simon Says, broadcast/received via the
// shared SignalrService (see services/signalr/SignalrService.ts).
export enum SimonOps {
  presenceJoin = 'simon.presence.join',     // a player announces they joined
  presenceLeave = 'simon.presence.leave',   // a player announces they left
  presenceQuery = 'simon.presence.query',   // a new player asks "who's here?"
  presenceResult = 'simon.presence.result', // reply to presenceQuery, one per already-joined player
  result = 'simon.result',                  // a completed game's result
}
