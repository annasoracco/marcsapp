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

/** Greedy word wrap across styled segments. Returns the y after the last line. */
function drawRich(ctx: CanvasRenderingContext2D, segs: Seg[], size: number, family: string, x: number, y: number, maxW: number, lh: number): number {
  const words: Seg[] = [];
  for (const s of segs) {
    const parts = s.text.split(/(\s+)/);
    for (const p of parts) if (p) words.push({ ...s, text: p });
  }
  let cx = x;
  let cy = y;
  const font = (w: Seg) => `${w.weight} ${size}px ${family}`;
  for (const w of words) {
    ctx.font = font(w);
    const isSpace = /^\s+$/.test(w.text);
    const width = ctx.measureText(w.text).width;
    if (!isSpace && cx + width > x + maxW && cx > x) {
      cx = x;
      cy += lh;
    }
    if (isSpace && cx === x) continue;
    ctx.fillStyle = w.color;
    ctx.fillText(w.text, cx, cy);
    // Underline tokens, including the spaces inside them ("Oct 2007"), but not a token's trailing space.
    if (w.weight > 500) {
      ctx.fillStyle = C.underline;
      ctx.fillRect(cx, cy + size * 0.16, width, Math.max(3, size * 0.045));
    }
    cx += width;
  }
  return cy;
}

function plainWrap(ctx: CanvasRenderingContext2D, text: string, size: number, color: string, x: number, y: number, maxW: number, lh: number): number {
  return drawRich(ctx, [{ text, color, weight: 400 }], size, SANS, x, y, maxW, lh);
}

export function drawShareCard(ctx: CanvasRenderingContext2D, sc: Scenario, opts: { asOf: string; cpiMonth: string; name: string }) {
  const W = CARD_W;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, CARD_H);
  ctx.textBaseline = "alphabetic";

  // Masthead
  ctx.font = `600 52px ${SERIF}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Hindsight", M, 160);
  ctx.font = `400 30px ${SANS}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "right";
  ctx.fillText(`Prices through ${opts.asOf}`, W - M, 158);
  ctx.textAlign = "left";

  // The question, first person for sharing.
  const when = sc.start.kind === "moment" ? `on ${fmtDay(sc.startDay)}` : `in ${fmtMonthOfDay(sc.startDay)}`;
  let y = drawRich(
    ctx,
    [
      { text: "If I’d put ", color: C.text, weight: 400 },
      { text: fmtAmount(sc.amount), color: C.token, weight: 560 },
      { text: " into ", color: C.text, weight: 400 },
      { text: opts.name, color: C.token, weight: 560 },
      { text: ` ${when.split(" ")[0]} `, color: C.text, weight: 400 },
      { text: when.slice(3), color: C.token, weight: 560 },
      { text: ", I’d have", color: C.muted, weight: 400 },
    ],
    76,
    SERIF,
    M,
    300,
    W - 2 * M,
    94,
  );

  // The number, fitted to the width.
  const num = fmtMoney(sc.value);
  let size = 230;
  ctx.font = `540 ${size}px ${SERIF}`;
  const w = ctx.measureText(num).width;
  if (w > W - 2 * M) size = Math.floor((size * (W - 2 * M)) / w);
  y += size * 0.86 + 40;
  ctx.font = `540 ${size}px ${SERIF}`;
  ctx.fillStyle = C.text;
  ctx.fillText(num, M - size * 0.03, y);

  const up = sc.value >= sc.invested;
  y += 84;
  ctx.font = `600 44px ${SANS}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`${up ? "▲" : "▼"} ${fmtPct(sc.gain, false)} ${up ? "gain" : "loss"}  ·  ${fmtMultiple(sc.multiple)} the money`, M, y);

  y += 78;
  const story = sc.sp
    ? `The same ${fmtAmount(sc.amount)} in the S&P 500 would be ${fmtMoney(sc.sp.value)}.`
    : "That’s the whole S&P 500, dividends reinvested.";
  y = plainWrap(ctx, story, 40, C.text2, M, y, W - 2 * M, 54);
  if (sc.real) y = plainWrap(ctx, `All amounts in ${opts.cpiMonth} dollars.`, 34, C.muted, M, y + 52, W - 2 * M, 46);

  // Chart
  const top = y + 110;
  const bottom = 1570;
  drawChart(ctx, sc, opts.name, M, top, W - 2 * M, bottom - top);

  // Dates and the fine print
  let fy = plainWrap(
    ctx,
    `From the close on ${fmtDay(sc.startDay)} to the close on ${fmtDay(sc.endDay)}.`,
    32,
    C.muted,
    M,
    1700,
    W - 2 * M,
    44,
  );
  ctx.fillStyle = C.rule;
  ctx.fillRect(M, fy + 40, W - 2 * M, 2);
  fy = plainWrap(
    ctx,
    "Hypothetical. Real prices, dividends reinvested, before taxes and fees. Not financial advice.",
    28,
    C.muted,
    M,
    fy + 96,
    W - 2 * M,
    40,
  );
  ctx.font = `600 28px ${SANS}`;
  ctx.fillStyle = C.underline;
  ctx.fillText("annasoracco.github.io/marcsapp", M, Math.min(CARD_H - 56, fy + 52));
}

function drawChart(ctx: CanvasRenderingContext2D, sc: Scenario, name: string, x0: number, y0: number, w: number, h: number) {
  const gutter = 200;
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
  if (labels.length === 2 && labels[1].y - labels[0].y < 96) {
    const mid = (labels[0].y + labels[1].y) / 2;
    labels[0].y = mid - 48;
    labels[1].y = mid + 48;
  }
  for (const l of labels) {
    ctx.font = `400 30px ${SANS}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(l.title, x0 + pw + 24, l.y - 6);
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = l.color;
    ctx.fillText(l.value, x0 + pw + 24, l.y + 34);
  }
  ctx.fillStyle = C.line;
  ctx.beginPath();
  ctx.arc(X(last.day), Y(last.value), 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `400 30px ${SANS}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(fmtMonthOfDay(pts[0].day), x0, y0 + h + 48);
  ctx.textAlign = "right";
  ctx.fillText(fmtMonthOfDay(last.day), x0 + pw, y0 + h + 48);
  ctx.textAlign = "left";
}

export async function renderShareCard(sc: Scenario, opts: { asOf: string; cpiMonth: string; name: string }): Promise<Blob> {
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
