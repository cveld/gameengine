// Chromecast sender: casts the race to a TV and turns this page into a remote control.
// Works where the browser supports Google Cast (Chrome on Android and desktop).
(function () {
  "use strict";

  const game = window.MarbleGame;
  if (!game || game.tv) return;
  const params = new URLSearchParams(window.location.search);
  const appId = params.get("castAppId") || window.MARBLE_CAST_APP_ID;
  if (!appId || !/^[A-Z0-9]{8}$/i.test(appId)) return;
  const NS = window.MARBLE_CAST_NAMESPACE;
  const button = document.getElementById("cast");

  window.__onGCastApiAvailable = available => { if (available) init(); };
  const script = document.createElement("script");
  script.src = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
  script.async = true;
  document.head.appendChild(script);

  function init() {
    const framework = window.cast.framework;
    const context = framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: appId,
      autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    });
    let session = null;

    function showCastState(state) {
      const S = framework.CastState;
      button.hidden = state === S.NO_DEVICES_AVAILABLE;
      button.disabled = state === S.CONNECTING;
      button.setAttribute("aria-pressed", String(state === S.CONNECTED));
      button.textContent = state === S.CONNECTED ? "Stop casting" : state === S.CONNECTING ? "Connecting…" : "Cast to TV";
    }
    showCastState(context.getCastState());
    context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, event => showCastState(event.castState));

    function send(message) {
      if (session) session.sendMessage(NS, message).catch(() => {});
    }
    function onMessage(namespace, text) {
      let state;
      try { state = JSON.parse(text); } catch (error) { return; }
      if (state && state.type === "state") game.applyRemoteState(state);
    }
    function attach(current) {
      if (session === current) return;
      session = current;
      session.addMessageListener(NS, onMessage);
      game.setRemote({
        command: (action, extra) => send(Object.assign({ type: "command", action }, extra)),
        pick: id => send({ type: "pick", pick: id })
      }, session.getCastDevice().friendlyName);
      send({ type: "hello", pick: game.pick });
    }
    function detach() {
      if (!session) return;
      try { session.removeMessageListener(NS, onMessage); } catch (error) { /* session gone */ }
      session = null;
      game.setRemote(null);
    }
    context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
      const S = framework.SessionState;
      if (event.sessionState === S.SESSION_STARTED || event.sessionState === S.SESSION_RESUMED) attach(context.getCurrentSession());
      else if (event.sessionState === S.SESSION_ENDED) detach();
    });
    if (context.getCurrentSession()) attach(context.getCurrentSession());

    button.addEventListener("click", () => {
      if (session) context.endCurrentSession(true);
      else context.requestSession().catch(() => { /* cancelled or no device */ });
    });
  }
})();
