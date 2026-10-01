/*
  COLE FIT - p5.js web version

  Input: .txt file with f,R,X columns; f in Hz, R and X in ohms.
  For the capacitive Cole model, X = Im(Z) = -Y <= 0.
  Delimiters: comma, semicolon, or whitespace; use a decimal point.
  The first row "f,R,X" is optional; blank lines and comments (#, %, //) are ignored.

  Web behavior:
    - Click OPEN .TXT or press O to choose a local file.
    - Press R to re-read the last selected File object.
    - The selected file is read locally by the browser; it is not uploaded by this code.
*/

const PI_D = Math.PI;
const DET_MIN = 1.0e-12;
const U_DEN_MIN = 1.0e-24;
const REL_DEN_MIN = 1.0e-12;
const HIST_BINS = 20;

const BG = "#F3F5F9";
const PAPER = "#FFFFFF";
const BORDER = "#DCE2EA";
const INK = "#182431";
const MUTED = "#64748B";
const RED_LINE = "#D8433C";
const MEASURED = "#17212F";
const GRID = "#E9EDF2";
const ACCENT = "#176B9A";

let result = null;
let statusText = "Select a .txt file with f,R,X columns.";
let shownFileName = "No file loaded";
let lastFile = null;
let filePicker = null;
let busy = false;

function setup() {
  const c = createCanvas(
    Math.max(windowWidth, 1100),
    Math.max(windowHeight, 760)
  );
  c.parent("app");

  frameRate(30);
  textFont("Arial");

  filePicker = document.getElementById("filePicker");
  if (!filePicker) {
    throw new Error("File picker element was not found in index.html.");
  }

  filePicker.addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setExternalStatus("No file selected.", false);
      return;
    }

    setExternalStatus(`Selected: ${file.name}`, false);
    await loadAndFit(file);
  });

  window.addEventListener("error", (event) => {
    const msg = event && event.message ? event.message : "Unknown JavaScript error";
    setExternalStatus("JavaScript error: " + msg, true);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event && event.reason ? event.reason : "Unknown promise error";
    const msg = reason && reason.message ? reason.message : String(reason);
    setExternalStatus("JavaScript error: " + msg, true);
  });
}

function windowResized() {
  resizeCanvas(
    Math.max(windowWidth, 1100),
    Math.max(windowHeight, 760)
  );
}

function draw() {
  background(BG);
  drawHeader();

  const margin = 18;
  const gap = 14;
  const sidebarW = constrain(width * 0.26, 332, 386);
  const sideX = width - margin - sidebarW;
  const chartsW = sideX - margin - gap;
  const chartW = (chartsW - gap) / 2.0;
  const top = 104;
  const bottom = height - 18;
  const chartH = (bottom - top - gap) / 2.0;

  drawChartCard(margin, top, chartW, chartH, 0);
  drawChartCard(margin + chartW + gap, top, chartW, chartH, 1);
  drawChartCard(margin, top + chartH + gap, chartW, chartH, 2);
  drawChartCard(margin + chartW + gap, top + chartH + gap, chartW, chartH, 3);
  drawResultsSidebar(sideX, top, sidebarW, bottom - top);
}

function drawHeader() {
  noStroke();
  fill(PAPER);
  rect(0, 0, width, 86);
  stroke(BORDER);
  line(0, 86, width, 86);

  const over = mouseX >= 18 && mouseX <= 177 && mouseY >= 20 && mouseY <= 62;
  noStroke();
  fill(over ? "#115578" : ACCENT);
  rect(18, 20, 159, 42, 9);

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(13);
  text(busy ? "LOADING..." : "OPEN .TXT", 97.5, 41);

  fill(INK);
  textAlign(LEFT, BASELINE);
  textSize(20);
  text("COLE FIT", 199, 38);

  fill(MUTED);
  textSize(12);
  text("Circle fit + q estimation  |  Web / p5.js v3", 200, 57);

  const sx = Math.min(630, Math.max(360, width * 0.47));
  const available = width - sx - 18;
  textSize(12);
  fill(INK);
  text(shorten(shownFileName, available), sx, 33);
  fill(MUTED);
  text(shorten(statusText, available), sx, 54);
}

function mousePressed() {
  // The HTML OPEN .TXT button sits over the canvas and opens the native picker.
}

