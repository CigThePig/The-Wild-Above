// Approved Mech colours. Every token already appears in the game's art.
// Adding or changing a token changes the visual direction and needs human
// approval (AGENTS.md); specs may only reference these names.
export const PALETTE = {
  /** Standard body and leg plating. */
  sand: 0xa5a082,
  /** Light caps, trim and the hook. */
  bone: 0xd0c1a0,
  /** Dark housings, joints, pack and boots. */
  slate: 0x34413b,
  /** Cockpit canopy glass. */
  glass: 0x76c5b4,
  /** Warm coat tone shared with the pilot. */
  ochre: 0xb99b64,
  /** Pale coat highlight shared with the pilot. */
  straw: 0xd3bb8c,
} as const;
export type PaletteToken = keyof typeof PALETTE;
export const PALETTE_TOKENS = Object.keys(PALETTE) as [
  PaletteToken,
  ...PaletteToken[],
];
export const paletteHex = (token: PaletteToken) =>
  `#${PALETTE[token].toString(16).padStart(6, "0")}`;
