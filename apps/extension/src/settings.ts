import { DEFAULT_SKIN, SKINS } from "../../web/src/mascot/skins";

export interface Settings {
  enabled: boolean;
  /** Where the Tekkie server (which mints voice tokens) lives. */
  serverUrl: string;
  skinId: string;
  /** Lets Tekkie read, click, type and scroll on the page you're looking at. */
  browserControl: boolean;
  /** Lets Tekkie take a screenshot of the current tab when you ask what is on screen. */
  screenReading: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  serverUrl: "http://localhost:8787",
  skinId: DEFAULT_SKIN.id,
  browserControl: true,
  screenReading: true,
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
