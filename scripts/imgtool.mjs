// Ferramenta de inspecao/recorte de sprite sheets (uso interno).
//   node scripts/imgtool.mjs info <src...>
//   node scripts/imgtool.mjs crop <src> <out> <x> <y> <w> <h> [--scale N] [--bg R,G,B] [--tol T] [--grid G]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const ASSET_DIR =
  "C:\\Users\\User\\.cursor\\projects\\c-Users-User-Desktop-Nova-pasta-3-AndreVassoler\\assets\\";
const ALIASES = {
  enemies: ASSET_DIR + "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_4ccd3b35e1cd9722705bd1cf2b392a7d_images_SNES_-_Super_Mario_World_-_Enemies___Bosses_-_Various_Enemies-626a8b96-1db2-49be-97e3-2c8fc77000e4.png",
  level: ASSET_DIR + "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_4ccd3b35e1cd9722705bd1cf2b392a7d_images_SNES_-_Super_Mario_World_-_Yoshi_s_Island_Stages_-_Yoshi_s_Island_2-7247f561-857f-498e-969e-3ca96465d8bf.png",
  mario: ASSET_DIR + "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_4ccd3b35e1cd9722705bd1cf2b392a7d_images_SNES_-_Super_Mario_World_-_Playable_Characters_-_Mario-eccc3b49-4a77-4b2b-b88c-5e8eca0c706a.png",
  koopa: ASSET_DIR + "c__Users_User_AppData_Roaming_Cursor_User_workspaceStorage_4ccd3b35e1cd9722705bd1cf2b392a7d_images_SNES_-_Super_Mario_World_-_Enemies___Bosses_-_Super_Koopas-123dbe06-2322-4396-9c97-df78ec5571de.png",
};

function resolve(src) {
  return ALIASES[src] || src;
}

// pngjs.sync nao tolera bytes apos o chunk IEND (rips costumam ter lixo no fim).
// Percorremos os chunks ate o IEND e truncamos exatamente ali.
function readPngTolerant(buf) {
  let end = buf.length;
  let off = 8; // pula assinatura PNG
  try {
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString("ascii", off + 4, off + 8);
      const next = off + 12 + len; // len(4)+type(4)+data+crc(4)
      if (type === "IEND") {
        end = next;
        break;
      }
      off = next;
    }
  } catch {
    end = buf.length;
  }
  return PNG.sync.read(buf.subarray(0, end));
}

function load(src) {
  const buf = readFileSync(resolve(src));
  // JPEG?
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const { width, height, data } = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width, height, data };
  }
  return readPngTolerant(buf);
}

function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function info(srcs) {
  for (const s of srcs) {
    console.log(`${s}`);
    try {
      const img = load(s);
      const c = (x, y) => px(img, x, y).join(",");
      console.log(`  size: ${img.width} x ${img.height}`);
      console.log(`  corners TL=${c(0, 0)} TR=${c(img.width - 1, 0)} BL=${c(0, img.height - 1)} BR=${c(img.width - 1, img.height - 1)}`);
    } catch (e) {
      console.log(`  ERRO: ${e.message}`);
    }
  }
}

function chunks(src) {
  const buf = readFileSync(resolve(src));
  const sigOk = buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  console.log(`${src} bytes=${buf.length} signatureOk=${sigOk}`);
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    console.log(`  @${off} ${type} len=${len}`);
    if (type === "IEND") {
      console.log(`  IEND ends at ${off + 12 + len}, file has ${buf.length} (trailing=${buf.length - (off + 12 + len)})`);
      break;
    }
    if (len < 0 || len > buf.length) {
      console.log(`  comprimento suspeito, abortando walk`);
      break;
    }
    off += 12 + len;
  }
}

