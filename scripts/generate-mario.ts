/**
 * github-readme-mario
 * --------------------
 * Gera um banner SVG animado (estilo Super Mario World) a partir do grafico de
 * contribuicoes do GitHub. Cada quadradinho do "contribution graph" vira um
 * elemento da fase (bloco "?", moeda, bloco de solo ou inimigo) e o Mario corre
 * e pula por cima da fase em pixel art.
 *
 * Uso:
 *   tsx scripts/generate-mario.ts <usuario> <saida1> [saida2 ...]
 *   # cada saida pode receber ?theme=dark para o tema escuro
 *
 * Sem GITHUB_TOKEN no ambiente, o script cai num gerador de dados de
 * demonstracao (deterministico) para que o SVG possa ser visualizado localmente.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Cell {
  date: string;
  count: number;
  /** 0 = nenhuma contribuicao ... 4 = maior intensidade */
  level: number;
  /** 0 (domingo) ... 6 (sabado) */
  weekday: number;
}

interface Grid {
  weeks: Cell[][];
  total: number;
  login: string;
}

type Palette = Record<string, string>;

// ---------------------------------------------------------------------------
// Layout (em unidades de usuario do SVG)
// ---------------------------------------------------------------------------

const ROWS = 7; // dias da semana
const PITCH = 19; // distancia entre o inicio de uma celula e a proxima
const CELL = 15; // tamanho util de cada celula (PITCH - GAP)
const MARGIN_X = 24; // margem lateral
const MARGIN_TOP = 80; // espaco para titulo + ceu + altura do pulo
const MARGIN_BOTTOM = 48; // espaco para o solo + legenda

// Duracao da animacao principal (corrida do Mario da esquerda para a direita).
const RUN_DURATION = 14; // segundos
const JUMP_PERIOD = 1.75; // segundos por ciclo de pulo (14 / 1.75 = 8 pulos)

// ---------------------------------------------------------------------------
// Temas de cor
// ---------------------------------------------------------------------------

interface Theme {
  skyTop: string;
  skyBottom: string;
  groundTop: string;
  groundBody: string;
  groundSeam: string;
  emptySlot: string;
  emptySlotStroke: string;
  title: string;
  titleShadow: string;
  caption: string;
  hill: string;
  hillDark: string;
  cloud: string;
}

const THEMES: Record<string, Theme> = {
  light: {
    skyTop: "#5c94fc", // azul ceu classico do Mario
    skyBottom: "#9fc6ff",
    groundTop: "#e39b4b",
    groundBody: "#b5651d",
    groundSeam: "#7a4416",
    emptySlot: "#ffffff22",
    emptySlotStroke: "#ffffff44",
    title: "#fff8e7",
    titleShadow: "#1f3a93",
    caption: "#0d2a66",
    hill: "#3aa93a",
    hillDark: "#2a7a2a",
    cloud: "#ffffff",
  },
  dark: {
    skyTop: "#0b1026",
    skyBottom: "#1b2a55",
    groundTop: "#7a4416",
    groundBody: "#4d2c10",
    groundSeam: "#2c1808",
    emptySlot: "#ffffff10",
    emptySlotStroke: "#ffffff20",
    title: "#ffe27a",
    titleShadow: "#000000",
    caption: "#cfe0ff",
    hill: "#1d5e2a",
    hillDark: "#123c1b",
    cloud: "#c7d4ff",
  },
};

// ---------------------------------------------------------------------------
// Paletas dos sprites (compartilhadas entre os temas: Mario continua vermelho)
// ---------------------------------------------------------------------------

