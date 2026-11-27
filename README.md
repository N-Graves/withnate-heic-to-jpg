# withnate-heic-to-jpg

Convert an iPhone HEIC photo to a JPG or PNG, in the browser.

**Nothing is uploaded.** The photo is decoded on the page, by a WebAssembly build of libheif that
the site serves itself. No account, no storage, no AI service. Built for
[withnate.co.uk](https://withnate.co.uk/tools/heic-to-jpg/) as a drop-in: one IIFE, one stylesheet,
a `heic/` folder holding the decoder, and a demo page.

The converter's own code is MIT licensed. The decoder in `dist/heic/` is LGPL (see below).

## The decoder, and its licence

HEIC is HEVC (H.265) compressed. The decoding is done by
[libheif](https://github.com/strukturag/libheif) and [libde265](https://github.com/strukturag/libde265),
both under the GNU Lesser General Public License, built to WebAssembly by
[libheif-js](https://github.com/catdad-experiments/libheif-js) 1.23.5.

To meet the LGPL they are **not bundled into this script**. The build copies them unchanged into
`dist/heic/` as separate files:

- `libheif.js`, `libheif.wasm`: the decoder, exactly as published in the `libheif-js` npm package
- `LICENSE-libheif.txt`: the licence text
- `README.txt`: where the source is, and how to replace the files

The page loads them only when a photo is chosen, so anyone can swap them for their own build of the
same libraries. The converter only uses the decoder's public interface (`libheif()` and
`HeifDecoder`).

HEVC is covered by patents in some countries. This software comes with no patent licence.

## What it does

1. Checks the file is no bigger than 60 MB, before reading it.
2. Reads the first 64 bytes and checks it really is HEIF (an ISO `ftyp` box with a HEIF brand,
   major or compatible). A JPG, PNG, MP4 or AVIF is turned away with a plain message.
3. Loads the decoder, decodes the first picture, and checks its size from the file before any
   pixels are made: over 80 megapixels is refused. Rotation stored in the file is applied by
   libheif.
4. Saves a JPG (quality 50-100, default 92) or a PNG. A JPG has no transparency, so anything
   see-through is laid on white rather than black.

A file holding more than one picture (a burst, or an edit with its original) gives the first one,
and says so. One file at a time.

## Integration

Mounts on `data-hj`; does nothing without it. The attribute's value is the URL of the `heic/`
folder.

| Attribute | Element | Role |
|---|---|---|
| `data-hj="/assets/tools/heic/"` | any | Mount point, and where the decoder lives |
| `data-hj-drop` | any | Drop zone; must contain an `input[type=file]` |
| `data-hj-status` | any | Reading, refusals, notes |
| `data-hj-controls` | any | Hidden until a photo loads |
| `data-hj-format` | `select` | `jpeg` or `png` |
| `data-hj-quality` | `input[type=range]` 50-100 | JPG quality |
| `data-hj-quality-label` | any | Names the quality |
| `data-hj-preview` | any | The converted picture |
| `data-hj-download` | `a` | The download |
| `data-hj-reset` | `button` | Clears the photo |

The page's Content Security Policy needs `'wasm-unsafe-eval'` in `script-src`, and `blob:` in
`img-src` for the preview. The decoder build cannot fetch its own `.wasm` in a browser, so the
script fetches it from the same folder and hands the bytes over: that is its only network request.

## Checks

- `npm test`: 11 tests over `src/plan.ts`.
- `npm run prove`: switches off each of the 10 guards in turn and confirms a test fails. All 10 do.
- `npm run smoke`: one fetch only (the decoder), no storage, no module syntax, no external URLs,
  libheif not bundled, the four decoder files present, silent with no root element, and only
  `.hj-` classes in the stylesheet.

Tried in Chrome with real HEIC files, an opaque one and one with transparency.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core), bundled in.

## Licence

MIT for this repository's own code. See [LICENSE](LICENSE). The files in `dist/heic/` are LGPL; see
`dist/heic/LICENSE-libheif.txt`.
