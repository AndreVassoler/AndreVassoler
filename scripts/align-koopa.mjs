// Alinha frames do Koopa (caminhada + casco) num canvas comum — pes na base, centralizado.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { PNG } from "pngjs";

function readPng(path) {
  const buf = readFileSync(path);
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

function trim(img) {
  const { width: w, height: h, data } = img;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 0) {
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { w: 0, h: 0, data: new Uint8ClampedArray(0) };
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const s = ((minY + y) * w + (minX + x)) * 4, d = (y * tw + x) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
  }
  return { w: tw, h: th, data: out };
}

function toCanvas(sub, cw, ch) {
  const canvas = new Uint8ClampedArray(cw * ch * 4);
  const offX = Math.floor((cw - sub.w) / 2);
  const offY = ch - sub.h;
  for (let y = 0; y < sub.h; y++) for (let x = 0; x < sub.w; x++) {
    const s = (y * sub.w + x) * 4, d = ((y + offY) * cw + (x + offX)) * 4;
    if (sub.data[s + 3] === 0) continue;
    canvas[d] = sub.data[s]; canvas[d + 1] = sub.data[s + 1]; canvas[d + 2] = sub.data[s + 2]; canvas[d + 3] = sub.data[s + 3];
  }
  return canvas;
}

function loadPrefix(prefix, dir = "assets/sprites") {
  const files = [];
  for (let i = 0; i < 16; i++) {
    const p = `${dir}/${prefix}_${i}.png`;
    try { readFileSync(p); files.push(p); } catch { break; }
  }
  return files;
}

const groups = [
  { prefix: "koopa", files: loadPrefix("koopa") },
  { prefix: "koopa_shell", files: loadPrefix("koopa_shell") },
];

const all = groups.flatMap((g) => g.files.map((p) => trim(readPng(p))));
const CW = Math.max(...all.map((s) => s.w), 1);
const CH = Math.max(...all.map((s) => s.h), 1);
console.log(`Canvas comum: ${CW}x${CH}`);

for (const { prefix, files } of groups) {
  for (const p of files) {
    const sub = trim(readPng(p));
    const png = new PNG({ width: CW, height: CH });
    png.data.set(toCanvas(sub, CW, CH));
    writeFileSync(p, PNG.sync.write(png));
    console.log(`  ${p.split("/").pop()} (${sub.w}x${sub.h} -> ${CW}x${CH})`);
  }
}
