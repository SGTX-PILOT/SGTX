/**
 * Ambient module declaration for the `qrcode` package (v1.5.x), which ships
 * no bundled TypeScript declarations. Only the subset of the API used by
 * SGTX is declared here — extend as needed.
 *
 * Reference: https://github.com/soldair/node-qrcode
 */
declare module "qrcode" {
  export interface QRCodeToDataURLOptions {
    /** Pixel width of the rendered QR code (height === width — QR is square). */
    width?: number;
    /** Quiet-zone size in modules (default 4). */
    margin?: number;
    /** Error-correction level (default: M). */
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    /** Foreground (dark module) and background (light module) colors. */
    color?: { dark?: string; light?: string };
    /** Output type — included for compatibility with `toString()`. */
    type?: "png" | "svg" | "utf8";
  }

  /** Render the given text as a PNG data URL (`data:image/png;base64,...`). */
  export function toDataURL(text: string, opts?: QRCodeToDataURLOptions): Promise<string>;

  /** Render the given text as an SVG or UTF-8 string per `opts.type`. */
  export function toString(
    text: string,
    opts?: QRCodeToDataURLOptions & { type?: "svg" | "utf8" },
  ): Promise<string>;

  const _default: {
    toDataURL: typeof toDataURL;
    toString: typeof toString;
  };
  export default _default;
}