function keyPressed() {
  if (!busy && (key === "o" || key === "O")) {
    openFileDialog();
  }

  if (!busy && (key === "r" || key === "R") && lastFile) {
    loadAndFit(lastFile);
  }
}

function openFileDialog() {
  // Clearing value lets the same file be selected again and still fire "change".
  filePicker.value = "";
  filePicker.click();
}

async function loadAndFit(file) {
  result = null;
  shownFileName = file.name;
  busy = true;
  statusText = "Reading file...";
  setExternalStatus(`Reading ${file.name}...`, false);

  try {
    const textData = await readFileAsText(file);

    if (!textData || !textData.trim()) {
      throw new Error("The selected TXT file is empty.");
    }

    statusText = "Parsing and fitting...";
    const input = readDataText(textData);
    const fitted = coleFit(input);

    result = fitted;
    lastFile = file;
    statusText = `Fit complete: ${fitted.pts.length} points.  O = open, R = reload.`;
    setExternalStatus(statusText, false);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    statusText = "ERROR: " + msg;
    setExternalStatus(statusText, true);
    console.error(err);
  } finally {
    busy = false;
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(
      new Error("Browser could not read the selected local file.")
    );
    reader.onabort = () => reject(new Error("File reading was cancelled."));

    reader.readAsText(file, "UTF-8");
  });
}

function setExternalStatus(message, isError) {
  const panel = document.getElementById("statusPanel");
  if (!panel) return;

  panel.textContent = message;
  panel.classList.toggle("error", !!isError);
  panel.classList.add("visible");

  if (!isError) {
    clearTimeout(setExternalStatus._timer);
    setExternalStatus._timer = setTimeout(() => {
      panel.classList.remove("visible");
    }, 3500);
  }
}

function readDataText(textData) {
  const lines = textData.split(/\r\n|\n|\r/);
  const data = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\uFEFF/g, "").trim();

    if (
      line.length === 0 ||
      line.startsWith("#") ||
      line.startsWith("%") ||
      line.startsWith("//")
    ) {
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

  data.sort((p1, p2) => p1.f - p2.f);

  if (data[0].f === data[data.length - 1].f) {
    throw new Error("More than one distinct frequency is required.");
  }

  return data;
}

