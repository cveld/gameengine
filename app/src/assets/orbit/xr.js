/* global OrbitXRMath, OrbitXRHands, XRWebGLLayer */
(function (root) {
  "use strict";
  function create(options) {
    const entries = {
      vr: { button: document.getElementById("enter-vr"), status: document.getElementById("vr-status"), label: "VR", mode: "immersive-vr", supported: false },
      ar: { button: document.getElementById("enter-ar"), status: document.getElementById("ar-status"), label: "AR", mode: "immersive-ar", supported: false },
      "ar-free": { button: document.getElementById("enter-ar-free"), status: document.getElementById("ar-free-status"), label: "free-roam AR", mode: "immersive-ar", supported: false, unbounded: true }
    };
    let mode = null, pending = false, session = null, layer = null, space = null;
    let entryKey = null, trackingStatus = "";
    let resetSpace = null;
    const originCorrections = [];
    let disposed = false, ready = false, frameRequest = null, previous = null, anchor = null;
    let distance = 1.8;
    const viewProjection = new Float32Array(16), sculpturePosition = new Float32Array(3);
    const arOffset = new Float32Array(3);
    const nearDistance = 0.85, farDistance = 4.5;
    let firstFrame = true, startupWatchdog = null;
    let compatibilitySession = null;
    let startupWarning = null, recoveryFrames = 0;
    const mutePressed = new Set();
    const hands = OrbitXRHands.create();

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
        console.warn("Orbit XR startup warning:", entries[entryKey].label, detail);
        message(entries[entryKey].label + " startup warning: " + detail + ". Checking the first rendered frame.");
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
        diagnose(entries[entryKey].label + " did not receive a renderable headset frame. Check tracking and retry.");
        void end();
      }, 8000);
    }
    function message(text, targetKey = entryKey) {
      const status = entries[targetKey]?.status;
      const content = [targetKey === entryKey ? trackingStatus : "", text].filter(Boolean).join(" ");
      if (status) { status.textContent = content; status.hidden = !content; }
    }
    function sync() {
      for (const [key, entry] of Object.entries(entries)) {
        const active = Boolean(session && entryKey === key);
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
      await Promise.all(["immersive-vr", "immersive-ar"].map(async sessionMode => {
        const matching = Object.entries(entries).filter(([, entry]) => entry.mode === sessionMode);
        try {
          const supported = await navigator.xr.isSessionSupported(sessionMode);
          for (const [key, entry] of matching) {
            entry.supported = supported;
            if (!disposed && key !== entryKey) message(supported ? "" : "No immersive " + entry.label +
              " support is available. Standard Orbit still works here.", key);
          }
        } catch (error) {
          for (const [key, entry] of matching) {
            entry.supported = false;
            if (!disposed && key !== entryKey) message(entry.label + " availability could not be checked. Open this page directly in your headset browser.", key);
          }
        }
      }));
      if (!disposed) sync();
    }
    function cleanup(endedSession) {
      if (session !== endedSession) return;
      const button = entries[entryKey].button;
      clearWatchdog(); mutePressed.clear(); hands.reset();
      if (frameRequest !== null) session.cancelAnimationFrame(frameRequest);
      frameRequest = null;
      if (resetSpace) resetSpace.removeEventListener("reset", recenter);
      session.removeEventListener("end", onEnd);
      session.removeEventListener("select", select);
      session.removeEventListener("squeeze", squeeze);
      session.removeEventListener("visibilitychange", onVisibility);
      session = layer = space = null;
      resetSpace = null; originCorrections.length = 0;
      mode = entryKey = null; trackingStatus = "";
      anchor = null; ready = false; previous = null; arOffset.fill(0);
      const gl = options.getGL();
      if (gl && !gl.isContextLost()) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 0);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthFunc(gl.LESS);
      }
      document.documentElement.classList.remove("xr-active", "vr-active", "ar-active", "ar-free-active");
      options.onEnd();
      sync();
      if (!disposed) button.focus({ preventScroll: true });
    }
    function onEnd(event) { cleanup(event.target); }
    function select(event) {
      // Hand pinch events overlap direct manipulation, not play/pause.
      if (event.inputSource?.hand) return;
      // Reserve the AR left trigger as the height modifier, including release.
      if (mode === "immersive-ar" && event.inputSource?.handedness === "left") return;
      if (ready && session.visibilityState === "visible") options.onSelect();
    }
    function squeeze(event) {
      if (event.inputSource?.hand) return;
      if (ready && session.visibilityState === "visible") options.onSqueeze();
    }
    function recenter(event) {
      if (!session || !ready || disposed) return;
      hands.reset();
      previous = null;
      if (!entries[entryKey]?.unbounded) {
        anchor = null; distance = 1.8; arOffset.fill(0);
        return;
      }
      try {
        if (!event.transform?.inverse) throw new Error("The tracking-origin shift is unknown");
        // WebXR specifies the NEW origin in the OLD coordinate system.
        // Its inverse cancels that shift, preserving the entire scene frame,
        // including sculpture orientation, controller movement and spatial audio.
        // Listen on the original, un-offset space: its reset transform has an
        // unambiguous native-origin frame. New corrections must precede older
        // ones; rotations and translations do not commute.
        originCorrections.unshift(event.transform.inverse);
        let replacement = resetSpace;
        for (const correction of originCorrections) replacement = replacement.getOffsetReferenceSpace(correction);
        space = replacement;
      } catch (error) {
        ready = false;
        diagnose("AR tracking changed without a usable origin transform. Returning to the browser; clear your space and re-enter to place the sculpture again.", error);
        void end();
      }
    }
    function onVisibility() {
      previous = null; mutePressed.clear(); hands.reset();
      options.onVisibility?.(session.visibilityState === "visible");
    }
    async function end() {
      const ending = session;
      if (!ending) return;
      const endingKey = entryKey;
      try {
        await ending.end();
        cleanup(ending);
      } catch (error) {
        if (session === ending) message(entries[endingKey].label +
          " could not close. Use your headset's system menu to exit XR.", endingKey);
      }
    }
    async function toggle(requestedKey) {
      if (pending || disposed) return;
      if (session) {
        if (entryKey !== requestedKey) return;
        pending = true; sync();
        await end();
        pending = false; sync();
        if (!session && !disposed) entries[requestedKey].button.focus({ preventScroll: true });
        return;
      }
      const entry = entries[requestedKey], requestedMode = entry.mode;
      if (!entry.supported || !options.available()) return;
      pending = true; mode = requestedMode; entryKey = requestedKey; trackingStatus = ""; sync(); message("");
      let starting = null;
      try {
        // Audio resume is initiated by this click, but never awaited before XR.
        options.onRequest?.();
        // requestSession must run directly from the user's click, before any
        // awaits that could consume transient user activation.
        starting = await navigator.xr.requestSession(requestedMode, {
          optionalFeatures: entry.unbounded ? ["unbounded", "local-floor", "hand-tracking"] : ["local-floor", "hand-tracking"]
        });
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
        let spaceType = null;
        for (const type of entry.unbounded ? ["unbounded", "local-floor", "local"] : ["local-floor", "local"]) {
          if (session !== starting || disposed) return;
          try {
            const selected = await starting.requestReferenceSpace(type);
            if (session !== starting || disposed) return;
            space = selected; spaceType = type; break;
          } catch (error) {
            if (type === "local") throw error;
          }
        }
        if (session !== starting || disposed) return;
        if (entry.unbounded) {
          trackingStatus = (spaceType === "unbounded" ? "Unbounded tracking selected." :
            "Unbounded tracking unavailable; using " + spaceType + " tracking.") +
            " This does not disable the headset safety boundary. Keep passthrough enabled and clear your walking space.";
          message("");
        }
        resetSpace = space;
        resetSpace.addEventListener("reset", recenter);
        session.addEventListener("select", select);
        session.addEventListener("squeeze", squeeze);
        anchor = null; distance = 1.8; previous = null; ready = true; arOffset.fill(0);
        firstFrame = true; startupWarning = null; recoveryFrames = 0;
        mutePressed.clear(); hands.reset(); watchStartup(starting);
        document.documentElement.classList.add("xr-active", requestedMode === "immersive-ar" ? "ar-active" : "vr-active");
        if (entry.unbounded) document.documentElement.classList.add("ar-free-active");
        frameRequest = session.requestAnimationFrame(onFrame);
      } catch (error) {
        const detail = String(error.message || error).slice(0, 160);
        console.warn("Orbit XR session setup failed:", requestedMode, error);
        if (starting && session === starting) await end();
        if (!session) { mode = entryKey = null; trackingStatus = ""; }
        if (!disposed) message(entry.label +
          " could not start. Allow headset access, close other XR sessions and check this mode is supported. (" +
          detail + ")", requestedKey);
      } finally {
        pending = false;
        sync();
        if (!session && !disposed) entry.button.focus({ preventScroll: true });
      }
    }
    function onFrame(timestamp, frame) {
      if (frame.session !== session || !ready || disposed) return;
      frameRequest = session.requestAnimationFrame(onFrame);
      if (session.visibilityState !== "visible" || !options.available()) {
        previous = null; hands.reset();
        options.onVisibility?.(false);
        return;
      }
      try {
        if (firstFrame) checkGL("XR frame entry", true);
        const pose = frame.getViewerPose(space);
        if (!pose || !pose.views.length) {
          previous = null; hands.reset(); options.onVisibility?.(false);
          return;
        }
        const elapsed = previous === null ? 0 : Math.max(0, (timestamp - previous) / 1000);
        const dt = Math.min(0.1, elapsed);
        previous = timestamp;
        if (!anchor) anchor = OrbitXRMath.anchorFromPose(pose.transform.matrix);
        let yaw = 0, pitch = 0;
        for (const input of session.inputSources) {
          if (input.hand) continue;
          // Only xr-standard tracked controllers have these thumbstick axes.
          const gamepad = input.gamepad;
          if (gamepad?.mapping !== "xr-standard" || gamepad.axes.length < 4) continue;
          const axis = index => {
            const value = gamepad.axes[index];
            return Number.isFinite(value) && Math.abs(value) > 0.18 ? Math.max(-1, Math.min(1, value)) : 0;
          };
          if (!hands.grabbing && input.handedness === "left" && mode === "immersive-vr") {
            distance = Math.max(nearDistance, Math.min(farDistance, distance + axis(3) * dt * 1.2));
          }
          if (!hands.grabbing && input.handedness === "left" && mode === "immersive-ar") {
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
        const gesture = hands.update(OrbitXRHands.read(frame, session.inputSources, space), sculpturePosition, elapsed);
        if (gesture.position) {
          // Relocate the anchor, rather than forcing direct hand placement into
          // the controller's limited adjustment offset. Keep the grab offset.
          for (let i = 0; i < 3; i++) anchor.origin[i] += gesture.position[i] - sculpturePosition[i];
          sculpturePosition.set(gesture.position);
        }
        if (gesture.changeShape) options.onSqueeze();
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
            message(entries[entryKey].label + " first-frame checks passed; startup warning: " + startupWarning);
          }
        } else if (recoveryFrames > 0) {
          // Confirm recovery without polling getError throughout every session.
          checkGL("XR recovery frame complete");
          recoveryFrames--;
        }
      } catch (error) {
        ready = false;
        diagnose(entries[entryKey].label + " rendering stopped. Returning to the browser.", error);
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
