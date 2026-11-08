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
    let firstFrame = true, startupWatchdog = null;
    let compatibilitySession = null;
    let startupWarning = null, recoveryFrames = 0;
    const mutePressed = new Set();

    function checkGL(stage, allowStartupWarning = false) {
      const gl = options.getGL(), error = gl.getError();
      if (error === gl.NO_ERROR) return;
      const name = {
        [gl.INVALID_ENUM]: "INVALID_ENUM", [gl.INVALID_VALUE]: "INVALID_VALUE",
        [gl.INVALID_OPERATION]: "INVALID_OPERATION", [gl.OUT_OF_MEMORY]: "OUT_OF_MEMORY",
        [gl.INVALID_FRAMEBUFFER_OPERATION]: "INVALID_FRAMEBUFFER_OPERATION",
        [gl.CONTEXT_LOST_WEBGL]: "CONTEXT_LOST_WEBGL"
      }[error] || "UNKNOWN";
      const detail = "WebGL 0x" + error.toString(16) + " " + name + " at " + stage;
      // A pre-existing error flag is not evidence that our next draw is invalid.
      // Permit one startup INVALID_OPERATION, then validate actual rendering.
      if (allowStartupWarning && error === gl.INVALID_OPERATION && startupWarning === null) {
        startupWarning = detail;
        console.warn("Orbit XR startup warning:", entries[mode].label, detail);
        message(entries[mode].label + " startup warning: " + detail + ". Checking the first rendered frame.");
        return;
      }
      throw new Error(detail);
    }
    function diagnose(text, error) {
      console.warn("Orbit XR:", text, error || "");
      message(text + (error ? " (" + String(error.message || error).slice(0, 160) + ")" : ""));
    }
    function clearWatchdog() {
      if (startupWatchdog !== null) clearTimeout(startupWatchdog);
      startupWatchdog = null;
    }
    function watchStartup(starting) {
      clearWatchdog();
      startupWatchdog = setTimeout(() => {
        if (session !== starting || !firstFrame || disposed) return;
        if (session.visibilityState !== "visible") { watchStartup(starting); return; }
        diagnose(entries[mode].label + " did not receive a renderable headset frame. Check tracking and retry.");
        void end();
      }, 8000);
    }
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
      clearWatchdog(); mutePressed.clear();
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
        gl.depthFunc(gl.LESS);
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
    function onVisibility() {
      previous = null; mutePressed.clear();
      options.onVisibility?.(session.visibilityState === "visible");
    }
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
        // Audio resume is initiated by this click, but never awaited before XR.
        options.onRequest?.();
        // requestSession must run directly from the user's click, before any
        // awaits that could consume transient user activation.
        starting = await navigator.xr.requestSession(requestedMode, { optionalFeatures: ["local-floor"] });
        if (disposed) { await starting.end(); return; }
        session = starting;
        session.addEventListener("end", onEnd);
        session.addEventListener("visibilitychange", onVisibility);
        options.onStart();
        const gl = options.getGL();
        // A graphics-adapter switch may legitimately lose and restore context.
        compatibilitySession = starting;
        try { await gl.makeXRCompatible(); }
        finally { if (compatibilitySession === starting) compatibilitySession = null; }
        if (session !== starting || disposed) return;
        if (!options.available()) throw new Error("The renderer is unavailable");
        checkGL("XR compatibility / renderer setup");
        if (requestedMode === "immersive-ar" &&
            !["alpha-blend", "additive"].includes(session.environmentBlendMode)) {
          throw new Error("This AR session cannot display the real environment");
        }
        layer = new XRWebGLLayer(session, gl, {
          // Keep an RGBA layer in both modes (the AR path tested on Quest).
          // VR clears opaque alpha; avoid optional MSAA/depth-compositor paths.
          alpha: true, depth: true, antialias: requestedMode === "immersive-ar",
          ignoreDepthValues: requestedMode === "immersive-vr", framebufferScaleFactor: 1
        });
        session.updateRenderState({ baseLayer: layer, depthNear: 0.05, depthFar: 30 });
        checkGL("XR layer setup");
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
        firstFrame = true; startupWarning = null; recoveryFrames = 0;
        mutePressed.clear(); watchStartup(starting);
        document.documentElement.classList.add("xr-active", requestedMode === "immersive-ar" ? "ar-active" : "vr-active");
        frameRequest = session.requestAnimationFrame(onFrame);
      } catch (error) {
        const detail = String(error.message || error).slice(0, 160);
        console.warn("Orbit XR session setup failed:", requestedMode, error);
        if (starting && session === starting) await end();
        if (!session) mode = null;
        if (!disposed) message(entries[requestedMode].label +
          " could not start. Allow headset access, close other XR sessions and check this mode is supported. (" +
          detail + ")", requestedMode);
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
        options.onVisibility?.(false);
        return;
      }
      try {
        if (firstFrame) checkGL("XR frame entry", true);
        const pose = frame.getViewerPose(space);
        if (!pose || !pose.views.length) {
          previous = null; options.onVisibility?.(false);
          return;
        }
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
          if (input.handedness === "right") {
            const pressed = gamepad.buttons?.[3]?.pressed === true;
            if (pressed && !mutePressed.has(input) && dt > 0) options.onMute?.();
            if (pressed) mutePressed.add(input); else mutePressed.delete(input);
          }
        }
        const activeInputs = new Set(session.inputSources);
        for (const input of mutePressed) if (!activeInputs.has(input)) mutePressed.delete(input);
        OrbitXRMath.position(anchor, distance, sculpturePosition);
        if (mode === "immersive-ar") {
          for (let i = 0; i < 3; i++) sculpturePosition[i] += arOffset[i];
        }
        // Advance animation and upload geometry once, not once per eye.
        if (firstFrame) checkGL("before first XR frame", true);
        options.prepareFrame(dt, yaw, pitch);
        if (firstFrame) checkGL("geometry upload");
        options.onPose?.(pose.transform.matrix, sculpturePosition);
        const gl = options.getGL();
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.disable(gl.SCISSOR_TEST);
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        gl.clearDepth(1);
        gl.depthFunc(gl.LEQUAL);
        if (firstFrame && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error("XR framebuffer is incomplete");
        }
        if (mode === "immersive-ar") {
          // Transparent pixels let the headset compositor show passthrough.
          // Separate alpha blending preserves correct coverage for wireframe.
          gl.clearColor(0, 0, 0, 0);
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          gl.clearColor(0.065, 0.085, 0.16, 1);
          // Preserve opaque coverage even when drawing translucent wire lines.
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (firstFrame) checkGL("XR framebuffer clear");
        let viewsDrawn = 0;
        for (const view of pose.views) {
          const viewport = layer.getViewport(view);
          if (!viewport) continue;
          gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
          if (firstFrame) checkGL((view.eye || "eye") + " viewport");
          OrbitXRMath.multiply(view.projectionMatrix, view.transform.inverse.matrix, viewProjection);
          const check = firstFrame ? stage => checkGL((view.eye || "eye") + " " + stage) : undefined;
          options.drawView(viewProjection, sculpturePosition, view.transform.position, check);
          viewsDrawn++;
        }
        if (firstFrame) {
          if (!viewsDrawn) throw new Error("No XR eye viewport is available");
          checkGL("first XR frame complete");
          firstFrame = false;
          clearWatchdog();
          if (startupWarning) {
            recoveryFrames = 2;
            message(entries[mode].label + " first-frame checks passed; startup warning: " + startupWarning);
          }
        } else if (recoveryFrames > 0) {
          // Confirm recovery without polling getError throughout every session.
          checkGL("XR recovery frame complete");
          recoveryFrames--;
        }
      } catch (error) {
        ready = false;
        diagnose(entries[mode].label + " rendering stopped. Returning to the browser.", error);
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
      get makingCompatible() { return Boolean(session && compatibilitySession === session); },
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
