// Restaura os 4 frames do Koopa VERDE (casco verde) a partir de assets/work/koopa_frames.png
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const SRC = "assets/work/koopa_frames.png";
const OUT_W = 19;
const OUT_H = 19;
const PANELS = [24, 276, 516, 768];

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
const isBg = (r, g, b) => r === 0 && g === 158 && b === 0;

function bboxIn(px, maxW = 130) {
  let minX = maxW, minY = 240, maxX = -1, maxY = -1;
  for (let y = 0; y < 240; y++) for (let x = 0; x < maxW; x++) {
    const sx = px + x, sy = y;
    const j = (sy * img.width + sx) * 4;
    if (!isBg(img.data[j], img.data[j + 1], img.data[j + 2])) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function extract(box, px) {
  const data = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
    const sx = px + box.x + x, sy = box.y + y;
    const si = (sy * img.width + sx) * 4, di = (y * box.w + x) * 4;
    const r = img.data[si], g = img.data[si + 1], b = img.data[si + 2];
    if (isBg(r, g, b)) { data[di + 3] = 0; continue; }
    data[di] = r; data[di + 1] = g; data[di + 2] = b; data[di + 3] = 255;
  }
  return { w: box.w, h: box.h, data };
}

/** Downscale pixel-art: pega pixel central de cada celula (nearest). */
function downscaleNN(sub, tw, th) {
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const sx = Math.min(sub.w - 1, Math.floor((x + 0.5) * sub.w / tw));
    const sy = Math.min(sub.h - 1, Math.floor((y + 0.5) * sub.h / th));
    const s = (sy * sub.w + sx) * 4, d = (y * tw + x) * 4;
    out[d] = sub.data[s]; out[d + 1] = sub.data[s + 1]; out[d + 2] = sub.data[s + 2]; out[d + 3] = sub.data[s + 3];
  }
  return { w: tw, h: th, data: out };
}

mkdirSync("assets/sprites", { recursive: true });
mkdirSync("assets/work", { recursive: true });

PANELS.forEach((px, i) => {
  const box = bboxIn(px);
  const sub = extract(box, px);
  const scaled = downscaleNN(sub, OUT_W, OUT_H);
  const png = new PNG({ width: OUT_W, height: OUT_H });
  png.data.set(scaled.data);
  writeFileSync(`assets/sprites/koopa_${i}.png`, PNG.sync.write(png));
  // preview
  const pv = new PNG({ width: OUT_W * 10, height: OUT_H * 10 });
  for (let y = 0; y < OUT_H * 10; y++) for (let x = 0; x < OUT_W * 10; x++) {
    const s = (Math.floor(y / 10) * OUT_W + Math.floor(x / 10)) * 4, d = (y * OUT_W * 10 + x) * 4;
    pv.data[d] = scaled.data[s]; pv.data[d + 1] = scaled.data[s + 1]; pv.data[d + 2] = scaled.data[s + 2]; pv.data[d + 3] = scaled.data[s + 3];
  }
  writeFileSync(`assets/work/gk${i}.png`, PNG.sync.write(pv));
  console.log(`koopa_${i}: src ${box.w}x${box.h} @ panel ${px}`);
});
