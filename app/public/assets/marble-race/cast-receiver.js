// Chromecast receiver: on the TV (index.html?tv=1) the race runs here and the
// connected phones control it over a custom message namespace.
(function () {
  "use strict";

  const game = window.MarbleGame;
  if (!game || !game.tv) return;
  const NS = window.MARBLE_CAST_NAMESPACE;
  const params = new URLSearchParams(window.location.search);
  const picks = new Map(); // sender id -> marble id

  // Outside a Chromecast (a normal browser) ?demo=1 runs races back to back,
  // which is handy to check the TV layout and performance.
  function demo() {
    game.setPicks([0]);
    game.onChange(() => {
      const state = game.snapshot();
      if (state.phase === "results" && state.resultsShown && !demo.pending) {
        demo.pending = setTimeout(() => { demo.pending = null; game.command("newTrack"); game.command("start"); }, 8000);
      }
    });
    setTimeout(() => game.command("start"), 3000);
  }

  function startReceiver() {
    const caf = window.cast && window.cast.framework;
    if (!caf) {
      if (params.get("demo") === "1") demo();
      return;
    }
    const context = caf.CastReceiverContext.getInstance();
    let ready = false;
    let timer = null;

    function send(senderId) {
      if (!ready) return;
      try {
        context.sendCustomMessage(NS, senderId, game.snapshot());
      } catch (error) {
        // A sender that just disconnected; the next broadcast goes to the others.
      }
    }
    // Throttle change-driven broadcasts; a steady 2 Hz keeps the clock moving.
    function broadcastSoon() {
      if (timer) return;
      timer = setTimeout(() => { timer = null; send(undefined); }, 120);
    }
    function updatePicks() {
      game.setPicks([...new Set(picks.values())]);
    }

    context.addCustomMessageListener(NS, event => {
      let message = event.data;
      if (typeof message === "string") {
        try { message = JSON.parse(message); } catch (error) { return; }
      }
      if (!message || typeof message !== "object") return;
      if ((message.type === "hello" || message.type === "pick") && Number.isInteger(message.pick)) {
        picks.set(event.senderId, message.pick);
        updatePicks();
        send(event.senderId);
      } else if (message.type === "command") {
        const allowed = ["start", "again", "newTrack", "skip", "camera", "world"];
        if (!allowed.includes(message.action)) return;
        const extra = {};
        if (message.action === "camera") {
          if (!["leader", "pick", "overview"].includes(message.mode)) return;
          extra.mode = message.mode;
          if (Number.isInteger(message.marble)) extra.marble = message.marble;
        }
        if (message.action === "world") {
          if (!["meadow", "lava"].includes(message.world)) return;
          extra.world = message.world;
        }
        game.command(message.action, extra);
      }
    });

    context.addEventListener(caf.system.EventType.READY, () => {
      ready = true;
      setInterval(() => send(undefined), 500);
    });
    context.addEventListener(caf.system.EventType.SENDER_DISCONNECTED, event => {
      picks.delete(event.senderId);
      updatePicks();
      // Close the app when the last phone leaves on purpose.
      if (context.getSenders().length === 0 && event.reason === caf.system.DisconnectReason.REQUESTED_BY_SENDER) {
        context.stop();
      }
    });
    game.onChange(broadcastSoon);

    const options = new caf.CastReceiverOptions();
    options.disableIdleTimeout = true;   // no media is playing, keep the race on screen
    options.skipPlayersLoad = true;      // no media player libraries needed
    options.customNamespaces = { [NS]: caf.system.MessageType.JSON };
    options.statusText = "Marble Race";
    context.start(options);
  }

  if (params.get("demo") === "1" && !(window.cast && window.cast.framework)) {
    startReceiver();
    return;
  }
  // The receiver framework only works on a Cast device; load it there.
  const script = document.createElement("script");
  script.src = "https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js";
  script.onload = startReceiver;
  script.onerror = startReceiver;
  document.head.appendChild(script);
})();
