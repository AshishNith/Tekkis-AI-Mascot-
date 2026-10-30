// Starts the voice server and the web app together, on Windows, macOS and Linux.
import { spawn } from "node:child_process";

const children = ["server", "apps/web"].map((workspace) =>
  spawn(`npm run dev -w ${workspace}`, { stdio: "inherit", shell: true }),
);

function stopAll() {
  for (const child of children) if (child.exitCode === null) child.kill();
}

for (const child of children) child.on("exit", (code) => {
  stopAll();
  process.exitCode = code ?? 0;
});
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