function parseFlags(args) {
  const f = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      f[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return f;
}

function crop(args) {
  const [src, out, xs, ys, ws, hs, ...rest] = args;
  const x = +xs, y = +ys, w = +ws, h = +hs;
  const flags = parseFlags(rest);
  const scale = flags.scale ? +flags.scale : 1;
  const tol = flags.tol ? +flags.tol : 16;
  const grid = flags.grid ? +flags.grid : 0;
  const bg = flags.bg ? flags.bg.split(",").map(Number) : null;

  const img = load(src);
  const ow = w * scale;
  const oh = h * scale;
  const out_ = new PNG({ width: ow, height: oh });

  for (let dy = 0; dy < oh; dy++) {
    for (let dx = 0; dx < ow; dx++) {
      const sx = x + Math.floor(dx / scale);
      const sy = y + Math.floor(dy / scale);
      const di = (dy * ow + dx) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) {
        out_.data[di + 3] = 0;
        continue;
      }
      const [r, g, b, a] = px(img, sx, sy);
      let alpha = a;
      if (bg && Math.abs(r - bg[0]) <= tol && Math.abs(g - bg[1]) <= tol && Math.abs(b - bg[2]) <= tol) {
        alpha = 0;
      }
      out_.data[di] = r;
      out_.data[di + 1] = g;
      out_.data[di + 2] = b;
      out_.data[di + 3] = alpha;
    }
  }

  // Grade de medicao (linhas a cada `grid` px de origem), desenhada por cima.
  if (grid > 0) {
    for (let gx = 0; gx <= w; gx += grid) {
      const dx = gx * scale;
      for (let dy = 0; dy < oh; dy++) {
        const di = (dy * ow + Math.min(dx, ow - 1)) * 4;
        out_.data[di] = 255; out_.data[di + 1] = 0; out_.data[di + 2] = 255; out_.data[di + 3] = 255;
      }
    }
    for (let gy = 0; gy <= h; gy += grid) {
      const dy = gy * scale;
      for (let dx = 0; dx < ow; dx++) {
        const di = (Math.min(dy, oh - 1) * ow + dx) * 4;
        out_.data[di] = 255; out_.data[di + 1] = 0; out_.data[di + 2] = 255; out_.data[di + 3] = 255;
      }
    }
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, PNG.sync.write(out_));
  console.log(`crop -> ${out} (${ow}x${oh}) from ${src} @ (${x},${y},${w},${h}) scale=${scale}${bg ? " bg-removed" : ""}`);
}

