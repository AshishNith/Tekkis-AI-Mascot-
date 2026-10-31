import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "./config.js";

// Tekkie's personality, shared with the mobile app. Locked into every voice token so a client
// can't swap it out.
export const TEKKIE_PERSONA = readFileSync(resolve(config.repoRoot, "shared/tekkie-persona.md"), "utf8").trim();
