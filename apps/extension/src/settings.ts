import { DEFAULT_SKIN, SKINS, customSkin, type Skin } from "../../web/src/mascot/skins";

export interface CustomColors {
  body: number;
  visor: number;
  glow: number;
  sneaker: number;
}

export interface SiteRules {
  /** Don't show Tekkie on this site. */
  hide?: boolean;
  /** Don't let Tekkie click, type or press keys on this site. */
  noControl?: boolean;
}

export interface Settings {
  enabled: boolean;
  /** Where the Tekkie server (which mints voice tokens) lives. */
  serverUrl: string;
  skinId: string;
  /** Lets Tekkie read, click, type and scroll on the page you're looking at. */
  browserControl: boolean;
  /** Lets Tekkie take a screenshot of the current tab when you ask what is on screen. */
  screenReading: boolean;
  /** Gemini voice name; empty = the server's default. */
  voiceName: string;
  /** Reply language code (en, hi, ar...); empty = match the user. */
  language: string;
  /** Say "Hey Tekkie" to start talking. */
  wakeWord: boolean;
  /** Kid-safe tutor mode, locked with a parent PIN. */
  tutor: boolean;
  tutorPinHash: string;
  /** Size multiplier and starting corner. */
  scale: number;
  corner: "left" | "right";
  customColors: CustomColors;
  /** Per-website rules, by hostname. */
  sites: Record<string, SiteRules>;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  serverUrl: "http://localhost:8787",
  skinId: DEFAULT_SKIN.id,
  browserControl: true,
  screenReading: true,
  voiceName: "",
  language: "",
  wakeWord: false,
  tutor: false,
  tutorPinHash: "",
  scale: 1,
  corner: "right",
  customColors: { body: 0x7c5cff, visor: 0x16123a, glow: 0x7ff6ff, sneaker: 0xff4f81 },
  sites: {},
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get({ ...DEFAULT_SETTINGS });
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(patch: Partial<Settings>) {
  return chrome.storage.local.set(patch);
}

export function skinById(id: string) {
  return SKINS.find((s) => s.id === id) ?? DEFAULT_SKIN;
}

/** The skin to wear: the user's own colours, or a built-in one if it is unlocked at this bond level. */
export function resolveSkin(settings: Settings, level: number): Skin {
  if (settings.skinId === "custom") return customSkin(settings.customColors);
  const skin = skinById(settings.skinId);
  return (skin.unlockLevel ?? 1) <= level ? skin : DEFAULT_SKIN;
}

export function siteRules(settings: Settings, hostname: string): SiteRules {
  return settings.sites[hostname] ?? {};
}

// --- Things Tekkie keeps for the user: memory, notes, to-dos, reminders. ----------------------

export interface Item {
  id: string;
  text: string;
  at: number;
  done?: boolean;
  /** Reminders: when it is due. */
  due?: number;
}

export type ListName = "memory" | "notes" | "todos" | "reminders";

export async function loadList(name: ListName): Promise<Item[]> {
  const v = (await chrome.storage.local.get(name))[name];
  return Array.isArray(v) ? (v as Item[]) : [];
}

export function saveList(name: ListName, items: Item[]) {
  return chrome.storage.local.set({ [name]: items.slice(-200) });
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
