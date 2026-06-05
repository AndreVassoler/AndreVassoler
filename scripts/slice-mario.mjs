// Recorta as poses do Mario (Run/Jump/Fall) a partir das prints do viewer.
// - remove os 2 tons de teal (fundo externo + painel)
// - apara no contorno do sprite
// - reduz para resolucao ~nativa com media de area (remove o leve blur do screenshot)
// - alinha as 3 poses num canvas comum (pes na base, centralizado) p/ animar liso
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const DIR = "C:\\Users\\User\\.cursor\\projects\\c-Users-User-Desktop-Nova-pasta-3-AndreVassoler\\assets\\";
const RUN = DIR + "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_4ccd3b35e1cd9722705bd1cf2b392a7d_images_image-38f20b80-de10-4777-ab3a-20a0e976c64e.png";
const JF = DIR + "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_4ccd3b35e1cd9722705bd1cf2b392a7d_images_image-af546c41-dcba-4bba-9ca6-ffd3b2b43e85.png";

const TEALS = [
  [0, 148, 148],
  [0, 84, 84],
];
const TEAL_TOL = 62; // distancia p/ considerar fundo
// NATIVE=true: exporta em alta (sem downscale) e deixa o navegador reduzir (mais nitido).
// NATIVE=false: reduz aqui p/ ~TARGET_H (pixel-art chunky).
const NATIVE = true;
const TARGET_H = 30;

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
const load = (p) => readPngTolerant(readFileSync(p));
const at = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };

const isTeal = (r, g, b) =>
  TEALS.some(([tr, tg, tb]) => Math.abs(r - tr) <= TEAL_TOL && Math.abs(g - tg) <= TEAL_TOL && Math.abs(b - tb) <= TEAL_TOL);

/** Recorta o painel, remove teal -> RGBA com alpha; retorna {w,h,data} ja aparado. */
function extractPanel(img, [px, py, pw, ph]) {
  // matriz RGBA do painel com teal removido
  const data = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const [r, g, b, a] = at(img, px + x, py + y);
      const o = (y * pw + x) * 4;
      if (a < 8 || isTeal(r, g, b)) { data[o + 3] = 0; continue; }
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
    }
  }
  // bbox dos opacos
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

/** Downscale por media de area (alpha-weighted). F = fator (>1 reduz). */
function downscale(sub, F) {
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
      data[o] = sumR[i] / sumA[i]; data[o + 1] = sumG[i] / sumA[i]; data[o + 2] = sumB[i] / sumA[i];
      data[o + 3] = Math.round(sumA[i] / cnt[i]);
    } else data[o + 3] = 0;
  }
  return { w: ow, h: oh, data };
}

function writePng(path, sub) {
  const png = new PNG({ width: sub.w, height: sub.h });
  png.data.set(sub.data);
  mkdirSync("assets/sprites", { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
}

// --- pipeline ---------------------------------------------------------------
const runImg = load(RUN);
const jfImg = load(JF);

const poses = [
  { name: "mario_run_0", sub: extractPanel(runImg, [21, 68, 196, 196]) },
  { name: "mario_jump", sub: extractPanel(jfImg, [15, 63, 197, 196]) },
  { name: "mario_fall", sub: extractPanel(jfImg, [229, 63, 196, 196]) },
];
poses.forEach((p) => console.log(`  bruto ${p.name}: ${p.sub.w}x${p.sub.h}`));

// escala comum: a pose mais ALTA vira TARGET_H (ou mantem alta se NATIVE)
const Hmax = Math.max(...poses.map((p) => p.sub.h));
const F = NATIVE ? 1 : Hmax / TARGET_H;
poses.forEach((p) => (p.scaled = F === 1 ? p.sub : downscale(p.sub, F)));
poses.forEach((p) => console.log(`  escalado ${p.name}: ${p.scaled.w}x${p.scaled.h}`));

// canvas comum (centralizado horiz., pes na base)
const CW = Math.max(...poses.map((p) => p.scaled.w));
const CH = Math.max(...poses.map((p) => p.scaled.h));
for (const p of poses) {
  const canvas = { w: CW, h: CH, data: new Uint8ClampedArray(CW * CH * 4) };
  const offX = Math.floor((CW - p.scaled.w) / 2);
  const offY = CH - p.scaled.h; // base alinhada embaixo
  for (let y = 0; y < p.scaled.h; y++) for (let x = 0; x < p.scaled.w; x++) {
    const s = (y * p.scaled.w + x) * 4, d = ((y + offY) * CW + (x + offX)) * 4;
    canvas.data[d] = p.scaled.data[s]; canvas.data[d + 1] = p.scaled.data[s + 1];
    canvas.data[d + 2] = p.scaled.data[s + 2]; canvas.data[d + 3] = p.scaled.data[s + 3];
  }
  writePng(`assets/sprites/${p.name}.png`, canvas);
}
console.log(`Canvas comum: ${CW}x${CH}. Frames salvos em assets/sprites/ (mario_run0, mario_jump, mario_fall).`);
