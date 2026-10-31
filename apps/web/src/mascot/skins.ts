// A skin is just data, so new ones (store items, seasonal drops) need no character code changes.
export type Accessory = "none" | "witch-hat" | "santa-hat" | "cap" | "crown" | "glasses" | "bow" | "scarf";

export const ACCESSORIES: { id: Accessory; name: string; icon: string; unlockLevel?: number }[] = [
  { id: "none", name: "Nothing", icon: "✨" },
  { id: "glasses", name: "Glasses", icon: "👓" },
  { id: "cap", name: "Cap", icon: "🧢", unlockLevel: 2 },
  { id: "bow", name: "Bow", icon: "🎀", unlockLevel: 2 },
  { id: "scarf", name: "Scarf", icon: "🧣", unlockLevel: 3 },
  { id: "witch-hat", name: "Witch hat", icon: "🎃", unlockLevel: 3 },
  { id: "santa-hat", name: "Santa hat", icon: "🎅", unlockLevel: 4 },
  { id: "crown", name: "Crown", icon: "👑", unlockLevel: 5 },
];

export interface Skin {
  id: string;
  name: string;
  /** Shell (robot), hoodie (buddy) or fur (critter). */
  body: number;
  /** Screen (robot), hair (buddy) or inner ears and belly (critter). */
  visor: number;
  /** Eyes. */
  glow: number;
  sneaker: number;
  sneakerStripe: number;
  sole: number;
  accessory: Accessory;
  accessoryColor: number;
  /** Buddy's skin tone (defaults to a warm beige). */
  skinTone?: number;
  /** Bond level (from looking after Tekkie) needed to wear this skin. */
  unlockLevel?: number;
}

export const SKINS: Skin[] = [
  {
    id: "classic",
    name: "Classic",
    body: 0x7c5cff,
    visor: 0x16123a,
    glow: 0x7ff6ff,
    sneaker: 0xff4f81,
    sneakerStripe: 0xffffff,
    sole: 0xf4f4f4,
    accessory: "none",
    accessoryColor: 0xff4f81,
  },
  {
    id: "street",
    name: "Street",
    body: 0x1fc7a5,
    visor: 0x0d2a2a,
    glow: 0xd8ff6b,
    sneaker: 0x222222,
    sneakerStripe: 0xd8ff6b,
    sole: 0xffffff,
    accessory: "cap",
    accessoryColor: 0xff6b35,
    unlockLevel: 2,
  },
  {
    id: "halloween",
    name: "Pumpkin",
    body: 0xff8a1f,
    visor: 0x1c0f05,
    glow: 0xffd23f,
    sneaker: 0x3b1f5c,
    sneakerStripe: 0x9dff6b,
    sole: 0x111111,
    accessory: "witch-hat",
    accessoryColor: 0x2a1840,
    unlockLevel: 3,
  },
  {
    id: "festive",
    name: "Festive",
    body: 0xe8364f,
    visor: 0x22080d,
    glow: 0xfff3c4,
    sneaker: 0x1f8f4e,
    sneakerStripe: 0xffffff,
    sole: 0xffffff,
    accessory: "santa-hat",
    accessoryColor: 0xd91f35,
    unlockLevel: 4,
  },
  {
    id: "galaxy",
    name: "Galaxy",
    body: 0x2b2d7a,
    visor: 0x05051a,
    glow: 0xff7cf5,
    sneaker: 0x7cf5ff,
    sneakerStripe: 0xff7cf5,
    sole: 0x111133,
    accessory: "none",
    accessoryColor: 0x7cf5ff,
    unlockLevel: 5,
  },
  {
    id: "gold",
    name: "Gold",
    body: 0xf2c14e,
    visor: 0x2a1b05,
    glow: 0xffffff,
    sneaker: 0x111111,
    sneakerStripe: 0xf2c14e,
    sole: 0xffffff,
    accessory: "crown",
    accessoryColor: 0x111111,
    unlockLevel: 6,
  },
];

/** A skin made from the user's own colours (always available). */
export function customSkin(colors: { body: number; visor: number; glow: number; sneaker: number }): Skin {
  return { id: "custom", name: "Custom", ...colors, sneakerStripe: 0xffffff, sole: 0xf4f4f4, accessory: "none", accessoryColor: colors.sneaker };
}

export const DEFAULT_SKIN = SKINS[0];
