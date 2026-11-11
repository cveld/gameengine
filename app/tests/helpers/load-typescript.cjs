const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("../../node_modules/typescript");
module.exports = function load(file, overrides = {}) {
  const filename = path.resolve(file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.CommonJS, experimentalDecorators: true }
  }).outputText;
  const value = new Module(filename);
  value.filename = filename; value.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = value.require.bind(value);
  value.require = id => {
    if (Object.prototype.hasOwnProperty.call(overrides, id)) return overrides[id];
    const local = path.resolve(path.dirname(filename), id + ".ts");
    if (id.startsWith(".") && fs.existsSync(local)) return load(local, overrides);
    return originalRequire(id);
  };
  value._compile(compiled, filename);
  return value.exports;
};