const PAL = {
  mario: {
    H: "#e23b2e", // bone/camisa vermelho
    S: "#f7b98e", // pele
    M: "#3a2412", // cabelo / bigode
    O: "#2b57c9", // macacao azul
    Y: "#ffd23b", // botoes dourados
    B: "#6b3e1e", // sapatos
  } as Palette,
  goomba: {
    K: "#8a4b23", // corpo marrom
    T: "#d9a066", // parte de baixo (tan)
    W: "#ffffff", // olho
    E: "#2a1a0e", // pupila
    F: "#3a2412", // pes
  } as Palette,
  koopa: {
    D: "#1b5e20", // verde escuro (borda do casco)
    g: "#43a047", // verde do casco
    W: "#a5d6a7", // manchas claras
    Y: "#f4c430", // pes
  } as Palette,
  qblock: {
    D: "#8a5a10", // contorno
    Q: "#f7a50c", // face laranja
    Z: "#c9790a", // sombra do "?"
    W: "#fff6d5", // glifo "?"
    r: "#ffe08a", // rebites
  } as Palette,
  coin: {
    E: "#c8860b", // borda
    C: "#ffce34", // ouro
    L: "#fff1a8", // brilho
  } as Palette,
  brick: {
    M: "#6e3a1a", // argamassa
    R: "#c56a33", // tijolo
    H: "#e0935c", // brilho superior
  } as Palette,
  groundBlock: {
    t: "#e39b4b", // topo
    g: "#c57a2e", // corpo
    D: "#8a5018", // textura
  } as Palette,
  star: {
    O: "#e0a21a", // contorno
    Y: "#ffe14d", // amarelo
    W: "#fffbe0", // brilho
  } as Palette,
};

// ---------------------------------------------------------------------------
// Sprites em pixel art (cada string = 1 linha; "." = transparente)
// ---------------------------------------------------------------------------

// Base do Mario (cabeca + tronco) - 12 colunas. As pernas mudam por quadro.
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

// Quadro A da corrida (pernas afastadas)
const MARIO_FRAME_A = [
  ...MARIO_HEAD_BODY,
  "..OOO..OOO..",
  "..BBB..BBB..",
  ".BBBB..BBBB.",
];

// Quadro B da corrida (passada)
const MARIO_FRAME_B = [
  ...MARIO_HEAD_BODY,
  "..OOO..OOO..",
  "..BBBB.BBB..",
  "..BBB.BBBB..",
];

const GOOMBA = [
  "...KKKKKK...",
  ".KKKKKKKKKK.",
  "KKKKKKKKKKKK",
  ".WW.KKKK.WW.",
  ".WE.KKKK.EW.",
  "KKKKKKKKKKKK",
  "TTTTTTTTTTTT",
  "TTTTTTTTTTTT",
  ".TTTTTTTTTT.",
  "FFF......FFF",
  "FFF......FFF",
];

const GOOMBA_SQUASHED = [
  "..KKKKKKKK..",
  "KKTTTTTTTTKK",
  "TTTTTTTTTTTT",
  "FFF......FFF",
];

const KOOPA_SHELL = [
  "..DDDDDD..",
  ".DggggggD.",
  "DgWggggWgD",
  "DggggggggD",
  "DgWggggWgD",
  "DggggggggD",
  ".DggggggD.",
  "..DDDDDD..",
  ".YY....YY.",
];

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

const GROUND_BLOCK = [
  "tttttttttttt",
  "tttttttttttt",
  "gggggggggggg",
  "ggDgggggggDg",
  "gggggggggggg",
  "gDgggggggDgg",
  "gggggggggggg",
  "ggggDgggDggg",
  "gggggggggggg",
  "gDggggggggDg",
  "gggggggggggg",
  "DDDDDDDDDDDD",
];

const STAR = [
  ".....YY.....",
  ".....YY.....",
  "....YYYY....",
  "YYYYYYYYYYYY",
  ".YYYYWWYYYY.",
  "..YYYYYYYY..",
  "..YYYYYYYY..",
  ".YYYY..YYYY.",
  ".YYY....YYY.",
  "YYO......OYY",
];

// ---------------------------------------------------------------------------
// Utilidades de renderizacao
// ---------------------------------------------------------------------------

const round = (n: number): number => Math.round(n * 100) / 100;

function spriteSize(rows: string[]): { w: number; h: number } {
  return { w: rows[0].length, h: rows.length };
}

/**
 * Converte um sprite (matriz de caracteres) em <rect>, unindo sequencias
 * horizontais de mesma cor para reduzir o tamanho do SVG. Coordenadas saem em
 * "pixels" do sprite (1 unidade = 1 pixel); o posicionamento/escala fica a cargo
 * do grupo que o envolve.
 */
function spriteRects(rows: string[], palette: Palette): string {
  const width = rows[0].length;
  const parts: string[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(
        `Sprite invalido: largura esperada ${width}, recebida ${row.length} na linha "${row}"`,
      );
    }
    let x = 0;
    while (x < width) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let len = 1;
      while (x + len < width && row[x + len] === ch) len++;
      parts.push(
        `<rect x="${x}" y="${y}" width="${len}" height="1" fill="${palette[ch]}"/>`,
      );
      x += len;
    }
  });
  return parts.join("");
}

