// Namespaced SignalR message types for the memory game, broadcast/received
// via the shared SignalrService (see services/signalr/SignalrService.ts).
export enum MemoryOps {
  presenceJoin = 'memory.presence.join',     // a player announces they joined
  presenceLeave = 'memory.presence.leave',   // a player announces they left
  presenceQuery = 'memory.presence.query',   // a new player asks "who's here?"
  presenceResult = 'memory.presence.result', // reply to presenceQuery, one per already-joined player
  result = 'memory.result',                  // a completed game's result
}
