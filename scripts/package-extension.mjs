// Builds the Chrome extension pointed at a hosted Tekkie server and zips it into the website's downloads,
// so visitors can download it straight from the site. No zip tool needed: the archive is written here.
//
//   TEKKIE_SERVER_URL=https://tekkie.onrender.com node scripts/package-extension.mjs
//
// On Render the server's own URL (RENDER_EXTERNAL_URL) is used when TEKKIE_SERVER_URL is not set.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverUrl = (process.env.TEKKIE_SERVER_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:8787").replace(/\/+$/, "");
const extDist = join(root, "apps/extension/dist");
const outDir = join(root, "apps/web/dist/downloads");
const outFile = join(outDir, "tekkie-extension.zip");

console.log(`[package-extension] building the extension for ${serverUrl}`);
execSync("npm run build -w apps/extension", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, VITE_TEKKIE_SERVER_URL: serverUrl },
});

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Everything goes under a "tekkie-extension/" folder so "Load unpacked" points at one obvious folder.
const files = walk(extDist).sort();
const local = [];
const central = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(`tekkie-extension/${relative(extDist, file).split("\\").join("/")}`, "utf8");
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data) >>> 0;
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4); // version needed
  head.writeUInt16LE(0x0800, 6); // UTF-8 names
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt32LE(0, 10); // time/date (fixed, so builds are reproducible)
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28);
  local.push(head, name, packed);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt32LE(0, 12);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(packed.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt32LE(offset, 42);
  central.push(dir, name);
  offset += head.length + name.length + packed.length;
}
const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, Buffer.concat([...local, centralBuf, end]));
const manifest = JSON.parse(readFileSync(join(extDist, "manifest.json"), "utf8"));
writeFileSync(
  join(outDir, "tekkie-extension.json"),
  JSON.stringify({ version: manifest.version, serverUrl, bytes: statSync(outFile).size, files: files.length }, null, 2),
);
console.log(`[package-extension] ${relative(root, outFile)}: ${files.length} files, ${statSync(outFile).size} bytes, v${manifest.version}`);
