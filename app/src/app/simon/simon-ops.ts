// Namespaced SignalR message type for Simon Says, broadcast/received via the
// shared SignalrService (see services/signalr/SignalrService.ts).
export enum SimonOps {
  result = 'simon.result', // a completed game's result
}
