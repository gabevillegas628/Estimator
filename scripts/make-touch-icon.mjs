// Renders public/apple-touch-icon.png from the same geometry as favicon.svg.
// iOS wants a PNG and applies its own corner mask, so this one is full-bleed:
// same wine ground, same three-segment pill, no rounded corners of its own.
//
// Written by hand rather than with a rasterizer dependency -- the artwork is
// four rectangles, and zlib is already in Node.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 180;
const SS = 3; // subsamples per axis, for the pill's rounded ends
const UNITS = 32; // the SVG's viewBox, so both icons share one coordinate space

const WINE = [0x7a, 0x3b, 0x54];
const GREEN = [0x6b, 0x8f, 0x71];
const CREAM = [0xf0, 0xee, 0xe8];
const AMBER = [0xd9, 0xa1, 0x5b];

// The pill, in viewBox units: x 4..28, y 12..20, corner radius 4.
const PILL = { x0: 4, y0: 12, x1: 28, y1: 20, r: 4 };
const SEGMENTS = [
  { until: 15, color: GREEN },
  { until: 21, color: CREAM },
  { until: 28, color: AMBER },
];

function insidePill(x, y) {
  if (x < PILL.x0 || x > PILL.x1 || y < PILL.y0 || y > PILL.y1) return false;
  const { r } = PILL;
  // Only the four corner boxes need the circle test; everything else is inside
  // by the bounds check above.
  const cx = x < PILL.x0 + r ? PILL.x0 + r : x > PILL.x1 - r ? PILL.x1 - r : x;
  const cy = y < PILL.y0 + r ? PILL.y0 + r : y > PILL.y1 - r ? PILL.y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function colorAt(x, y) {
  if (!insidePill(x, y)) return WINE;
  return (SEGMENTS.find((s) => x < s.until) ?? SEGMENTS[SEGMENTS.length - 1]).color;
}

// One raw scanline per row, each prefixed with filter type 0 (none).
const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
for (let py = 0; py < SIZE; py++) {
  const rowStart = py * (1 + SIZE * 3);
  raw[rowStart] = 0;
  for (let px = 0; px < SIZE; px++) {
    const acc = [0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const ux = ((px + (sx + 0.5) / SS) * UNITS) / SIZE;
        const uy = ((py + (sy + 0.5) / SS) * UNITS) / SIZE;
        const c = colorAt(ux, uy);
        acc[0] += c[0];
        acc[1] += c[1];
        acc[2] += c[2];
      }
    }
    const at = rowStart + 1 + px * 3;
    for (let i = 0; i < 3; i++) raw[at + i] = Math.round(acc[i] / (SS * SS));
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type 2: truecolor, no alpha
// bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync("public/apple-touch-icon.png", png);
console.log(`apple-touch-icon.png: ${SIZE}x${SIZE}, ${png.length} bytes`);
