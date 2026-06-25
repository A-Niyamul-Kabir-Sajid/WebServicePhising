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
