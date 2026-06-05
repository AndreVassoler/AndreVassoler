// Mario jump ORIGINAL (print pequena do viewer, assets/raw/mario_jump_orig.png)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const SRC = "assets/raw/mario_jump_orig.png";
const TEALS = [[0, 148, 148], [0, 84, 84]];
const TOL = 62;

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
const isTeal = (r, g, b) => TEALS.some(([tr, tg, tb]) => Math.abs(r - tr) <= TOL && Math.abs(g - tg) <= TOL && Math.abs(b - tb) <= TOL);

let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
  const i = (y * img.width + x) * 4;
  const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
  if (isTeal(r, g, b)) continue;
  if (r < 20 && g < 20 && b < 20) continue; // texto "jump"
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const w = maxX - minX + 1, h = maxY - minY + 1;
const sub = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const si = ((minY + y) * img.width + (minX + x)) * 4, di = (y * w + x) * 4;
  const r = img.data[si], g = img.data[si + 1], b = img.data[si + 2];
  if (isTeal(r, g, b)) { sub[di + 3] = 0; continue; }
  sub[di] = r; sub[di + 1] = g; sub[di + 2] = b; sub[di + 3] = 255;
}
console.log(`mario jump bruto: ${w}x${h}`);

// canvas comum com run/fall (66x90)
const CW = 66, CH = 90;
const canvas = new Uint8ClampedArray(CW * CH * 4);
const offX = Math.floor((CW - w) / 2), offY = CH - h;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const s = (y * w + x) * 4, d = ((y + offY) * CW + (x + offX)) * 4;
  canvas[d] = sub[s]; canvas[d + 1] = sub[s + 1]; canvas[d + 2] = sub[s + 2]; canvas[d + 3] = sub[s + 3];
}
mkdirSync("assets/sprites", { recursive: true });
const png = new PNG({ width: CW, height: CH });
png.data.set(canvas);
writeFileSync("assets/sprites/mario_jump.png", PNG.sync.write(png));
console.log(`salvo: assets/sprites/mario_jump.png (${CW}x${CH})`);
