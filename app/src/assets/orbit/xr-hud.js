(function (root) {
  "use strict";
  function create(gl) {
    const canvas = document.createElement("canvas");
    canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { draw() {}, dispose() {} };
    const shaders = [];
    function shader(type, text) {
      const value = gl.createShader(type); shaders.push(value);
      gl.shaderSource(value, text); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw new Error("XR status shader failed");
      return value;
    }
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, "attribute vec2 p; varying vec2 uv; void main(){uv=vec2((p.x+1.0)*0.5,1.0-(p.y+1.0)*0.5);gl_Position=vec4(p.x*0.75,p.y*0.10-0.68,0.0,1.0);}"));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, "precision mediump float; varying vec2 uv; uniform sampler2D t; void main(){gl_FragColor=texture2D(t,uv);}"));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("XR status program failed");
    const attribute = gl.getAttribLocation(program, "p"), sampler = gl.getUniformLocation(program, "t");
    const buffer = gl.createBuffer(), texture = gl.createTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    let previous = "";
    return {
      draw(lines) {
        const text = lines.join("\n");
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
        if (text !== previous) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "rgba(8,16,30,0.85)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#defff4"; ctx.font = "24px monospace";
          lines.slice(0, 3).forEach((line, index) => ctx.fillText(line.slice(0, 54), 14, 32 + index * 36));
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
          previous = text;
        }
        gl.useProgram(program); gl.uniform1i(sampler, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disableVertexAttribArray(attribute); gl.depthMask(true);
      },
      dispose() {
        gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
        shaders.forEach(value => gl.deleteShader(value));
      }
    };
  }
  root.OrbitXRHUD = { create };
})(window);
