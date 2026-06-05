// Detecta componentes conectados (sprites) na print do Koopa, isolando por forma.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const SRC = "assets/raw/koopa_src.png";
const BG = [
  [0, 192, 192, 70],
  [0, 158, 0, 55],
  [2, 42, 32, 26],
  [248, 248, 248, 14], // branco SO no fundo (borda) - tol baixo; olho do koopa fica
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
const { width: W, height: H } = img;
const isBg = (r, g, b) => BG.some(([br, bg2, bb, t]) => Math.abs(r - br) <= t && Math.abs(g - bg2) <= t && Math.abs(b - bb) <= t);

const fg = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  fg[y * W + x] = isBg(img.data[i], img.data[i + 1], img.data[i + 2]) ? 0 : 1;
}
// rotula componentes (8-neighbor) via BFS
const lab = new Int32Array(W * H).fill(0);
let next = 0;
const comps = [];
const stack = [];
for (let s = 0; s < W * H; s++) {
  if (!fg[s] || lab[s]) continue;
  next++;
  let minX = W, minY = H, maxX = -1, maxY = -1, count = 0;
  stack.push(s); lab[s] = next;
  while (stack.length) {
    const p = stack.pop();
    const x = p % W, y = (p / W) | 0;
    count++;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const np = ny * W + nx;
      if (fg[np] && !lab[np]) { lab[np] = next; stack.push(np); }
    }
  }
  comps.push({ id: next, minX, minY, maxX, maxY, count });
}
comps.sort((a, b) => b.count - a.count);
console.log(`Componentes (>=150px):`);
for (const c of comps.filter((c) => c.count >= 150))
  console.log(`  id=${c.id} bbox=(${c.minX},${c.minY},${c.maxX - c.minX + 1},${c.maxY - c.minY + 1}) px=${c.count}`);

// exporta os 3 maiores isolados (mascara pelo label), x6
mkdirSync("assets/work", { recursive: true });
const big = comps.filter((c) => c.count >= 150).slice(0, 4);
big.forEach((c, idx) => {
  const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1, scale = 6;
  const png = new PNG({ width: w * scale, height: h * scale });
  for (let y = 0; y < h * scale; y++) for (let x = 0; x < w * scale; x++) {
    const sx = c.minX + ((x / scale) | 0), sy = c.minY + ((y / scale) | 0);
    const sp = sy * W + sx, si = sp * 4, d = (y * w * scale + x) * 4;
    if (lab[sp] === c.id) { png.data[d] = img.data[si]; png.data[d + 1] = img.data[si + 1]; png.data[d + 2] = img.data[si + 2]; png.data[d + 3] = 255; }
    else png.data[d + 3] = 0;
  }
  writeFileSync(`assets/work/cc_${idx}.png`, PNG.sync.write(png));
});
console.log(`Exportados assets/work/cc_0..${big.length - 1}.png (x6, isolados por forma).`);
