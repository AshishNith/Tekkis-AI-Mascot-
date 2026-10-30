// A skin is just data, so new ones (store items, seasonal drops) need no character code changes.
export type Accessory = "none" | "witch-hat" | "santa-hat" | "cap";

export interface Skin {
  id: string;
  name: string;
  body: number;
  visor: number;
  glow: number;
  sneaker: number;
  sneakerStripe: number;
  sole: number;
  accessory: Accessory;
  accessoryColor: number;
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
    accessoryColor: 0,
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
  },
];

export const DEFAULT_SKIN = SKINS[0];