function coleFit(p) {
  const n = p.length;
  const fit = new FitResult();

  fit.pts = p;
  fit.fMin = p[0].f;
  fit.fMax = p[n - 1].f;

  // STEPS 1 AND 2: mean values and common scale
  let R0 = 0.0;
  let Y0 = 0.0;

  for (const v of p) {
    R0 += v.r;
    Y0 += -v.x;
  }

  R0 /= n;
  Y0 /= n;

  let scl = 0.0;
  for (const v of p) {
    scl = Math.max(scl, Math.abs(v.r - R0));
    scl = Math.max(scl, Math.abs(-v.x - Y0));
  }

  if (!(scl > 0) || !finite(scl)) {
    throw new Error("Invalid data scaling.");
  }

  // STEP 3: scalar moments in centered and scaled coordinates
  let Srr = 0;
  let Syy = 0;
  let Sry = 0;
  let Tr = 0;
  let Ty = 0;
  let St = 0;

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

  // STEPS 4 AND 5: circle fit and conversion back to original R,Y coordinates
  const D = Srr * Syy - Sry * Sry;

  if (!finite(D) || Math.abs(D) < DET_MIN) {
    throw new Error("Degenerate data: the circle determinant is too small.");
  }

  const A = (-Tr * Syy + Sry * Ty) / D;
  const B = (Tr * Sry - Srr * Ty) / D;
  const C0 = -St / n;

  fit.a = A * scl - 2.0 * R0;
  fit.b = B * scl - 2.0 * Y0;
  fit.c =
    R0 * R0 +
    Y0 * Y0 -
    A * scl * R0 -
    B * scl * Y0 +
    C0 * scl * scl;

  // STEP 6: geometric Cole parameters
  const Delta = fit.a * fit.a - 4.0 * fit.c;

  if (!(Delta > 0) || !finite(Delta)) {
    throw new Error("Nonphysical fit: Delta <= 0.");
  }

  fit.R1 = Math.sqrt(Delta);
  fit.Rinf = (-fit.a - fit.R1) / 2.0;
  fit.alpha = (2.0 / PI_D) * Math.atan2(fit.R1, fit.b);

  if (
    !(fit.R1 > 0 && fit.Rinf > 0 && fit.alpha > 0 && fit.alpha <= 1.0) ||
    !finite(fit.Rinf) ||
    !finite(fit.alpha)
  ) {
    throw new Error("Nonphysical estimated parameters (Rinf, R1, or alpha).");
  }

  // STEP 7: least-squares estimate of q = R1*C
  let qNum = 0;
  let qDen = 0;
  let validQ = 0;

  for (const v of p) {
    const y = -v.x;
    const denU = sqD(v.r - fit.Rinf) + y * y;
    const numU = sqD(fit.Rinf + fit.R1 - v.r) + y * y;

    if (denU > U_DEN_MIN && numU >= 0) {
      const uHat = Math.sqrt(numU / denU);
      const waHat = Math.exp(fit.alpha * Math.log(2.0 * PI_D * v.f));

      qNum += waHat * uHat;
      qDen += waHat * waHat;
      validQ++;
    }
  }

  if (
    validQ < 3 ||
    !(qDen > 0) ||
    !finite(qNum) ||
    !finite(qDen)
  ) {
    throw new Error("q estimation failed.");
  }

  fit.q = qNum / qDen;
  fit.C = fit.q / fit.R1;

  if (!finite(fit.C) || !(fit.C > 0)) {
    throw new Error("Nonphysical estimated C coefficient.");
  }

  // Model evaluated at measured frequencies; relative errors.
  let sumER = 0;
  let sumEX = 0;
  let sumAbsER = 0;
  let sumAbsEX = 0;
  let sumSqER = 0;
  let sumSqEX = 0;
  let maxAbsER = 0;
  let maxAbsEX = 0;
  let totalAbs = 0;
  let validR = 0;
  let validX = 0;
  let validPair = 0;

  for (const v of p) {
    const modeled = coleModel(fit, v.f);

    v.rFit = modeled[0];
    v.xFit = modeled[1];
    v.eR = NaN;
    v.eX = NaN;

    if (Math.abs(v.r) > REL_DEN_MIN) {
      v.eR = 100.0 * (v.rFit - v.r) / v.r;

      if (!finite(v.eR)) throw new Error("Invalid R error.");

      sumER += v.eR;
      sumAbsER += Math.abs(v.eR);
      sumSqER += v.eR * v.eR;
      maxAbsER = Math.max(maxAbsER, Math.abs(v.eR));
      validR++;
    }

    if (Math.abs(v.x) > REL_DEN_MIN) {
      v.eX = 100.0 * (v.xFit - v.x) / v.x;

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

  fit.meanER = validR > 0 ? sumER / validR : NaN;
  fit.meanEX = validX > 0 ? sumEX / validX : NaN;
  fit.maeER = validR > 0 ? sumAbsER / validR : NaN;
  fit.maeEX = validX > 0 ? sumAbsEX / validX : NaN;
  fit.rmsER = validR > 0 ? Math.sqrt(sumSqER / validR) : NaN;
  fit.rmsEX = validX > 0 ? Math.sqrt(sumSqEX / validX) : NaN;
  fit.maxER = validR > 0 ? maxAbsER : NaN;
  fit.maxEX = validX > 0 ? maxAbsEX : NaN;
  fit.totalAbs = validPair > 0 ? totalAbs : NaN;
  fit.validR = validR;
  fit.validX = validX;
  fit.validPairs = validPair;

  // Smooth 600-point curve.
  const nm = 600;
  fit.modelF = new Array(nm);
  fit.modelR = new Array(nm);
  fit.modelX = new Array(nm);

  const ratio = Math.log(fit.fMax / fit.fMin);

  for (let j = 0; j < nm; j++) {
    fit.modelF[j] =
      fit.fMin * Math.exp(ratio * j / (nm - 1.0));

    const v = coleModel(fit, fit.modelF[j]);
    fit.modelR[j] = v[0];
    fit.modelX[j] = v[1];
  }

  return fit;
}

function coleModel(fit, f) {
  const theta = 0.5 * PI_D * fit.alpha;
  const wa = Math.exp(fit.alpha * Math.log(2.0 * PI_D * f));
  const u = fit.q * wa;
  const den = 1.0 + 2.0 * u * Math.cos(theta) + u * u;

  const rFit =
    fit.Rinf +
    fit.R1 * (1.0 + u * Math.cos(theta)) / den;

  const xFit =
    -fit.R1 * u * Math.sin(theta) / den;

  return [rFit, xFit];
}

function sqD(v) {
  return v * v;
}

function finite(v) {
  return Number.isFinite(v);
}

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

    this.fMin = NaN;
    this.fMax = NaN;

    this.a = NaN;
    this.b = NaN;
    this.c = NaN;
    this.q = NaN;
    this.Rinf = NaN;
    this.R1 = NaN;
    this.alpha = NaN;
    this.C = NaN;

    this.meanER = NaN;
    this.meanEX = NaN;
    this.maeER = NaN;
    this.maeEX = NaN;
    this.rmsER = NaN;
    this.rmsEX = NaN;
    this.maxER = NaN;
    this.maxEX = NaN;
    this.totalAbs = NaN;

    this.validR = 0;
    this.validX = 0;
    this.validPairs = 0;

    this.modelF = [];
    this.modelR = [];
    this.modelX = [];
  }
}

