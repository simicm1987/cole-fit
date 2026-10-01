(() => {
"use strict";

const PI_D = Math.PI;
const DET_MIN = 1.0e-12;
const U_DEN_MIN = 1.0e-24;
const REL_DEN_MIN = 1.0e-12;
const HIST_BINS = 20;

const C = {
  BG: "#F3F5F9",
  PAPER: "#FFFFFF",
  BORDER: "#DCE2EA",
  INK: "#182431",
  MUTED: "#64748B",
  RED_LINE: "#D8433C",
  MEASURED: "#17212F",
  GRID: "#E9EDF2",
  ACCENT: "#176B9A",
  AXIS: "#AEB9C7",
  HIST: "#718DA5"
};

const canvas = document.getElementById("appCanvas");
const ctx = canvas.getContext("2d");
const picker = document.getElementById("filePicker");
const openButton = document.getElementById("openButton");
const statusPanel = document.getElementById("statusPanel");

let cssWidth = 1100;
let cssHeight = 760;
let result = null;
let statusText = "Select a .txt file with f,R,X columns.";
let shownFileName = "No file loaded";
let lastFile = null;
let busy = false;
let statusTimer = null;

class PointData {
  constructor(f, r, x) {
    this.f = f;
    this.r = r;
    this.x = x;
    this.rFit = NaN;
    this.xFit = NaN;
    this.eR = NaN;
    this.eX = NaN;
    this.sumAbs = NaN;
  }
}

class FitResult {
  constructor() {
    this.pts = [];
    this.modelF = [];
    this.modelR = [];
    this.modelX = [];
  }
}

function resizeCanvas() {
  cssWidth = Math.max(window.innerWidth, 1100);
  cssHeight = Math.max(window.innerHeight, 760);

  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  draw();
}

function setStatus(message, isError = false, autoHide = true) {
  clearTimeout(statusTimer);
  statusPanel.textContent = message;
  statusPanel.classList.toggle("error", isError);
  statusPanel.classList.add("visible");

  if (autoHide && !isError) {
    statusTimer = setTimeout(() => {
      statusPanel.classList.remove("visible");
    }, 3500);
  }
}

function setBusy(v) {
  busy = v;
  openButton.disabled = v;
  openButton.textContent = v ? "LOADING..." : "OPEN .TXT";
}

openButton.addEventListener("click", () => {
  if (busy) return;
  picker.value = "";
  picker.click();
});

picker.addEventListener("change", async () => {
  const file = picker.files && picker.files[0];
  if (file) await loadAndFit(file);
});

window.addEventListener("keydown", (ev) => {
  if ((ev.key === "o" || ev.key === "O") && !busy) {
    picker.value = "";
    picker.click();
  } else if ((ev.key === "r" || ev.key === "R") && !busy && lastFile) {
    loadAndFit(lastFile);
  }
});

window.addEventListener("resize", resizeCanvas);

window.addEventListener("error", (ev) => {
  const msg = ev.error && ev.error.message ? ev.error.message : ev.message;
  setStatus("JavaScript error: " + (msg || "unknown error"), true, false);
});

window.addEventListener("unhandledrejection", (ev) => {
  const reason = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason);
  setStatus("JavaScript error: " + reason, true, false);
});

async function loadAndFit(file) {
  result = null;
  shownFileName = file.name;
  statusText = "Reading file...";
  setBusy(true);
  draw();
  setStatus(`Reading ${file.name}...`, false, false);

  try {
    const textData = await readFileAsText(file);
    if (!textData.trim()) throw new Error("The selected TXT file is empty.");

    const input = readDataText(textData);
    statusText = "Fitting...";
    draw();

    const fitted = coleFit(input);
    result = fitted;
    lastFile = file;
    statusText = `Fit complete: ${fitted.pts.length} points. O = open, R = reload.`;
    setStatus(statusText, false, true);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    statusText = "ERROR: " + msg;
    setStatus(statusText, true, false);
    console.error(err);
  } finally {
    setBusy(false);
    draw();
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error || new Error("Browser could not read the file."));
    reader.onabort = () => reject(new Error("File reading was cancelled."));
    reader.readAsText(file, "UTF-8");
  });
}

