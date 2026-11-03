// Starts the voice server and the web app together, on Windows, macOS and Linux.
import { spawn } from "node:child_process";

// Launchers (IDE previews, hosting panels) often inject PORT. The voice server must keep its own
// port from .env, or it would take Vite's; and Vite 8 stalls at startup when PORT is set. Both
// children get an environment without it: their ports come from .env and vite.config.ts.
const env = { ...process.env };
delete env.PORT;

// Only the server gets stdin (tsx watch restarts on "rs"); Vite stalls at startup when it shares a
// launcher's open stdin pipe with another reader.
const children = ["server", "apps/web"].map((workspace) =>
  spawn(`npm run dev -w ${workspace}`, { stdio: [workspace === "server" ? "inherit" : "ignore", "inherit", "inherit"], shell: true, env }),
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