// ======================== EMBEDDED PLOTS ================================

function drawChartCard(x, y, w, h, which) {
  noStroke();
  fill(PAPER);
  rect(x, y, w, h, 11);
  stroke(BORDER);
  noFill();
  rect(x, y, w, h, 11);

  if (result === null) {
    fill(INK);
    textAlign(LEFT, BASELINE);
    textSize(14);
    text(chartName(which), x + 18, y + 29);

    fill(MUTED);
    textSize(13);
    textAlign(CENTER, CENTER);
    text("Plot will appear after loading and fitting", x + w / 2, y + h / 2);
    return;
  }

  if (which === 3) drawHistogram(x, y, w, h);
  else drawFitChart(x, y, w, h, which);
}

function chartName(which) {
  if (which === 0) return "Nyquist: R - X";
  if (which === 1) return "R vs. frequency";
  if (which === 2) return "X vs. frequency";
  return "Histogram: |eR| + |eX|";
}

function drawFitChart(x, y, w, h, mode) {
  const px = x + 60;
  const py = y + 55;
  const pw = Math.max(20, w - 83);
  const ph = Math.max(20, h - 122);

  const logF = mode !== 0;
  const xLabel = mode === 0 ? "R [ohm]" : "f [kHz] (log scale)";
  const yLabel = mode === 1 ? "R [ohm]" : "X [ohm]";

  fill(INK);
  textAlign(LEFT, BASELINE);
  textSize(14);
  text(chartName(mode), x + 17, y + 27);

  drawLegend(x + w - 214, y + 26);

  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;

  for (const p of result.pts) {
    const xx = logF ? Math.log10(p.f) : p.r;
    const yy = mode === 1 ? p.r : p.x;

    xmin = Math.min(xmin, xx);
    xmax = Math.max(xmax, xx);
    ymin = Math.min(ymin, yy);
    ymax = Math.max(ymax, yy);
  }

  for (let j = 0; j < result.modelF.length; j++) {
    const xx = logF ? Math.log10(result.modelF[j]) : result.modelR[j];
    const yy = mode === 1 ? result.modelR[j] : result.modelX[j];

    xmin = Math.min(xmin, xx);
    xmax = Math.max(xmax, xx);
    ymin = Math.min(ymin, yy);
    ymax = Math.max(ymax, yy);
  }

  if (xmax <= xmin) xmax = xmin + 1.0;
  if (ymax <= ymin) ymax = ymin + 1.0;

  const xpad = logF ? 0.0 : (xmax - xmin) * 0.06;
  const ypad = (ymax - ymin) * 0.10;

  xmin -= xpad;
  xmax += xpad;
  ymin -= ypad;
  ymax += ypad;

  drawAxes(px, py, pw, ph, xmin, xmax, ymin, ymax, logF, xLabel, yLabel);

  noFill();
  stroke(RED_LINE);
  strokeWeight(2.0);
  beginShape();

  for (let j = 0; j < result.modelF.length; j++) {
    const xx = logF ? Math.log10(result.modelF[j]) : result.modelR[j];
    const yy = mode === 1 ? result.modelR[j] : result.modelX[j];

    vertex(
      coordX(xx, xmin, xmax, px, pw),
      coordY(yy, ymin, ymax, py, ph)
    );
  }

  endShape();

  stroke(MEASURED);
  strokeWeight(0.7);
  fill(MEASURED);

  for (const p of result.pts) {
    const xx = logF ? Math.log10(p.f) : p.r;
    const yy = mode === 1 ? p.r : p.x;

    circle(
      coordX(xx, xmin, xmax, px, pw),
      coordY(yy, ymin, ymax, py, ph),
      3.6
    );
  }

  strokeWeight(1);
}

