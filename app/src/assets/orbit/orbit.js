/* global OrbitGeometry */
(function () {
  "use strict";
  const canvas = document.getElementById("scene");
  const status = document.getElementById("status");
  const play = document.getElementById("play");
  const tempo = document.getElementById("tempo");
  const zoom = document.getElementById("zoom");
  // Keep wheel and pinch limits in sync with the visible slider.
  const minZoom = Number(zoom.min), maxZoom = Number(zoom.max);
  const wireframe = document.getElementById("wireframe");
  const rain = document.getElementById("rain");
  const dialog = document.getElementById("shortcuts");
  const fullscreenButton = document.getElementById("fullscreen");
  const fullscreenStatus = document.getElementById("fullscreen-status");
  const hideControlsButton = document.getElementById("hide-controls");
  let fullscreenPending = false;
  const fullscreenSupported = Boolean(document.fullscreenEnabled &&
    document.documentElement.requestFullscreen && document.exitFullscreen);
  const shapeButtons = Array.from(document.querySelectorAll("[data-shape]"));
  const shapeNames = ["Trefoil knot", "Rippling torus", "Fluted sphere"];
  const state = {
    shape: 0, time: 0, speed: 1, zoom: 1, yaw: 0, pitch: -0.2,
    playing: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    wireframe: false, rain: true
  };
  let gl, sculpture, atmosphere, geometryBuffer, atmosphereBuffer;
  let mesh = OrbitGeometry.buildMesh(0);
  let frame = null, previousFrame = null, meshTime = NaN;
  let lost = false, failed = false, suspended = false, pinch = null;
  const pointers = new Map();
  let reportedHeight = 0;
  const atmosphereData = new Float32Array(320 * 7);
  const fract = value => value - Math.floor(value);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const sculptureVertex = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec2 aMaterial;
    uniform vec3 uRotation;
    uniform vec2 uScale;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vMaterial;
    vec3 rotate(vec3 p) {
      float c = cos(uRotation.z), s = sin(uRotation.z);
      p = vec3(c*p.x-s*p.y, s*p.x+c*p.y, p.z);
      c = cos(uRotation.y); s = sin(uRotation.y);
      p = vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z);
      c = cos(uRotation.x); s = sin(uRotation.x);
      return vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z);
    }
    void main() {
      vec3 p = rotate(aPosition);
      float distance = 8.5 - p.z;
      gl_Position = vec4(p.xy*uScale, 1.0689655*distance-2.0689655, distance);
      vPosition = p;
      vNormal = rotate(aNormal);
      vMaterial = aMaterial;
    }`;
  const sculptureFragment = `
    precision mediump float;
    uniform float uTime;
    uniform bool uWireframe;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec2 vMaterial;
    void main() {
      if (uWireframe) {
        gl_FragColor = vec4(0.56, 0.70, 0.96, 0.66);
        return;
      }
      vec3 normal = normalize(vNormal);
      if (!gl_FrontFacing) normal = -normal;
      float diffuse = max(0.0, dot(normal, normalize(vec3(-0.4, -0.6, 1.0))));
      float specular = pow(max(0.0, normal.z), 18.0)*0.38;
      float wave = 0.5+0.5*sin(uTime*1.4+vMaterial.x*6.2831853+vPosition.z*0.45);
      vec3 base = mix(vec3(0.478,0.635,0.969), vec3(0.718,0.631,0.933), 0.16+vMaterial.x*0.38);
      base = mix(base, vec3(0.451,0.890,0.808), wave*0.28);
      base = mix(base, vec3(0.914,0.937,1.0), vMaterial.y*0.20);
      float brightness = 0.24+0.66*diffuse+specular;
      vec3 color = brightness > 1.0 ? mix(base, vec3(0.949,0.961,1.0), brightness-1.0) : base*brightness;
      gl_FragColor = vec4(color, 1.0);
    }`;
  const atmosphereVertex = `
    attribute vec2 aPosition;
    attribute float aSize;
    attribute vec4 aColor;
    varying vec4 vColor;
    void main() {
      gl_Position = vec4(aPosition, 0.99, 1.0);
      gl_PointSize = aSize;
      vColor = aColor;
    }`;
  const atmosphereFragment = `
    precision mediump float;
    uniform bool uRound;
    varying vec4 vColor;
    void main() {
      float alpha = vColor.a;
      if (uRound) alpha *= max(0.0, 1.0-length(gl_PointCoord-vec2(0.5))*2.0);
      gl_FragColor = vec4(vColor.rgb, alpha);
    }`;

  function program(vertexSource, fragmentSource, attributes, uniforms) {
    const shaders = [];
    let handle;
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Unable to allocate a WebGL shader");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      }
      handle = gl.createProgram();
      if (!handle) throw new Error("Unable to allocate a WebGL program");
      shaders.forEach(shader => gl.attachShader(handle, shader));
      gl.linkProgram(handle);
      if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
      return {
        handle,
        attributes: Object.fromEntries(attributes.map(name => [name, gl.getAttribLocation(handle, name)])),
        uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(handle, name)]))
      };
    } catch (error) {
      if (handle) gl.deleteProgram(handle);
      throw error;
    } finally {
      shaders.forEach(shader => gl.deleteShader(shader));
    }
  }

  function setAvailable(available, message) {
    document.querySelectorAll(".controls button, .controls input").forEach(control => { control.disabled = !available; });
    status.textContent = message || "";
    status.hidden = !message;
  }

  function release() {
    if (!gl || gl.isContextLost()) return;
    if (sculpture) gl.deleteProgram(sculpture.handle);
    if (atmosphere) gl.deleteProgram(atmosphere.handle);
    if (geometryBuffer) gl.deleteBuffer(geometryBuffer);
    if (atmosphereBuffer) gl.deleteBuffer(atmosphereBuffer);
    sculpture = atmosphere = geometryBuffer = atmosphereBuffer = null;
  }

  function initialize() {
    try {
      gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
      if (!gl) throw new Error("WebGL is unavailable");
      sculpture = program(sculptureVertex, sculptureFragment, ["aPosition", "aNormal", "aMaterial"],
        ["uRotation", "uScale", "uTime", "uWireframe"]);
      atmosphere = program(atmosphereVertex, atmosphereFragment, ["aPosition", "aSize", "aColor"], ["uRound"]);
      geometryBuffer = gl.createBuffer();
      atmosphereBuffer = gl.createBuffer();
      if (!geometryBuffer || !atmosphereBuffer) throw new Error("Unable to allocate WebGL buffers");
      gl.bindBuffer(gl.ARRAY_BUFFER, atmosphereBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, atmosphereData.byteLength, gl.DYNAMIC_DRAW);
      allocateMesh();
      gl.clearColor(0, 0, 0, 0);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      failed = false;
      setAvailable(true);
      requestRender();
    } catch (error) {
      failed = true;
      release();
      setAvailable(false, "Orbit could not start WebGL. Enable hardware acceleration or try another browser.");
      console.warn("Orbit renderer initialization failed:", error.message);
    }
  }

  function allocateMesh() {
    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Math.max(mesh.solid.byteLength, mesh.wire.byteLength), gl.DYNAMIC_DRAW);
    meshTime = NaN;
  }

  function attribute(location, count, stride, offset) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, count, gl.FLOAT, false, stride * 4, offset * 4);
  }

  function particle(index, x, y, size, color, alpha) {
    const offset = index * 7;
    atmosphereData[offset] = x;
    atmosphereData[offset + 1] = y;
    atmosphereData[offset + 2] = size;
    atmosphereData[offset + 3] = color[0];
    atmosphereData[offset + 4] = color[1];
    atmosphereData[offset + 5] = color[2];
    atmosphereData[offset + 6] = alpha;
  }

  function drawAtmosphere(count, mode) {
    gl.useProgram(atmosphere.handle);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, atmosphereBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, atmosphereData.subarray(0, count * 7));
    const a = atmosphere.attributes;
    attribute(a.aPosition, 2, 7, 0);
    attribute(a.aSize, 1, 7, 2);
    attribute(a.aColor, 4, 7, 3);
    gl.uniform1i(atmosphere.uniforms.uRound, mode === gl.POINTS ? 1 : 0);
    gl.drawArrays(mode, 0, count);
    Object.values(a).forEach(location => gl.disableVertexAttribArray(location));
  }

  function drawStars(width, height, ratio) {
    for (let i = 0; i < 75; i++) {
      const twinkle = 0.5 + 0.5 * Math.sin(state.time * 1.4 + i * 2.4);
      particle(i, fract(i * 0.61803398875 + 0.17) * 2 - 1, fract(i * 0.41421356237 + 0.31) * 2 - 1,
        (i % 7 === 0 ? 3.2 : 2) * ratio, [0.67, 0.74, 0.88], (20 + (i % 4) * 10 + 25 * twinkle) / 255);
    }
    const unit = Math.min(width, height) * 0.135 * state.zoom;
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.399963 + state.time * (0.16 + (i % 3) * 0.045);
      const radius = unit * (2.65 + (i % 5) * 0.13);
      const pulse = 0.5 + 0.5 * Math.sin(state.time * 1.8 + i * 1.7);
      particle(75 + i, Math.cos(angle) * radius * 2 / width, Math.sin(angle) * radius * 1.32 / height,
        (4 + pulse * 3) * ratio, [0.63, 0.9, 0.91], 0.35 + pulse * 0.4);
    }
    drawAtmosphere(99, gl.POINTS);
  }

  function drawRain(foreground, width, height) {
    if (!state.rain) return;
    const count = foreground ? 35 : 125;
    for (let i = 0; i < count; i++) {
      const seed = foreground ? i + 130 : i;
      const depth = 0.35 + (seed % 7) * 0.10;
      const y = fract(seed * 0.41421356237 + state.time * (0.22 + depth * 0.28));
      const x = fract(seed * 0.61803398875 + 0.13) * width - y * 42;
      const head = y * (height + 48) - 24;
      const length = foreground ? 15 + depth * 12 : 8 + depth * 9;
      const alpha = foreground ? (25 + depth * 38) / 255 : (12 + depth * 26) / 255;
      particle(i * 2, (x + 2.4) / width * 2 - 1, 1 - (head - length) / height * 2, 1, [0.68, 0.79, 0.92], 0);
      particle(i * 2 + 1, x / width * 2 - 1, 1 - head / height * 2, 1, [0.68, 0.79, 0.92], alpha);
    }
    drawAtmosphere(count * 2, gl.LINES);
  }

  function draw() {
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const maxSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const ratio = Math.min(window.devicePixelRatio || 1, 2, maxSize / width, maxSize / height);
    const pixelWidth = Math.max(1, Math.round(width * ratio)), pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth; canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawStars(width, height, ratio);
    drawRain(false, width, height);
    if (meshTime !== state.time) {
      OrbitGeometry.updateMesh(mesh, state.time);
      meshTime = state.time;
    }
    gl.useProgram(sculpture.handle);
    if (state.wireframe) {
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
    } else {
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, geometryBuffer);
    const vertices = state.wireframe ? mesh.wire : mesh.solid;
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    const a = sculpture.attributes, u = sculpture.uniforms;
    attribute(a.aPosition, 3, 8, 0);
    attribute(a.aNormal, 3, 8, 3);
    attribute(a.aMaterial, 2, 8, 6);
    gl.uniform3f(u.uRotation,
      state.pitch + 0.12 * Math.sin(state.time * 0.8) + 0.04 * Math.sin(state.time * 1.7),
      state.yaw + state.time * 0.34 + 0.13 * Math.sin(state.time * 0.6),
      (22 + Math.sin(state.time * 0.7) * 18) * Math.PI / 180);
    gl.uniform2f(u.uScale, 2.295 * state.zoom * Math.min(width, height) / width,
      2.295 * state.zoom * Math.min(width, height) / height);
    gl.uniform1f(u.uTime, state.time);
    gl.uniform1i(u.uWireframe, state.wireframe ? 1 : 0);
    gl.drawArrays(state.wireframe ? gl.LINES : gl.TRIANGLES, 0, vertices.length / 8);
    Object.values(a).forEach(location => gl.disableVertexAttribArray(location));
    drawRain(true, width, height);
  }

  function requestRender() {
    if (frame === null && !lost && !failed && !suspended && !document.hidden) frame = requestAnimationFrame(render);
  }
  function stopFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = previousFrame = null;
  }
  function render(timestamp) {
    frame = null;
    if (lost || failed || suspended || document.hidden) { previousFrame = null; return; }
    if (state.playing && previousFrame !== null) state.time += Math.min(0.1, (timestamp - previousFrame) / 1000) * state.speed;
    previousFrame = state.playing ? timestamp : null;
    try {
      draw();
      if (state.playing) requestRender();
    } catch (error) {
      failed = true;
      stopFrame();
      setAvailable(false, "Rendering stopped. Reload this page to try WebGL again.");
      console.warn("Orbit rendering failed:", error.message);
    }
  }
  function syncControls() {
    play.textContent = state.playing ? "Pause" : "Play";
    play.setAttribute("aria-pressed", String(state.playing));
    tempo.value = String(state.speed);
    zoom.value = String(state.zoom);
    document.getElementById("tempo-value").textContent = state.speed.toFixed(2) + "×";
    document.getElementById("zoom-value").textContent = state.zoom.toFixed(2) + "×";
    wireframe.checked = state.wireframe;
    rain.checked = state.rain;
    shapeButtons.forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.shape) === state.shape)));
    document.getElementById("shape-name").textContent = shapeNames[state.shape];
  }
  function setShape(shape) {
    if (shape === state.shape) return;
    state.shape = shape;
    mesh = OrbitGeometry.buildMesh(shape);
    allocateMesh();
    syncControls();
    requestRender();
  }
  function togglePlay() {
    state.playing = !state.playing;
    previousFrame = null;
    syncControls();
    requestRender();
  }
  function resetCamera() {
    pointers.clear(); pinch = null;
    state.yaw = 0; state.pitch = -0.2; state.zoom = 1;
    syncControls();
    requestRender();
  }
  function reset() {
    setShape(0);
    state.time = 0; state.speed = 1; state.wireframe = false; state.rain = true;
    state.playing = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    previousFrame = null;
    resetCamera();
  }

  shapeButtons.forEach(button => button.addEventListener("click", () => setShape(Number(button.dataset.shape))));
  play.addEventListener("click", togglePlay);
  tempo.addEventListener("input", () => { state.speed = Number(tempo.value); syncControls(); requestRender(); });
  zoom.addEventListener("input", () => { state.zoom = Number(zoom.value); syncControls(); requestRender(); });
  wireframe.addEventListener("change", () => { state.wireframe = wireframe.checked; requestRender(); });
  rain.addEventListener("change", () => { state.rain = rain.checked; requestRender(); });
  document.getElementById("reset").addEventListener("click", reset);
  document.getElementById("help").addEventListener("click", () => dialog.showModal());
  function syncFullscreen() {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.textContent = active ? "Exit fullscreen" : "Fullscreen";
    fullscreenButton.setAttribute("aria-pressed", String(active));
    fullscreenButton.disabled = !fullscreenSupported || fullscreenPending;
  }
  function showImmersiveControls(visible) {
    document.documentElement.classList.toggle("controls-visible", visible && Boolean(document.fullscreenElement));
    if (!visible && document.fullscreenElement) canvas.focus({ preventScroll: true });
  }
  function toggleImmersiveControls() {
    if (document.fullscreenElement) {
      showImmersiveControls(!document.documentElement.classList.contains("controls-visible"));
    }
  }
  hideControlsButton.addEventListener("click", () => showImmersiveControls(false));
  fullscreenButton.addEventListener("click", async () => {
    if (!fullscreenSupported || fullscreenPending) return;
    fullscreenPending = true;
    fullscreenStatus.hidden = true;
    syncFullscreen();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      fullscreenStatus.textContent = "Fullscreen was denied by the browser. You can continue using Orbit here.";
      fullscreenStatus.hidden = false;
    } finally {
      fullscreenPending = false;
      syncFullscreen();
      reportSize();
      requestRender();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    pointers.clear(); pinch = null;
    showImmersiveControls(false);
    if (!document.fullscreenElement) fullscreenButton.focus({ preventScroll: true });
    syncFullscreen();
    reportSize();
    requestRender();
  });
  syncFullscreen();
  if (!fullscreenSupported) {
    fullscreenStatus.textContent = "Fullscreen is not available in this browser.";
    fullscreenStatus.hidden = false;
  }

  document.addEventListener("keydown", event => {
    if (document.fullscreenElement && event.target === canvas &&
        (event.key === "Enter" || event.key === "Tab") && !event.repeat) {
      if (event.key === "Enter") { event.preventDefault(); toggleImmersiveControls(); }
      else showImmersiveControls(true);
      return;
    }
    // Native button, slider and checkbox keyboard behavior takes precedence.
    if (dialog.open || event.altKey || event.ctrlKey || event.metaKey ||
      event.target.closest("input, button, select, textarea, a") || event.target.isContentEditable) return;
    const key = event.key.toLowerCase();
    if (key === "?") { event.preventDefault(); dialog.showModal(); return; }
    if (failed || lost || suspended || event.repeat) return;
    if ([" ", "1", "2", "3", "w", "g", "r"].includes(key)) event.preventDefault();
    else return;
    if (key === " ") togglePlay();
    else if (["1", "2", "3"].includes(key)) setShape(Number(key) - 1);
    else if (key === "w") { state.wireframe = !state.wireframe; syncControls(); requestRender(); }
    else if (key === "g") { state.rain = !state.rain; syncControls(); requestRender(); }
    else reset();
  });
  canvas.addEventListener("pointerdown", event => {
    if (((lost || failed) && !document.fullscreenElement) || pointers.size >= 2 ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
    pointers.set(event.pointerId, {
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, tap: true
    });
    canvas.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      pointers.forEach(pointer => { pointer.tap = false; });
      const [a, b] = Array.from(pointers.values());
      pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: state.zoom };
    }
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener("pointermove", event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 8) pointer.tap = false;
    // Keep tap-to-reveal/exit available even if the graphics context has failed.
    if (lost || failed) return;
    if (pointers.size === 1) {
      state.yaw += (event.clientX - pointer.x) * 0.008;
      state.pitch = clamp(state.pitch + (event.clientY - pointer.y) * 0.008, -1.4, 1.4);
    }
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (pinch && pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      state.zoom = clamp(pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance, minZoom, maxZoom);
      syncControls();
    }
    requestRender();
  });
  const endPointer = event => {
    const pointer = pointers.get(event.pointerId);
    const tap = pointer?.tap && event.type === "pointerup" &&
      Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) <= 8;
    if (!pointers.delete(event.pointerId)) return;
    pinch = null;
    if (tap) toggleImmersiveControls();
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);
  canvas.addEventListener("wheel", event => {
    if (failed || lost) return;
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    state.zoom = clamp(state.zoom * Math.exp(-delta * 0.001), minZoom, maxZoom);
    syncControls();
    requestRender();
  }, { passive: false });
  canvas.addEventListener("dblclick", resetCamera);
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    lost = true; pointers.clear(); pinch = null;
    stopFrame();
    setAvailable(false, "The graphics context was lost. Waiting for WebGL to recover…");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    initialize();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { pointers.clear(); pinch = null; stopFrame(); }
    else { previousFrame = null; requestRender(); }
  });
  // An iframe removed by Angular must not keep rendering or retain GPU resources.
  window.addEventListener("pagehide", () => { suspended = true; pointers.clear(); pinch = null; stopFrame(); release(); });
  window.addEventListener("pageshow", event => {
    if (event.persisted) { suspended = false; initialize(); }
  });
  function reportSize() {
    // Fullscreen has its own viewport; keep the embedded height unchanged until exit.
    if (document.fullscreenElement) return;
    // Measure content, not the iframe viewport. Width-based stage sizing prevents
    // a height feedback loop when the parent applies this measurement.
    const height = Math.ceil(document.querySelector(".playground").getBoundingClientRect().height);
    if (window.parent !== window && height !== reportedHeight) {
      reportedHeight = height;
      window.parent.postMessage({ type: "orbit:resize", height }, window.location.origin);
    }
  }
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(requestRender).observe(canvas);
    new ResizeObserver(reportSize).observe(document.querySelector(".playground"));
  } else {
    window.addEventListener("resize", () => { requestRender(); reportSize(); });
  }
  window.addEventListener("load", reportSize);
  reportSize();
  syncControls();
  initialize();
})();