const [, , cmd, ...rest] = process.argv;
function hexToRgb(h) {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Paleta SMW Mario (aprox. autentica) para reconstruir os frames do JPEG.
const MARIO_PAL = [
  "000000", "ffffff",
  "f83800", "b81800", // vermelho cap/camisa
  "f8b888", "e09050", // pele
  "0070ec", "0040a8", // azul macacao
  "904000", "secret", // marrom (placeholder ajustado abaixo)
].filter((h) => h !== "secret").map(hexToRgb);

function snap(args) {
  const [src, out, xs, ys, ws, hs, ...rest] = args;
  const x = +xs, y = +ys, w = +ws, h = +hs;
  const f = parseFlags(rest);
  const scale = f.scale ? +f.scale : 1;
  // Multiplos tons de fundo (ex.: dois tons de teal do grid) separados por ';'
  const bgList = (f.bg || "38,110,148;22,74,104").split(";").map((s) => s.split(",").map(Number));
  const pal = f.pal ? f.pal.split(",").map(hexToRgb) : MARIO_PAL;
  // Paleta combinada: indices < pal.length sao cor real; >= sao fundo (=> transparente)
  const combined = pal.concat(bgList);
  const img = load(src);
  const ow = w * scale, oh = h * scale;
  const o = new PNG({ width: ow, height: oh });
  for (let dy = 0; dy < oh; dy++) {
    for (let dx = 0; dx < ow; dx++) {
      const sx = x + Math.floor(dx / scale);
      const sy = y + Math.floor(dy / scale);
      const di = (dy * ow + dx) * 4;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { o.data[di + 3] = 0; continue; }
      const [r, g, b] = px(img, sx, sy);
      let best = 0, bd = Infinity;
      for (let i = 0; i < combined.length; i++) {
        const dr = r - combined[i][0], dg = g - combined[i][1], db = b - combined[i][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= pal.length) { o.data[di + 3] = 0; continue; } // fundo => transparente
      o.data[di] = pal[best][0]; o.data[di + 1] = pal[best][1]; o.data[di + 2] = pal[best][2]; o.data[di + 3] = 255;
    }
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, PNG.sync.write(o));
  console.log(`snap -> ${out} (${ow}x${oh})`);
}

function bbox(args) {
  const [src, ...rest] = args;
  const f = parseFlags(rest);
  const bg = (f.bg || "0,158,0").split(",").map(Number);
  const tol = f.tol ? +f.tol : 60;
  const minPx = f.min ? +f.min : 24;
  const rx = f.x ? +f.x : 0;
  const ry = f.y ? +f.y : 0;
  const img = load(src);
  const rw = f.w ? +f.w : img.width - rx;
  const rh = f.h ? +f.h : img.height - ry;
  const isBg = (x, y) => {
    const [r, g, b, a] = px(img, x, y);
    if (a < 8) return true;
    return Math.abs(r - bg[0]) <= tol && Math.abs(g - bg[1]) <= tol && Math.abs(b - bg[2]) <= tol;
  };
  const seen = new Uint8Array(img.width * img.height);
  const boxes = [];
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const id = y * img.width + x;
      if (seen[id] || isBg(x, y)) continue;
      // flood fill 8-conex
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      const stack = [id];
      seen[id] = 1;
      while (stack.length) {
        const cur = stack.pop();
        const cy = (cur / img.width) | 0;
        const cx = cur - cy * img.width;
        count++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < rx || ny < ry || nx >= rx + rw || ny >= ry + rh) continue;
            const nid = ny * img.width + nx;
            if (seen[nid] || isBg(nx, ny)) continue;
            seen[nid] = 1;
            stack.push(nid);
          }
        }
      }
      if (count >= minPx) boxes.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count });
    }
  }
  boxes.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  console.log(`${src}: ${boxes.length} componentes (bg=${bg} tol=${tol} min=${minPx} regiao=${rx},${ry},${rw},${rh})`);
  for (const b of boxes) console.log(`  x=${b.x} y=${b.y} w=${b.w} h=${b.h} px=${b.count}`);
}

function palette(args) {
  const [src, ...rest] = args;
  const f = parseFlags(rest);
  const rx = f.x ? +f.x : 0, ry = f.y ? +f.y : 0;
  const img = load(src);
  const rw = f.w ? +f.w : img.width - rx;
  const rh = f.h ? +f.h : img.height - ry;
  const q = f.q ? +f.q : 1; // quantizacao (1 = exato)
  const counts = new Map();
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const [r, g, b, a] = px(img, x, y);
      if (a < 8) continue;
      const qr = Math.round(r / q) * q, qg = Math.round(g / q) * q, qb = Math.round(b / q) * q;
      const key = `${qr},${qg},${qb}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, f.n ? +f.n : 24);
  console.log(`${src} paleta regiao=${rx},${ry},${rw},${rh} (top ${top.length}):`);
  for (const [k, c] of top) {
    const [r, g, b] = k.split(",").map(Number);
    const hexc = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    console.log(`  ${hexc}  rgb(${k})  x${c}`);
  }
}

function hex(src) {
  const buf = readFileSync(resolve(src));
  const n = Math.min(32, buf.length);
  const h = buf.subarray(0, n).toString("hex").match(/../g).join(" ");
  const a = Array.from(buf.subarray(0, n)).map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
  console.log(`${src} bytes=${buf.length}`);
  console.log(`  hex: ${h}`);
  console.log(`  asc: ${a}`);
}

if (cmd === "info") info(rest);
else if (cmd === "hex") hex(rest[0]);
else if (cmd === "chunks") chunks(rest[0]);
else if (cmd === "bbox") bbox(rest);
else if (cmd === "palette") palette(rest);
else if (cmd === "snap") snap(rest);
else if (cmd === "crop") crop(rest);
else console.log("uso: info <src...> | chunks <src> | crop <src> <out> <x> <y> <w> <h> [--scale N] [--bg R,G,B] [--tol T] [--grid G]");