function drawLegend(x, y) {
  noStroke();
  fill(MEASURED);
  circle(x, y - 4, 5);

  textAlign(LEFT, BASELINE);
  textSize(10);
  fill(MUTED);
  text("Data", x + 7, y);

  stroke(RED_LINE);
  strokeWeight(2);
  line(x + 76, y - 4, x + 92, y - 4);

  noStroke();
  text("Fit", x + 96, y);
}

function drawAxes(px, py, pw, ph, xmin, xmax, ymin, ymax, logF, xLabel, yLabel) {
  textSize(10);
  textAlign(CENTER, BASELINE);

  for (let i = 0; i <= 5; i++) {
    const fx = px + i * pw / 5.0;
    const fy = py + i * ph / 5.0;

    stroke(GRID);
    strokeWeight(1);
    line(fx, py, fx, py + ph);
    line(px, fy, px + pw, fy);

    fill(MUTED);

    const xv = xmin + (xmax - xmin) * i / 5.0;
    text(axisNum(logF ? Math.pow(10, xv) / 1000.0 : xv), fx, py + ph + 17);

    const yv = ymax - (ymax - ymin) * i / 5.0;
    textAlign(RIGHT, CENTER);
    text(axisNum(yv), px - 8, fy);

    textAlign(CENTER, BASELINE);
  }

  stroke("#AEB9C7");
  line(px, py, px, py + ph);
  line(px, py + ph, px + pw, py + ph);

  noStroke();
  fill(INK);
  textSize(11);
  textAlign(CENTER, CENTER);
  text(xLabel, px + pw / 2, py + ph + 40);

  push();
  translate(px - 46, py + ph / 2);
  rotate(-HALF_PI);
  text(yLabel, 0, 0);
  pop();
}

function coordX(val, minV, maxV, x, w) {
  return x + (val - minV) * w / (maxV - minV);
}

function coordY(val, minV, maxV, y, h) {
  return y + h - (val - minV) * h / (maxV - minV);
}

function drawHistogram(x, y, w, h) {
  fill(INK);
  textAlign(LEFT, BASELINE);
  textSize(14);
  text(chartName(3), x + 17, y + 27);

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

  if (valid === 0) {
    fill(MUTED);
    textAlign(CENTER, CENTER);
    text("No valid pairs of relative errors.", x + w / 2, y + h / 2);
    return;
  }

  if (maxV < 1.0e-8) {
    fill(MUTED);
    textAlign(CENTER, CENTER);
    text("Relative errors are numerically close to zero.", x + w / 2, y + h / 2);
    return;
  }

  maxV *= 1.00001;

  const bins = new Array(HIST_BINS).fill(0);
  let peakCount = 0;

  for (const p of result.pts) {
    if (!finite(p.sumAbs)) continue;

    let k = Math.floor(p.sumAbs / maxV * HIST_BINS);
    k = constrain(k, 0, HIST_BINS - 1);

    bins[k]++;
    peakCount = Math.max(peakCount, bins[k]);
  }

  const ceilCount = Math.max(1, peakCount);

  drawAxes(
    px, py, pw, ph,
    0, maxV, 0, ceilCount,
    false,
    "|eR| + |eX| [%]",
    "Number of points"
  );

  noStroke();
  fill("#718DA5");

  for (let k = 0; k < HIST_BINS; k++) {
    const bx = px + pw * k / HIST_BINS;
    const bh = ph * bins[k] / ceilCount;

    rect(
      bx + 1,
      py + ph - bh,
      Math.max(1, pw / HIST_BINS - 2),
      bh
    );
  }
}

// ========================= RESULTS PANEL ================================

