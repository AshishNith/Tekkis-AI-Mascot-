// One command from source to an installable APK: builds the app, syncs it into the Android
// project, runs Gradle, and copies the result to ./tekkie.apk.
// Set VITE_TEKKIE_SERVER_URL to bake in a different server address.
import { execSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const android = resolve(root, "apps/mobile/android");
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });

run("npm run sync -w apps/mobile");
run(process.platform === "win32" ? "gradlew.bat assembleDebug" : "./gradlew assembleDebug", android);
copyFileSync(resolve(android, "app/build/outputs/apk/debug/app-debug.apk"), resolve(root, "tekkie.apk"));
console.log(`\nAPK ready: ${resolve(root, "tekkie.apk")}`);
