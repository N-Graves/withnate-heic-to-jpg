The HEIC decoder in this folder
===============================

libheif.js and libheif.wasm are libheif (https://github.com/strukturag/libheif),
which decodes HEIC through libde265 (https://github.com/strukturag/libde265),
built to WebAssembly by libheif-js 1.23.5
(https://github.com/catdad-experiments/libheif-js). They are copied here
unchanged from the libheif-js npm package.

Both libraries are licensed under the GNU Lesser General Public License; the
licence text is in LICENSE-libheif.txt. Source code:

- libheif:    https://github.com/strukturag/libheif
- libde265:   https://github.com/strukturag/libde265
- libheif-js: https://github.com/catdad-experiments/libheif-js (build scripts)

They are kept as separate files, loaded by the page at run time, so you can
replace them with your own build of the same libraries: put your libheif.js
and libheif.wasm here under the same names. The converter's own code (MIT) only
calls the decoder's public interface (libheif() and HeifDecoder).

HEVC, the compression inside HEIC, is covered by patents in some countries.
This software is offered without any patent licence.
