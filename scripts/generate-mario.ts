/**
 * github-readme-mario
 * --------------------
 * Gera um banner SVG animado (FASE estilo Super Mario World) a partir do grafico
 * de contribuicoes do GitHub.
 *
 * Layout da cena (pedido do usuario): "fase de verdade" -> chao solido embaixo,
 * o grid de contribuicoes vira BLOCOS FLUTUANDO na altura do pulo, e o Mario
 * corre no chao pulando em cima de duas tartaruguinhas (Koopas).
 *
 * Sprites:
 *  - Koopa: PNG REAL (rip oficial SNES) embutido em base64 e animado por frames.
 *  - Mario: PLUGAVEL. Se existirem PNGs em assets/sprites/mario_run*.png +
 *    mario_jump.png, eles sao usados (1:1). Senao, cai num placeholder vetorial.
 *  - Tiles (bloco "?", moeda, tijolo, chao): pixel art com cores AUTENTICAS
 *    amostradas do proprio jogo.
 *
 * Uso:
 *   tsx scripts/generate-mario.ts <usuario> <saida1> [saida2 ...]
 *   # cada saida pode receber ?theme=dark para o tema escuro
 *
 * Sem GITHUB_TOKEN, usa dados de demonstracao deterministicos.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Cell {
  date: string;
  count: number;
  level: number; // 0..4
  weekday: number; // 0..6
}

interface Grid {
  weeks: Cell[][];
  total: number;
  login: string;
}

type Palette = Record<string, string>;

interface Sprite {
  w: number;
  h: number;
  href: string; // data URL
}

// ---------------------------------------------------------------------------
// Layout (unidades de usuario do SVG)
// ---------------------------------------------------------------------------

const ROWS = 7;
const PITCH = 15; // distancia entre celulas do grid flutuante
const CELL = 13; // tamanho util da celula
const MARGIN_X = 22;
const TITLE_H = 40; // faixa do titulo
const RUN_STRIP = 44; // altura da faixa onde o Mario corre (entre grid e chao)
const GROUND_H = 34; // altura do solo
const CAPTION_H = 22;

const RUN_DURATION = 10; // segundos (corrida completa esquerda -> direita)

// ---------------------------------------------------------------------------
// Temas
// ---------------------------------------------------------------------------

interface Theme {
  skyTop: string;
  skyBottom: string;
  dirt: string;
  dirtDark: string;
  dirtLight: string;
  grass: string;
  grassDark: string;
  grassMid: string;
  emptySlot: string;
  emptySlotStroke: string;
  title: string;
  titleShadow: string;
  caption: string;
  hill: string;
  hillDark: string;
  cloud: string;
  pipe: string;
  pipeDark: string;
  pipeLight: string;
  night: boolean;
}

// Cores amostradas do strip de fase: dirt #c89850, grama #00c800 / #008000.
const THEMES: Record<string, Theme> = {
  light: {
    skyTop: "#5c94fc",
    skyBottom: "#a4c8ff",
    dirt: "#c08838",
    dirtDark: "#9a6822",
    dirtLight: "#d8b070",
    grass: "#00c800",
    grassMid: "#00a800",
    grassDark: "#007000",
    emptySlot: "#ffffff22",
    emptySlotStroke: "#ffffff3a",
    title: "#fff8e7",
    titleShadow: "#1f3a93",
    caption: "#0d2a66",
    hill: "#00a800",
    hillDark: "#007000",
    cloud: "#ffffff",
    pipe: "#00c800",
    pipeDark: "#007000",
    pipeLight: "#7bf07b",
    night: false,
  },
  dark: {
    skyTop: "#0b1026",
    skyBottom: "#22305c",
    dirt: "#7a5526",
    dirtDark: "#4d3414",
    dirtLight: "#9a7038",
    grass: "#1f8a1f",
    grassMid: "#176617",
    grassDark: "#0c3f0c",
    emptySlot: "#ffffff10",
    emptySlotStroke: "#ffffff22",
    title: "#ffe27a",
    titleShadow: "#000000",
    caption: "#cfe0ff",
    hill: "#176617",
    hillDark: "#0c3f0c",
    cloud: "#c7d4ff",
    pipe: "#1f8a1f",
    pipeDark: "#0c3f0c",
    pipeLight: "#3fbf3f",
    night: true,
  },
};

// ---------------------------------------------------------------------------
// Paletas dos tiles (cores autenticas)
// ---------------------------------------------------------------------------

const PAL = {
  qblock: {
    D: "#5a3a06", // contorno
    Q: "#f8a800", // face laranja
    Z: "#c9790a", // sombra do "?"
    W: "#fff6d5", // glifo
    r: "#ffe08a", // rebites
  } as Palette,
  coin: {
    E: "#c8860b",
    C: "#fcd800",
    L: "#fff1a8",
  } as Palette,
  brick: {
    M: "#7a3b10",
    R: "#c0561c",
    H: "#e0935c",
  } as Palette,
  // Mario placeholder vetorial (usado so se nao houver PNG do Mario)
  mario: {
    H: "#e00000",
    S: "#f7b98e",
    M: "#3a2412",
    O: "#0a48d8",
    Y: "#ffd23b",
    B: "#6b3e1e",
  } as Palette,
};

// ---------------------------------------------------------------------------
// Sprites em pixel art (tiles)
// ---------------------------------------------------------------------------

const QBLOCK = [
  "DDDDDDDDDDDD",
  "DQQQQQQQQQQD",
  "DQrQQQQQQrQD",
  "DQQQWWWWQQQD",
  "DQQWWZZWWQQD",
  "DQQQQZWWQQQD",
  "DQQQQWWZQQQD",
  "DQQQQWWQQQQD",
  "DQQQQQQQQQQD",
  "DQQQQWWQQQQD",
  "DQrQQQQQQrQD",
  "DDDDDDDDDDDD",
];

const COIN = [
  "...EEEE...",
  ".EECCCCEE.",
  "EECLLLLCEE",
  "ECLLCCLLCE",
  "ECLCCCCLCE",
  "ECLCCCCLCE",
  "ECLCCCCLCE",
  "ECLCCCCLCE",
  "EECLLLLCEE",
  ".EECCCCEE.",
  "...EEEE...",
];

const BRICK = [
  "HHHHHHHHHHHH",
  "MMMMMMMMMMMM",
  "RRRRRMRRRRRM",
  "RRRRRMRRRRRM",
  "MMMMMMMMMMMM",
  "RRMRRRRRMRRR",
  "RRMRRRRRMRRR",
  "MMMMMMMMMMMM",
  "RRRRRMRRRRRM",
  "RRRRRMRRRRRM",
  "MMMMMMMMMMMM",
  "RRMRRRRRMRRR",
];

// Mario placeholder (vetorial) - substituido por PNG real quando disponivel.
const MARIO_HEAD_BODY = [
  "....HHHH....",
  "..HHHHHHHH..",
  ".HHHHHHHHHH.",
  ".MMSSSSSSMM.",
  ".SSMSSSSMSS.",
  ".SSSSSSSSSS.",
  "..MMMMMMMM..",
  "..SMMMMMMS..",
  ".HHHOOOOHHH.",
  "HHHHOYYOHHHH",
  "SHHHOOOOHHHS",
  ".SHHOOOOHHS.",
  "..OOOOOOOO..",
];
const MARIO_FRAME_A = [...MARIO_HEAD_BODY, "..OOO..OOO..", "..BBB..BBB..", ".BBBB..BBBB."];
const MARIO_FRAME_B = [...MARIO_HEAD_BODY, "..OOO..OOO..", "..BBBB.BBB..", "..BBB.BBBB.."];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const round = (n: number): number => Math.round(n * 100) / 100;

const pct = (x: number): number => round(Math.max(0, Math.min(100, x * 100)));

/** Track de opacity (steps): default OCULTO, visivel dentro das janelas. */
function onTrack(wins: Array<[number, number]>): string {
  const eps = 0.001;
  const parts = ["0% { opacity: 0; }"];
  for (const [a, b] of wins.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0])) {
    parts.push(`${pct(a)}% { opacity: 0; }`, `${round(pct(a) + eps)}% { opacity: 1; }`, `${pct(b)}% { opacity: 1; }`, `${round(pct(b) + eps)}% { opacity: 0; }`);
  }
  parts.push("100% { opacity: 0; }");
  return parts.join(" ");
}

