// Recorta os frames do Koopa a partir da print nativa (163x124).
// Remove SOMENTE teal/verde/verde-escuro (o branco e olho/casco do Koopa, entao fica).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const SRC = "assets/raw/koopa_src.png";
// [r,g,b,tol] por cor de fundo. verde-escuro com tol baixo p/ nao comer o preto do contorno.
const BG = [
  [0, 192, 192, 70],
  [0, 158, 0, 55],
  [2, 42, 32, 26],
];
// Regioes aproximadas de cada koopa (x,y,w,h) no original.
const REGIONS = [
  ["koopa_a", [8, 6, 46, 118]],
  ["koopa_b", [82, 6, 58, 118]],
];

function readPngTolerant(buf) {
  let end = buf.length, off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const next = off + 12 + len;
    if (type === "IEND") { end = next; break; }
    off = next;
  }
  return PNG.sync.read(buf.subarray(0, end));
}
const img = readPngTolerant(readFileSync(SRC));
const at = (x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const isBg = (r, g, b) => BG.some(([br, bg2, bb, t]) => Math.abs(r - br) <= t && Math.abs(g - bg2) <= t && Math.abs(b - bb) <= t);

function extract(region) {
  const [px, py, pw, ph] = region;
  const data = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const sx = px + x, sy = py + y;
    const o = (y * pw + x) * 4;
    if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { data[o + 3] = 0; continue; }
    const [r, g, b] = at(sx, sy);
    if (isBg(r, g, b)) { data[o + 3] = 0; continue; }
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
  }
  // trim
  let minX = pw, minY = ph, maxX = -1, maxY = -1;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (data[(y * pw + x) * 4 + 3] > 0) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((minY + y) * pw + (minX + x)) * 4, d = (y * w + x) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
  }
  return { w, h, data: out };
}

function write(path, sub) {
  const png = new PNG({ width: sub.w, height: sub.h });
  png.data.set(sub.data);
  mkdirSync("assets/work", { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}
function preview(path, sub, scale) {
  const W = sub.w * scale, H = sub.h * scale;
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (Math.floor(y / scale) * sub.w + Math.floor(x / scale)) * 4, d = (y * W + x) * 4;
    png.data[d] = sub.data[s]; png.data[d + 1] = sub.data[s + 1]; png.data[d + 2] = sub.data[s + 2]; png.data[d + 3] = sub.data[s + 3];
  }
  writeFileSync(path, PNG.sync.write(png));
}

for (const [name, region] of REGIONS) {
  const sub = extract(region);
  write(`assets/work/${name}.png`, sub);
  preview(`assets/work/${name}_x8.png`, sub, 8);
  console.log(`  ${name}: ${sub.w}x${sub.h}`);
}
