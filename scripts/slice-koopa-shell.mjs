// 3 frames do casco (Koopa entrando) a partir de koopa_shell_row.png
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const SRC = "assets/raw/koopa_shell_row.png";
const BG = [0, 158, 0];
const isBg = (r, g, b) => Math.abs(r - BG[0]) <= 25 && Math.abs(g - BG[1]) <= 25 && Math.abs(b - BG[2]) <= 25;

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
// 3 cascos lado a lado (~34px cada)
const FRAMES = [[0, 0, 35, 34], [35, 0, 35, 34], [70, 0, 34, 34]];

function extract([px, py, pw, ph]) {
  let minX = pw, minY = ph, maxX = -1, maxY = -1;
  const raw = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const si = ((py + y) * img.width + (px + x)) * 4, di = (y * pw + x) * 4;
    const r = img.data[si], g = img.data[si + 1], b = img.data[si + 2];
    if (isBg(r, g, b)) { raw[di + 3] = 0; continue; }
    raw[di] = r; raw[di + 1] = g; raw[di + 2] = b; raw[di + 3] = 255;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((minY + y) * pw + (minX + x)) * 4, d = (y * w + x) * 4;
    out[d] = raw[s]; out[d + 1] = raw[s + 1]; out[d + 2] = raw[s + 2]; out[d + 3] = raw[s + 3];
  }
  return { w, h, data: out };
}

function toCanvas(sub, cw, ch) {
  const canvas = { w: cw, h: ch, data: new Uint8ClampedArray(cw * ch * 4) };
  const offX = Math.floor((cw - sub.w) / 2);
  const offY = ch - sub.h;
  for (let y = 0; y < sub.h; y++) for (let x = 0; x < sub.w; x++) {
    const s = (y * sub.w + x) * 4, d = ((y + offY) * cw + (x + offX)) * 4;
    canvas.data[d] = sub.data[s]; canvas.data[d + 1] = sub.data[s + 1];
    canvas.data[d + 2] = sub.data[s + 2]; canvas.data[d + 3] = sub.data[s + 3];
  }
  return canvas;
}

mkdirSync("assets/sprites", { recursive: true });
const sizes = [];
for (let i = 0; i < FRAMES.length; i++) {
  const sub = extract(FRAMES[i]);
  const cw = Math.max(32, sub.w), ch = Math.max(34, sub.h);
  const canvas = toCanvas(sub, cw, ch);
  const png = new PNG({ width: cw, height: ch });
  png.data.set(canvas.data);
  writeFileSync(`assets/sprites/koopa_shell_${i}.png`, PNG.sync.write(png));
  sizes.push(`${cw}x${ch}`);
  console.log(`koopa_shell_${i}: ${sub.w}x${sub.h} -> canvas ${cw}x${ch}`);
}
console.log("salvo em assets/sprites/koopa_shell_0..2.png");
