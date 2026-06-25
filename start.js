/* Render entry shim.
 *
 * The TypeScript build emits dist/index.js. Render sometimes caches the
 * previously configured start command (e.g. "node dist/index.js" or
 * "npm start") even after we update render.yaml, so we normalize both
 * paths through this single shim.
 *
 * Usage:
 *   node start.js
 *   npm start
 */

const path = require("path");
const { spawn } = require("child_process");

const distEntry = path.join(__dirname, "dist", "index.js");
const child = spawn(process.execPath, [distEntry], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
