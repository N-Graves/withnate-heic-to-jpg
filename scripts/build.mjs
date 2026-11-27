import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const banner = `/*! ${pkg.name} v${pkg.version} - ${pkg.license}
 * ${pkg.homepage}
 * Runs entirely in the browser. No uploads, no storage. Loads its decoder
 * (libheif, LGPL) from the separate heic/ folder on the same site.
 */`;

await mkdir(new URL("../dist/heic/", import.meta.url), { recursive: true });

// The decoder stays as separate, replaceable files (LGPL): copied as shipped,
// never bundled into this script.
const LIBHEIF = new URL("../node_modules/libheif-js/libheif-wasm/", import.meta.url);
for (const f of ["libheif.js", "libheif.wasm", "LICENSE"])
  await copyFile(new URL(f, LIBHEIF), new URL(`../dist/heic/${f === "LICENSE" ? "LICENSE-libheif.txt" : f}`, import.meta.url));
await copyFile(new URL("../DECODER.md", import.meta.url), new URL("../dist/heic/README.txt", import.meta.url));

const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/heic-to-jpg.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  banner: { js: banner },
  metafile: true,
});

await build({
  entryPoints: ["src/style.css"],
  outfile: "dist/heic-to-jpg.css",
  bundle: true,
  minify: false,
  banner: { css: banner },
});

const out = result.metafile.outputs["dist/heic-to-jpg.js"];
const css = await readFile(new URL("../dist/heic-to-jpg.css", import.meta.url));

await writeFile(
  new URL("../dist/BUILD.txt", import.meta.url),
  [
    `${pkg.name} v${pkg.version}`,
    `js   ${out.bytes} bytes`,
    `css  ${css.length} bytes`,
    "",
    "Drop both, and the heic/ folder, into the site's assets directory and reference them from the",
    "page. The script is a plain IIFE - no module, no defer requirement beyond",
    "the site's own convention. It does nothing unless the page contains an",
    "element with a data-hj attribute. Its value is the URL of the heic/ folder.",
    "",
  ].join("\n"),
);

console.log(`built  js ${out.bytes}B  css ${css.length}B`);