function readDataText(textData) {
  const lines = textData.split(/\r\n|\n|\r/);
  const data = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\uFEFF/g, "").trim();

    if (!line || line.startsWith("#") || line.startsWith("%") || line.startsWith("//")) {
      continue;
    }

    let fields;
    if (line.includes(";")) fields = line.split(/\s*;\s*/);
    else if (line.includes(",")) fields = line.split(/\s*,\s*/);
    else fields = line.split(/\s+/);

    if (fields.length < 3) {
      throw new Error(`Line ${i + 1}: required columns: f,R,X.`);
    }

    const first = fields[0].trim().toLowerCase();
    if (first === "f" || first.startsWith("freq")) continue;

    const f = Number(fields[0].trim().replace(/\u2212/g, "-"));
    const r = Number(fields[1].trim().replace(/\u2212/g, "-"));
    const x = Number(fields[2].trim().replace(/\u2212/g, "-"));

    if (![f, r, x].every(Number.isFinite)) {
      throw new Error(`Line ${i + 1}: invalid number (use a decimal point).`);
    }
    if (f <= 0) {
      throw new Error(`Line ${i + 1}: values must be finite; f > 0.`);
    }
    if (x > 0) {
      throw new Error(
        `Line ${i + 1}: X=Im(Z) must be <= 0. If you have -Im(Z), reverse its sign.`
      );
    }

    data.push(new PointData(f, r, x));
  }

  if (data.length < 3) {
    throw new Error("At least 3 valid data points are required for fitting.");
  }

  data.sort((a, b) => a.f - b.f);

  if (data[0].f === data[data.length - 1].f) {
    throw new Error("More than one distinct frequency is required.");
  }

  return data;
}

function finite(v) {
  return Number.isFinite(v);
}

function sqD(v) {
  return v * v;
}

