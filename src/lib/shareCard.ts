import type { Scenario } from "./engine";
import { fmtAmount, fmtDay, fmtMoney, fmtMoneyShort, fmtMonthOfDay, fmtMultiple, fmtPct } from "./format";

export const CARD_W = 1080;
export const CARD_H = 1920;

// The card is a poster: midnight green field, paper type, silver for the S&P 500.
const C = {
  bg: "#004c54",
  text: "#faf9f6",
  text2: "rgba(250, 249, 246, 0.9)",
  muted: "rgba(250, 249, 246, 0.74)",
  token: "#faf9f6",
  underline: "#a5acaf",
  line: "#faf9f6",
  sp: "#a5acaf",
  rule: "rgba(250, 249, 246, 0.24)",
  base: "rgba(250, 249, 246, 0.5)",
};

const SERIF = '"Fraunces Variable", Georgia, serif';
const SANS = '"Geist Variable", -apple-system, "Segoe UI", system-ui, sans-serif';
const M = 96;

interface Seg {
  text: string;
  color: string;
  weight: number;
}

export async function ensureCardFonts(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`400 76px ${SERIF}`),
    document.fonts.load(`560 76px ${SERIF}`),
    document.fonts.load(`600 52px ${SERIF}`),
    document.fonts.load(`400 40px ${SANS}`),
    document.fonts.load(`600 40px ${SANS}`),
  ]).catch(() => {});
  await document.fonts.ready;
}

/**
 * Greedy word wrap across styled segments. With `draw` false it only measures.
 * Returns the baseline of the last line and how many lines it took.
 */
function drawRich(
  ctx: CanvasRenderingContext2D,
  segs: Seg[],
  size: number,
  family: string,
  x: number,
  y: number,
  maxW: number,
  lh: number,
  draw = true,
): { y: number; lines: number } {
  const words: Seg[] = [];
  for (const s of segs) for (const p of s.text.split(/(\s+)/)) if (p) words.push({ ...s, text: p });
  let cx = x;
  let cy = y;
  let lines = 1;
  for (const w of words) {
    ctx.font = `${w.weight} ${size}px ${family}`;
    const isSpace = /^\s+$/.test(w.text);
    const width = ctx.measureText(w.text).width;
    if (!isSpace && cx + width > x + maxW && cx > x) {
      cx = x;
      cy += lh;
      lines++;
    }
    if (isSpace && cx === x) continue;
    if (draw) {
      ctx.fillStyle = w.color;
      ctx.fillText(w.text, cx, cy);
    }
    cx += width;
  }
  return { y: cy, lines };
}

function plainWrap(ctx: CanvasRenderingContext2D, text: string, size: number, color: string, x: number, y: number, maxW: number, lh: number, draw = true) {
  return drawRich(ctx, [{ text, color, weight: 400 }], size, SANS, x, y, maxW, lh, draw);
}

const SAFE_BOTTOM = CARD_H - 180; // Story apps cover the bottom of a tall image.
const MIN_TEXT = 36;

export function drawShareCard(ctx: CanvasRenderingContext2D, sc: Scenario, opts: CardOptions) {
  const W = CARD_W;
  const TW = W - 2 * M;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, CARD_H);
  ctx.textBaseline = "alphabetic";

  // Masthead: wordmark and where to find it.
  ctx.font = `600 56px ${SERIF}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Hindsight", M, 170);
  ctx.font = `500 ${MIN_TEXT}px ${SANS}`;
  ctx.fillStyle = C.underline;
  ctx.textAlign = "right";
  ctx.fillText("annasoracco.github.io/marcsapp", W - M, 166);
  ctx.textAlign = "left";

  // The question, first person for sharing. Shrinks so it never runs past three lines.
  const when = sc.start.kind === "moment" ? `on ${fmtDay(sc.startDay)}` : `in ${fmtMonthOfDay(sc.startDay)}`;
  const q: Seg[] = [
    { text: "If I’d put ", color: C.text, weight: 400 },
    { text: fmtAmount(sc.amount), color: C.token, weight: 620 },
    { text: " into ", color: C.text, weight: 400 },
    { text: opts.name, color: C.token, weight: 620 },
    { text: ` ${when.split(" ")[0]} `, color: C.text, weight: 400 },
    { text: when.slice(3), color: C.token, weight: 620 },
    { text: ", I’d have", color: C.muted, weight: 400 },
  ];
  let qs = 76;
  while (qs > 52 && drawRich(ctx, q, qs, SERIF, M, 0, TW, qs * 1.24, false).lines > 3) qs -= 4;
  let y = drawRich(ctx, q, qs, SERIF, M, 320, TW, qs * 1.24).y;

  // The number, fitted to the width.
  const num = fmtMoney(sc.value);
  let size = 230;
  ctx.font = `540 ${size}px ${SERIF}`;
  const w = ctx.measureText(num).width;
  if (w > TW) size = Math.floor((size * TW) / w);
  y += size * 0.86 + 36;
  ctx.font = `540 ${size}px ${SERIF}`;
  ctx.fillStyle = C.text;
  ctx.fillText(num, M - size * 0.03, y);

  const up = sc.value >= sc.invested;
  y += 88;
  ctx.font = `600 46px ${SANS}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`${up ? "▲" : "▼"} ${fmtPct(sc.gain, false)} ${up ? "gain" : "loss"}  ·  ${fmtMultiple(sc.multiple)} my money`, M, y);

  y += 80;
  const story = sc.sp
    ? `The S&P 500 would have made it ${fmtMoney(sc.sp.value)}.`
    : opts.isBenchmark
      ? "That’s the whole S&P 500, dividends reinvested."
      : "";
  if (story) y = plainWrap(ctx, story, 42, C.text2, M, y, TW, 56).y;
  if (sc.real) y = plainWrap(ctx, `In today’s dollars (CPI through ${opts.cpiMonth}).`, MIN_TEXT, C.muted, M, y + 54, TW, 48).y;

  // Footer, laid out from the safe bottom up: dates, a hairline, then the fine print.
  const dates = `Closing prices, ${fmtDay(sc.startDay)} to ${fmtDay(sc.endDay)}.`;
  const fine = "Hypothetical. Dividends reinvested, before taxes and fees. Not financial advice.";
  const LH = 50;
  const fineLines = plainWrap(ctx, fine, MIN_TEXT, C.muted, M, 0, TW, LH, false).lines;
  const dateLines = plainWrap(ctx, dates, MIN_TEXT, C.text2, M, 0, TW, LH, false).lines;
  const fineY = SAFE_BOTTOM - (fineLines - 1) * LH;
  const ruleY = fineY - 62;
  const datesY = ruleY - 34 - (dateLines - 1) * LH;
  plainWrap(ctx, fine, MIN_TEXT, C.muted, M, fineY, TW, LH);
  ctx.fillStyle = C.rule;
  ctx.fillRect(M, ruleY, TW, 2);
  plainWrap(ctx, dates, MIN_TEXT, C.text2, M, datesY, TW, LH);

  // Chart fills what's left between the story and the footer (axis labels sit under it).
  const top = y + 100;
  const bottom = datesY - 130;
  drawChart(ctx, sc, opts.name, M, top, TW, Math.max(260, bottom - top));
}

