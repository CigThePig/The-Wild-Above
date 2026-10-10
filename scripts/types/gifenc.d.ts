// Minimal types for gifenc 1.0.3 (MIT), which ships none.
declare module "gifenc" {
  type Palette = number[][];
  interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: { palette?: Palette; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  const gifenc: {
    GIFEncoder(): Encoder;
    quantize(rgba: Uint8Array | Uint8ClampedArray, colors: number): Palette;
    applyPalette(
      rgba: Uint8Array | Uint8ClampedArray,
      palette: Palette,
    ): Uint8Array;
  };
  export default gifenc;
}
