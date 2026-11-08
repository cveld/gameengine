/* global OrbitXRMath, XRWebGLLayer */
(function (root) {
  "use strict";
  function create(options) {
    const button = document.getElementById("enter-vr");
    const status = document.getElementById("vr-status");
    let supported = false, pending = false, session = null, layer = null, space = null;
    let disposed = false, ready = false, frameRequest = null, previous = null, anchor = null;
    let distance = 1.8;
    const viewProjection = new Float32Array(16), sculpturePosition = new Float32Array(3);
    const nearDistance = 0.85, farDistance = 4.5;

    function message(text) {
      status.textContent = text || "";
      status.hidden = !text;
    }
    function sync() {
      button.textContent = session ? "Exit VR" : "Enter VR";
      button.setAttribute("aria-pressed", String(Boolean(session)));
      button.disabled = pending || disposed || (!session && (!supported || !options.available()));
    }
    async function discover() {
      if (!window.isSecureContext || !navigator.xr || typeof XRWebGLLayer === "undefined") {
        supported = false;
        message("VR needs an HTTPS page and a WebXR-capable headset browser. Standard Orbit still works here.");
        sync();
        return;
      }
      try {
        supported = await navigator.xr.isSessionSupported("immersive-vr");
        if (!disposed) message(supported ? "" : "No immersive VR headset is available. Standard Orbit still works here.");
      } catch (error) {
        supported = false;
        if (!disposed) message("VR availability could not be checked. Open this page directly in your headset browser.");
      }
      if (!disposed) sync();
    }
    function cleanup(endedSession) {
      if (session !== endedSession) return;
      if (frameRequest !== null) session.cancelAnimationFrame(frameRequest);
      frameRequest = null;
      if (space) space.removeEventListener("reset", recenter);
      session.removeEventListener("end", onEnd);
      session.removeEventListener("select", select);
      session.removeEventListener("squeeze", squeeze);
      session.removeEventListener("visibilitychange", onVisibility);
      session = layer = space = null;
      anchor = null; ready = false; previous = null;
      const gl = options.getGL();
      if (gl && !gl.isContextLost()) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
      }
      document.documentElement.classList.remove("vr-active");
      options.onEnd();
      sync();
      if (!disposed) button.focus({ preventScroll: true });
    }
    function onEnd(event) { cleanup(event.target); }
    function select() {
      if (ready && session.visibilityState === "visible") options.onSelect();
    }
    function squeeze() {
      if (ready && session.visibilityState === "visible") options.onSqueeze();
    }
    function recenter() { anchor = null; distance = 1.8; previous = null; }
    function onVisibility() { previous = null; }
    async function end() {
      const ending = session;
      if (!ending) return;
      try {
        await ending.end();
        cleanup(ending);
      } catch (error) {
        message("VR could not close. Use your headset's system menu to exit VR.");
      }
    }
    async function toggle() {
      if (pending || disposed) return;
      if (session) {
        pending = true; sync();
        await end();
        pending = false; sync();
        return;
      }
      if (!supported || !options.available()) return;
      pending = true; sync(); message("");
      let starting = null;
      try {
        // requestSession must run directly from the user's click, before any
        // awaits that could consume transient user activation.
        starting = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
        if (disposed) { await starting.end(); return; }
        session = starting;
        session.addEventListener("end", onEnd);
        session.addEventListener("visibilitychange", onVisibility);
        options.onStart();
        const gl = options.getGL();
        await gl.makeXRCompatible();
        if (session !== starting || disposed) return;
        if (!options.available()) throw new Error("The renderer is unavailable");
        layer = new XRWebGLLayer(session, gl, {
          alpha: false, depth: true, antialias: true, framebufferScaleFactor: 1
        });
        session.updateRenderState({ baseLayer: layer, depthNear: 0.05, depthFar: 30 });
        try { space = await starting.requestReferenceSpace("local-floor"); }
        catch (error) {
          if (session !== starting || disposed) return;
          space = await starting.requestReferenceSpace("local");
        }
        if (session !== starting || disposed) return;
        space.addEventListener("reset", recenter);
        session.addEventListener("select", select);
        session.addEventListener("squeeze", squeeze);
        anchor = null; distance = 1.8; previous = null; ready = true;
        document.documentElement.classList.add("vr-active");
        frameRequest = session.requestAnimationFrame(onFrame);
      } catch (error) {
        if (starting && session === starting) await end();
        if (!disposed) message("VR could not start. Allow VR access, close other VR sessions and try again.");
      } finally {
        pending = false;
        sync();
      }
    }
    function onFrame(timestamp, frame) {
      if (frame.session !== session || !ready || disposed) return;
      frameRequest = session.requestAnimationFrame(onFrame);
      if (session.visibilityState !== "visible" || !options.available()) {
        previous = null;
        return;
      }
      try {
        const pose = frame.getViewerPose(space);
        if (!pose) { previous = null; return; }
        const dt = previous === null ? 0 : Math.min(0.1, Math.max(0, (timestamp - previous) / 1000));
        previous = timestamp;
        if (!anchor) anchor = OrbitXRMath.anchorFromPose(pose.transform.matrix);
        let yaw = 0, pitch = 0;
        for (const input of session.inputSources) {
          // Only xr-standard tracked controllers have these thumbstick axes.
          const gamepad = input.gamepad;
          if (gamepad?.mapping !== "xr-standard" || gamepad.axes.length < 4) continue;
          const axis = index => {
            const value = gamepad.axes[index];
            return Number.isFinite(value) && Math.abs(value) > 0.18 ? Math.max(-1, Math.min(1, value)) : 0;
          };
          if (input.handedness === "left") distance = Math.max(nearDistance, Math.min(farDistance, distance + axis(3) * dt * 1.2));
          if (input.handedness === "right") { yaw = axis(2) * dt * 1.5; pitch = axis(3) * dt * 1.5; }
        }
        OrbitXRMath.position(anchor, distance, sculpturePosition);
        // Advance animation and upload geometry once, not once per eye.
        options.prepareFrame(dt, yaw, pitch);
        const gl = options.getGL();
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.disable(gl.SCISSOR_TEST);
        gl.depthMask(true);
        gl.clearColor(0.043, 0.063, 0.125, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        for (const view of pose.views) {
          const viewport = layer.getViewport(view);
          if (!viewport) continue;
          gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
          OrbitXRMath.multiply(view.projectionMatrix, view.transform.inverse.matrix, viewProjection);
          options.drawView(viewProjection, sculpturePosition, view.transform.position);
        }
      } catch (error) {
        ready = false;
        message("VR rendering stopped. Exit VR and try again.");
        void end();
      }
    }
    button.addEventListener("click", toggle);
    if (navigator.xr) navigator.xr.addEventListener("devicechange", discover);
    void discover();
    return {
      get active() { return Boolean(session); },
      refresh: sync,
      end,
      dispose() {
        disposed = true;
        button.removeEventListener("click", toggle);
        if (navigator.xr) navigator.xr.removeEventListener("devicechange", discover);
        void end();
        sync();
      }
    };
  }
  root.OrbitXR = { create };
})(window);