function drawChart(ctx: CanvasRenderingContext2D, sc: Scenario, name: string, x0: number, y0: number, w: number, h: number) {
  const gutter = 220;
  const pw = w - gutter;
  const pts = sc.series;
  const sp = sc.sp?.series;
  const d0 = pts[0].day;
  const d1 = Math.max(pts[pts.length - 1].day, d0 + 1);
  let max = sc.invested;
  for (const p of pts) max = Math.max(max, p.value);
  if (sp) for (const p of sp) max = Math.max(max, p.value);
  max *= 1.05;
  const X = (d: number) => x0 + ((d - d0) / (d1 - d0)) * pw;
  const Y = (v: number) => y0 + h - (v / max) * h;

  ctx.save();
  ctx.setLineDash([4, 10]);
  ctx.strokeStyle = C.base;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, Y(sc.invested));
  ctx.lineTo(x0 + pw, Y(sc.invested));
  ctx.stroke();
  ctx.restore();

  const line = (series: { day: number; value: number }[], color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    series.forEach((p, i) => (i ? ctx.lineTo(X(p.day), Y(p.value)) : ctx.moveTo(X(p.day), Y(p.value))));
    ctx.stroke();
  };
  if (sp) line(sp, C.sp, 5);
  line(pts, C.line, 7);

  const last = pts[pts.length - 1];
  const labels: { y: number; title: string; value: string; color: string }[] = [
    { y: Y(last.value), title: name, value: fmtMoneyShort(last.value), color: C.text },
  ];
  if (sp) labels.push({ y: Y(sp[sp.length - 1].value), title: "S&P 500", value: fmtMoneyShort(sp[sp.length - 1].value), color: C.sp });
  labels.sort((a, b) => a.y - b.y);
  if (labels.length === 2 && labels[1].y - labels[0].y < 104) {
    const mid = (labels[0].y + labels[1].y) / 2;
    labels[0].y = mid - 52;
    labels[1].y = mid + 52;
  }
  for (const l of labels) {
    ctx.font = `400 ${MIN_TEXT}px ${SANS}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(l.title, x0 + pw + 24, l.y - 6);
    ctx.font = `600 40px ${SANS}`;
    ctx.fillStyle = l.color;
    ctx.fillText(l.value, x0 + pw + 24, l.y + 40);
  }
  ctx.fillStyle = C.line;
  ctx.beginPath();
  ctx.arc(X(last.day), Y(last.value), 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `400 ${MIN_TEXT}px ${SANS}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(fmtMonthOfDay(pts[0].day), x0, y0 + h + 56);
  ctx.textAlign = "right";
  ctx.fillText(fmtMonthOfDay(last.day), x0 + pw, y0 + h + 56);
  ctx.textAlign = "left";
}

export interface CardOptions {
  cpiMonth: string;
  name: string;
  isBenchmark: boolean;
}

export async function renderShareCard(sc: Scenario, opts: CardOptions): Promise<Blob> {
  await ensureCardFonts();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn’t available");
  drawShareCard(ctx, sc, opts);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn’t make the image"))), "image/png"));
}

export function cardFileName(sc: Scenario): string {
  const slug = sc.asset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `hindsight-${slug}-${new Date(sc.startDay * 86400000).getUTCFullYear()}.png`;
}
