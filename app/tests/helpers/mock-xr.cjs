// Browser-only injected test harness. Uses a real WebGL framebuffer and shaders,
// but synthetic headset poses/session events; it is not a physical Quest test.
module.exports = function installMockXR(config = {}) {
  const state = {
    supported: config.supported !== false, arSupported: config.arSupported !== false,
    requests: [], sessions: [], draws: [], layerOptions: [], contextRequests: [],
    uploads: 0, viewports: [], matrices: [], positions: [], spaces: [], offsets: [], pulses: [],
    failRequest: Boolean(config.failRequest), failSetup: Boolean(config.failSetup),
    failFloor: Boolean(config.failFloor), missingPose: false, device: null
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (["webgl", "webgl2"].includes(type)) state.contextRequests.push({ type, attributes: args[0] });
    return config.webgl1Only && type === "webgl2" ? null : getContext.call(this, type, ...args);
  };
  if (config.watchdogMs) {
    const timeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay, ...args) =>
      timeout(callback, delay === 8000 ? config.watchdogMs : delay, ...args);
  }
  for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const originalDraw = prototype.drawArrays;
    prototype.drawArrays = function (...args) {
      state.draws.push(args);
      if (config.failPhase === "drawArrays" && state.device?.renderState.baseLayer && !state.device.ended) this.useProgram(null);
      return originalDraw.apply(this, args);
    };
    const originalUpload = prototype.bufferSubData;
    prototype.bufferSubData = function (...args) {
      state.uploads++;
      if (config.failPhase === "geometry upload" && state.device?.renderState.baseLayer && !state.device.ended) {
        this.bindBuffer(this.ARRAY_BUFFER, null);
      }
      return originalUpload.apply(this, args);
    };
    const names = new WeakMap();
    const originalLocation = prototype.getUniformLocation;
    prototype.getUniformLocation = function (program, name) {
      const location = originalLocation.call(this, program, name);
      if (location) names.set(location, name);
      return location;
    };
    const matrix = prototype.uniformMatrix4fv;
    prototype.uniformMatrix4fv = function (location, transpose, data) {
      if (names.get(location) === "uViewProjection") state.matrices.push(Array.from(data));
      if (config.failPhase === "shader uniforms" && state.device?.renderState.baseLayer && !state.device.ended) {
        // A float setter on a mat4 uniform produces a real INVALID_OPERATION.
        this.uniform1f(location, 1);
      }
      return matrix.call(this, location, transpose, data);
    };
    const vector = prototype.uniform3fv;
    prototype.uniform3fv = function (location, data) {
      if (names.get(location) === "uXRPosition") state.positions.push(Array.from(data));
      return vector.call(this, location, data);
    };
    const viewport = prototype.viewport;
    prototype.viewport = function (...args) {
      state.viewports.push(args);
      return viewport.apply(this, args);
    };
    const scalar = prototype.uniform1f;
    prototype.uniform1f = function (location, value) {
      if (names.get(location) === "uPulse") state.pulses.push(value);
      return scalar.call(this, location, value);
    };
    const framebufferStatus = prototype.checkFramebufferStatus;
    prototype.checkFramebufferStatus = function (target) {
      if (config.incompleteFramebuffer && state.device?.renderState.baseLayer &&
          this.getParameter(this.FRAMEBUFFER_BINDING) === state.device.renderState.baseLayer.framebuffer) {
        return this.FRAMEBUFFER_UNSUPPORTED;
      }
      return framebufferStatus.call(this, target);
    };
    prototype.makeXRCompatible = async function () {
      if (state.failSetup) throw new Error("Synthetic compatibility failure");
      if (config.deferCompatibility) await new Promise(resolve => { state.finishCompatibility = resolve; });
      if (config.restoreDuringCompatibility) {
        const gl = this, extension = gl.getExtension("WEBGL_lose_context");
        await new Promise(resolve => {
          gl.canvas.addEventListener("webglcontextrestored", () => {
            state.compatibilityRestored = true;
            resolve();
          }, { once: true });
          gl.canvas.addEventListener("webglcontextlost", () => {
            setTimeout(() => extension.restoreContext(), 100);
          }, { once: true });
          extension.loseContext();
        });
      }
      if (config.failPhase === "compatibility") {
        const unlinked = this.createProgram();
        this.useProgram(unlinked);
        this.deleteProgram(unlinked);
      }
    };
  }

  class MockLayer {
    constructor(session, gl, options) {
      state.layerOptions.push(options);
      if (config.requireRGBA && !options.alpha) throw new Error("Synthetic RGB layer failure");
      this.framebufferWidth = 1024;
      this.framebufferHeight = 512;
      this.framebuffer = gl.createFramebuffer();
      this.color = gl.createRenderbuffer();
      this.depth = gl.createRenderbuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.color);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA4, 1024, 512);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.color);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1024, 512);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.gl = gl;
    }
    getViewport(view) { return { x: view.eye === "left" ? 0 : 512, y: 0, width: 512, height: 512 }; }
    release() {
      this.gl.deleteFramebuffer(this.framebuffer);
      this.gl.deleteRenderbuffer(this.color);
      this.gl.deleteRenderbuffer(this.depth);
    }
  }
  window.XRWebGLLayer = MockLayer;
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
      }
    }
    return out;
  }
  function inverse(matrix) {
    const out = identity();
    for (let column = 0; column < 3; column++) {
      for (let row = 0; row < 3; row++) out[column * 4 + row] = matrix[row * 4 + column];
    }
    for (let row = 0; row < 3; row++) {
      out[12 + row] = -(out[row] * matrix[12] + out[4 + row] * matrix[13] + out[8 + row] * matrix[14]);
    }
    return out;
  }
  function rigid(matrix) {
    return { matrix, inverse: { matrix: inverse(matrix) } };
  }
  class MockReferenceSpace extends EventTarget {
    constructor(session, offset = identity()) {
      super(); this.session = session; this.offset = offset;
      session.referenceSpaces.push(this);
    }
    world() { return multiply(this.session.nativeOrigin, this.offset); }
    getOffsetReferenceSpace(transform) {
      state.offsets.push(Array.from(transform.matrix));
      if (config.failOffset) throw new Error("Synthetic offset failure");
      const replacement = new MockReferenceSpace(this.session, multiply(this.offset, transform.matrix));
      this.session.space = replacement;
      return replacement;
    }
  }
  function pose(x = 0, y = 1.6, z = 0, yaw = 0) {
    const transform = identity();
    const c = Math.cos(yaw), s = Math.sin(yaw);
    transform[0] = c; transform[2] = -s; transform[8] = s; transform[10] = c;
    transform[12] = x; transform[13] = y; transform[14] = z;
    return {
      transform: { matrix: transform },
      views: ["left", "right"].map(eye => {
        const offset = eye === "left" ? -0.032 : 0.032;
        const eyeX = x + c * offset, eyeZ = z - s * offset;
        const inverse = identity();
        inverse[0] = c; inverse[2] = s; inverse[8] = -s; inverse[10] = c;
        inverse[12] = -c * eyeX + s * eyeZ; inverse[13] = -y; inverse[14] = -s * eyeX - c * eyeZ;
        const projection = [1.4, 0, 0, 0, 0, 1.4, 0, 0, 0, 0, -1.00334, -1, 0, 0, -0.100167, 0];
        return { eye, projectionMatrix: projection,
          transform: { inverse: { matrix: inverse }, position: { x: eyeX, y, z: eyeZ } } };
      })
    };
  }
  class MockSession extends EventTarget {
    constructor(mode) {
      super();
      this.visibilityState = "visible";
      if (config.enabledFeatures) this.enabledFeatures = config.enabledFeatures;
      this.environmentBlendMode = mode === "immersive-ar" ? (config.arBlendMode || "alpha-blend") : "opaque";
      this.inputSources = [];
      this.renderState = {};
      this.callbacks = new Map();
      this.nextId = 0;
      this.ended = false;
      this.nativeOrigin = identity();
      this.referenceSpaces = [];
    }
    updateRenderState(value) { Object.assign(this.renderState, value); }
    async requestReferenceSpace(type) {
      state.spaces.push(type);
      if (type === "unbounded" && config.failUnbounded) throw new Error("Unbounded is unavailable");
      if (type === "local-floor" && state.failFloor) throw new Error("No floor");
      if (config.deferSpace) await new Promise(resolve => { state.finishSpace = resolve; });
      this.space = new MockReferenceSpace(this);
      return this.space;
    }
    resetOrigin(x, y, z, yaw = 0, known = true) {
      const spaces = this.referenceSpaces.map(space => ({ space, oldWorld: space.world() }));
      this.nativeOrigin = pose(x, y, z, yaw).transform.matrix;
      for (const { space, oldWorld } of spaces) {
        const event = new Event("reset");
        event.transform = known ? rigid(multiply(inverse(oldWorld), space.world())) : null;
        space.dispatchEvent(event);
      }
    }
    requestAnimationFrame(callback) {
      const id = ++this.nextId;
      this.callbacks.set(id, callback);
      return id;
    }
    cancelAnimationFrame(id) { this.callbacks.delete(id); }
    async end() {
      if (this.ended) return;
      this.ended = true;
      this.callbacks.clear();
      this.dispatchEvent(new Event("end"));
      if (this.renderState.baseLayer) this.renderState.baseLayer.release();
    }
    step(time, x = 0, y = 1.6, z = 0, yaw = 0) {
      const callbacks = Array.from(this.callbacks.values());
      this.callbacks.clear();
      const injectStartupError = () => {
        if (config.startupError && (!this.startupErrorInjected || config.repeatStartupError)) {
          this.startupErrorInjected = true;
          const gl = this.renderState.baseLayer.gl;
          if (config.startupError === "INVALID_OPERATION") {
            // Leave a real error flag without invalidating the current program.
            const unlinked = gl.createProgram();
            gl.useProgram(unlinked); gl.deleteProgram(unlinked);
          } else gl.enable(-1);
        }
      };
      if (!config.startupErrorAfterPose) injectStartupError();
      const frame = { session: this, getJointPose: (joint, reference) => {
        if (config.noHandAPI || !joint.position) return null;
        const physical = identity();
        physical[12] = joint.position[0]; physical[13] = joint.position[1]; physical[14] = joint.position[2];
        const local = multiply(inverse(reference.world()), physical);
          return { emulatedPosition: Boolean(joint.emulated), transform: { position: { x: local[12], y: local[13], z: local[14] } } };
      }, getViewerPose: reference => {
        if (config.startupErrorAfterPose) injectStartupError();
        if (state.missingPose) return null;
        const physical = pose(x, y, z, yaw).transform.matrix;
        const local = multiply(inverse(reference.world()), physical);
        return pose(local[12], local[13], local[14], Math.atan2(local[8], local[0]));
      } };
      callbacks.forEach(callback => callback(time, frame));
    }
    pixels() {
      const layer = this.renderState.baseLayer, gl = layer.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      const image = new Uint8Array(1024 * 512 * 4);
      gl.readPixels(0, 0, 1024, 512, gl.RGBA, gl.UNSIGNED_BYTE, image);
      const counts = [0, 0], hashes = [0, 0], transparent = [0, 0], opaque = [0, 0];
      for (let i = 0; i < image.length; i += 4) {
        const eye = (i / 4) % 1024 < 512 ? 0 : 1;
        if (image[i] > 45 || image[i + 1] > 45 || image[i + 2] > 60) counts[eye]++;
        if (image[i + 3] === 0) transparent[eye]++;
        if (image[i + 3] === 255) opaque[eye]++;
        hashes[eye] = (hashes[eye] + image[i] * ((i / 4) % 511) + image[i + 1]) % 2147483647;
      }
      return { counts, hashes, transparent, opaque, error: gl.getError() };
    }
  }
  const xr = new EventTarget();
  xr.isSessionSupported = async mode => mode === "immersive-vr" ? state.supported : mode === "immersive-ar" && state.arSupported;
  xr.requestSession = async (mode, options) => {
    state.requests.push({ mode, options });
    if (state.failRequest) throw new Error("Synthetic permission denial");
    const session = new MockSession(mode);
    state.sessions.push(session);
    state.device = session;
    return session;
  };
  Object.defineProperty(navigator, "xr", { configurable: true, value: xr });
  window.mockXR = state;
};