interface PlaceOpts {
  x: number;
  y: number;
  scale: number;
  cls?: string;
  id?: string;
  style?: string;
}

/** Envolve o conteudo de um sprite em um grupo posicionado e escalado. */
function placeGroup(inner: string, opts: PlaceOpts): string {
  const attrs = [
    opts.id ? `id="${opts.id}"` : "",
    opts.cls ? `class="${opts.cls}"` : "",
    `transform="translate(${round(opts.x)},${round(opts.y)}) scale(${round(opts.scale)})"`,
    opts.style ? `style="${opts.style}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<g ${attrs}>${inner}</g>`;
}

/** Posiciona um sprite numa celula, centralizado horizontalmente e apoiado na base. */
function placeInCell(
  rows: string[],
  palette: Palette,
  cellX: number,
  cellY: number,
  targetH: number,
  extra: Partial<PlaceOpts> = {},
): string {
  const { w, h } = spriteSize(rows);
  const scale = targetH / h;
  const x = cellX + (CELL - w * scale) / 2;
  const y = cellY + (CELL - h * scale); // apoia na base da celula
  return placeGroup(spriteRects(rows, palette), { x, y, scale, ...extra });
}

// --- Reuso via <defs>/<use> --------------------------------------------------
// Tiles que se repetem centenas de vezes (solo, tijolo, bloco "?", moeda,
// Goomba, Koopa) sao definidos UMA vez em <defs> e referenciados com <use>,
// reduzindo o tamanho do SVG em ~5x.

/** Define um sprite reutilizavel dentro de <defs>. */
function spriteDef(id: string, rows: string[], palette: Palette): string {
  return `<g id="${id}">${spriteRects(rows, palette)}</g>`;
}

function cellPlacement(rows: string[], cellX: number, cellY: number, targetH: number, yOffset: number) {
  const { w, h } = spriteSize(rows);
  const scale = targetH / h;
  return {
    scale,
    x: cellX + (CELL - w * scale) / 2,
    y: cellY + (CELL - h * scale) + yOffset,
  };
}

/** <use> estatico (sem animacao): posiciona via atributo transform. */
function useStatic(id: string, rows: string[], cellX: number, cellY: number, targetH: number, yOffset = 0): string {
  const { scale, x, y } = cellPlacement(rows, cellX, cellY, targetH, yOffset);
  return `<use href="#${id}" transform="translate(${round(x)},${round(y)}) scale(${round(scale)})"/>`;
}

/**
 * <use> animado: um <g> faz a posicao (atributo) e o <use> recebe a classe CSS.
 * A separacao em dois niveis e necessaria porque a animacao CSS (transform)
 * sobrescreveria o transform de posicionamento se estivessem no mesmo elemento.
 */
function useAnimated(
  id: string,
  rows: string[],
  cellX: number,
  cellY: number,
  targetH: number,
  cls: string,
  style = "",
  yOffset = 0,
): string {
  const { scale, x, y } = cellPlacement(rows, cellX, cellY, targetH, yOffset);
  const st = style ? ` style="${style}"` : "";
  return `<g transform="translate(${round(x)},${round(y)}) scale(${round(scale)})"><use href="#${id}" class="${cls}"${st}/></g>`;
}

// ---------------------------------------------------------------------------
// Decoracoes vetoriais (nuvens, morros, cano, mastro)
// ---------------------------------------------------------------------------

function cloud(x: number, y: number, s: number, fill: string, delay: number): string {
  const c = `<g class="cloud" style="animation-delay:${delay}s">
    <ellipse cx="${x}" cy="${y}" rx="${22 * s}" ry="${12 * s}" fill="${fill}"/>
    <ellipse cx="${x - 16 * s}" cy="${y + 4 * s}" rx="${14 * s}" ry="${9 * s}" fill="${fill}"/>
    <ellipse cx="${x + 16 * s}" cy="${y + 4 * s}" rx="${14 * s}" ry="${9 * s}" fill="${fill}"/>
    <rect x="${x - 24 * s}" y="${y + 4 * s}" width="${48 * s}" height="${10 * s}" rx="${5 * s}" fill="${fill}"/>
  </g>`;
  return c;
}

function hill(x: number, baseY: number, w: number, h: number, fill: string): string {
  return `<path d="M ${x} ${baseY} Q ${x + w / 2} ${baseY - h} ${x + w} ${baseY} Z" fill="${fill}"/>`;
}

function pipe(x: number, baseY: number, h: number): string {
  const w = 34;
  const rimW = 44;
  const top = baseY - h;
  return `<g>
    <rect x="${x - 1}" y="${top}" width="${rimW}" height="14" rx="3" fill="#2e9e2e"/>
    <rect x="${x - 1}" y="${top}" width="${rimW}" height="14" rx="3" fill="none" stroke="#1c6b1c" stroke-width="2"/>
    <rect x="${x + 4}" y="${top + 13}" width="${w}" height="${h - 13}" fill="#34b534"/>
    <rect x="${x + 4}" y="${top + 13}" width="8" height="${h - 13}" fill="#6fe06f"/>
    <rect x="${x + 4}" y="${top + 13}" width="${w}" height="${h - 13}" fill="none" stroke="#1c6b1c" stroke-width="2"/>
  </g>`;
}

function flagpole(x: number, baseY: number, h: number, theme: Theme): string {
  const top = baseY - h;
  return `<g>
    <rect x="${x - 2}" y="${top}" width="4" height="${h}" fill="#bdbdbd"/>
    <circle cx="${x}" cy="${top}" r="5" fill="#2e9e2e" stroke="#1c6b1c" stroke-width="1.5"/>
    <g class="flag">
      <path d="M ${x} ${top + 8} L ${x - 30} ${top + 18} L ${x} ${top + 28} Z" fill="${theme === THEMES.dark ? "#ffe27a" : "#2e9e2e"}" stroke="#1c6b1c" stroke-width="1"/>
    </g>
  </g>`;
}

// ---------------------------------------------------------------------------
// Construcao do SVG
// ---------------------------------------------------------------------------

function buildSVG(grid: Grid, theme: Theme): string {
  const cols = grid.weeks.length;
  const gridW = cols * PITCH;
  const gridH = ROWS * PITCH;
  const width = MARGIN_X * 2 + gridW;
  const height = MARGIN_TOP + gridH + MARGIN_BOTTOM;

  const groundTopY = MARGIN_TOP + gridH + 6; // topo do solo
  const baselineY = MARGIN_TOP + gridH - 2; // onde os pes do Mario descansam

  // --- Camadas de fundo ---------------------------------------------------
  const bg: string[] = [];
  bg.push(`<rect width="${width}" height="${height}" fill="url(#sky)"/>`);

  // Nuvens
  bg.push(cloud(width * 0.16, 34, 1, theme.cloud, 0));
  bg.push(cloud(width * 0.52, 24, 0.8, theme.cloud, -3));
  bg.push(cloud(width * 0.83, 40, 1.1, theme.cloud, -6));

  // Morros atras do grid
  bg.push(hill(width * 0.05, groundTopY, 150, 60, theme.hillDark));
  bg.push(hill(width * 0.62, groundTopY, 190, 74, theme.hill));
  bg.push(hill(width * 0.3, groundTopY, 120, 48, theme.hill));

  // --- Tiles do grid (a "fase") ------------------------------------------
  const tiles: string[] = [];
  const enemies: string[] = [];
  const coinsAndBlocks: string[] = [];

  // Escolhe uma celula proxima ao centro com nivel baixo para o Goomba "pisado".
  let squashTarget: { w: number; d: number } | null = null;
  const centerW = Math.floor(cols / 2);
  outer: for (let radius = 0; radius < cols; radius++) {
    for (const w of [centerW - radius, centerW + radius]) {
      if (w < 0 || w >= cols) continue;
      for (const cell of grid.weeks[w]) {
        if (cell.level <= 1) {
          squashTarget = { w, d: cell.weekday };
          break outer;
        }
      }
    }
  }

  grid.weeks.forEach((week, w) => {
    week.forEach((cell) => {
      const cellX = MARGIN_X + w * PITCH;
      const cellY = MARGIN_TOP + cell.weekday * PITCH;
      const key = w * 7 + cell.weekday;
      const isSquash =
        squashTarget && squashTarget.w === w && squashTarget.d === cell.weekday;

      switch (cell.level) {
        case 0: {
          // Dia vazio: slot apagado. Espalha alguns inimigos pelos dias barren.
          tiles.push(
            `<rect x="${round(cellX)}" y="${round(cellY)}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.emptySlot}" stroke="${theme.emptySlotStroke}" stroke-width="1"/>`,
          );
          if (isSquash) {
            enemies.push(
              placeInCell(GOOMBA_SQUASHED, PAL.goomba, cellX, cellY, CELL * 0.42),
            );
            enemies.push(impactSparks(cellX + CELL / 2, cellY + CELL - 3));
          } else if (key % 11 === 3) {
            enemies.push(useAnimated("s-koopa", KOOPA_SHELL, cellX, cellY, CELL * 0.95, "waddle"));
          }
          break;
        }
        case 1: {
          // Contribuicao baixa: bloco de solo, frequentemente com um inimigo.
          tiles.push(useStatic("s-ground", GROUND_BLOCK, cellX, cellY, CELL));
          if (isSquash) {
            enemies.push(
              placeInCell(GOOMBA_SQUASHED, PAL.goomba, cellX, cellY - CELL, CELL * 0.42),
            );
            enemies.push(impactSparks(cellX + CELL / 2, cellY - 3));
          } else if (key % 5 === 0) {
            // Goomba apoiado em cima do bloco de solo (yOffset = -CELL).
            enemies.push(
              useAnimated("s-goomba", GOOMBA, cellX, cellY, CELL * 0.92, "waddle", `animation-delay:${(key % 7) * 0.1}s`, -CELL),
            );
          }
          break;
        }
        case 2: {
          // Contribuicao media: moeda girando.
          coinsAndBlocks.push(
            useAnimated("s-coin", COIN, cellX, cellY, CELL * 0.92, "coin", `animation-delay:${(key % 9) * 0.13}s`),
          );
          break;
        }
        case 3: {
          // Contribuicao alta: bloco de tijolos.
          coinsAndBlocks.push(useStatic("s-brick", BRICK, cellX, cellY, CELL));
          break;
        }
        default: {
          // Contribuicao maxima: bloco "?" pulsando + brilho de estrela.
          coinsAndBlocks.push(
            useAnimated("s-qblock", QBLOCK, cellX, cellY, CELL, "qbob", `animation-delay:${(key % 8) * 0.18}s`),
          );
          coinsAndBlocks.push(
            `<circle class="spark" cx="${round(cellX + CELL / 2)}" cy="${round(cellY - 3)}" r="1.6" fill="#fff6d5" style="animation-delay:${(key % 6) * 0.2}s"/>`,
          );
        }
      }
    });
  });

  // Trilha de moedas seguindo o arco do pulo (parte superior do grid)
  const coinTrail: string[] = [];
  const trailCount = 7;
  for (let i = 0; i < trailCount; i++) {
    const tx = MARGIN_X + gridW * (0.28 + (i / trailCount) * 0.4);
    const arc = Math.sin((i / (trailCount - 1)) * Math.PI);
    const ty = MARGIN_TOP + 6 + (1 - arc) * 26;
    const trailScale = (CELL * 0.78) / spriteSize(COIN).h;
    coinTrail.push(
      `<g transform="translate(${round(tx)},${round(ty)}) scale(${round(trailScale)})"><use href="#s-coin" class="coin" style="animation-delay:${i * 0.12}s"/></g>`,
    );
  }

  // --- Solo na base -------------------------------------------------------
  const groundH = height - groundTopY;
  const ground: string[] = [];
  ground.push(
    `<rect x="0" y="${round(groundTopY)}" width="${width}" height="${round(groundH)}" fill="${theme.groundBody}"/>`,
  );
  ground.push(
    `<rect x="0" y="${round(groundTopY)}" width="${width}" height="5" fill="${theme.groundTop}"/>`,
  );
  for (let gx = 0; gx < width; gx += 16) {
    ground.push(
      `<rect x="${gx}" y="${round(groundTopY + 5)}" width="2" height="${round(groundH - 5)}" fill="${theme.groundSeam}" opacity="0.5"/>`,
    );
  }

  // Cano e mastro de bandeira no fim da fase
  const decorations: string[] = [];
  decorations.push(pipe(width - 96, groundTopY + 1, 40));
  decorations.push(flagpole(width - 30, groundTopY + 1, gridH + 30, theme));

  // --- Mario animado ------------------------------------------------------
  const marioScale = (PITCH * 2.3) / spriteSize(MARIO_FRAME_A).h;
  const marioH = spriteSize(MARIO_FRAME_A).h * marioScale;
  const marioBaseY = baselineY - marioH; // topo do sprite com pes na baseline
  const marioStartX = -spriteSize(MARIO_FRAME_A).w * marioScale - 10;
  const marioEndX = width + 10;
  const jumpHeight = PITCH * 2.7;

  // Estrutura aninhada: #mario (eixo X) > .jump (eixo Y) > sprite (escala/base).
  const marioSprite = `
    <g transform="translate(0,${round(marioBaseY)}) scale(${round(marioScale)})">
      <g class="legA">${spriteRects(MARIO_FRAME_A, PAL.mario)}</g>
      <g class="legB">${spriteRects(MARIO_FRAME_B, PAL.mario)}</g>
    </g>`;

  // Estrela que acompanha o Mario (a "trilha de estrelas")
  const trailStar = placeGroup(spriteRects(STAR, PAL.star), {
    x: -PITCH * 1.4,
    y: marioBaseY - PITCH * 0.6,
    scale: (PITCH * 1.1) / spriteSize(STAR).h,
    cls: "starspin",
  });

  const mario = `
  <g id="mario">
    <g class="jump">
      ${trailStar}
      ${marioSprite}
    </g>
  </g>`;

  // --- Textos -------------------------------------------------------------
  const title = "Meu Historico de Contribuicoes (Estilo Mario)";
  const caption = `${grid.login} • ${grid.total.toLocaleString("pt-BR")} contribuicoes no ultimo ano`;
  const texts = `
    <text x="${MARGIN_X}" y="34" class="title" fill="${theme.titleShadow}" transform="translate(2,2)">${title}</text>
    <text x="${MARGIN_X}" y="34" class="title" fill="${theme.title}">${title}</text>
    <text x="${MARGIN_X}" y="${round(height - 16)}" class="caption" fill="${theme.caption}">${caption}</text>`;

  // --- CSS / animacoes ----------------------------------------------------
  const css = buildCSS(marioStartX, marioEndX, jumpHeight);

  // Sprites reutilizaveis (definidos uma vez, referenciados por <use>).
  const spriteDefs = [
    spriteDef("s-ground", GROUND_BLOCK, PAL.groundBlock),
    spriteDef("s-brick", BRICK, PAL.brick),
    spriteDef("s-qblock", QBLOCK, PAL.qblock),
    spriteDef("s-coin", COIN, PAL.coin),
    spriteDef("s-goomba", GOOMBA, PAL.goomba),
    spriteDef("s-koopa", KOOPA_SHELL, PAL.koopa),
  ].join("");

  // --- Montagem final -----------------------------------------------------
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
  ${coinsAndBlocks.join("")}
  ${coinTrail.join("")}
  ${enemies.join("")}
  ${ground.join("")}
  ${decorations.join("\n  ")}
  ${mario}
  ${texts}
</svg>`;
}

function impactSparks(cx: number, cy: number): string {
  return `<g class="spark">
    <circle cx="${round(cx - 5)}" cy="${round(cy - 4)}" r="1.4" fill="#fff6d5"/>
    <circle cx="${round(cx + 5)}" cy="${round(cy - 4)}" r="1.4" fill="#fff6d5"/>
    <circle cx="${round(cx)}" cy="${round(cy - 7)}" r="1.2" fill="#fff6d5"/>
  </g>`;
}

function buildCSS(startX: number, endX: number, jump: number): string {
  return `
    .title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
    .caption { font-size: 11px; opacity: 0.92; }

    #mario { animation: runX ${RUN_DURATION}s linear infinite; will-change: transform; }
    #mario .jump { animation: jumpY ${JUMP_PERIOD}s ease-in-out infinite; }

    @keyframes runX {
      from { transform: translateX(${round(startX)}px); }
      to   { transform: translateX(${round(endX)}px); }
    }
    @keyframes jumpY {
      0%   { transform: translateY(0); }
      8%   { transform: translateY(-${round(jump * 0.55)}px); }
      18%  { transform: translateY(-${round(jump)}px); }
      28%  { transform: translateY(-${round(jump * 0.55)}px); }
      36%  { transform: translateY(0); }
      100% { transform: translateY(0); }
    }

    .legA { animation: legA 0.32s steps(1,end) infinite; }
    .legB { animation: legB 0.32s steps(1,end) infinite; }
    @keyframes legA { 0%,49.9% { opacity: 1; } 50%,100% { opacity: 0; } }
    @keyframes legB { 0%,49.9% { opacity: 0; } 50%,100% { opacity: 1; } }

    .coin { transform-box: fill-box; transform-origin: center; animation: spin 1.2s ease-in-out infinite; }
    @keyframes spin { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.16); } }

    .starspin { transform-box: fill-box; transform-origin: center; animation: starspin 2.2s linear infinite; }
    @keyframes starspin { to { transform: rotate(360deg); } }

    .qbob { transform-box: fill-box; transform-origin: center; animation: qbob 1.6s ease-in-out infinite; }
    @keyframes qbob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }

    .waddle { transform-box: fill-box; transform-origin: bottom center; animation: waddle 0.7s ease-in-out infinite; }
    @keyframes waddle { 0%,100% { transform: translateX(-0.6px); } 50% { transform: translateX(0.6px); } }

    .spark { transform-box: fill-box; transform-origin: center; animation: spark 1.1s ease-in-out infinite; }
    @keyframes spark { 0%,100% { opacity: 0.2; transform: scale(0.6); } 50% { opacity: 1; transform: scale(1.2); } }

    .cloud { animation: drift 24s ease-in-out infinite alternate; }
    @keyframes drift { from { transform: translateX(0); } to { transform: translateX(34px); } }

    .flag { transform-box: fill-box; transform-origin: right center; animation: wave 2.4s ease-in-out infinite; }
    @keyframes wave { 0%,100% { transform: scaleX(1); } 50% { transform: scaleX(0.86); } }

    @media (prefers-reduced-motion: reduce) {
      #mario, #mario .jump, .legA, .legB, .coin, .starspin, .qbob, .waddle, .spark, .cloud, .flag { animation: none; }
      .legB { opacity: 0; }
    }
  `;
}

// ---------------------------------------------------------------------------
// Dados: API GraphQL do GitHub + fallback de demonstracao
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
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-readme-mario",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API respondeu ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as any;
  if (json.errors) throw new Error(JSON.stringify(json.errors));

  const cal = json.data.user.contributionsCollection.contributionCalendar;
  const levelMap: Record<string, number> = {
    NONE: 0,
    FIRST_QUARTILE: 1,
    SECOND_QUARTILE: 2,
    THIRD_QUARTILE: 3,
    FOURTH_QUARTILE: 4,
  };

  const weeks: Cell[][] = cal.weeks.map((wk: any) =>
    wk.contributionDays.map((d: any) => ({
      date: d.date,
      count: d.contributionCount,
      level: levelMap[d.contributionLevel] ?? 0,
      weekday: d.weekday,
    })),
  );

  return { weeks, total: cal.totalContributions, login };
}

/** PRNG deterministico (mulberry32) para que a demo seja estavel entre execucoes. */
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
  const rng = mulberry32(0x4d4152494f); // "MARIO"
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
      if (rng() > (weekend ? 0.74 : 0.46)) {
        count = Math.floor(rng() * (weekend ? 6 : 13));
      }
      if (rng() > 0.93) count += Math.floor(rng() * 18); // picos esporadicos

      const level =
        count === 0 ? 0 : count < 3 ? 1 : count < 7 ? 2 : count < 12 ? 3 : 4;
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
    outputArgs.length > 0
      ? outputArgs
      : ["dist/mario-contribution.svg", "dist/mario-contribution-dark.svg?theme=dark"]
  ).map(parseOutput);

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  let grid: Grid;

  if (token) {
    try {
      grid = await fetchContributions(login, token);
      console.log(
        `[mario] Contribuicoes de "${login}" carregadas da API (${grid.total} no ano).`,
      );
    } catch (err) {
      console.warn(
        `[mario] Falha ao consultar a API do GitHub, usando dados de demonstracao. Motivo: ${(err as Error).message}`,
      );
      grid = demoData(login);
    }
  } else {
    console.log(
      "[mario] GITHUB_TOKEN ausente: gerando SVG com dados de demonstracao.",
    );
    grid = demoData(login);
  }

  for (const out of outputs) {
    const svg = buildSVG(grid, out.theme);
    mkdirSync(dirname(out.file), { recursive: true });
    writeFileSync(out.file, svg, "utf8");
    console.log(`[mario] SVG gerado: ${out.file} (${svg.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
