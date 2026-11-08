/* global OrbitXRMath, XRWebGLLayer */
(function (root) {
  "use strict";
  function create(options) {
    const entries = {
      "immersive-vr": { button: document.getElementById("enter-vr"), status: document.getElementById("vr-status"), label: "VR", supported: false },
      "immersive-ar": { button: document.getElementById("enter-ar"), status: document.getElementById("ar-status"), label: "AR", supported: false }
    };
    let mode = null, pending = false, session = null, layer = null, space = null;
    let disposed = false, ready = false, frameRequest = null, previous = null, anchor = null;
    let distance = 1.8;
    const viewProjection = new Float32Array(16), sculpturePosition = new Float32Array(3);
    const arOffset = new Float32Array(3);
    const nearDistance = 0.85, farDistance = 4.5;

    function message(text, targetMode = mode) {
      const status = entries[targetMode]?.status;
      if (status) { status.textContent = text || ""; status.hidden = !text; }
    }
    function sync() {
      for (const [entryMode, entry] of Object.entries(entries)) {
        const active = Boolean(session && mode === entryMode);
        entry.button.textContent = (active ? "Exit " : "Enter ") + entry.label;
        entry.button.setAttribute("aria-pressed", String(active));
        // Only one XR session may be running or starting at a time.
        entry.button.disabled = pending || disposed || (!active && (Boolean(session) || !entry.supported || !options.available()));
      }
    }
    async function discover() {
      if (!window.isSecureContext || !navigator.xr || typeof XRWebGLLayer === "undefined") {
        for (const [entryMode, entry] of Object.entries(entries)) {
          entry.supported = false;
          message(entry.label + " needs an HTTPS page and a WebXR-capable headset browser. Standard Orbit still works here.", entryMode);
        }
        sync();
        return;
      }
      await Promise.all(Object.entries(entries).map(async ([entryMode, entry]) => {
        try {
          entry.supported = await navigator.xr.isSessionSupported(entryMode);
          if (!disposed) message(entry.supported ? "" : "No immersive " + entry.label +
            " support is available. Standard Orbit still works here.", entryMode);
        } catch (error) {
          entry.supported = false;
          if (!disposed) message(entry.label + " availability could not be checked. Open this page directly in your headset browser.", entryMode);
        }
      }));
      if (!disposed) sync();
    }
    function cleanup(endedSession) {
      if (session !== endedSession) return;
      const button = entries[mode].button;
      if (frameRequest !== null) session.cancelAnimationFrame(frameRequest);
      frameRequest = null;
      if (space) space.removeEventListener("reset", recenter);
      session.removeEventListener("end", onEnd);
      session.removeEventListener("select", select);
      session.removeEventListener("squeeze", squeeze);
      session.removeEventListener("visibilitychange", onVisibility);
      session = layer = space = null;
      mode = null;
      anchor = null; ready = false; previous = null; arOffset.fill(0);
      const gl = options.getGL();
      if (gl && !gl.isContextLost()) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      document.documentElement.classList.remove("xr-active", "vr-active", "ar-active");
      options.onEnd();
      sync();
      if (!disposed) button.focus({ preventScroll: true });
    }
    function onEnd(event) { cleanup(event.target); }
    function select(event) {
      // Reserve the AR left trigger as the height modifier, including release.
      if (mode === "immersive-ar" && event.inputSource?.handedness === "left") return;
      if (ready && session.visibilityState === "visible") options.onSelect();
    }
    function squeeze() {
      if (ready && session.visibilityState === "visible") options.onSqueeze();
    }
    function recenter() { anchor = null; distance = 1.8; previous = null; arOffset.fill(0); }
    function onVisibility() { previous = null; }
    async function end() {
      const ending = session;
      if (!ending) return;
      const endingMode = mode;
      try {
        await ending.end();
        cleanup(ending);
      } catch (error) {
        if (session === ending) message(entries[endingMode].label +
          " could not close. Use your headset's system menu to exit XR.", endingMode);
      }
    }
    async function toggle(requestedMode) {
      if (pending || disposed) return;
      if (session) {
        if (mode !== requestedMode) return;
        pending = true; sync();
        await end();
        pending = false; sync();
        return;
      }
      if (!entries[requestedMode].supported || !options.available()) return;
      pending = true; mode = requestedMode; sync(); message("");
      let starting = null;
      try {
        // requestSession must run directly from the user's click, before any
        // awaits that could consume transient user activation.
        starting = await navigator.xr.requestSession(requestedMode, { optionalFeatures: ["local-floor"] });
        if (disposed) { await starting.end(); return; }
        session = starting;
        session.addEventListener("end", onEnd);
        session.addEventListener("visibilitychange", onVisibility);
        options.onStart();
        const gl = options.getGL();
        await gl.makeXRCompatible();
        if (session !== starting || disposed) return;
        if (!options.available()) throw new Error("The renderer is unavailable");
        if (requestedMode === "immersive-ar" &&
            !["alpha-blend", "additive"].includes(session.environmentBlendMode)) {
          throw new Error("This AR session cannot display the real environment");
        }
        layer = new XRWebGLLayer(session, gl, {
          alpha: requestedMode === "immersive-ar", depth: true, antialias: true, framebufferScaleFactor: 1
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
        anchor = null; distance = 1.8; previous = null; ready = true; arOffset.fill(0);
        document.documentElement.classList.add("xr-active", requestedMode === "immersive-ar" ? "ar-active" : "vr-active");
        frameRequest = session.requestAnimationFrame(onFrame);
      } catch (error) {
        if (starting && session === starting) await end();
        if (!session) mode = null;
        if (!disposed) message(entries[requestedMode].label +
          " could not start. Allow headset access, close other XR sessions and check this mode is supported.", requestedMode);
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
          if (input.handedness === "left" && mode === "immersive-vr") {
            distance = Math.max(nearDistance, Math.min(farDistance, distance + axis(3) * dt * 1.2));
          }
          if (input.handedness === "left" && mode === "immersive-ar") {
            // xr-standard button 0 is the trigger; axes 2/3 are the thumbstick.
            const heightMode = gamepad.buttons?.[0]?.pressed === true;
            const x = heightMode ? 0 : axis(2), y = -axis(3);
            if (x || y) OrbitXRMath.moveOffset(arOffset, OrbitXRMath.anchorFromPose(pose.transform.matrix),
              x, heightMode ? 0 : y, heightMode ? y : 0, dt);
          }
          if (input.handedness === "right") { yaw = axis(2) * dt * 1.5; pitch = axis(3) * dt * 1.5; }
        }
        OrbitXRMath.position(anchor, distance, sculpturePosition);
        if (mode === "immersive-ar") {
          for (let i = 0; i < 3; i++) sculpturePosition[i] += arOffset[i];
        }
        // Advance animation and upload geometry once, not once per eye.
        options.prepareFrame(dt, yaw, pitch);
        const gl = options.getGL();
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.disable(gl.SCISSOR_TEST);
        gl.depthMask(true);
        if (mode === "immersive-ar") {
          // Transparent pixels let the headset compositor show passthrough.
          // Separate alpha blending preserves correct coverage for wireframe.
          gl.clearColor(0, 0, 0, 0);
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          gl.clearColor(0.043, 0.063, 0.125, 1);
        }
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
        message(entries[mode].label + " rendering stopped. Exit XR and try again.");
        void end();
      }
    }
    const listeners = Object.entries(entries).map(([entryMode, entry]) => {
      const listener = () => toggle(entryMode);
      entry.button.addEventListener("click", listener);
      return { button: entry.button, listener };
    });
    if (navigator.xr) navigator.xr.addEventListener("devicechange", discover);
    void discover();
    return {
      get active() { return Boolean(session); },
      refresh: sync,
      end,
      dispose() {
        disposed = true;
        listeners.forEach(({ button, listener }) => button.removeEventListener("click", listener));
        if (navigator.xr) navigator.xr.removeEventListener("devicechange", discover);
        void end();
        sync();
      }
    };
  }
  root.OrbitXR = { create };
})(window);
