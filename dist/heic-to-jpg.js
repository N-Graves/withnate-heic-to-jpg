/*! withnate-heic-to-jpg v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-heic-to-jpg#readme
 * Runs entirely in the browser. No uploads, no storage. Loads its decoder
 * (libheif, LGPL) from the separate heic/ folder on the same site.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var HEADER_BYTES = 64 * 1024;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/units.js
  var MM_PER_INCH = 25.4;
  var CM_PER_INCH = MM_PER_INCH / 10;
  var roundTo = (value, dp) => {
    const f = 10 ** dp;
    return Math.round(value * f) / f;
  };
  var formatBytes = (n) => {
    if (!Number.isFinite(n) || n < 0)
      return "\u2014";
    if (n < 1e3)
      return `${Math.round(n)} B`;
    const kb = Math.round(n / 1e3);
    if (kb < 1e3)
      return `${kb} KB`;
    return `${roundTo(n / 1e6, 1)} MB`;
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var MAX_BLOCK_BYTES = 4 * 1024 * 1024;
  var TEXT = new TextDecoder("utf-8", { fatal: false });

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/intake.js
  var DEFAULT_DRAGGING_CLASS = "is-dragging";
  var attachIntake = (root, opts) => {
    const draggingClass = opts.draggingClass ?? DEFAULT_DRAGGING_CLASS;
    const input = root.querySelector('input[type="file"]');
    const accept = (file) => {
      if (!file)
        return;
      if (opts.maxBytes && file.size > opts.maxBytes) {
        opts.onReject?.(`That file is ${formatBytes(file.size)}. The limit here is ${formatBytes(opts.maxBytes)}.`);
        return;
      }
      if (file.size === 0) {
        opts.onReject?.("That file is empty.");
        return;
      }
      opts.onFile(file);
    };
    const onDragEnter = (e) => {
      e.preventDefault();
      root.classList.add(draggingClass);
    };
    const onDragOver = (e) => {
      e.preventDefault();
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e) => {
      if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget))
        return;
      root.classList.remove(draggingClass);
    };
    const onDrop = (e) => {
      e.preventDefault();
      root.classList.remove(draggingClass);
      accept(e.dataTransfer?.files?.[0]);
    };
    const onChange = () => {
      accept(input?.files?.[0]);
      if (input)
        input.value = "";
    };
    const onPaste = (e) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file");
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        accept(file);
      }
    };
    root.addEventListener("dragenter", onDragEnter);
    root.addEventListener("dragover", onDragOver);
    root.addEventListener("dragleave", onDragLeave);
    root.addEventListener("drop", onDrop);
    input?.addEventListener("change", onChange);
    document.addEventListener("paste", onPaste);
    return () => {
      root.removeEventListener("dragenter", onDragEnter);
      root.removeEventListener("dragover", onDragOver);
      root.removeEventListener("dragleave", onDragLeave);
      root.removeEventListener("drop", onDrop);
      input?.removeEventListener("change", onChange);
      document.removeEventListener("paste", onPaste);
      root.classList.remove(draggingClass);
    };
  };
  var readHeaderBytes = async (file, n = HEADER_BYTES) => {
    const buf = await file.slice(0, n).arrayBuffer();
    return new Uint8Array(buf);
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => globalThis.WN ?? null;
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // src/plan.ts
  var MAX_FILE_BYTES = 60 * 1024 * 1024;
  var MAX_MEGAPIXELS = 80;
  var megapixels = (s) => s.width * s.height / 1e6;
  var isTooLarge = (s) => megapixels(s) > MAX_MEGAPIXELS;
  var isTooBig = (bytes) => bytes > MAX_FILE_BYTES;
  var HEIF_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];
  var ascii = (b, from, n) => {
    let s = "";
    for (let i = from; i < from + n; i++) s += String.fromCharCode(b[i] ?? 0);
    return s;
  };
  var looksLikeHeif = (header) => {
    if (header.length < 16 || ascii(header, 4, 4) !== "ftyp") return false;
    const boxSize = (header[0] << 24 | header[1] << 16 | header[2] << 8 | header[3]) >>> 0;
    const end = Math.min(header.length, boxSize >= 16 ? boxSize : 16);
    const brands = [ascii(header, 8, 4)];
    for (let i = 16; i + 4 <= end; i += 4) brands.push(ascii(header, i, 4));
    return brands.some((b) => HEIF_BRANDS.includes(b));
  };
  var mimeFor = (f) => f === "png" ? "image/png" : "image/jpeg";
  var needsMatte = (f) => f === "jpeg";
  var quality = (slider) => {
    if (!Number.isFinite(slider)) return 0.92;
    return Math.min(100, Math.max(50, Math.round(slider))) / 100;
  };
  var suggestedName = (original, f) => {
    const dot = original.lastIndexOf(".");
    const base = (dot > 0 ? original.slice(0, dot) : original).trim() || "photo";
    return `${base}.${f === "png" ? "png" : "jpg"}`;
  };

  // src/render.ts
  var decoder = null;
  var loadDecoder = (base) => {
    if (decoder) return decoder;
    const dir = base.endsWith("/") ? base : `${base}/`;
    decoder = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${dir}libheif.js`;
      s.async = true;
      const wasm = fetch(`${dir}libheif.wasm`).then((r) => {
        if (!r.ok) throw new Error(`The HEIC decoder could not be loaded (${r.status}).`);
        return r.arrayBuffer();
      });
      s.onload = () => {
        const f = window.libheif;
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
  var decodeHeic = async (mod, bytes) => {
    const images = new mod.HeifDecoder().decode(bytes);
    const first = images[0];
    if (!first) throw new Error("No picture was found inside that HEIC file.");
    const size = { width: first.get_width(), height: first.get_height() };
    if (isTooLarge(size))
      throw new Error(
        `That photo is ${Math.round(megapixels(size))} megapixels (${size.width} \xD7 ${size.height}). The limit here is ${MAX_MEGAPIXELS}.`
      );
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser would not give us a canvas to draw on.");
    const out = ctx.createImageData(size.width, size.height);
    await new Promise(
      (resolve, reject) => first.display(out, (d) => d ? resolve() : reject(new Error("That HEIC file could not be decoded.")))
    );
    ctx.putImageData(out, 0, 0);
    return { canvas, size, count: images.length };
  };
  var encode = (src, f, q2) => {
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
    return new Promise(
      (resolve, reject) => c.toBlob((b) => b ? resolve(b) : reject(new Error("The browser could not save that image.")), mimeFor(f), q2)
    );
  };

  // src/index.ts
  var q = (root, sel) => root.querySelector(sel);
  mount("[data-hj]", ({ root }) => {
    const drop = q(root, "[data-hj-drop]");
    if (!drop) return;
    const base = root.getAttribute("data-hj") || "./heic/";
    const statusOut = q(root, "[data-hj-status]");
    const controls = q(root, "[data-hj-controls]");
    const formatIn = q(root, "[data-hj-format]");
    const qualityIn = q(root, "[data-hj-quality]");
    const qualityLabel = q(root, "[data-hj-quality-label]");
    const preview = q(root, "[data-hj-preview]");
    const dl = q(root, "[data-hj-download]");
    const resetBtn = q(root, "[data-hj-reset]");
    let picture = null;
    let name = "photo";
    let note = "";
    let url = "";
    let request = 0;
    let debounce = 0;
    const setStatus = (text, kind = "") => {
      if (!statusOut) return;
      statusOut.textContent = text;
      statusOut.className = kind ? `hj-status is-${kind}` : "hj-status";
      statusOut.hidden = text.length === 0;
    };
    const release = () => {
      if (url) URL.revokeObjectURL(url);
      url = "";
    };
    const show = (on) => {
      if (controls) controls.hidden = !on;
      for (const el of [dl, resetBtn]) if (el) el.hidden = !on;
      if (!on) {
        release();
        preview?.replaceChildren();
      }
    };
    const format = () => formatIn?.value === "png" ? "png" : "jpeg";
    const run = async () => {
      if (!picture) return;
      const ticket = ++request;
      const f = format();
      const qv = quality(Number(qualityIn?.value ?? 92));
      if (qualityIn) qualityIn.disabled = f === "png";
      if (qualityLabel) qualityLabel.textContent = f === "png" ? "Quality: PNG is lossless" : `Quality: ${Math.round(qv * 100)}`;
      try {
        const blob = await encode(picture, f, qv);
        if (ticket !== request) return;
        release();
        url = URL.createObjectURL(blob);
        const img = document.createElement("img");
        img.className = "hj-picture";
        img.alt = "Your converted photo";
        img.src = url;
        preview?.replaceChildren(img);
        if (dl) {
          dl.href = url;
          dl.download = suggestedName(name, f);
          dl.textContent = `Download ${f === "png" ? "PNG" : "JPG"} (${formatBytes(blob.size)})`;
        }
        setStatus(note, note ? "info" : "");
      } catch (err) {
        if (ticket !== request) return;
        setStatus(err instanceof Error ? err.message : "That photo could not be saved.", "error");
      }
    };
    const load = async (file) => {
      const ticket = ++request;
      show(false);
      picture = null;
      if (isTooBig(file.size)) {
        setStatus(`That file is ${formatBytes(file.size)}. The limit here is ${formatBytes(MAX_FILE_BYTES)}.`, "error");
        return;
      }
      try {
        if (!looksLikeHeif(await readHeaderBytes(file, 64))) {
          setStatus(
            "That file is not a HEIC photo. If it is already a JPG or PNG there is nothing to convert; the image compressor can make it smaller.",
            "error"
          );
          return;
        }
        setStatus("Loading the decoder and reading the photo\u2026", "info");
        const [mod, buf] = await Promise.all([loadDecoder(base), file.arrayBuffer()]);
        if (ticket !== request) return;
        const decoded = await decodeHeic(mod, new Uint8Array(buf));
        if (ticket !== request) return;
        picture = decoded.canvas;
        name = file.name;
        note = decoded.count > 1 ? `That file holds ${decoded.count} pictures (a burst or edited copies). This is the first one.` : "";
        show(true);
        await run();
      } catch (err) {
        if (ticket !== request) return;
        setStatus(err instanceof Error ? err.message : "That file could not be read as a HEIC photo.", "error");
        show(false);
      }
    };
    attachIntake(drop, {
      onFile: (f) => void load(f),
      onReject: (reason) => setStatus(reason, "error"),
      draggingClass: "is-dragging"
    });
    formatIn?.addEventListener("change", () => void run());
    qualityIn?.addEventListener("input", () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void run(), 150);
    });
    resetBtn?.addEventListener("click", () => {
      request += 1;
      picture = null;
      show(false);
      setStatus("");
    });
    show(false);
  });
})();
