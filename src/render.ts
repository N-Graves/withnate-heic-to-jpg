import { isTooLarge, MAX_MEGAPIXELS, megapixels, mimeFor, needsMatte, type Format, type Size } from "./plan.js";

/**
 * The decoder is libheif (LGPL), built to WebAssembly by libheif-js. It is not
 * bundled into this script: it is two separate files, libheif.js and
 * libheif.wasm, loaded from the page's own site only when a photo is chosen,
 * so anyone can swap them for their own build.
 */
interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(out: ImageData, done: (data: ImageData | null) => void): void;
}
interface HeifModule {
  HeifDecoder: new () => { decode(buf: Uint8Array): HeifImage[] };
}
type Factory = (opts: { locateFile: (f: string) => string; wasmBinary: ArrayBuffer }) => Promise<HeifModule>;

let decoder: Promise<HeifModule> | null = null;

export const loadDecoder = (base: string): Promise<HeifModule> => {
  if (decoder) return decoder;
  const dir = base.endsWith("/") ? base : `${base}/`;
  decoder = new Promise<HeifModule>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${dir}libheif.js`;
    s.async = true;
    // This libheif build cannot fetch its own .wasm in a browser, so the page
    // fetches it from the same folder and hands the bytes over. It is the
    // script's only network request, and it goes to the site's own files.
    const wasm = fetch(`${dir}libheif.wasm`).then((r) => {
      if (!r.ok) throw new Error(`The HEIC decoder could not be loaded (${r.status}).`);
      return r.arrayBuffer();
    });
    s.onload = () => {
      const f = (window as unknown as { libheif?: Factory }).libheif;
      if (!f) return reject(new Error("The HEIC decoder did not load."));
      wasm.then((wasmBinary) => f({ locateFile: (name) => dir + name, wasmBinary })).then(resolve, reject);
    };
    s.onerror = () => reject(new Error("The HEIC decoder could not be loaded. Check your connection and try again."));
    document.head.appendChild(s);
  }).catch((err) => {
    decoder = null;
    throw err;
  });
  return decoder;
};

export interface Decoded {
  canvas: HTMLCanvasElement;
  size: Size;
  count: number;
}

/** Decodes the first picture in the file. The size is checked before any pixels are made. */
export const decodeHeic = async (mod: HeifModule, bytes: Uint8Array): Promise<Decoded> => {
  const images = new mod.HeifDecoder().decode(bytes);
  const first = images[0];
  if (!first) throw new Error("No picture was found inside that HEIC file.");
  const size = { width: first.get_width(), height: first.get_height() };
  if (isTooLarge(size))
    throw new Error(
      `That photo is ${Math.round(megapixels(size))} megapixels (${size.width} × ${size.height}). The limit here is ${MAX_MEGAPIXELS}.`,
    );
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser would not give us a canvas to draw on.");
  const out = ctx.createImageData(size.width, size.height);
  await new Promise<void>((resolve, reject) =>
    first.display(out, (d) => (d ? resolve() : reject(new Error("That HEIC file could not be decoded.")))),
  );
  ctx.putImageData(out, 0, 0);
  return { canvas, size, count: images.length };
};

/** The picture as a JPG or PNG. JPG is laid on white first. */
export const encode = (src: HTMLCanvasElement, f: Format, q: number): Promise<Blob> => {
  let c = src;
  if (needsMatte(f)) {
    c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("This browser would not give us a canvas to draw on.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
  }
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser could not save that image."))), mimeFor(f), q),
  );
};