function coleFit(p) {
  const n = p.length;
  const fit = new FitResult();
  fit.pts = p;
  fit.fMin = p[0].f;
  fit.fMax = p[n - 1].f;

  let R0 = 0;
  let Y0 = 0;
  for (const v of p) {
    R0 += v.r;
    Y0 += -v.x;
  }
  R0 /= n;
  Y0 /= n;

  let scl = 0;
  for (const v of p) {
    scl = Math.max(scl, Math.abs(v.r - R0));
    scl = Math.max(scl, Math.abs(-v.x - Y0));
  }
  if (!(scl > 0) || !finite(scl)) throw new Error("Invalid data scaling.");

  let Srr = 0, Syy = 0, Sry = 0, Tr = 0, Ty = 0, St = 0;
  for (const v of p) {
    const rr = (v.r - R0) / scl;
    const yy = (-v.x - Y0) / scl;
    const t = rr * rr + yy * yy;
    Srr += rr * rr;
    Syy += yy * yy;
    Sry += rr * yy;
    Tr += rr * t;
    Ty += yy * t;
    St += t;
  }

  const D = Srr * Syy - Sry * Sry;
  if (!finite(D) || Math.abs(D) < DET_MIN) {
    throw new Error("Degenerate data: the circle determinant is too small.");
  }

  const A = (-Tr * Syy + Sry * Ty) / D;
  const B = (Tr * Sry - Srr * Ty) / D;
  const C0 = -St / n;

  fit.a = A * scl - 2 * R0;
  fit.b = B * scl - 2 * Y0;
  fit.c = R0 * R0 + Y0 * Y0 - A * scl * R0 - B * scl * Y0 + C0 * scl * scl;

  const Delta = fit.a * fit.a - 4 * fit.c;
  if (!(Delta > 0) || !finite(Delta)) throw new Error("Nonphysical fit: Delta <= 0.");

  fit.R1 = Math.sqrt(Delta);
  fit.Rinf = (-fit.a - fit.R1) / 2;
  fit.alpha = (2 / PI_D) * Math.atan2(fit.R1, fit.b);

  if (
    !(fit.R1 > 0 && fit.Rinf > 0 && fit.alpha > 0 && fit.alpha <= 1) ||
    !finite(fit.Rinf) || !finite(fit.alpha)
  ) {
    throw new Error("Nonphysical estimated parameters (Rinf, R1, or alpha).");
  }

  let qNum = 0, qDen = 0, validQ = 0;
  for (const v of p) {
    const y = -v.x;
    const denU = sqD(v.r - fit.Rinf) + y * y;
    const numU = sqD(fit.Rinf + fit.R1 - v.r) + y * y;

    if (denU > U_DEN_MIN && numU >= 0) {
      const uHat = Math.sqrt(numU / denU);
      const waHat = Math.exp(fit.alpha * Math.log(2 * PI_D * v.f));
      qNum += waHat * uHat;
      qDen += waHat * waHat;
      validQ++;
    }
  }

  if (validQ < 3 || !(qDen > 0) || !finite(qNum) || !finite(qDen)) {
    throw new Error("q estimation failed.");
  }

  fit.q = qNum / qDen;
  fit.C = fit.q / fit.R1;
  if (!finite(fit.C) || !(fit.C > 0)) {
    throw new Error("Nonphysical estimated C coefficient.");
  }

  let sumER = 0, sumEX = 0, sumAbsER = 0, sumAbsEX = 0;
  let sumSqER = 0, sumSqEX = 0, maxAbsER = 0, maxAbsEX = 0;
  let totalAbs = 0, validR = 0, validX = 0, validPair = 0;

  for (const v of p) {
    const modeled = coleModel(fit, v.f);
    v.rFit = modeled[0];
    v.xFit = modeled[1];
    v.eR = NaN;
    v.eX = NaN;

    if (Math.abs(v.r) > REL_DEN_MIN) {
      v.eR = 100 * (v.rFit - v.r) / v.r;
      if (!finite(v.eR)) throw new Error("Invalid R error.");
      sumER += v.eR;
      sumAbsER += Math.abs(v.eR);
      sumSqER += v.eR * v.eR;
      maxAbsER = Math.max(maxAbsER, Math.abs(v.eR));
      validR++;
    }

    if (Math.abs(v.x) > REL_DEN_MIN) {
      v.eX = 100 * (v.xFit - v.x) / v.x;
      if (!finite(v.eX)) throw new Error("Invalid X error.");
      sumEX += v.eX;
      sumAbsEX += Math.abs(v.eX);
      sumSqEX += v.eX * v.eX;
      maxAbsEX = Math.max(maxAbsEX, Math.abs(v.eX));
      validX++;
    }

    if (finite(v.eR) && finite(v.eX)) {
      v.sumAbs = Math.abs(v.eR) + Math.abs(v.eX);
      totalAbs += v.sumAbs;
      validPair++;
    } else {
      v.sumAbs = NaN;
    }
  }

  fit.meanER = validR ? sumER / validR : NaN;
  fit.meanEX = validX ? sumEX / validX : NaN;
  fit.maeER = validR ? sumAbsER / validR : NaN;
  fit.maeEX = validX ? sumAbsEX / validX : NaN;
  fit.rmsER = validR ? Math.sqrt(sumSqER / validR) : NaN;
  fit.rmsEX = validX ? Math.sqrt(sumSqEX / validX) : NaN;
  fit.maxER = validR ? maxAbsER : NaN;
  fit.maxEX = validX ? maxAbsEX : NaN;
  fit.totalAbs = validPair ? totalAbs : NaN;
  fit.validR = validR;
  fit.validX = validX;
  fit.validPairs = validPair;

  const nm = 600;
  const ratio = Math.log(fit.fMax / fit.fMin);

  for (let j = 0; j < nm; j++) {
    const f = fit.fMin * Math.exp(ratio * j / (nm - 1));
    const m = coleModel(fit, f);
    fit.modelF.push(f);
    fit.modelR.push(m[0]);
    fit.modelX.push(m[1]);
  }

  return fit;
}

