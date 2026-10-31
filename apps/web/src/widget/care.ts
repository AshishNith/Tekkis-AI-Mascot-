// Looking after Tekkie: food, mood and energy drift down over real time, and caring for it earns
// bond points (xp) that unlock skins. Pure data so any host can store it wherever it likes.

export interface CareState {
  food: number;
  mood: number;
  energy: number;
  xp: number;
  /** When the numbers above were last brought up to date (ms). */
  at: number;
}

export const XP_PER_LEVEL = 50;

export function newCare(): CareState {
  return { food: 80, mood: 80, energy: 80, xp: 0, at: Date.now() };
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** Brings the stats up to now: hungrier, a bit lonelier and more tired as time passes. */
export function decay(s: CareState, now = Date.now()): CareState {
  const minutes = Math.max(0, (now - s.at) / 60_000);
  return {
    ...s,
    food: clamp(s.food - minutes / 6), // empty in ~10 hours
    mood: clamp(s.mood - minutes / 5),
    energy: clamp(s.energy - minutes / 8),
    at: now,
  };
}

export function levelOf(xp: number) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

export type CareAction = "feed" | "play" | "pet" | "nap" | "win";

/** Applies an action. Returns the new state, or an excuse when Tekkie can't do it right now. */
export function applyCare(s: CareState, action: CareAction): { state: CareState; excuse?: string } {
  const n = { ...s };
  switch (action) {
    case "feed":
      if (n.food > 95) return { state: s, excuse: "I'm full! Maybe later." };
      n.food = clamp(n.food + 25);
      n.mood = clamp(n.mood + 4);
      n.xp += 5;
      break;
    case "play":
      if (n.energy < 15) return { state: s, excuse: "I'm too tired to play… can I nap first?" };
      n.mood = clamp(n.mood + 20);
      n.energy = clamp(n.energy - 10);
      n.food = clamp(n.food - 4);
      n.xp += 5;
      break;
    case "pet":
      n.mood = clamp(n.mood + 8);
      n.xp += 2;
      break;
    case "nap":
      n.energy = clamp(n.energy + 35);
      n.xp += 1;
      break;
    case "win":
      n.mood = clamp(n.mood + 6);
      n.xp += 5;
      break;
  }
  return { state: n };
}
