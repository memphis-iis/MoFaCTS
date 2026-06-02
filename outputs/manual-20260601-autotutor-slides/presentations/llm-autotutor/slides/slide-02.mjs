import path from "node:path";

const ink = "#172033";
const muted = "#4B5563";
const paper = "#FBFAF5";
const blue = "#DCEBFF";
const blueInk = "#2F5F9E";
const green = "#DCFCE7";
const greenInk = "#24734D";
const amber = "#FEF3C7";
const amberInk = "#8A5A00";
const violet = "#EDE9FE";
const violetInk = "#5B4BA8";

function text(slide, ctx, opts) {
  return ctx.addText(slide, {
    typeface: opts.face || ctx.fonts.body,
    color: opts.color || ink,
    fontSize: opts.size || 20,
    bold: opts.bold || false,
    insets: opts.insets || { left: 0, right: 0, top: 0, bottom: 0 },
    ...opts,
  });
}

function box(slide, ctx, opts) {
  return ctx.addShape(slide, {
    geometry: "rect",
    fill: opts.fill || "#FFFFFF",
    line: ctx.line(opts.stroke || "#D1D5DB", opts.strokeWidth ?? 1.2),
    ...opts,
  });
}

function layer(slide, ctx, x, y, w, h, kicker, title, bullets, fill, stroke) {
  box(slide, ctx, { x, y, w, h, fill, stroke, strokeWidth: 1.2 });
  text(slide, ctx, { x: x + 18, y: y + 14, w: 160, h: 18, text: kicker, size: 11, bold: true, color: stroke });
  text(slide, ctx, { x: x + 18, y: y + 38, w: w - 36, h: 30, text: title, size: 21, bold: true, color: ink });
  bullets.forEach((b, i) => {
    text(slide, ctx, { x: x + 28, y: y + 82 + i * 28, w: w - 56, h: 22, text: b, size: 15, color: muted });
    box(slide, ctx, { x: x + 18, y: y + 91 + i * 28, w: 4, h: 4, fill: stroke, stroke, strokeWidth: 0 });
  });
}

export async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  box(slide, ctx, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill: paper, stroke: paper, strokeWidth: 0 });

  text(slide, ctx, { x: 56, y: 36, w: 330, h: 26, text: "MOFACTS INTEGRATION", size: 13, bold: true, color: violetInk });
  text(slide, ctx, {
    x: 56, y: 68, w: 710, h: 92,
    text: "The research idea becomes a deployable, resumable learning unit.",
    size: 38, face: ctx.fonts.title, bold: true, color: ink,
  });
  text(slide, ctx, {
    x: 58, y: 154, w: 660, h: 48,
    text: "MoFaCTS separates authored pedagogy from app infrastructure: the planner owns tutoring decisions; the app owns launch, LLM calls, history, and resume.",
    size: 18, color: muted,
  });

  layer(slide, ctx, 58, 244, 760, 116, "AUTHORED TDF", "Script and runtime settings", [
    "expectations, misconceptions, prompts, graduation",
    "coverage thresholds, max turns, model and temperature",
  ], blue, blueInk);
  layer(slide, ctx, 58, 386, 760, 116, "LEARNING COMPONENT", "AutoTutor planner and state contracts", [
    "score merge -> target selection -> move selection",
    "saved state, saved history, and end-state semantics",
  ], green, greenInk);
  layer(slide, ctx, 58, 528, 760, 116, "MOFACTS APP", "Svelte/Meteor runtime shell", [
    "mobile chat UI, OpenRouter calls, session publication",
    "canonical history persistence and resume reconstruction",
  ], amber, amberInk);

  [374, 516].forEach((y) => {
    box(slide, ctx, { x: 420, y, w: 34, h: 2, fill: "#6B7280", stroke: "#6B7280", strokeWidth: 0 });
    ctx.addShape(slide, { geometry: "triangle", x: 434, y: y + 2, w: 14, h: 14, fill: "#6B7280", line: ctx.line("#6B7280", 0) });
  });

  box(slide, ctx, { x: 894, y: 98, w: 248, h: 538, fill: "#111827", stroke: "#111827" });
  box(slide, ctx, { x: 904, y: 108, w: 228, h: 518, fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: 0 });
  await ctx.addImage(slide, {
    path: path.join(ctx.assetDir, "autotutor-mobile-stock-shorting-complete.png"),
    x: 904, y: 108, w: 228, h: 518, fit: "cover",
    alt: "Mobile MoFaCTS AutoTutor completed stock-shorting session",
  });

  box(slide, ctx, { x: 842, y: 244, w: 88, h: 44, fill: violet, stroke: violetInk });
  text(slide, ctx, { x: 850, y: 254, w: 72, h: 18, text: "resume", size: 14, bold: true, color: violetInk, align: "center" });
  box(slide, ctx, { x: 842, y: 326, w: 88, h: 44, fill: green, stroke: greenInk });
  text(slide, ctx, { x: 850, y: 336, w: 72, h: 18, text: "progress", size: 14, bold: true, color: greenInk, align: "center" });
  box(slide, ctx, { x: 842, y: 408, w: 88, h: 44, fill: amber, stroke: amberInk });
  text(slide, ctx, { x: 850, y: 418, w: 72, h: 18, text: "cost cap", size: 14, bold: true, color: amberInk, align: "center" });

  text(slide, ctx, { x: 842, y: 652, w: 312, h: 24, text: "Completion, summary, and progress in the real mobile learner surface.", size: 14, color: muted, align: "center" });
  text(slide, ctx, { x: 1110, y: 666, w: 112, h: 16, text: "02 / 02", size: 11, color: "#9CA3AF", align: "right" });
  return slide;
}