/** Track de opacity (steps): default VISIVEL, oculto dentro das janelas. */
function offTrack(wins: Array<[number, number]>): string {
  const eps = 0.001;
  const parts = ["0% { opacity: 1; }"];
  for (const [a, b] of wins.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0])) {
    parts.push(`${pct(a)}% { opacity: 1; }`, `${round(pct(a) + eps)}% { opacity: 0; }`, `${pct(b)}% { opacity: 0; }`, `${round(pct(b) + eps)}% { opacity: 1; }`);
  }
  parts.push("100% { opacity: 1; }");
  return parts.join(" ");
}

function spriteSize(rows: string[]): { w: number; h: number } {
  return { w: rows[0].length, h: rows.length };
}

function spriteRects(rows: string[], palette: Palette): string {
  const width = rows[0].length;
  const parts: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < width) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < width && row[x + len] === ch) len++;
      parts.push(`<rect x="${x}" y="${y}" width="${len}" height="1" fill="${palette[ch]}"/>`);
      x += len;
    }
  });
  return parts.join("");
}

function spriteDef(id: string, rows: string[], palette: Palette): string {
  return `<g id="${id}">${spriteRects(rows, palette)}</g>`;
}

function cellPlacement(rows: string[], cellX: number, cellY: number, targetH: number) {
  const { w, h } = spriteSize(rows);
  const scale = targetH / h;
  return { scale, x: cellX + (CELL - w * scale) / 2, y: cellY + (CELL - h * scale) / 2 };
}

