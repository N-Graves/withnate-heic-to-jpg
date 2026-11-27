import { attachIntake, formatBytes, mount, readHeaderBytes } from "@nasdigitaluk/withnate-tool-core";
import { decodeHeic, encode, loadDecoder } from "./render.js";
import { isTooBig, looksLikeHeif, MAX_FILE_BYTES, quality, suggestedName, type Format } from "./plan.js";

const q = <T extends HTMLElement>(root: HTMLElement, sel: string): T | null => root.querySelector<T>(sel);

mount("[data-hj]", ({ root }) => {
  const drop = q<HTMLElement>(root, "[data-hj-drop]");
  if (!drop) return;
  const base = root.getAttribute("data-hj") || "./heic/";
  const statusOut = q<HTMLElement>(root, "[data-hj-status]");
  const controls = q<HTMLElement>(root, "[data-hj-controls]");
  const formatIn = q<HTMLSelectElement>(root, "[data-hj-format]");
  const qualityIn = q<HTMLInputElement>(root, "[data-hj-quality]");
  const qualityLabel = q<HTMLElement>(root, "[data-hj-quality-label]");
  const preview = q<HTMLElement>(root, "[data-hj-preview]");
  const dl = q<HTMLAnchorElement>(root, "[data-hj-download]");
  const resetBtn = q<HTMLButtonElement>(root, "[data-hj-reset]");

  let picture: HTMLCanvasElement | null = null;
  let name = "photo";
  let note = "";
  let url = "";
  let request = 0;
  let debounce = 0;

  const setStatus = (text: string, kind: "info" | "error" | "" = ""): void => {
    if (!statusOut) return;
    statusOut.textContent = text;
    statusOut.className = kind ? `hj-status is-${kind}` : "hj-status";
    statusOut.hidden = text.length === 0;
  };
  const release = (): void => {
    if (url) URL.revokeObjectURL(url);
    url = "";
  };
  const show = (on: boolean): void => {
    if (controls) controls.hidden = !on;
    for (const el of [dl, resetBtn]) if (el) el.hidden = !on;
    if (!on) {
      release();
      preview?.replaceChildren();
    }
  };
  const format = (): Format => (formatIn?.value === "png" ? "png" : "jpeg");

  const run = async (): Promise<void> => {
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

  const load = async (file: File): Promise<void> => {
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
          "error",
        );
        return;
      }
      setStatus("Loading the decoder and reading the photo…", "info");
      const [mod, buf] = await Promise.all([loadDecoder(base), file.arrayBuffer()]);
      if (ticket !== request) return;
      const decoded = await decodeHeic(mod, new Uint8Array(buf));
      if (ticket !== request) return;
      picture = decoded.canvas;
      name = file.name;
      note =
        decoded.count > 1
          ? `That file holds ${decoded.count} pictures (a burst or edited copies). This is the first one.`
          : "";
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
    draggingClass: "is-dragging",
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