function coleModel(fit, f) {
  const theta = 0.5 * PI_D * fit.alpha;
  const wa = Math.exp(fit.alpha * Math.log(2 * PI_D * f));
  const u = fit.q * wa;
  const den = 1 + 2 * u * Math.cos(theta) + u * u;

  const rFit = fit.Rinf + fit.R1 * (1 + u * Math.cos(theta)) / den;
  const xFit = -fit.R1 * u * Math.sin(theta) / den;
  return [rFit, xFit];
}

// ---------------- drawing helpers ----------------

function font(size, weight = "normal") {
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
}

function setText(color, size, align = "left", baseline = "alphabetic", weight = "normal") {
  ctx.fillStyle = color;
  font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
}

function roundedRect(x, y, w, h, r, fill, stroke = null) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function line(x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function circle(x, y, d, fill, stroke = null, strokeWidth = 1) {
  ctx.beginPath();
  ctx.arc(x, y, d / 2, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function shorten(s, maxWidth) {
  let t = String(s);
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(t + "...").width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + "...";
}

function drawWrappedText(text, x, y, maxWidth, lineHeight) {
  const paragraphs = String(text).split("\n");
  let yy = y;

  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let lineText = "";

    for (const word of words) {
      const test = lineText ? lineText + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && lineText) {
        ctx.fillText(lineText, x, yy);
        yy += lineHeight;
        lineText = word;
      } else {
        lineText = test;
      }
    }

    if (lineText) {
      ctx.fillText(lineText, x, yy);
      yy += lineHeight;
    }
  }

  return yy;
}

function draw() {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = C.BG;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  drawHeader();

  const margin = 18;
  const gap = 14;
  const sidebarW = Math.max(332, Math.min(386, cssWidth * 0.26));
  const sideX = cssWidth - margin - sidebarW;
  const chartsW = sideX - margin - gap;
  const chartW = (chartsW - gap) / 2;
  const top = 104;
  const bottom = cssHeight - 18;
  const chartH = (bottom - top - gap) / 2;

  drawChartCard(margin, top, chartW, chartH, 0);
  drawChartCard(margin + chartW + gap, top, chartW, chartH, 1);
  drawChartCard(margin, top + chartH + gap, chartW, chartH, 2);
  drawChartCard(margin + chartW + gap, top + chartH + gap, chartW, chartH, 3);
  drawResultsSidebar(sideX, top, sidebarW, bottom - top);
}

function drawHeader() {
  ctx.fillStyle = C.PAPER;
  ctx.fillRect(0, 0, cssWidth, 86);
  line(0, 86, cssWidth, 86, C.BORDER, 1);

  setText(C.INK, 20);
  ctx.fillText("COLE FIT", 209, 33);

  setText(C.MUTED, 12);
  ctx.fillText("Circle fit + q estimation  |  Web / Canvas v5", 210, 52);

  const sx = Math.min(630, Math.max(360, cssWidth * 0.47));
  const available = cssWidth - sx - 18;
  setText(C.INK, 12);
  ctx.fillText(shorten(shownFileName, available), sx, 33);
  setText(C.MUTED, 12);
  ctx.fillText(shorten(statusText, available), sx, 54);
}

function chartName(which) {
  if (which === 0) return "Nyquist: R - X";
  if (which === 1) return "R vs. frequency";
  if (which === 2) return "X vs. frequency";
  return "Histogram: |eR| + |eX|";
}

function drawChartCard(x, y, w, h, which) {
  roundedRect(x, y, w, h, 11, C.PAPER, C.BORDER);

  if (!result) {
    setText(C.INK, 14);
    ctx.fillText(chartName(which), x + 18, y + 29);

    setText(C.MUTED, 13, "center", "middle");
    ctx.fillText("Plot will appear after loading and fitting", x + w / 2, y + h / 2);
    return;
  }

  if (which === 3) drawHistogram(x, y, w, h);
  else drawFitChart(x, y, w, h, which);
}

function drawFitChart(x, y, w, h, mode) {
  const px = x + 60;
  const py = y + 55;
  const pw = Math.max(20, w - 83);
  const ph = Math.max(20, h - 122);

  const logF = mode !== 0;
  const xLabel = mode === 0 ? "R [ohm]" : "f [kHz] (log scale)";
  const yLabel = mode === 1 ? "R [ohm]" : "X [ohm]";

  setText(C.INK, 14);
  ctx.fillText(chartName(mode), x + 17, y + 27);
  drawLegend(x + w - 214, y + 26);

  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;

  for (const p of result.pts) {
    const xx = logF ? Math.log10(p.f) : p.r;
    const yy = mode === 1 ? p.r : p.x;
    xmin = Math.min(xmin, xx); xmax = Math.max(xmax, xx);
    ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy);
  }

  for (let j = 0; j < result.modelF.length; j++) {
    const xx = logF ? Math.log10(result.modelF[j]) : result.modelR[j];
    const yy = mode === 1 ? result.modelR[j] : result.modelX[j];
    xmin = Math.min(xmin, xx); xmax = Math.max(xmax, xx);
    ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy);
  }

  if (xmax <= xmin) xmax = xmin + 1;
  if (ymax <= ymin) ymax = ymin + 1;

  const xpad = logF ? 0 : (xmax - xmin) * 0.06;
  const ypad = (ymax - ymin) * 0.10;
  xmin -= xpad; xmax += xpad;
  ymin -= ypad; ymax += ypad;

  drawAxes(px, py, pw, ph, xmin, xmax, ymin, ymax, logF, xLabel, yLabel);

  ctx.beginPath();
  for (let j = 0; j < result.modelF.length; j++) {
    const xx = logF ? Math.log10(result.modelF[j]) : result.modelR[j];
    const yy = mode === 1 ? result.modelR[j] : result.modelX[j];
    const cx = coordX(xx, xmin, xmax, px, pw);
    const cy = coordY(yy, ymin, ymax, py, ph);
    if (j === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  }
  ctx.strokeStyle = C.RED_LINE;
  ctx.lineWidth = 2;
  ctx.stroke();

  for (const p of result.pts) {
    const xx = logF ? Math.log10(p.f) : p.r;
    const yy = mode === 1 ? p.r : p.x;
    circle(
      coordX(xx, xmin, xmax, px, pw),
      coordY(yy, ymin, ymax, py, ph),
      3.6,
      C.MEASURED
    );
  }
}

