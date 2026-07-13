/**
 * QR-code utility wrapper.
 *
 * Tiny typed wrapper around the `qrcode` package which ships no bundled
 * TypeScript declarations. The ambient module declaration lives in
 * `src/types/qrcode.d.ts`.
 *
 * Server-side only — the `qrcode` package reads the canvas/renderer APIs
 * which are not available in the Edge Runtime. Call this from a Node Server
 * Component or a Node route handler.
 */

import QRCode from "qrcode";

/**
 * Generate a QR code that encodes the given payload as a base64 PNG data URL.
 *
 * @param payload  The text/URL to encode.
 * @param size     Pixel width/height of the rendered QR (default 240).
 * @returns        A `data:image/png;base64,...` string suitable for `<img src>`.
 */
export async function generateQrDataUrl(payload: string, size = 240): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
