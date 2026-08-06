#!/usr/bin/env node
/**
 * Gera os ícones PNG do PWA a partir da mesma arte de `apps/web/public/favicon.svg`.
 *
 * Rodar: `node deploy/gen-icons.mjs`
 *
 * Sem dependências: rasteriza a arte por distância com supersampling e escreve o
 * PNG na mão (zlib do próprio Node). Assim o repositório não ganha uma dependência
 * de build (sharp, resvg, canvas) só para produzir quatro arquivos que praticamente
 * nunca mudam. Os PNGs são versionados; este script existe para reproduzi-los.
 *
 * A arte vive num espaço de 32×32 unidades, igual ao viewBox do favicon:
 *   - fundo    #0d1117, retângulo de cantos arredondados (r = 7)
 *   - anel     #c0392b, círculo em (16,16) r = 9, traço 3
 *   - ponteiro #e6edf3, polilinha (16,10.5) → (16,17) → (20.2,19.6), traço 2.4
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';

/** @typedef {readonly [number, number, number]} Rgb */

/** @type {Rgb} */
const BG = [0x0d, 0x11, 0x17];
/** @type {Rgb} */
const RING = [0xc0, 0x39, 0x2b];
/** @type {Rgb} */
const HAND = [0xe6, 0xed, 0xf3];

/** Amostras por eixo dentro de cada pixel. 4×4 já esconde qualquer serrilhado. */
const SUPERSAMPLE = 4;

// --- PNG --------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * @param {Buffer} buffer
 * @returns {number}
 */
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/**
 * RGBA de 8 bits, sem entrelaçamento, todas as linhas com filtro 0.
 *
 * @param {number} size lado da imagem em pixels
 * @param {Buffer} rgba `size * size * 4` bytes
 * @returns {Buffer}
 */
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidade de bits
  ihdr[9] = 6; // tipo de cor: truecolor + alfa
  ihdr[10] = 0; // compressão
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // entrelaçamento

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Geometria (espaço 32×32) -----------------------------------------------

/**
 * Distância com sinal até um retângulo de cantos arredondados centrado em (16,16)
 * e lado 32. Negativa dentro da forma.
 *
 * @param {number} px
 * @param {number} py
 * @param {number} radius
 * @returns {number}
 */
function sdRoundRect(px, py, radius) {
  const qx = Math.abs(px - 16) - (16 - radius);
  const qy = Math.abs(py - 16) - (16 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * @param {number} px
 * @param {number} py
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number}
 */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const t = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * t, pay - bay * t);
}

/**
 * Cor opaca da arte no ponto (x, y), ou `null` onde ela é transparente.
 *
 * @param {number} x
 * @param {number} y
 * @param {{ rounded: boolean; contentScale: number }} options
 * @returns {Rgb | null}
 */
function sample(x, y, options) {
  // O ponteiro fica por cima do anel, que fica por cima do fundo.
  const cx = 16 + (x - 16) / options.contentScale;
  const cy = 16 + (y - 16) / options.contentScale;

  const toHand = Math.min(
    distanceToSegment(cx, cy, 16, 10.5, 16, 17),
    distanceToSegment(cx, cy, 16, 17, 20.2, 19.6),
  );
  if (toHand <= 1.2) return HAND;

  if (Math.abs(Math.hypot(cx - 16, cy - 16) - 9) <= 1.5) return RING;

  if (!options.rounded || sdRoundRect(x, y, 7) <= 0) return BG;
  return null;
}

/**
 * @param {number} size lado do PNG em pixels
 * @param {{ rounded: boolean; contentScale: number }} options
 * @returns {Buffer}
 */
function render(size, options) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / SUPERSAMPLE;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          // Centro do subpixel, convertido para o espaço 32×32 da arte.
          const x = ((px + (sx + 0.5) * step) / size) * 32;
          const y = ((py + (sy + 0.5) * step) / size) * 32;
          const color = sample(x, y, options);
          if (color !== null) {
            r += color[0];
            g += color[1];
            b += color[2];
            covered += 1;
          }
        }
      }

      if (covered === 0) continue;

      // Média ponderada pela cobertura: evita franja escura nas bordas.
      const offset = (py * size + px) * 4;
      rgba[offset] = Math.round(r / covered);
      rgba[offset + 1] = Math.round(g / covered);
      rgba[offset + 2] = Math.round(b / covered);
      rgba[offset + 3] = Math.round((covered / samples) * 255);
    }
  }

  return encodePng(size, rgba);
}

// --- Saída -------------------------------------------------------------------

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');

const TARGETS = [
  { file: 'pwa-192.png', size: 192, rounded: true, contentScale: 1 },
  { file: 'pwa-512.png', size: 512, rounded: true, contentScale: 1 },
  // Maskable: fundo sangrando até a borda e arte encolhida, porque o sistema
  // recorta o ícone com a máscara que quiser. A zona segura é o círculo central
  // de 80% do lado — com escala 0.9 a arte ocupa ~59%, folgada dentro dela.
  { file: 'pwa-512-maskable.png', size: 512, rounded: false, contentScale: 0.9 },
  // O iOS aplica o próprio arredondamento; entregar cantos transparentes daria
  // uma borda escura em volta do ícone.
  { file: 'apple-touch-icon.png', size: 180, rounded: false, contentScale: 1 },
];

mkdirSync(publicDir, { recursive: true });

const report = TARGETS.map(({ file, size, rounded, contentScale }) => {
  const png = render(size, { rounded, contentScale });
  writeFileSync(join(publicDir, file), png);
  return `${file.padEnd(24)} ${String(size).padStart(4)}px  ${String(png.length).padStart(7)} bytes`;
});

process.stdout.write(`${report.join('\n')}\n`);
