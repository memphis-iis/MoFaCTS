import path from "node:path";

const ink = "#172033";
const muted = "#4B5563";
const paper = "#FBFAF5";
const green = "#DCFCE7";
const greenInk = "#24734D";
const blue = "#DCEBFF";
const blueInk = "#2F5F9E";
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

function stage(slide, ctx, x, y, w, label, fill, stroke) {
  box(slide, ctx, { x, y, w, h: 54, fill, stroke });
  text(slide, ctx, { x: x + 12, y: y + 12, w: w - 24, h: 26, text: label, size: 16, bold: true, color: ink, align: "center", valign: "middle" });
}

function arrow(slide, ctx, x, y, w, color = "#6B7280") {
  box(slide, ctx, { x, y: y + 12, w, h: 2, fill: color, stroke: color, strokeWidth: 0 });
  ctx.addShape(slide, { geometry: "triangle", x: x + w - 4, y: y + 6, w: 14, h: 14, fill: color, line: ctx.line(color, 0) });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  box(slide, ctx, { x: 0, y: 0, w: ctx.W, h: ctx.H, fill: paper, stroke: paper, strokeWidth: 0 });

  text(slide, ctx, { x: 56, y: 36, w: 260, h: 26, text: "LLM AUTOTUTOR", size: 13, bold: true, color: blueInk });
  text(slide, ctx, {
    x: 56, y: 68, w: 700, h: 112,
    text: "AutoTutor 2.0 keeps the tutoring policy explicit while letting the LLM handle language.",
    size: 33, face: ctx.fonts.title, bold: true, color: ink,
  });
  text(slide, ctx, {
    x: 58, y: 184, w: 620, h: 48,
    text: "Each learner turn is scored against authored expectations and misconceptions, routed through a planner, then realized as a tutor message.",
    size: 18, color: muted,
  });

  const y = 270;
  stage(slide, ctx, 58, y, 150, "Learner turn", green, greenInk);
  arrow(slide, ctx, 211, y + 14, 42);
  stage(slide, ctx, 258, y, 168, "Score", amber, amberInk);
  arrow(slide, ctx, 430, y + 14, 42);
  stage(slide, ctx, 478, y, 176, "Select target", blue, blueInk);
  arrow(slide, ctx, 660, y + 14, 42);
  stage(slide, ctx, 708, y, 150, "Tutor move", violet, violetInk);

  const lanes = [
    ["learner question", "answer from authored content", blue, blueInk],
    ["misconception", "repair: hint -> prompt -> assertion", amber, amberInk],
    ["expectation", "pump / hint / prompt / assertion", green, greenInk],
    ["completion", "final answer prompt -> summary", violet, violetInk],
  ];
  lanes.forEach(([label, body, fill, stroke], i) => {
    const yy = 362 + i * 56;
    box(slide, ctx, { x: 86, y: yy, w: 716, h: 42, fill: "#FFFFFF", stroke: "#DADDE3" });
    box(slide, ctx, { x: 86, y: yy, w: 145, h: 42, fill, stroke, strokeWidth: 0 });
    text(slide, ctx, { x: 100, y: yy + 10, w: 120, h: 20, text: label, size: 13, bold: true, color: stroke, align: "center", valign: "middle" });
    text(slide, ctx, { x: 250, y: yy + 9, w: 520, h: 22, text: body, size: 15, color: ink, valign: "middle" });
  });

  box(slide, ctx, { x: 896, y: 40, w: 260, h: 570, fill: "#111827", stroke: "#111827" });
  box(slide, ctx, { x: 907, y: 51, w: 238, h: 548, fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: 0 });
  await ctx.addImage(slide, {
    path: path.join(ctx.assetDir, "autotutor-mobile-04-after-response.png"),
    x: 907, y: 51, w: 238, h: 548, fit: "cover",
    alt: "Mobile MoFaCTS AutoTutor session after one learner response",
  });
  text(slide, ctx, { x: 894, y: 628, w: 270, h: 34, text: "Real mobile AutoTutor session: progress updates after scoring and planning.", size: 14, color: muted, align: "center" });

  text(slide, ctx, { x: 58, y: 644, w: 520, h: 22, text: "Implemented locally in MoFaCTS as a configurable unit type with persisted turn state.", size: 14, color: muted });
  text(slide, ctx, { x: 1110, y: 666, w: 112, h: 16, text: "01 / 02", size: 11, color: "#9CA3AF", align: "right" });
  return slide;
}