function drawResultsSidebar(x, y, w, h) {
  noStroke();
  fill(PAPER);
  rect(x, y, w, h, 11);

  stroke(BORDER);
  noFill();
  rect(x, y, w, h, 11);

  fill(INK);
  textAlign(LEFT, BASELINE);
  textSize(16);
  text("RESULTS", x + 19, y + 30);

  if (result === null) {
    fill(MUTED);
    textSize(13);
    textLeading(19);
    text(
      "After selecting a file, the estimated Cole parameters, circle coefficients, and relative fit errors will appear here.",
      x + 19, y + 56, w - 38, h - 70
    );
    return;
  }

  const r = result;
  const left = x + 19;
  const right = x + w - 19;
  let yy = y + 54;

  fill(MUTED);
  textSize(11);
  text(
    "Points: " + r.pts.length +
    "   |   f: " + axisNum(r.fMin / 1000.0) +
    "-" + axisNum(r.fMax / 1000.0) + " kHz",
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

  fill(MUTED);
  textSize(11);
  textAlign(RIGHT, BASELINE);
  text("R", colR, yy);
  text("X", colX, yy);

  yy += 24;

  metricRow("Mean", r.meanER, r.meanEX, left, colR, colX, yy); yy += 25;
  metricRow("Mean abs.", r.maeER, r.maeEX, left, colR, colX, yy); yy += 25;
  metricRow("RMS", r.rmsER, r.rmsEX, left, colR, colX, yy); yy += 25;
  metricRow("Max. abs.", r.maxER, r.maxEX, left, colR, colX, yy); yy += 22;

  lineSep(x + 19, yy, x + w - 19);
  yy += 25;

  fill(MUTED);
  textAlign(LEFT, BASELINE);
  textSize(11);
  text("Sum |eR| + |eX| [%]", left, yy);

  fill(INK);
  textAlign(RIGHT, BASELINE);
  textSize(12);
  text(nice(r.totalAbs), right, yy);

  yy += 25;

  fill(MUTED);
  textAlign(LEFT, BASELINE);
  textSize(10);
  text(
    `Valid: R=${r.validR}, X=${r.validX}, pairs=${r.validPairs}`,
    left, yy
  );

  yy += 26;

  fill(MUTED);
  textSize(10);
  textLeading(14);
  text(
    "eR=100*(Rfit-Rmeas)/Rmeas\n" +
    "eX=100*(Xfit-Xmeas)/Xmeas\n" +
    "Parameter errors cannot be calculated without reference values.",
    left, yy, w - 38, 66
  );
}

function lineSep(x1, y, x2) {
  stroke(BORDER);
  strokeWeight(1);
  line(x1, y, x2, y);
  noStroke();
}

function sectionLabel(s, x, y) {
  fill(ACCENT);
  textAlign(LEFT, BASELINE);
  textSize(11);
  text(s, x, y);
}

function statRow(label, value, left, right, yy) {
  textAlign(LEFT, BASELINE);
  fill(MUTED);
  textSize(12);
  text(label, left, yy);

  textAlign(RIGHT, BASELINE);
  fill(INK);
  textSize(13);
  text(value, right, yy);
}

function metricRow(label, r, x, left, colR, colX, yy) {
  fill(MUTED);
  textSize(11);
  textAlign(LEFT, BASELINE);
  text(label, left, yy);

  textAlign(RIGHT, BASELINE);
  fill(INK);
  textSize(11);
  text(smallErr(r), colR, yy);
  text(smallErr(x), colX, yy);
}

function nice(x) {
  if (!finite(x)) return "n/a";

  const a = Math.abs(x);

  if (a > 0 && (a < 0.0001 || a >= 100000.0)) {
    return x.toExponential(5);
  }

  return x.toFixed(6);
}

function smallErr(x) {
  return finite(x) ? x.toFixed(4) : "n/a";
}

function axisNum(x) {
  if (Math.abs(x) < 1e-13) x = 0;

  if (Math.abs(x) > 0 && (Math.abs(x) < 0.001 || Math.abs(x) >= 10000)) {
    return cleanExponent(x.toExponential(2));
  }

  // Approximately equivalent to Java's "%.3g".
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

function shorten(s, maxWidth) {
  if (textWidth(s) <= maxWidth) return s;

  let t = s;
  while (t.length > 1 && textWidth(t + "...") > maxWidth) {
    t = t.slice(0, -1);
  }

  return t + "...";
}