function drawLegend(x, y) {
  circle(x, y - 4, 5, C.MEASURED);
  setText(C.MUTED, 10);
  ctx.fillText("Data", x + 7, y);
  line(x + 76, y - 4, x + 92, y - 4, C.RED_LINE, 2);
  ctx.fillText("Fit", x + 96, y);
}

function drawAxes(px, py, pw, ph, xmin, xmax, ymin, ymax, logF, xLabel, yLabel) {
  setText(C.MUTED, 10, "center", "alphabetic");

  for (let i = 0; i <= 5; i++) {
    const fx = px + i * pw / 5;
    const fy = py + i * ph / 5;

    line(fx, py, fx, py + ph, C.GRID, 1);
    line(px, fy, px + pw, fy, C.GRID, 1);

    const xv = xmin + (xmax - xmin) * i / 5;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = C.MUTED;
    ctx.fillText(axisNum(logF ? Math.pow(10, xv) / 1000 : xv), fx, py + ph + 17);

    const yv = ymax - (ymax - ymin) * i / 5;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(axisNum(yv), px - 8, fy);
  }

  line(px, py, px, py + ph, C.AXIS, 1);
  line(px, py + ph, px + pw, py + ph, C.AXIS, 1);

  setText(C.INK, 11, "center", "middle");
  ctx.fillText(xLabel, px + pw / 2, py + ph + 40);

  ctx.save();
  ctx.translate(px - 46, py + ph / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function coordX(val, minV, maxV, x, w) {
  return x + (val - minV) * w / (maxV - minV);
}

function coordY(val, minV, maxV, y, h) {
  return y + h - (val - minV) * h / (maxV - minV);
}

function drawHistogram(x, y, w, h) {
  setText(C.INK, 14);
  ctx.fillText(chartName(3), x + 17, y + 27);

  const px = x + 60;
  const py = y + 55;
  const pw = Math.max(20, w - 83);
  const ph = Math.max(20, h - 122);

  let maxV = 0;
  let valid = 0;
  for (const p of result.pts) {
    if (finite(p.sumAbs)) {
      valid++;
      maxV = Math.max(maxV, p.sumAbs);
    }
  }

  if (!valid) {
    setText(C.MUTED, 13, "center", "middle");
    ctx.fillText("No valid pairs of relative errors.", x + w / 2, y + h / 2);
    return;
  }

  if (maxV < 1e-8) {
    setText(C.MUTED, 13, "center", "middle");
    ctx.fillText("Relative errors are numerically close to zero.", x + w / 2, y + h / 2);
    return;
  }

  maxV *= 1.00001;
  const bins = new Array(HIST_BINS).fill(0);
  let peakCount = 0;

  for (const p of result.pts) {
    if (!finite(p.sumAbs)) continue;
    let k = Math.floor(p.sumAbs / maxV * HIST_BINS);
    k = Math.max(0, Math.min(HIST_BINS - 1, k));
    bins[k]++;
    peakCount = Math.max(peakCount, bins[k]);
  }

  const ceilCount = Math.max(1, peakCount);
  drawAxes(px, py, pw, ph, 0, maxV, 0, ceilCount, false, "|eR| + |eX| [%]", "Number of points");

  ctx.fillStyle = C.HIST;
  for (let k = 0; k < HIST_BINS; k++) {
    const bx = px + pw * k / HIST_BINS;
    const bh = ph * bins[k] / ceilCount;
    ctx.fillRect(
      bx + 1,
      py + ph - bh,
      Math.max(1, pw / HIST_BINS - 2),
      bh
    );
  }
}

function drawResultsSidebar(x, y, w, h) {
  roundedRect(x, y, w, h, 11, C.PAPER, C.BORDER);

  setText(C.INK, 16);
  ctx.fillText("RESULTS", x + 19, y + 30);

  if (!result) {
    setText(C.MUTED, 13);
    drawWrappedText(
      "After selecting a file, the estimated Cole parameters, circle coefficients, and relative fit errors will appear here.",
      x + 19, y + 56, w - 38, 19
    );
    return;
  }

  const r = result;
  const left = x + 19;
  const right = x + w - 19;
  let yy = y + 54;

  setText(C.MUTED, 11);
  ctx.fillText(
    `Points: ${r.pts.length}   |   f: ${axisNum(r.fMin / 1000)}-${axisNum(r.fMax / 1000)} kHz`,
    left, yy
  );

  yy += 19;
  lineSep(x + 19, yy, x + w - 19);
  yy += 23;
  sectionLabel("ESTIMATED PARAMETERS", left, yy);
  yy += 26;

  statRow("Rinf [ohm]", nice(r.Rinf), left, right, yy); yy += 27;
  statRow("R1 [ohm]", nice(r.R1), left, right, yy); yy += 27;
  statRow("alpha", nice(r.alpha), left, right, yy); yy += 27;
  statRow("C (CPE) [S*s^alpha]", nice(r.C), left, right, yy); yy += 28;

  lineSep(x + 19, yy, x + w - 19);
  yy += 22;
  sectionLabel("FIT COEFFICIENTS", left, yy);
  yy += 21;

  statRow("a", nice(r.a), left, right, yy); yy += 23;
  statRow("b", nice(r.b), left, right, yy); yy += 23;
  statRow("c", nice(r.c), left, right, yy); yy += 23;
  statRow("q = R1*C", nice(r.q), left, right, yy); yy += 22;

  lineSep(x + 19, yy, x + w - 19);
  yy += 23;
  sectionLabel("RELATIVE FIT ERRORS [%]", left, yy);
  yy += 26;

  const colR = x + w - 139;
  const colX = x + w - 19;

  setText(C.MUTED, 11, "right");
  ctx.fillText("R", colR, yy);
  ctx.fillText("X", colX, yy);
  yy += 24;

  metricRow("Mean", r.meanER, r.meanEX, left, colR, colX, yy); yy += 25;
  metricRow("Mean abs.", r.maeER, r.maeEX, left, colR, colX, yy); yy += 25;
  metricRow("RMS", r.rmsER, r.rmsEX, left, colR, colX, yy); yy += 25;
  metricRow("Max. abs.", r.maxER, r.maxEX, left, colR, colX, yy); yy += 22;

  lineSep(x + 19, yy, x + w - 19);
  yy += 25;

  setText(C.MUTED, 11);
  ctx.fillText("Sum |eR| + |eX| [%]", left, yy);
  setText(C.INK, 12, "right");
  ctx.fillText(nice(r.totalAbs), right, yy);

  yy += 25;
  setText(C.MUTED, 10);
  ctx.fillText(`Valid: R=${r.validR}, X=${r.validX}, pairs=${r.validPairs}`, left, yy);

  yy += 26;
  setText(C.MUTED, 10);
  drawWrappedText(
    "eR=100*(Rfit-Rmeas)/Rmeas\neX=100*(Xfit-Xmeas)/Xmeas\nParameter errors cannot be calculated without reference values.",
    left, yy, w - 38, 14
  );
}

function lineSep(x1, y, x2) {
  line(x1, y, x2, y, C.BORDER, 1);
}

function sectionLabel(s, x, y) {
  setText(C.ACCENT, 11);
  ctx.fillText(s, x, y);
}

function statRow(label, value, left, right, yy) {
  setText(C.MUTED, 12);
  ctx.fillText(label, left, yy);
  setText(C.INK, 13, "right");
  ctx.fillText(value, right, yy);
}

function metricRow(label, rv, xv, left, colR, colX, yy) {
  setText(C.MUTED, 11);
  ctx.fillText(label, left, yy);
  setText(C.INK, 11, "right");
  ctx.fillText(smallErr(rv), colR, yy);
  ctx.fillText(smallErr(xv), colX, yy);
}

function nice(x) {
  if (!finite(x)) return "n/a";
  const a = Math.abs(x);
  return (a > 0 && (a < 0.0001 || a >= 100000))
    ? x.toExponential(5)
    : x.toFixed(6);
}

function smallErr(x) {
  return finite(x) ? x.toFixed(4) : "n/a";
}

function axisNum(x) {
  if (Math.abs(x) < 1e-13) x = 0;
  const a = Math.abs(x);

  if (a > 0 && (a < 0.001 || a >= 10000)) {
    return cleanExponent(x.toExponential(2));
  }

  return stripTrailingZeros(Number(x).toPrecision(3));
}

function cleanExponent(s) {
  return s
    .replace(/e\+?(-?)0*(\d+)/i, "e$1$2")
    .replace(/(\.\d*?[1-9])0+e/i, "$1e")
    .replace(/\.0+e/i, "e");
}

function stripTrailingZeros(s) {
  if (/e/i.test(s)) return cleanExponent(s);
  return s
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

resizeCanvas();

})();
