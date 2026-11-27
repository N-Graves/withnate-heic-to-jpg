/**
 * HEIC to JPG: the decisions, as pure functions, so they test without a
 * browser. src/render.ts loads the decoder and moves pixels; src/index.ts
 * wires the page.
 */

export interface Size {
  width: number;
  height: number;
}

/** Biggest file accepted. Checked before a single byte is decoded. */
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
/** Biggest picture decoded. Checked from the file's own header, before the pixels are made. */
export const MAX_MEGAPIXELS = 80;

export const megapixels = (s: Size): number => (s.width * s.height) / 1e6;
export const isTooLarge = (s: Size): boolean => megapixels(s) > MAX_MEGAPIXELS;
export const isTooBig = (bytes: number): boolean => bytes > MAX_FILE_BYTES;

/**
 * HEIF brands an iPhone, a Samsung or a camera writes. A HEIF file is an ISO
 * box file: bytes 4-7 read "ftyp" and bytes 8-11 are the major brand.
 */
export const HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"] as const;

const ascii = (b: ArrayLike<number>, from: number, n: number): string => {
  let s = "";
  for (let i = from; i < from + n; i++) s += String.fromCharCode(b[i] ?? 0);
  return s;
};

/** True when the header is an ISO box file that declares a HEIF brand (major or compatible). */
export const looksLikeHeif = (header: ArrayLike<number>): boolean => {
  if (header.length < 16 || ascii(header, 4, 4) !== "ftyp") return false;
  const boxSize = ((header[0]! << 24) | (header[1]! << 16) | (header[2]! << 8) | header[3]!) >>> 0;
  const end = Math.min(header.length, boxSize >= 16 ? boxSize : 16);
  const brands = [ascii(header, 8, 4)];
  for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(header, i, 4));
  return brands.some((b) => (HEIF_BRANDS as readonly string[]).includes(b));
};

export type Format = "jpeg" | "png";

export const mimeFor = (f: Format): string => (f === "png" ? "image/png" : "image/jpeg");

/** JPEG has no transparency; anything see-through is laid on white, not black. */
export const needsMatte = (f: Format): boolean => f === "jpeg";

/** Quality as the browser wants it, 0..1, from the slider's 50..100. Bad input gives 0.92. */
export const quality = (slider: number): number => {
  if (!Number.isFinite(slider)) return 0.92;
  return Math.min(100, Math.max(50, Math.round(slider))) / 100;
};

export const suggestedName = (original: string, f: Format): string => {
  const dot = original.lastIndexOf(".");
  const base = (dot > 0 ? original.slice(0, dot) : original).trim() || "photo";
  return `${base}.${f === "png" ? "png" : "jpg"}`;
};
