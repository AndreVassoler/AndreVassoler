// Recorta sprite isolado (fundo xadrez cinza/branco) de JPEG/PNG upscaled.
// Uso: node scripts/slice-solo.mjs <src> <out> [--canvas WxH] [--flip]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Uso: node scripts/slice-solo.mjs <src> <out> [--canvas WxH] [--flip]");
  process.exit(1);
}
const SRC = args[0];
const OUT = args[1];
let canvasSpec = null;
let flip = false;
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--flip") flip = true;
  else if (args[i] === "--canvas" && args[i + 1]) { canvasSpec = args[++i]; }
}

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
function load(path) {
  const buf = readFileSync(path);
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const { width, height, data } = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width, height, data };
  }
  const png = readPngTolerant(buf);
  return { width: png.width, height: png.height, data: png.data };
}

/** Fundo xadrez JPEG: tons neutros claros. */
function isCheckerBg(r, g, b, a = 255) {
  if (a < 8) return true;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  const avg = (r + g + b) / 3;
  return spread <= 12 && avg >= 195;
}

function bbox(img) {
  const { width: W, height: H, data } = img;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!isCheckerBg(data[i], data[i + 1], data[i + 2], data[i + 3])) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function runLengths(img, x0, y0, x1, y1, horiz) {
  const runs = [];
  if (horiz) {
    for (let y = y0; y <= y1; y += Math.max(1, Math.floor((y1 - y0) / 6))) {
      let prev = null, run = 0;
      for (let x = x0; x <= x1; x++) {
        const i = (y * img.width + x) * 4;
        const c = [img.data[i], img.data[i + 1], img.data[i + 2]];
        if (prev && Math.abs(c[0] - prev[0]) <= 2 && Math.abs(c[1] - prev[1]) <= 2 && Math.abs(c[2] - prev[2]) <= 2) run++;
        else { if (run > 0) runs.push(run); run = 1; prev = c; }
      }
      if (run > 0) runs.push(run);
    }
  } else {
    for (let x = x0; x <= x1; x += Math.max(1, Math.floor((x1 - x0) / 6))) {
      let prev = null, run = 0;
      for (let y = y0; y <= y1; y++) {
        const i = (y * img.width + x) * 4;
        const c = [img.data[i], img.data[i + 1], img.data[i + 2]];
        if (prev && Math.abs(c[0] - prev[0]) <= 2 && Math.abs(c[1] - prev[1]) <= 2 && Math.abs(c[2] - prev[2]) <= 2) run++;
        else { if (run > 0) runs.push(run); run = 1; prev = c; }
      }
      if (run > 0) runs.push(run);
    }
  }
  runs.sort((a, b) => b - a);
  const good = runs.filter((r) => r >= 8 && r <= 60);
  return good.length ? Math.round(good.reduce((a, b) => a + b, 0) / good.length) : (runs[0] || 1);
}

function extract(img, box) {
  const { minX, minY, w, h } = box;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((minY + y) * img.width + (minX + x)) * 4, di = (y * w + x) * 4;
    const r = img.data[si], g = img.data[si + 1], b = img.data[si + 2], a = img.data[si + 3];
    if (isCheckerBg(r, g, b, a)) { out[di + 3] = 0; continue; }
    out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = 255;
  }
  return { w, h, data: out };
}

function downscale(sub, targetH) {
  const F = sub.h / targetH;
  const ow = Math.max(1, Math.round(sub.w / F));
  const oh = Math.max(1, Math.round(sub.h / F));
  const sumR = new Float64Array(ow * oh), sumG = new Float64Array(ow * oh), sumB = new Float64Array(ow * oh);
  const sumA = new Float64Array(ow * oh), cnt = new Float64Array(ow * oh);
  for (let y = 0; y < sub.h; y++) {
    const oy = Math.min(oh - 1, Math.floor((y * oh) / sub.h));
    for (let x = 0; x < sub.w; x++) {
      const ox = Math.min(ow - 1, Math.floor((x * ow) / sub.w));
      const s = (y * sub.w + x) * 4, bin = oy * ow + ox;
      const a = sub.data[s + 3];
      sumR[bin] += sub.data[s] * a; sumG[bin] += sub.data[s + 1] * a; sumB[bin] += sub.data[s + 2] * a;
      sumA[bin] += a; cnt[bin] += 1;
    }
  }
  const data = new Uint8ClampedArray(ow * oh * 4);
  for (let i = 0; i < ow * oh; i++) {
    const o = i * 4;
    if (sumA[i] > 0) {
      data[o] = Math.round(sumR[i] / sumA[i]);
      data[o + 1] = Math.round(sumG[i] / sumA[i]);
      data[o + 2] = Math.round(sumB[i] / sumA[i]);
      data[o + 3] = Math.round(sumA[i] / cnt[i]);
    } else data[o + 3] = 0;
  }
  return { w: ow, h: oh, data };
}

function flipH(sub) {
  const out = new Uint8ClampedArray(sub.data.length);
  for (let y = 0; y < sub.h; y++) for (let x = 0; x < sub.w; x++) {
    const s = (y * sub.w + x) * 4, d = (y * sub.w + (sub.w - 1 - x)) * 4;
    out[d] = sub.data[s]; out[d + 1] = sub.data[s + 1]; out[d + 2] = sub.data[s + 2]; out[d + 3] = sub.data[s + 3];
  }
  return { w: sub.w, h: sub.h, data: out };
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

function writePng(path, sub) {
  const png = new PNG({ width: sub.w, height: sub.h });
  png.data.set(sub.data);
  mkdirSync("assets/sprites", { recursive: true });
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

// --- main -------------------------------------------------------------------
const img = load(SRC);
const box = bbox(img);
if (!box) { console.error("Nenhum sprite encontrado."); process.exit(1); }
console.log(`bbox: (${box.minX},${box.minY}) ${box.w}x${box.h}`);

const bx = runLengths(img, box.minX, box.minY, box.minX + box.w - 1, box.minY + box.h - 1, true);
const by = runLengths(img, box.minX, box.minY, box.minX + box.w - 1, box.minY + box.h - 1, false);
const block = Math.round((bx + by) / 2);
const nativeH = Math.max(1, Math.round(box.h / block));
const nativeW = Math.max(1, Math.round(box.w / block));
console.log(`bloco ~${block}px -> nativo ~${nativeW}x${nativeH}`);

let sub = downscale(extract(img, box), nativeH);
if (flip) sub = flipH(sub);
if (canvasSpec) {
  const [cw, ch] = canvasSpec.split("x").map(Number);
  sub = toCanvas(sub, cw, ch);
}
writePng(`assets/sprites/${OUT}.png`, sub);
preview(`assets/work/${OUT}_x8.png`, sub, 8);
console.log(`salvo: assets/sprites/${OUT}.png (${sub.w}x${sub.h})`);