function useStatic(id: string, rows: string[], cellX: number, cellY: number, targetH: number): string {
  const { scale, x, y } = cellPlacement(rows, cellX, cellY, targetH);
  return `<use href="#${id}" transform="translate(${round(x)},${round(y)}) scale(${round(scale)})"/>`;
}

function useAnimated(id: string, rows: string[], cellX: number, cellY: number, targetH: number, cls: string, style = ""): string {
  const { scale, x, y } = cellPlacement(rows, cellX, cellY, targetH);
  const st = style ? ` style="${style}"` : "";
  return `<g transform="translate(${round(x)},${round(y)}) scale(${round(scale)})"><use href="#${id}" class="${cls}"${st}/></g>`;
}

// --- PNG embedding ----------------------------------------------------------

/** Le um PNG e retorna {w,h,href(dataURL)}; null se nao existir. */
function loadPng(relPath: string): Sprite | null {
  const p = resolve(process.cwd(), relPath);
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  if (buf.length < 24 || buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h, href: `data:image/png;base64,${buf.toString("base64")}` };
}

/** Carrega uma sequencia de frames (ex.: koopa_0..3.png). */
function loadFrames(prefix: string, max = 8): Sprite[] {
  const frames: Sprite[] = [];
  for (let i = 0; i < max; i++) {
    const s = loadPng(`assets/sprites/${prefix}_${i}.png`);
    if (!s) break;
    frames.push(s);
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Decoracoes vetoriais
// ---------------------------------------------------------------------------

function cloud(x: number, y: number, s: number, fill: string, delay: number): string {
  return `<g class="cloud" style="animation-delay:${delay}s">
    <ellipse cx="${x}" cy="${y}" rx="${22 * s}" ry="${12 * s}" fill="${fill}"/>
    <ellipse cx="${x - 16 * s}" cy="${y + 4 * s}" rx="${14 * s}" ry="${9 * s}" fill="${fill}"/>
    <ellipse cx="${x + 16 * s}" cy="${y + 4 * s}" rx="${14 * s}" ry="${9 * s}" fill="${fill}"/>
    <rect x="${x - 24 * s}" y="${y + 4 * s}" width="${48 * s}" height="${10 * s}" rx="${5 * s}" fill="${fill}"/>
  </g>`;
}

/** Morro arredondado estilo SMB (claro com base escura). */
function hill(cx: number, baseY: number, w: number, h: number, fill: string, dark: string): string {
  const r = w / 2;
  return `<g>
    <path d="M ${cx - r} ${baseY} Q ${cx} ${baseY - h} ${cx + r} ${baseY} Z" fill="${fill}"/>
    <path d="M ${cx - r} ${baseY} Q ${cx} ${baseY - h} ${cx + r} ${baseY}" fill="none" stroke="${dark}" stroke-width="2" opacity="0.5"/>
  </g>`;
}

function bush(cx: number, baseY: number, s: number, fill: string, dark: string): string {
  return `<g>
    <ellipse cx="${cx}" cy="${baseY}" rx="${16 * s}" ry="${9 * s}" fill="${fill}"/>
    <ellipse cx="${cx - 12 * s}" cy="${baseY + 2 * s}" rx="${10 * s}" ry="${7 * s}" fill="${fill}"/>
    <ellipse cx="${cx + 12 * s}" cy="${baseY + 2 * s}" rx="${10 * s}" ry="${7 * s}" fill="${fill}"/>
    <rect x="${cx - 22 * s}" y="${baseY}" width="${44 * s}" height="${6 * s}" fill="${fill}"/>
    <rect x="${cx - 22 * s}" y="${baseY + 5 * s}" width="${44 * s}" height="1.5" fill="${dark}" opacity="0.4"/>
  </g>`;
}

function pipe(x: number, baseY: number, h: number, theme: Theme): string {
  const w = 30;
  const rimW = 40;
  const top = baseY - h;
  return `<g>
    <rect x="${x - 5}" y="${top}" width="${rimW}" height="13" rx="2" fill="${theme.pipe}" stroke="${theme.pipeDark}" stroke-width="2"/>
    <rect x="${x - 2}" y="${top + 2}" width="6" height="9" fill="${theme.pipeLight}"/>
    <rect x="${x}" y="${top + 13}" width="${w}" height="${h - 13}" fill="${theme.pipe}" stroke="${theme.pipeDark}" stroke-width="2"/>
    <rect x="${x + 3}" y="${top + 13}" width="6" height="${h - 13}" fill="${theme.pipeLight}"/>
  </g>`;
}

function flagpole(x: number, baseY: number, h: number, theme: Theme): string {
  const top = baseY - h;
  return `<g>
    <rect x="${x - 1.5}" y="${top}" width="3" height="${h}" fill="${theme.night ? "#9aa" : "#cfcfcf"}"/>
    <circle cx="${x}" cy="${top}" r="4" fill="${theme.pipe}" stroke="${theme.pipeDark}" stroke-width="1.5"/>
    <g class="flag" style="transform-box:fill-box;transform-origin:right center">
      <path d="M ${x} ${top + 6} L ${x - 26} ${top + 15} L ${x} ${top + 24} Z" fill="${theme.night ? "#ffe27a" : "#ffffff"}" stroke="${theme.pipeDark}" stroke-width="1"/>
    </g>
  </g>`;
}

// ---------------------------------------------------------------------------
// CSS de frames (cicla N frames via opacity)
// ---------------------------------------------------------------------------

function frameCycleCSS(prefix: string, n: number, dur: number): string {
  if (n <= 1) return `.${prefix}0 { opacity: 1; }`;
  const seg = 100 / n;
  let css = `.${prefix}f { opacity: 0; }`;
  for (let i = 0; i < n; i++) {
    const a = round(i * seg);
    const b = round((i + 1) * seg);
    css += `
    .${prefix}${i} { animation: ${prefix}k${i} ${dur}s steps(1,end) infinite; }
    @keyframes ${prefix}k${i} { 0% { opacity: ${i === 0 ? 1 : 0}; } ${a}% { opacity: ${i === 0 ? 1 : 0}; }`;
    css += ` ${a === 0 ? 0.001 : a}% { opacity: 1; } ${b}% { opacity: 1; }`;
    if (b < 100) css += ` ${round(b + 0.001)}% { opacity: 0; } 100% { opacity: 0; }`;
    css += ` }`;
  }
  return css;
}

/** Empilha frames PNG como <image> com opacity ciclada. */
function imageFrames(frames: Sprite[], prefix: string, rendering = "pixelated"): string {
  return frames
    .map(
      (f, i) =>
        `<image class="${prefix}f ${prefix}${i}" href="${f.href}" x="0" y="0" width="${f.w}" height="${f.h}" style="image-rendering:${rendering}"/>`,
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Construcao do SVG
// ---------------------------------------------------------------------------

function buildSVG(grid: Grid, theme: Theme, sprites: { koopa: Sprite[]; marioRun: Sprite[]; marioJump: Sprite | null; marioFall: Sprite | null }): string {
  const cols = grid.weeks.length;
  const gridW = cols * PITCH;
  const gridH = ROWS * PITCH;
  const width = MARGIN_X * 2 + gridW;

  const gridTopY = TITLE_H;
  const gridBottomY = gridTopY + gridH;
  const groundTopY = gridBottomY + RUN_STRIP; // superficie do chao
  const height = groundTopY + GROUND_H + CAPTION_H;
  const baselineY = groundTopY; // pes do Mario / Koopas

  // --- Fundo --------------------------------------------------------------
  const bg: string[] = [];
  bg.push(`<rect width="${width}" height="${height}" fill="url(#sky)"/>`);
  bg.push(cloud(width * 0.14, 26, 1, theme.cloud, 0));
  bg.push(cloud(width * 0.5, 18, 0.8, theme.cloud, -3));
  bg.push(cloud(width * 0.8, 30, 1.1, theme.cloud, -6));

  // Morros e arbustos apoiados no chao
  bg.push(hill(width * 0.12, groundTopY, 150, 56, theme.hill, theme.hillDark));
  bg.push(hill(width * 0.66, groundTopY, 200, 72, theme.hillDark, theme.hillDark));
  bg.push(hill(width * 0.4, groundTopY, 120, 44, theme.hill, theme.hillDark));
  bg.push(bush(width * 0.28, groundTopY - 4, 1, theme.hill, theme.hillDark));
  bg.push(bush(width * 0.9, groundTopY - 4, 1.2, theme.hill, theme.hillDark));

  // --- Grid flutuante (a "fase" de blocos) --------------------------------
  const tiles: string[] = [];
  grid.weeks.forEach((week, w) => {
    week.forEach((cell) => {
      const cellX = MARGIN_X + w * PITCH;
      const cellY = gridTopY + cell.weekday * PITCH;
      const key = w * 7 + cell.weekday;
      switch (cell.level) {
        case 0:
          tiles.push(
            `<rect x="${round(cellX)}" y="${round(cellY)}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.emptySlot}" stroke="${theme.emptySlotStroke}" stroke-width="1"/>`,
          );
          break;
        case 1:
          tiles.push(useAnimated("s-coin", COIN, cellX, cellY, CELL * 0.9, "coin", `animation-delay:${(key % 9) * 0.13}s`));
          break;
        case 2:
          tiles.push(useAnimated("s-coin", COIN, cellX, cellY, CELL, "coin", `animation-delay:${(key % 7) * 0.11}s`));
          break;
        case 3:
          tiles.push(useStatic("s-brick", BRICK, cellX, cellY, CELL));
          break;
        default:
          tiles.push(useAnimated("s-qblock", QBLOCK, cellX, cellY, CELL, "qbob", `animation-delay:${(key % 8) * 0.18}s`));
          tiles.push(
            `<circle class="spark" cx="${round(cellX + CELL / 2)}" cy="${round(cellY - 3)}" r="1.5" fill="#fff6d5" style="animation-delay:${(key % 6) * 0.2}s"/>`,
          );
      }
    });
  });

  // --- Solo ---------------------------------------------------------------
  const ground: string[] = [];
  ground.push(`<rect x="0" y="${round(groundTopY)}" width="${width}" height="${round(height - groundTopY)}" fill="${theme.dirt}"/>`);
  // faixa de grama no topo do solo
  ground.push(`<rect x="0" y="${round(groundTopY)}" width="${width}" height="4" fill="${theme.grass}"/>`);
  ground.push(`<rect x="0" y="${round(groundTopY + 4)}" width="${width}" height="2" fill="${theme.grassDark}"/>`);
  // textura: tufos de grama + pontinhos de terra
  for (let gx = 0; gx < width; gx += 8) {
    ground.push(`<rect x="${gx}" y="${round(groundTopY)}" width="2" height="2" fill="${theme.grassMid}"/>`);
  }
  for (let gx = 6; gx < width; gx += 22) {
    ground.push(`<rect x="${gx}" y="${round(groundTopY + 12)}" width="2" height="2" fill="${theme.dirtDark}"/>`);
    ground.push(`<rect x="${gx + 11}" y="${round(groundTopY + 20)}" width="2" height="2" fill="${theme.dirtLight}"/>`);
  }

  // --- Decoracoes no chao -------------------------------------------------
  const decorations: string[] = [];
  decorations.push(pipe(width - 84, groundTopY, 38, theme));
  decorations.push(flagpole(width - 26, groundTopY, RUN_STRIP + gridH * 0.5, theme));

  // --- Koopas + Mario (sobre o chao) --------------------------------------
  const useRealMario = sprites.marioRun.length > 0;

  // Tamanho do Mario
  const marioRef = useRealMario ? sprites.marioRun[0] : { w: 12, h: 16, href: "" };
  const marioTargetH = PITCH * 2.1;
  const marioScale = marioTargetH / marioRef.h;
  const marioH = marioRef.h * marioScale;
  const marioW = marioRef.w * marioScale;
  const marioBaseY = baselineY - marioH;
  const marioStartX = -marioW - 12;
  const marioEndX = width + 12;
  const runSpan = marioEndX - marioStartX;

  // Koopas
  const hasKoopa = sprites.koopa.length > 0;
  const koopaRef = hasKoopa ? sprites.koopa[0] : { w: 19, h: 19, href: "" };
  const koopaTargetH = PITCH * 1.6;
  const koopaScale = koopaTargetH / koopaRef.h;
  const koopaW = koopaRef.w * koopaScale;
  const koopaH = koopaRef.h * koopaScale;
  const koopaTopY = baselineY - koopaH;
  const koopaXs = [MARGIN_X + gridW * 0.36, MARGIN_X + gridW * 0.64];

  const jumpHeight = marioH + koopaH * 0.5;
  const stompY = koopaH;
  const stompFractions = koopaXs.map((xc) => (xc - marioW / 2 - marioStartX) / runSpan);

  // Koopas: <g posiciona> > <use .koopaStompN amassa> > frames
  const koopas = hasKoopa
    ? koopaXs
        .map((xc, i) => {
          const x = xc - koopaW / 2;
          return `<g transform="translate(${round(x)},${round(koopaTopY)}) scale(${round(koopaScale)})"><g class="koopaStomp${i + 1}" style="transform-box:fill-box;transform-origin:bottom center"><g class="koopaFlap">${imageFrames(sprites.koopa, "ko")}</g></g></g>`;
        })
        .join("")
    : "";

  // Mario
  let marioInner: string;
  if (useRealMario) {
    const run = imageFrames(sprites.marioRun, "mr", "auto");
    const mk = (s: Sprite | null, cls: string): string =>
      s ? `<image class="${cls}" href="${s.href}" x="0" y="0" width="${s.w}" height="${s.h}" style="image-rendering:auto"/>` : "";
    marioInner = `<g transform="translate(0,${round(marioBaseY)}) scale(${round(marioScale)})"><g class="marioRunCycle">${run}</g>${mk(sprites.marioJump, "marioJumpFrame")}${mk(sprites.marioFall, "marioFallFrame")}</g>`;
  } else {
    // Placeholder vetorial (ate chegarem os prints do Mario)
    const pScale = marioTargetH / spriteSize(MARIO_FRAME_A).h;
    marioInner = `<g transform="translate(0,${round(baselineY - spriteSize(MARIO_FRAME_A).h * pScale)}) scale(${round(pScale)})">
      <g class="legA">${spriteRects(MARIO_FRAME_A, PAL.mario)}</g>
      <g class="legB">${spriteRects(MARIO_FRAME_B, PAL.mario)}</g>
    </g>`;
  }

  const mario = `<g id="mario"><g class="jump">${marioInner}</g></g>`;

  // --- Textos -------------------------------------------------------------
  const title = "Meu historico de contribuicoes - estilo Super Mario World";
  const caption = `${grid.login} - ${grid.total.toLocaleString("pt-BR")} contribuicoes no ultimo ano`;
  const texts = `
    <text x="${MARGIN_X}" y="27" class="title" fill="${theme.titleShadow}" transform="translate(1.5,1.5)">${title}</text>
    <text x="${MARGIN_X}" y="27" class="title" fill="${theme.title}">${title}</text>
    <text x="${MARGIN_X}" y="${round(height - 7)}" class="caption" fill="${theme.caption}">${caption}</text>`;

  // --- CSS ----------------------------------------------------------------
  const css = buildCSS({
    startX: marioStartX,
    endX: marioEndX,
    jump: jumpHeight,
    stomp: stompY,
    fractions: stompFractions,
    koopaFrames: sprites.koopa.length,
    marioFrames: sprites.marioRun.length,
    hasJump: !!sprites.marioJump,
    hasFall: !!sprites.marioFall,
  });

  const spriteDefs = [spriteDef("s-brick", BRICK, PAL.brick), spriteDef("s-qblock", QBLOCK, PAL.qblock), spriteDef("s-coin", COIN, PAL.coin)].join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Press Start 2P','Segoe UI',Verdana,sans-serif" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${theme.skyTop}"/>
      <stop offset="1" stop-color="${theme.skyBottom}"/>
    </linearGradient>
    ${spriteDefs}
    <style>${css}</style>
  </defs>
  ${bg.join("\n  ")}
  ${tiles.join("")}
  ${ground.join("")}
  ${decorations.join("\n  ")}
  ${koopas}
  ${mario}
  ${texts}
</svg>`;
}

interface CssOpts {
  startX: number;
  endX: number;
  jump: number;
  stomp: number;
  fractions: number[];
  koopaFrames: number;
  marioFrames: number;
  hasJump: boolean;
  hasFall: boolean;
}

function buildCSS(opts: CssOpts): string {
  const { startX, endX, jump, stomp, fractions } = opts;
  const jw = 0.06;

  const pts: Array<[number, number]> = [[0, 0]];
  for (const f of fractions) {
    pts.push([f - jw, 0]);
    pts.push([f - 0.55 * jw, -jump]);
    pts.push([f, -stomp]);
    pts.push([f + 0.42 * jw, -jump * 0.5]);
    pts.push([f + jw, 0]);
  }
  pts.push([1, 0]);
  const jumpFrames = pts
    .filter(([f]) => f >= 0 && f <= 1)
    .sort((a, b) => a[0] - b[0])
    .map(([f, y]) => `${round(f * 100)}% { transform: translateY(${round(y)}px); }`)
    .join(" ");

  const sw = 0.016;
  const squish = (f: number): string =>
    ([
      [0, 1],
      [f - sw, 1],
      [f, 0.55],
      [f + sw, 1],
      [1, 1],
    ] as Array<[number, number]>)
      .filter(([x]) => x >= 0 && x <= 1)
      .sort((a, b) => a[0] - b[0])
      .map(([x, s]) => `${round(x * 100)}% { transform: scaleY(${s}); }`)
      .join(" ");
  const squishRules = fractions
    .map(
      (f, i) =>
        `.koopaStomp${i + 1} { animation: koopaStomp${i + 1} ${RUN_DURATION}s linear infinite; }
    @keyframes koopaStomp${i + 1} { ${squish(f)} }`,
    )
    .join("\n    ");

  // Troca de pose: corre (chao) -> sobe (Jump) -> desce/pisa (Fall).
  // O apice fica em f - 0.55*jw (igual ao arco de jumpFrames).
  let jumpToggle = "";
  if (opts.marioFrames > 0) {
    const apex = 0.55 * jw;
    const offWins = fractions.map((f) => [f - jw, f + jw] as [number, number]);
    const jumpWins = fractions.map((f) => [f - jw, f - apex] as [number, number]);
    const fallWins = fractions.map((f) => [f - apex, f + jw] as [number, number]);
    jumpToggle = `
    .marioRunCycle { animation: marioRunVis ${RUN_DURATION}s steps(1,end) infinite; }
    @keyframes marioRunVis { ${offTrack(offWins)} }`;
    if (opts.hasJump) {
      jumpToggle += `
    .marioJumpFrame { opacity: 0; animation: marioJumpVis ${RUN_DURATION}s steps(1,end) infinite; }
    @keyframes marioJumpVis { ${onTrack(jumpWins)} }`;
    }
    if (opts.hasFall) {
      jumpToggle += `
    .marioFallFrame { opacity: 0; animation: marioFallVis ${RUN_DURATION}s steps(1,end) infinite; }
    @keyframes marioFallVis { ${onTrack(fallWins)} }`;
    }
  }

  const koopaFlapCSS = opts.koopaFrames > 0 ? frameCycleCSS("ko", opts.koopaFrames, 0.5) : "";
  const marioRunCSS = opts.marioFrames > 0 ? frameCycleCSS("mr", opts.marioFrames, 0.45) : "";

  return `
    .title { font-size: 12px; font-weight: 700; letter-spacing: 0.3px; }
    .caption { font-size: 10px; opacity: 0.95; }

    #mario { animation: runX ${RUN_DURATION}s linear infinite; will-change: transform; }
    #mario .jump { animation: jumpY ${RUN_DURATION}s linear infinite; }
    @keyframes runX { from { transform: translateX(${round(startX)}px); } to { transform: translateX(${round(endX)}px); } }
    @keyframes jumpY { ${jumpFrames} }

    ${squishRules}
    ${jumpToggle}
    ${koopaFlapCSS}
    ${marioRunCSS}

    .koopaFlap { transform-box: fill-box; transform-origin: bottom center; animation: koopaBob 0.5s ease-in-out infinite; }
    @keyframes koopaBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1px); } }

    .legA { animation: legA 0.28s steps(1,end) infinite; }
    .legB { animation: legB 0.28s steps(1,end) infinite; }
    @keyframes legA { 0%,49.9% { opacity: 1; } 50%,100% { opacity: 0; } }
    @keyframes legB { 0%,49.9% { opacity: 0; } 50%,100% { opacity: 1; } }

    .coin { transform-box: fill-box; transform-origin: center; animation: spin 1.2s ease-in-out infinite; }
    @keyframes spin { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.16); } }

    .qbob { transform-box: fill-box; transform-origin: center; animation: qbob 1.6s ease-in-out infinite; }
    @keyframes qbob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }

    .spark { transform-box: fill-box; transform-origin: center; animation: spark 1.1s ease-in-out infinite; }
    @keyframes spark { 0%,100% { opacity: 0.2; transform: scale(0.6); } 50% { opacity: 1; transform: scale(1.2); } }

    .cloud { animation: drift 24s ease-in-out infinite alternate; }
    @keyframes drift { from { transform: translateX(0); } to { transform: translateX(30px); } }

    .flag { animation: wave 2.4s ease-in-out infinite; }
    @keyframes wave { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.86); } }

    @media (prefers-reduced-motion: reduce) {
      #mario, #mario .jump, .legA, .legB, .coin, .qbob, .spark, .cloud, .flag,
      .koopaFlap, .koopaStomp1, .koopaStomp2, .kof, .mrf, .marioRunCycle, .marioJumpFrame, .marioFallFrame { animation: none; }
      .legB { opacity: 0; }
    }
  `;
}

// ---------------------------------------------------------------------------
// Dados: API GraphQL + fallback de demonstracao
// ---------------------------------------------------------------------------

async function fetchContributions(login: string, token: string): Promise<Grid> {
  const query = `query($login:String!){
    user(login:$login){
      contributionsCollection{
        contributionCalendar{
          totalContributions
          weeks{ contributionDays{ date contributionCount contributionLevel weekday } }
        }
      }
    }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "github-readme-mario" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GitHub API respondeu ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as any;
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const levelMap: Record<string, number> = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const weeks: Cell[][] = cal.weeks.map((wk: any) =>
    wk.contributionDays.map((d: any) => ({ date: d.date, count: d.contributionCount, level: levelMap[d.contributionLevel] ?? 0, weekday: d.weekday })),
  );
  return { weeks, total: cal.totalContributions, login };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoData(login: string): Grid {
  const rng = mulberry32(0x4d4152494f);
  const weeks: Cell[][] = [];
  const today = new Date();
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const days: Cell[] = [];
    for (let d = 0; d < 7; d++) {
      const daysAgo = (52 - w) * 7 + (6 - d);
      const date = new Date(today);
      date.setDate(today.getDate() - daysAgo);
      const weekend = d === 0 || d === 6;
      let count = 0;
      if (rng() > (weekend ? 0.74 : 0.46)) count = Math.floor(rng() * (weekend ? 6 : 13));
      if (rng() > 0.93) count += Math.floor(rng() * 18);
      const level = count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 12 ? 3 : 4;
      total += count;
      days.push({ date: date.toISOString().slice(0, 10), count, level, weekday: d });
    }
    weeks.push(days);
  }
  return { weeks, total, login };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Output {
  file: string;
  theme: Theme;
}

function parseOutput(arg: string): Output {
  const [file, qs] = arg.split("?");
  const params = new URLSearchParams(qs ?? "");
  const themeName = params.get("theme") === "dark" ? "dark" : "light";
  return { file, theme: THEMES[themeName] };
}

async function main(): Promise<void> {
  const [, , userArg, ...outputArgs] = process.argv;
  const login = userArg || "AndreVassoler";

  const outputs = (
    outputArgs.length > 0 ? outputArgs : ["dist/mario-contribution.svg", "dist/mario-contribution-dark.svg?theme=dark"]
  ).map(parseOutput);

  // Carrega sprites reais (PNG). Mario e opcional (plugavel).
  const koopa = loadFrames("koopa");
  const marioRun = loadFrames("mario_run");
  const marioJump = loadPng("assets/sprites/mario_jump.png");
  const marioFall = loadPng("assets/sprites/mario_fall.png");
  console.log(
    `[mario] sprites: koopa=${koopa.length}, marioRun=${marioRun.length}, marioJump=${marioJump ? "sim" : "nao"}, marioFall=${marioFall ? "sim" : "nao"}` +
      (marioRun.length === 0 ? " (usando Mario placeholder vetorial)" : ""),
  );

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  let grid: Grid;
  if (token) {
    try {
      grid = await fetchContributions(login, token);
      console.log(`[mario] Contribuicoes de "${login}" carregadas da API (${grid.total} no ano).`);
    } catch (err) {
      console.warn(`[mario] Falha na API, usando demo. Motivo: ${(err as Error).message}`);
      grid = demoData(login);
    }
  } else {
    console.log("[mario] GITHUB_TOKEN ausente: gerando com dados de demonstracao.");
    grid = demoData(login);
  }

  for (const out of outputs) {
    const svg = buildSVG(grid, out.theme, { koopa, marioRun, marioJump, marioFall });
    mkdirSync(dirname(out.file), { recursive: true });
    writeFileSync(out.file, svg, "utf8");
    console.log(`[mario] SVG gerado: ${out.file} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
