// Browser-only injected test harness. Uses a real WebGL framebuffer and shaders,
// but synthetic headset poses/session events; it is not a physical Quest test.
module.exports = function installMockXR(config = {}) {
  const state = {
    supported: config.supported !== false, requests: [], sessions: [], draws: [],
    uploads: 0, viewports: [], matrices: [], positions: [], spaces: [],
    failRequest: Boolean(config.failRequest), failSetup: Boolean(config.failSetup),
    failFloor: Boolean(config.failFloor), missingPose: false, device: null
  };
  const originalDraw = WebGLRenderingContext.prototype.drawArrays;
  WebGLRenderingContext.prototype.drawArrays = function (...args) {
    state.draws.push(args);
    return originalDraw.apply(this, args);
  };
  const originalUpload = WebGLRenderingContext.prototype.bufferSubData;
  WebGLRenderingContext.prototype.bufferSubData = function (...args) {
    state.uploads++;
    return originalUpload.apply(this, args);
  };
  const names = new WeakMap();
  const originalLocation = WebGLRenderingContext.prototype.getUniformLocation;
  WebGLRenderingContext.prototype.getUniformLocation = function (program, name) {
    const location = originalLocation.call(this, program, name);
    if (location) names.set(location, name);
    return location;
  };
  const matrix = WebGLRenderingContext.prototype.uniformMatrix4fv;
  WebGLRenderingContext.prototype.uniformMatrix4fv = function (location, transpose, data) {
    if (names.get(location) === "uViewProjection") state.matrices.push(Array.from(data));
    return matrix.call(this, location, transpose, data);
  };
  const vector = WebGLRenderingContext.prototype.uniform3fv;
  WebGLRenderingContext.prototype.uniform3fv = function (location, data) {
    if (names.get(location) === "uXRPosition") state.positions.push(Array.from(data));
    return vector.call(this, location, data);
  };
  const viewport = WebGLRenderingContext.prototype.viewport;
  WebGLRenderingContext.prototype.viewport = function (...args) {
    state.viewports.push(args);
    return viewport.apply(this, args);
  };
  WebGLRenderingContext.prototype.makeXRCompatible = async function () {
    if (state.failSetup) throw new Error("Synthetic compatibility failure");
    if (config.deferCompatibility) await new Promise(resolve => { state.finishCompatibility = resolve; });
  };

  class MockLayer {
    constructor(session, gl) {
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
  function pose(x = 0, y = 1.6, z = 0) {
    const transform = identity();
    transform[12] = x; transform[13] = y; transform[14] = z;
    return {
      transform: { matrix: transform },
      views: ["left", "right"].map(eye => {
        const eyeX = x + (eye === "left" ? -0.032 : 0.032);
        const inverse = identity();
        inverse[12] = -eyeX; inverse[13] = -y; inverse[14] = -z;
        const projection = [1.4, 0, 0, 0, 0, 1.4, 0, 0, 0, 0, -1.00334, -1, 0, 0, -0.100167, 0];
        return { eye, projectionMatrix: projection,
          transform: { inverse: { matrix: inverse }, position: { x: eyeX, y, z } } };
      })
    };
  }
  class MockSession extends EventTarget {
    constructor() {
      super();
      this.visibilityState = "visible";
      this.inputSources = [];
      this.renderState = {};
      this.callbacks = new Map();
      this.nextId = 0;
      this.ended = false;
    }
    updateRenderState(value) { Object.assign(this.renderState, value); }
    async requestReferenceSpace(type) {
      state.spaces.push(type);
      if (type === "local-floor" && state.failFloor) throw new Error("No floor");
      this.space = new EventTarget();
      return this.space;
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
    step(time, x = 0, y = 1.6, z = 0) {
      const callbacks = Array.from(this.callbacks.values());
      this.callbacks.clear();
      const frame = { session: this, getViewerPose: () => state.missingPose ? null : pose(x, y, z) };
      callbacks.forEach(callback => callback(time, frame));
    }
    pixels() {
      const layer = this.renderState.baseLayer, gl = layer.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
      const image = new Uint8Array(1024 * 512 * 4);
      gl.readPixels(0, 0, 1024, 512, gl.RGBA, gl.UNSIGNED_BYTE, image);
      const counts = [0, 0], hashes = [0, 0];
      for (let i = 0; i < image.length; i += 4) {
        const eye = (i / 4) % 1024 < 512 ? 0 : 1;
        if (image[i] > 45 || image[i + 1] > 45 || image[i + 2] > 60) counts[eye]++;
        hashes[eye] = (hashes[eye] + image[i] * ((i / 4) % 511) + image[i + 1]) % 2147483647;
      }
      return { counts, hashes, error: gl.getError() };
    }
  }
  const xr = new EventTarget();
  xr.isSessionSupported = async mode => mode === "immersive-vr" && state.supported;
  xr.requestSession = async (mode, options) => {
    state.requests.push({ mode, options });
    if (state.failRequest) throw new Error("Synthetic permission denial");
    const session = new MockSession();
    state.sessions.push(session);
    state.device = session;
    return session;
  };
  Object.defineProperty(navigator, "xr", { configurable: true, value: xr });
  window.mockXR = state;
};
