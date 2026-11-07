// Builds PriceScope_DevOps_Presentation.pptx  (run: node build.js)
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
const { applyTheme } = require("C:/Users/aayus/AppData/Local/Claude-Data/claude_pzs8sxrjxfjjc/local-agent-mode-sessions/skills-plugin/1f37d5b6-b923-417f-b0af-d8cca8101bac/4767df22-d168-47c5-a2c9-ebde9aab7f18/skills/pptx/scripts/apply_theme.js");

const OUT = path.join(__dirname, "PriceScope_DevOps_Presentation.pptx");
const IMG = f => path.join(__dirname, "img", f);
const TERM = f => path.join(__dirname, "screens", f);

/* ---------------------------------------------------------------- theme */
const INK = "262626", MUTED = "5E5A55", SOFT = "ECE9E1", LINE = "D8D4CA", WHITE = "FFFFFF";
const BG = "F6F5F0", BORDER = "6B2A2A", GOOD = "2F6B4A", TERMBG = "0C0F16";   // template background, maroon frame, success green, terminal
const LOGO = IMG("nmims_logo.png");                                          // 330 x 259
const P = { 1: "7A2430", 2: "3F3F44", 3: "80623A" };                         // one colour per speaker
const THEME = {
  name: "PriceScope DevOps", headFontFace: "Times New Roman", bodyFontFace: "Calibri",
  colors: { dk1: INK, lt1: WHITE, dk2: MUTED, lt2: SOFT, accent1: P[1], accent2: P[2], accent3: P[3],
            accent4: "A0262B", accent5: "6B2A2A", accent6: "8A8680", hlink: P[1], folHlink: MUTED },
};
const HEAD = "Times New Roman", BODY = "Calibri", MONO = "Courier New";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";                      // 13.33 x 7.5 in
pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };
pres.title = "PriceScope - DevOps Project";
pres.author = "Aayush Nayak, Ritwik Shetty, Iram Shaikh";
pres.subject = "BTI DS Sem 11 - DevOps Project";

const SPEAKERS = {
  1: { name: "Ritwik Shetty", id: "E008", part: "Part 1  ·  Why DevOps" },
  2: { name: "Aayush Nayak", id: "E007", part: "Part 2  ·  What We Built, Step by Step" },
  3: { name: "Iram Shaikh", id: "E037", part: "Part 3  ·  Results & Wrap-up" },
};
const TEAM = [["E007", "Aayush Nayak"], ["E008", "Ritwik Shetty"], ["E037", "Iram Shaikh"]];

/* ---------------------------------------------------------------- layouts */
function contentLayout(n) {
  const s = SPEAKERS[n];
  pres.defineSlideMaster({
    title: `Part ${n}`, background: { color: BG },
    objects: [
      { image: { path: LOGO, x: 11.5, y: 0.2, w: 1.2, h: 0.94 } },
      { rect: { x: 0.6, y: 0.38, w: 2.5, h: 0.36, fill: { color: P[n] }, rectRadius: 0.18 } },
      { text: { text: s.name.toUpperCase(), options: { x: 0.6, y: 0.38, w: 2.5, h: 0.36, align: "center", valign: "middle", fontFace: BODY, fontSize: 13, bold: true, color: WHITE, margin: 0 } } },
      { text: { text: s.part, options: { x: 3.3, y: 0.38, w: 6, h: 0.36, valign: "middle", fontFace: BODY, fontSize: 13, color: MUTED, margin: 0 } } },
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.95, w: 10.6, h: 0.7, fontFace: HEAD, fontSize: 36, bold: true, color: INK, align: "left", valign: "middle", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "sub", type: "body", x: 0.6, y: 1.62, w: 12.1, h: 0.4, fontFace: BODY, fontSize: 16, color: MUTED, align: "left", valign: "top", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 12.1, y: 7.0, w: 0.6, h: 0.3, fontFace: BODY, fontSize: 11, color: MUTED, align: "right" },
  });
}
[1, 2, 3].forEach(contentLayout);
pres.defineSlideMaster({ title: "Title", background: { color: BG }, objects: [] });

/* ---------------------------------------------------------------- helpers */
let current = 0;
function newSlide(part, title, sub) {
  if (part !== current) { pres.addSection({ title: SPEAKERS[part].part }); current = part; }
  const s = pres.addSlide({ masterName: `Part ${part}`, sectionTitle: SPEAKERS[part].part });
  s.addText(title, { placeholder: "title" });
  s.addText(sub, { placeholder: "sub" });
  return s;
}
const txt = (s, t, o) => s.addText(t, { isTextBox: true, fontFace: BODY, color: INK, margin: 0, valign: "top", ...o });
const card = (s, x, y, w, h, fill = SOFT, extra = {}) =>
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.1, ...extra });

function pngSize(f) {
  const b = fs.readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function picture(s, file, x, y, w, h, alt) {                        // fits inside the box without stretching, centred
  const p = pngSize(file), k = Math.min(w / p.w, h / p.h), iw = p.w * k, ih = p.h * k;
  s.addImage({ path: file, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih, altText: alt });
}
function terminal(s, file, x, y, w, h, alt) {                       // real command output on a matching dark panel
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: TERMBG }, line: { color: TERMBG, width: 0 } });
  const p = pngSize(file), k = Math.min(w / p.w, h / p.h), iw = p.w * k, ih = p.h * k;
  s.addImage({ path: file, x, y, w: iw, h: ih, altText: alt });
}
function node(s, x, y, w, h, title, sub, { fill = SOFT, color = INK, subColor = MUTED, titleSize = 15, subSize = 12 } = {}) {
  card(s, x, y, w, h, fill);
  txt(s, title, { x: x + 0.08, y: y + (sub ? 0.1 : 0), w: w - 0.16, h: sub ? 0.32 : h, align: "center", valign: "middle", fontSize: titleSize, bold: true, color });
  if (sub) txt(s, sub, { x: x + 0.1, y: y + 0.43, w: w - 0.2, h: h - 0.48, align: "center", fontSize: subSize, color: subColor });
}
function arrow(s, x1, y1, x2, y2, color = MUTED) {                  // straight arrow: right, left, up or down
  s.addShape(pres.ShapeType.line, {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1, line: { color, width: 1.75, endArrowType: "triangle" },
  });
}
function seg(s, x1, y1, x2, y2, color = MUTED) {
  s.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), line: { color, width: 1.75 } });
}
function numRow(s, part, x, y, w, n, head, body, gap = 1.1) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: 0.46, h: 0.46, fill: { color: P[part] }, line: { color: P[part], width: 0 } });
  txt(s, String(n), { x, y, w: 0.46, h: 0.46, align: "center", valign: "middle", fontSize: 16, bold: true, color: WHITE });
  txt(s, head, { x: x + 0.62, y: y - 0.03, w: w - 0.62, h: 0.34, fontSize: 18, bold: true });
  txt(s, body, { x: x + 0.62, y: y + 0.32, w: w - 0.62, h: gap - 0.34, fontSize: 14, color: MUTED });
}
function codePanel(s, code, x, y, w, h, size = 13) {
  card(s, x, y, w, h, INK);
  txt(s, code, { x: x + 0.22, y: y + 0.16, w: w - 0.44, h: h - 0.32, fontFace: MONO, fontSize: size, color: "E8E6DF", lineSpacingMultiple: 1.05 });
}
function stat(s, x, y, w, big, small, color = P[2]) {
  card(s, x, y, w, 1.28, SOFT);
  txt(s, big, { x: x + 0.1, y: y + 0.12, w: w - 0.2, h: 0.68, align: "center", valign: "middle", fontFace: HEAD, fontSize: 34, bold: true, color });
  txt(s, small, { x: x + 0.1, y: y + 0.8, w: w - 0.2, h: 0.42, align: "center", fontSize: 13, color: MUTED });
}
const caption = (s, t, x, y, w) => txt(s, t, { x, y, w, h: 0.28, fontSize: 12, color: MUTED });

function frameBox(s, x, y, w, h) {                                  // the template's double maroon frame + institute lines
  s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { type: "none" }, line: { color: BORDER, width: 4.5 } });
  s.addShape(pres.ShapeType.rect, { x: x + 0.1, y: y + 0.1, w: w - 0.2, h: h - 0.2, fill: { type: "none" }, line: { color: BORDER, width: 1 } });
  const L = (t, last) => ({ text: t, options: { bold: true, breakLine: !last, paraSpaceAfter: 6 } });
  s.addText([L("SVKM’s NMIMS"), L("Mukesh Patel School of Technology Management and Engineering, Vile Parle, Mumbai- 400056"), L("Department of Data Science", true)],
    { isTextBox: true, x: x + 0.25, y: y + 0.18, w: w - 0.5, h: h - 0.36, align: "center", valign: "middle", fontFace: BODY, fontSize: 15, color: INK, margin: 0 });
}

/* ================================================================ TITLE */
{
  const s = pres.addSlide({ masterName: "Title" });
  s.addImage({ path: LOGO, x: 10.9, y: 0.35, w: 1.9, h: 1.49, altText: "NMIMS logo" });
  s.addText("BTI DS  ·  SEMESTER 11  ·  DEVOPS PROJECT", { isTextBox: true, x: 0.8, y: 0.6, w: 9, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: INK, charSpacing: 2, margin: 0 });
  s.addText("PriceScope", { isTextBox: true, x: 0.8, y: 1.15, w: 7.2, h: 1.2, fontFace: HEAD, fontSize: 60, bold: true, color: INK, margin: 0 });
  s.addText("Containerised, Orchestrated and Automated", { isTextBox: true, x: 0.8, y: 2.4, w: 7.2, h: 0.55, fontFace: HEAD, fontSize: 26, color: INK, margin: 0 });
  s.addText("A retail price tracker delivered with Docker, Kubernetes and a CI/CD pipeline", { isTextBox: true, x: 0.8, y: 3.05, w: 6.6, h: 0.7, fontFace: BODY, fontSize: 16, color: MUTED, margin: 0 });
  TEAM.forEach(([id, nm], i) => {
    s.addText(id, { isTextBox: true, x: 0.8, y: 4.0 + i * 0.42, w: 0.9, h: 0.3, fontFace: MONO, fontSize: 14, color: P[1], margin: 0 });
    s.addText(nm, { isTextBox: true, x: 1.7, y: 4.0 + i * 0.42, w: 4, h: 0.3, fontFace: BODY, fontSize: 17, bold: true, color: INK, margin: 0 });
  });
  [["Docker", "Package"], ["Compose", "Run locally"], ["Kubernetes", "Orchestrate"], ["GitHub Actions", "Automate"], ["Trivy", "Secure"], ["Prometheus metrics", "Format only, no server"]].forEach(([t, d], i) => {
    const x = 7.75 + (i % 2) * 2.55, y = 2.2 + Math.floor(i / 2) * 1.05;
    node(s, x, y, 2.4, 0.9, t, d, { titleSize: 15, subSize: 13 });
  });
  frameBox(s, 0.8, 5.65, 11.7, 1.4);
}

/* ================================================================ PART 1 - WHY DEVOPS */
{
  const s = newSlide(1, "The Application: PriceScope", "A real, data-heavy web app is what we took through the DevOps journey.");
  numRow(s, 1, 0.6, 2.35, 5.0, 1, "What it does", "Tracks prices of 8,817 products and shows history, deals and alerts.", 1.2);
  numRow(s, 1, 0.6, 3.6, 5.0, 2, "How it is built", "Python Flask web server, PostgreSQL database, and a JavaScript front end.", 1.2);
  numRow(s, 1, 0.6, 4.85, 5.0, 3, "Why it suits DevOps", "Three parts must start in the right order: database, then data load, then the app.", 1.2);
  picture(s, IMG("overview.png"), 5.95, 2.2, 6.75, 4.5, "PriceScope overview page running on Kubernetes");
}
{
  const s = newSlide(1, "Problem Statement", "“It works on my machine” is not good enough.");
  card(s, 0.6, 2.25, 5.7, 4.45, INK);
  txt(s, "THE MANUAL WAY: RUNNING THE APP ON A NEW LAPTOP", { x: 0.95, y: 2.5, w: 5.0, h: 0.3, fontSize: 12, bold: true, color: "C5CAD3", charSpacing: 1 });
  ["Install PostgreSQL by hand", "Create a .env file and type the password", "pip install every Python library", "Run the data cleaning script", "Run the database load script", "Start the Python server"].forEach((t, i) => {
    txt(s, String(i + 1), { x: 0.95, y: 2.98 + i * 0.58, w: 0.4, h: 0.45, fontFace: HEAD, fontSize: 24, bold: true, color: "E0B4B9", valign: "middle" });
    txt(s, t, { x: 1.45, y: 2.98 + i * 0.58, w: 4.6, h: 0.45, fontSize: 16, color: WHITE, valign: "middle" });
  });
  txt(s, "WHAT COULD GO WRONG", { x: 6.9, y: 2.25, w: 5.8, h: 0.3, fontSize: 12, bold: true, color: MUTED, charSpacing: 1 });
  [["Different machines, different results", "Another Python or PostgreSQL version can break the app."],
   ["One crash means downtime", "If the server stops, nobody restarts it until someone notices."],
   ["Changes are risky", "No automatic tests, so a bug can reach users unnoticed."]].forEach(([h, d], i) => {
    const y = 2.65 + i * 1.37;
    card(s, 6.9, y, 5.8, 1.22, SOFT);
    txt(s, String(i + 1), { x: 7.1, y: y + 0.18, w: 0.6, h: 0.85, fontSize: 36, bold: true, fontFace: HEAD, color: P[1], valign: "middle" });
    txt(s, h, { x: 7.8, y: y + 0.18, w: 4.7, h: 0.4, fontSize: 18, bold: true });
    txt(s, d, { x: 7.8, y: y + 0.6, w: 4.7, h: 0.5, fontSize: 14, color: MUTED });
  });
}
{
  const s = newSlide(1, "Objectives", "Four goals, each solving one problem from the last slide.");
  [["01", "Containerise", "Package the app and everything it needs into one Docker image that runs anywhere."],
   ["02", "Orchestrate", "Use Kubernetes to run several copies, replace failures and update with no downtime."],
   ["03", "Automate", "Use a GitHub Actions pipeline to lint, test, scan and publish on every push."],
   ["04", "Monitor", "Add health checks, Prometheus-format metrics and a live DevOps dashboard in the UI."]].forEach(([n, h, d], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 2.35 + Math.floor(i / 2) * 2.15;
    card(s, x, y, 5.95, 1.95, SOFT);
    txt(s, n, { x: x + 0.3, y: y + 0.25, w: 1.3, h: 0.9, fontSize: 48, bold: true, fontFace: HEAD, color: P[1] });
    txt(s, h, { x: x + 1.7, y: y + 0.3, w: 4.0, h: 0.45, fontSize: 22, bold: true });
    txt(s, d, { x: x + 1.7, y: y + 0.82, w: 4.0, h: 0.95, fontSize: 15, color: MUTED });
  });
}
{
  const s = newSlide(1, "What is DevOps?", "Building software and running software, treated as one continuous process.");
  const st = [["Code", "Git, GitHub", "Save every change with history"], ["Test", "pytest, ruff", "Check nothing is broken"], ["Build", "Docker", "Package the app into an image"],
    ["Scan", "Trivy", "Look for known security holes"], ["Publish", "GHCR", "Store the image online"], ["Deploy", "Kubernetes", "Run it, with no downtime"], ["Monitor", "Probes, /metrics", "Watch that it stays healthy"]];
  const w = 1.6, gap = 0.15;
  st.forEach(([n, t, d], i) => {
    const x = 0.6 + i * (w + gap);
    card(s, x, 2.35, w, 2.75, SOFT);
    s.addShape(pres.ShapeType.ellipse, { x: x + 0.56, y: 2.5, w: 0.48, h: 0.48, fill: { color: P[1] }, line: { color: P[1], width: 0 } });
    txt(s, String(i + 1), { x: x + 0.56, y: 2.5, w: 0.48, h: 0.48, align: "center", valign: "middle", fontSize: 16, bold: true, color: WHITE });
    txt(s, n, { x: x + 0.08, y: 3.08, w: w - 0.16, h: 0.36, align: "center", fontSize: 18, bold: true });
    txt(s, t, { x: x + 0.08, y: 3.46, w: w - 0.16, h: 0.3, align: "center", fontSize: 13, bold: true, color: P[1] });
    txt(s, d, { x: x + 0.12, y: 3.82, w: w - 0.24, h: 1.2, align: "center", fontSize: 14, color: MUTED });
    if (i < 6) arrow(s, x + w + 0.005, 3.7, x + w + gap - 0.005, 3.7, P[1]);
  });
  card(s, 0.6, 5.35, 12.1, 1.3, INK);
  txt(s, "The idea in one line", { x: 0.95, y: 5.5, w: 11.4, h: 0.3, fontSize: 13, bold: true, color: "C5CAD3" });
  txt(s, "If a step is done by hand, it can be done wrong. So we turn every step into code that runs the same way every time.", { x: 0.95, y: 5.82, w: 11.4, h: 0.7, fontSize: 20, fontFace: HEAD, color: WHITE });
}
{
  const s = newSlide(1, "End-to-End Architecture", "Two paths: how code becomes an image, and how a user reaches the app.");
  txt(s, "BUILD PATH", { x: 0.6, y: 2.2, w: 3, h: 0.28, fontSize: 12, bold: true, color: MUTED, charSpacing: 1 });
  const W = 2.1, xs = [0.6, 3.1, 5.6, 8.1, 10.6];
  [["Developer", "git push"], ["GitHub", "stores the code"], ["GitHub Actions", "tests, scans, builds"], ["Container Registry", "GHCR stores the image"]].forEach(([t, d], i) => {
    node(s, xs[i], 2.52, W, 1.05, t, d, { fill: i === 2 ? P[1] : SOFT, color: i === 2 ? WHITE : INK, subColor: i === 2 ? "F2DCDF" : MUTED, subSize: 13 });
    if (i < 3) arrow(s, xs[i] + W + 0.03, 3.05, xs[i + 1] - 0.03, 3.05);
  });
  seg(s, xs[3] + W / 2, 3.59, xs[3] + W / 2, 4.14);
  seg(s, xs[2] + W / 2, 4.14, xs[3] + W / 2, 4.14);
  arrow(s, xs[2] + W / 2, 4.14, xs[2] + W / 2, 4.72);
  txt(s, "image", { x: 7.7, y: 3.84, w: 1.3, h: 0.26, fontSize: 12, color: MUTED, align: "center" });
  txt(s, "RUN PATH", { x: 0.6, y: 4.4, w: 3, h: 0.28, fontSize: 12, bold: true, color: MUTED, charSpacing: 1 });
  [["User's browser", "localhost:8081"], ["K8s Service", "shares the traffic"], ["App pods × 2", "Flask + gunicorn"], ["PostgreSQL pod", "the database"], ["Volume", "data survives restarts"]].forEach(([t, d], i) => {
    node(s, xs[i], 4.74, W, 1.05, t, d, { fill: i === 2 ? P[1] : SOFT, color: i === 2 ? WHITE : INK, subColor: i === 2 ? "F2DCDF" : MUTED, subSize: 13 });
    if (i < 4) arrow(s, xs[i] + W + 0.03, 5.27, xs[i + 1] - 0.03, 5.27);
  });
  caption(s, "All of this is defined in code: Dockerfile, docker-compose.yml, k8s/*.yaml and .github/workflows/ci-cd.yml", 0.6, 6.1, 12.1);
}

/* ================================================================ PART 2 - WHAT WE BUILT */
{
  const s = newSlide(2, "Step 1: Prepare the App", "Making the app behave well inside a container.");
  [["Settings from the environment", "Database host and password are set outside the code."],
   ["Production web server", "gunicorn serves the app, built for real traffic."],
   ["Health and metrics addresses", "/healthz, /readyz and /metrics tell tools how the app is doing."],
   ["Safe to restart", "etl/load.py --if-empty skips loading if the data is already there."]].forEach(([h, d], i) => numRow(s, 2, 0.6, 2.35 + i * 1.1, 6.3, i + 1, h, d, 1.0));
  codePanel(s, "Devops_Project_Sem_11/\n├── app/            Flask API + web UI\n├── etl/            data loading\n├── sql/            schema, views, trigger\n├── data/clean/     the dataset\n├── tests/          automated tests\n├── Dockerfile\n├── docker-compose.yml\n├── k8s/            Kubernetes manifests\n├── scripts/        deploy-k8s.ps1\n└── .github/workflows/ci-cd.yml", 7.2, 2.3, 5.5, 4.35, 14);
}
{
  const s = newSlide(2, "Step 2: Docker Image", "A Dockerfile is a recipe. It produces one package that runs the same everywhere.");
  node(s, 0.6, 2.3, 2.6, 1.15, "Dockerfile", "the recipe, stored in Git", { subSize: 13 });
  arrow(s, 3.23, 2.87, 3.72, 2.87);
  node(s, 3.75, 2.3, 2.6, 1.15, "docker build", "follows the recipe", { fill: P[2], color: WHITE, subColor: "DDDDDD", subSize: 13 });
  arrow(s, 3.23 + 3.15, 2.87, 6.87, 2.87);
  node(s, 6.9, 2.3, 2.6, 1.15, "Image", "sealed package, 225 MB", { fill: P[2], color: WHITE, subColor: "DDDDDD", subSize: 13 });
  arrow(s, 9.53, 2.87, 10.07, 2.87);
  node(s, 10.1, 2.3, 2.6, 1.15, "Container", "the image, running", { subSize: 13 });
  codePanel(s, "# Stage 1: install libraries\nFROM python:3.12-slim AS builder\nRUN pip install --prefix=/install \\\n    -r requirements.txt\n\n# Stage 2: only what ships\nFROM python:3.12-slim\nCOPY --from=builder /install /usr/local\nCOPY app etl sql data/clean ...\nUSER 10001\nHEALTHCHECK ... /healthz\nCMD [\"gunicorn\", ... \"server:app\"]", 0.6, 3.7, 6.2, 3.05, 12);
  [["Multi-stage build", "Build leftovers are thrown away"], ["Non-root user", "USER 10001 limits possible damage"], ["Built-in health check", "Docker can tell if it is healthy"]].forEach(([h, d], i) => {
    const y = 3.7 + i * 1.04;
    card(s, 7.1, y, 5.6, 0.92, SOFT);
    txt(s, h, { x: 7.35, y: y + 0.1, w: 5.1, h: 0.36, fontSize: 17, bold: true });
    txt(s, d, { x: 7.35, y: y + 0.48, w: 5.1, h: 0.34, fontSize: 14, color: MUTED });
  });
}
{
  const s = newSlide(2, "Our Docker Image", "Real output from our machine: small, layered and clean.");
  terminal(s, TERM("t_images.png"), 0.6, 2.25, 6.9, 0.87, "docker images output showing pricescope-app 1.0.0 at 225MB");
  terminal(s, TERM("t_layers.png"), 0.6, 3.22, 6.9, 3.5, "docker history output listing image layers and sizes");
  stat(s, 7.8, 2.25, 2.35, "225 MB", "final image size");
  stat(s, 10.35, 2.25, 2.35, "0", "high or critical issues", GOOD);
  caption(s, "Trivy security scan of the image", 7.8, 3.6, 4.9);
  terminal(s, TERM("t_trivy.png"), 7.8, 3.88, 4.9, 1.95, "Trivy results showing 0 vulnerabilities");
  card(s, 7.8, 5.93, 4.9, 0.79, SOFT);
  txt(s, "Docker reuses unchanged layers, so a small code edit rebuilds in seconds.", { x: 8.0, y: 5.93, w: 4.5, h: 0.79, valign: "middle", fontSize: 14, color: MUTED });
}
{
  const s = newSlide(2, "Step 3: Docker Compose", "One command starts all three containers, in the right order.");
  codePanel(s, "docker compose up --build", 0.6, 2.25, 6.2, 0.62, 16);
  node(s, 0.6, 3.1, 1.85, 1.25, "1. db", "waits until healthy", { subSize: 13 });
  arrow(s, 2.47, 3.72, 2.76, 3.72);
  node(s, 2.78, 3.1, 1.85, 1.25, "2. loader", "loads data, then exits", { subSize: 13 });
  arrow(s, 4.65, 3.72, 4.93, 3.72);
  node(s, 4.95, 3.1, 1.85, 1.25, "3. app", "serves port 5000", { fill: P[2], color: WHITE, subColor: "DDDDDD", subSize: 13 });
  stat(s, 0.6, 4.55, 3.0, "6 → 1", "manual steps to one command");
  stat(s, 3.8, 4.55, 3.0, "15 s", "start with image already built", GOOD);
  caption(s, "First run including image build: 68 seconds", 0.6, 5.95, 6.2);
  terminal(s, TERM("t_compose.png"), 7.1, 2.25, 5.6, 1.11, "docker compose ps showing app and db healthy and loader exited 0");
  terminal(s, TERM("t_loader.png"), 7.1, 3.46, 5.6, 3.3, "Loader logs showing rows loaded and second run skipping");
}
{
  const s = newSlide(2, "Step 4: Kubernetes in Plain English", "Docker runs a container. Kubernetes keeps a whole application running.");
  [["Pod", "Our app running", "The smallest unit: one running container."],
   ["Deployment", "The manager", "Keeps 2 app pods alive and updates them safely."],
   ["Service", "The receptionist", "One address that shares visitors between pods."],
   ["StatefulSet + Volume", "The filing cabinet", "Runs the database and keeps its data safe."],
   ["Job", "A one-off task", "Loads the data once, then finishes."],
   ["ConfigMap", "The settings sheet", "Normal settings, kept outside the image."],
   ["Secret", "The locked drawer", "Holds the password, separate from the code."],
   ["RBAC", "The ID badge", "The app may read pods and scale itself, nothing else."]].forEach(([h, a, d], i) => {
    const x = 0.6 + (i % 4) * 3.07, y = 2.3 + Math.floor(i / 4) * 2.27;
    card(s, x, y, 2.9, 2.1, SOFT);
    txt(s, h, { x: x + 0.18, y: y + 0.15, w: 2.54, h: 0.38, fontSize: 18, bold: true });
    txt(s, a, { x: x + 0.18, y: y + 0.55, w: 2.54, h: 0.3, fontSize: 14, bold: true, color: P[2], italic: true });
    txt(s, d, { x: x + 0.18, y: y + 0.92, w: 2.54, h: 1.05, fontSize: 15, color: MUTED });
  });
}
{
  const s = newSlide(2, "Our Kubernetes Architecture", "Everything lives in one namespace, defined by the YAML files in k8s/.");
  node(s, 0.6, 3.25, 1.55, 1.1, "Browser", ":8081", { subSize: 13 });
  s.addShape(pres.ShapeType.roundRect, { x: 2.55, y: 2.25, w: 10.15, h: 4.5, fill: { color: WHITE }, line: { color: P[2], width: 1.5, dashType: "dash" }, rectRadius: 0.08 });
  txt(s, "Namespace: pricescope", { x: 2.75, y: 2.33, w: 4, h: 0.28, fontSize: 13, bold: true, color: P[2] });
  arrow(s, 2.18, 3.8, 2.83, 3.8);
  node(s, 2.85, 3.25, 1.95, 1.1, "Service", "LoadBalancer", { fill: P[2], color: WHITE, subColor: "DDDDDD", subSize: 13 });
  node(s, 5.5, 2.65, 2.05, 1.0, "App pod 1", "Deployment", { fill: P[1], color: WHITE, subColor: "F2DCDF", subSize: 13 });
  node(s, 5.5, 3.95, 2.05, 1.0, "App pod 2", "Deployment", { fill: P[1], color: WHITE, subColor: "F2DCDF", subSize: 13 });
  seg(s, 4.82, 3.8, 5.14, 3.8); seg(s, 5.14, 3.15, 5.14, 4.45);
  arrow(s, 5.14, 3.15, 5.48, 3.15); arrow(s, 5.14, 4.45, 5.48, 4.45);
  seg(s, 7.57, 3.15, 7.87, 3.15); seg(s, 7.57, 4.45, 7.87, 4.45); seg(s, 7.87, 3.15, 7.87, 4.45);
  arrow(s, 7.87, 3.8, 8.13, 3.8);
  node(s, 8.15, 3.25, 1.85, 1.1, "postgres", "headless Service", { subSize: 13 });
  arrow(s, 10.02, 3.8, 10.38, 3.8);
  node(s, 10.4, 3.25, 2.1, 1.1, "postgres-0", "StatefulSet", { fill: P[3], color: WHITE, subColor: "F4E8D6", subSize: 13 });
  arrow(s, 11.45, 4.37, 11.45, 5.33);
  node(s, 10.4, 5.35, 2.1, 1.1, "1 Gi Volume", "PersistentVolumeClaim", { subSize: 12 });
  node(s, 8.15, 5.35, 1.85, 1.1, "db-loader", "Job, runs once", { subSize: 13 });
  arrow(s, 9.07, 5.33, 9.07, 4.37);
  node(s, 5.5, 5.35, 2.05, 1.1, "ConfigMap + Secret", "settings, password", { titleSize: 13, subSize: 13 });
  arrow(s, 6.52, 5.33, 6.52, 4.97);
  node(s, 2.85, 5.35, 1.95, 1.1, "ServiceAccount", "+ Role (RBAC)", { titleSize: 14, subSize: 13 });
}
{
  const s = newSlide(2, "Running on Our Cluster", "Real output of kubectl: every part is up and healthy.");
  terminal(s, TERM("t_k8s.png"), 0.6, 2.25, 7.0, 4.59, "kubectl output showing pods, services, deployment, statefulset and job");
  numRow(s, 2, 7.95, 2.35, 4.75, 1, "2 app pods, 1/1 ready", "Two copies share all the traffic.", 0.95);
  numRow(s, 2, 7.95, 3.35, 4.75, 2, "postgres-0 running", "The database, with a permanent name.", 0.95);
  numRow(s, 2, 7.95, 4.35, 4.75, 3, "db-loader Completed", "A Job finishes on purpose after loading.", 0.95);
  card(s, 7.95, 5.4, 4.75, 1.44, INK);
  txt(s, "One script deploys it all", { x: 8.18, y: 5.52, w: 4.3, h: 0.32, fontSize: 14, color: "C5CAD3", bold: true });
  txt(s, "scripts\\deploy-k8s.ps1", { x: 8.18, y: 5.88, w: 4.3, h: 0.34, fontFace: MONO, fontSize: 16, bold: true, color: WHITE });
  txt(s, "Build, secret, manifests, wait", { x: 8.18, y: 6.28, w: 4.3, h: 0.34, fontSize: 14, color: "C5CAD3" });
}
{
  const s = newSlide(2, "Step 5: CI/CD Pipeline", "Every push to GitHub runs these checks automatically, with no one watching.");
  node(s, 0.6, 3.6, 1.7, 1.25, "git push", "to main branch", { fill: INK, color: WHITE, subColor: "C5CAD3", subSize: 13 });
  seg(s, 2.32, 4.22, 2.65, 4.22); seg(s, 2.65, 3.1, 2.65, 5.45);
  arrow(s, 2.65, 3.1, 2.98, 3.1); arrow(s, 2.65, 5.45, 2.98, 5.45);
  card(s, 3.0, 2.3, 3.9, 1.65, SOFT);
  txt(s, "Job 1: Lint and test", { x: 3.2, y: 2.4, w: 3.5, h: 0.35, fontSize: 17, bold: true, color: P[2] });
  txt(s, [{ text: "Starts a real PostgreSQL", options: { bullet: true, breakLine: true } }, { text: "Checks code style with ruff", options: { bullet: true, breakLine: true } }, { text: "Runs 37 tests with pytest", options: { bullet: true } }], { x: 3.2, y: 2.77, w: 3.5, h: 1.1, fontSize: 14, color: MUTED });
  card(s, 3.0, 4.65, 3.9, 1.65, SOFT);
  txt(s, "Job 2: Validate Kubernetes", { x: 3.2, y: 4.75, w: 3.5, h: 0.35, fontSize: 17, bold: true, color: P[2] });
  txt(s, [{ text: "kubeconform checks each YAML", options: { bullet: true, breakLine: true } }, { text: "Bad manifests are caught before they reach a cluster", options: { bullet: true } }], { x: 3.2, y: 5.12, w: 3.5, h: 1.1, fontSize: 14, color: MUTED });
  seg(s, 6.92, 3.1, 7.3, 3.1); seg(s, 6.92, 5.45, 7.3, 5.45); seg(s, 7.3, 3.1, 7.3, 5.45);
  arrow(s, 7.3, 4.22, 7.63, 4.22);
  card(s, 7.65, 2.3, 5.05, 4.0, P[1]);
  txt(s, "Job 3: Build, scan and publish", { x: 7.9, y: 2.4, w: 4.6, h: 0.36, fontSize: 18, bold: true, color: WHITE });
  txt(s, "Runs only if Jobs 1 and 2 both pass", { x: 7.9, y: 2.76, w: 4.6, h: 0.28, fontSize: 13, color: "F2DCDF" });
  ["Build the Docker image", "Scan it with Trivy", "Smoke test: start it, call /healthz", "Log in to GitHub Container Registry", "Push, tagged by commit and latest"].forEach((t, i) => {
    const y = 3.14 + i * 0.6;
    s.addShape(pres.ShapeType.ellipse, { x: 7.9, y, w: 0.42, h: 0.42, fill: { color: WHITE }, line: { color: WHITE, width: 0 } });
    txt(s, String(i + 1), { x: 7.9, y, w: 0.42, h: 0.42, align: "center", valign: "middle", fontSize: 14, bold: true, color: P[1] });
    txt(s, t, { x: 8.47, y, w: 4.1, h: 0.42, valign: "middle", fontSize: 15, color: WHITE });
  });
}
{
  const s = newSlide(2, "Automated Testing", "Real results from the same commands the pipeline runs.");
  stat(s, 0.6, 2.25, 2.35, "37 / 37", "tests passed", GOOD);
  stat(s, 3.1, 2.25, 2.35, "11 / 11", "K8s resources valid", GOOD);
  txt(s, "WHAT THE TESTS COVER", { x: 0.6, y: 3.75, w: 4.85, h: 0.3, fontSize: 12, bold: true, color: MUTED, charSpacing: 1 });
  txt(s, [{ text: "Every analysis query runs without error", options: { bullet: true, breakLine: true } }, { text: "Data counts match: 8,817 products", options: { bullet: true, breakLine: true } }, { text: "SQL Lab blocks DELETE and DROP", options: { bullet: true, breakLine: true } }, { text: "Database trigger logs a price drop", options: { bullet: true, breakLine: true } }, { text: "Health, metrics and shutdown safety", options: { bullet: true } }],
    { x: 0.6, y: 4.08, w: 4.85, h: 2.6, fontSize: 15, color: INK, paraSpaceAfter: 6 });
  terminal(s, TERM("t_tests.png"), 5.8, 2.25, 6.9, 3.27, "pytest output showing 37 passed");
  terminal(s, TERM("t_kubeconform.png"), 5.8, 5.65, 6.9, 0.67, "kubeconform summary showing 11 valid resources");
}

{
  const s = newSlide(2, "Proof: Docker and Compose", "Live output: the image is built and the containers are running.");
  txt(s, "Docker", { x: 0.6, y: 2.2, w: 5.95, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("p_docker.png"), 0.6, 2.65, 5.95, 2.7, "Docker version, pricescope-app image at 225MB and healthy running containers");
  card(s, 0.6, 5.5, 5.95, 1.15, SOFT);
  txt(s, "Our image is built, and its containers report healthy using the Dockerfile's health check.", { x: 0.85, y: 5.5, w: 5.45, h: 1.15, fontSize: 15, valign: "middle" });
  txt(s, "Docker Compose", { x: 6.75, y: 2.2, w: 5.95, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("p_compose.png"), 6.75, 2.65, 5.95, 2.7, "Compose version and app, db and loader services");
  card(s, 6.75, 5.5, 5.95, 1.15, SOFT);
  txt(s, "All three services ran from one file. Exited (0) means the loader finished successfully.", { x: 7.0, y: 5.5, w: 5.45, h: 1.15, fontSize: 15, valign: "middle" });
}
{
  const s = newSlide(2, "Proof: Kubernetes", "Live output from our cluster, and the same pods inside our own app.");
  terminal(s, TERM("p_k8s.png"), 0.6, 2.25, 6.95, 3.82, "kubectl version, nodes, pods and services");
  caption(s, "kubectl on our single-node Docker Desktop cluster", 0.6, 6.15, 6.95);
  caption(s, "The DevOps Dashboard in our app, reading the Kubernetes API", 7.8, 2.25, 4.9);
  picture(s, IMG("proof_pods.png"), 7.8, 2.55, 4.9, 1.25, "Live cluster table in the DevOps Dashboard");
  numRow(s, 2, 7.8, 4.05, 4.9, 1, "Cluster is Ready", "A real control-plane node on v1.36.1.", 0.85);
  numRow(s, 2, 7.8, 4.85, 4.9, 2, "Pods are running", "2 app pods and the database, 0 restarts.", 0.85);
  numRow(s, 2, 7.8, 5.65, 4.9, 3, "Service is live", "The LoadBalancer serves port 8081.", 0.85);
}
{
  const s = newSlide(2, "Proof: GitHub Actions", "Our pipeline really ran on GitHub: all 3 jobs passed in 1 min 35 s.");
  caption(s, "Pipeline run on GitHub", 0.6, 2.13, 5.6);
  picture(s, IMG("proof_actions_run.png"), 0.6, 2.42, 5.6, 2.28, "GitHub Actions run with status Success and three green jobs");
  caption(s, "Published image on GitHub Container Registry", 0.6, 4.77, 5.6);
  picture(s, IMG("proof_ghcr.png"), 0.6, 5.05, 5.6, 1.82, "pricescope-app package page on GHCR");
  caption(s, "Steps inside the Build, scan and publish job", 6.4, 2.13, 6.3);
  picture(s, IMG("proof_actions_steps.png"), 6.4, 2.42, 6.3, 2.69, "Job steps with green ticks, including Scan image and Publish image");
  card(s, 6.4, 5.25, 6.3, 1.62, INK);
  txt(s, "Anyone can pull our image", { x: 6.65, y: 5.36, w: 5.8, h: 0.34, fontSize: 16, bold: true, color: WHITE });
  txt(s, "docker pull ghcr.io/aayushhn123/\npricescope-app:latest", { x: 6.65, y: 5.72, w: 5.8, h: 0.6, fontFace: MONO, fontSize: 15, color: "E8E6DF" });
  txt(s, "Published tags: latest and f5ff888 (the commit)", { x: 6.65, y: 6.4, w: 5.8, h: 0.34, fontSize: 14, color: "C5CAD3" });
}
{
  const s = newSlide(2, "Proof: Trivy and Prometheus Metrics", "A clean security scan, and the metrics our app exposes.");
  txt(s, "Trivy security scan", { x: 0.6, y: 2.2, w: 5.75, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("p_trivy.png"), 0.6, 2.65, 5.75, 2.75, "Trivy results showing 0 vulnerabilities across all targets");
  card(s, 0.6, 5.55, 5.75, 1.2, SOFT);
  txt(s, "Counts high and critical issues that have a known fix. In the pipeline, Trivy reports but does not fail the build.", { x: 0.85, y: 5.55, w: 5.25, h: 1.2, fontSize: 15, valign: "middle" });
  txt(s, "Prometheus-format metrics", { x: 6.55, y: 2.2, w: 6.15, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("p_metrics.png"), 6.55, 2.65, 6.15, 2.75, "Metrics output from the app in Prometheus text format");
  card(s, 6.55, 5.55, 6.15, 1.2, INK);
  txt(s, "No Prometheus server was used.", { x: 6.8, y: 5.63, w: 5.65, h: 0.36, fontSize: 17, bold: true, color: WHITE });
  txt(s, "The app only exposes its metrics in Prometheus format. Nothing collects or stores them.", { x: 6.8, y: 6.0, w: 5.65, h: 0.68, fontSize: 14, color: "C5CAD3" });
}

/* ================================================================ PART 3 - RESULTS */
{
  const s = newSlide(3, "The DevOps Dashboard", "A dedicated page makes DevOps visible in the UI itself.");
  picture(s, IMG("devops_top.png"), 0.6, 2.25, 7.75, 4.45, "DevOps dashboard showing KPIs, pipeline, live pods and team");
  numRow(s, 3, 8.65, 2.3, 4.05, 1, "Live numbers", "Environment, version, uptime, database health, traffic.", 1.05);
  numRow(s, 3, 8.65, 3.42, 4.05, 2, "Pipeline view", "The seven stages each change goes through.", 1.05);
  numRow(s, 3, 8.65, 4.54, 4.05, 3, "Live cluster table", "Real pods, with the one serving you highlighted.", 1.05);
  numRow(s, 3, 8.65, 5.66, 4.05, 4, "Status and team", "Every page shows where it runs and who built it.", 1.05);
}
{
  const s = newSlide(3, "The Application on Kubernetes", "Every feature runs inside the cluster, served by our pods.");
  picture(s, IMG("explorer.png"), 0.6, 2.2, 5.95, 3.35, "Product explorer searching for Sony headphones");
  picture(s, IMG("modal.png"), 6.75, 2.2, 5.95, 3.35, "Product detail window with price history chart");
  txt(s, "Product Explorer", { x: 0.6, y: 5.65, w: 5.95, h: 0.34, fontSize: 18, bold: true });
  txt(s, "Search and filter across 8,817 products", { x: 0.6, y: 6.0, w: 5.95, h: 0.3, fontSize: 14, color: MUTED });
  txt(s, "Product details", { x: 6.75, y: 5.65, w: 5.95, h: 0.34, fontSize: 18, bold: true });
  txt(s, "Price history, category rank and alerts", { x: 6.75, y: 6.0, w: 5.95, h: 0.3, fontSize: 14, color: MUTED });
}
{
  const s = newSlide(3, "Shutdown Button", "Stops the app from the UI, whichever way it is running.");
  [["1  Click, top right", "shutdown_button.png", "Shutdown button in the top bar"], ["2  Confirm", "shutdown_confirm_crop.png", "Shutdown confirmation dialog"], ["3  App stopped", "shutdown_done_crop.png", "Stopped screen showing the restart command"]].forEach(([t, f, alt], i) => {
    const x = 0.6 + i * 3.05;
    s.addShape(pres.ShapeType.rect, { x, y: 2.2, w: 2.95, h: 1.97, fill: { color: TERMBG }, line: { color: TERMBG, width: 0 } });
    txt(s, t, { x: x + 0.12, y: 2.27, w: 2.7, h: 0.3, fontSize: 13, bold: true, color: WHITE });
    picture(s, IMG(f), x + 0.1, 2.6, 2.75, 1.5, alt);
  });
  card(s, 9.75, 2.2, 2.95, 1.97, INK);
  txt(s, "Why not just exit?", { x: 9.92, y: 2.28, w: 2.65, h: 0.34, fontSize: 16, bold: true, fontFace: HEAD, color: WHITE });
  txt(s, "Kubernetes would restart a stopped pod, so we ask it for 0 copies instead.", { x: 9.92, y: 2.66, w: 2.65, h: 1.4, fontSize: 14, color: "C5CAD3" });
  const h = o => ({ bold: true, color: WHITE, fill: { color: P[3] }, fontSize: 14, ...o });
  s.addTable([
    [{ text: "Running on", options: h() }, { text: "What the button does", options: h() }, { text: "Command to start again", options: h() }],
    [{ text: "Kubernetes", options: { bold: true } }, "Scales the Deployment to 0 pods", { text: "kubectl scale deployment pricescope-app -n pricescope --replicas=2", options: { fontFace: MONO, fontSize: 11 } }],
    [{ text: "Docker Compose", options: { bold: true } }, "Exits cleanly; restart: on-failure keeps it stopped", { text: "docker compose up -d app", options: { fontFace: MONO, fontSize: 11 } }],
    [{ text: "Local Python", options: { bold: true } }, "Ends the server process", { text: "python app/server.py", options: { fontFace: MONO, fontSize: 11 } }],
  ], { x: 0.6, y: 4.4, w: 12.1, colW: [2.1, 4.8, 5.2], rowH: 0.48, fontFace: BODY, fontSize: 14, color: INK, valign: "middle", fill: { color: WHITE }, border: { type: "solid", color: LINE, pt: 0.75 } });
  caption(s, "Tested on Compose by clicking the button in a browser, and on Kubernetes by sending the same request. Each time the app stopped and the command brought it back.", 0.6, 6.5, 12.1);
}
{
  const s = newSlide(3, "Self-Healing", "We deleted a running pod on purpose. Users never noticed.");
  terminal(s, TERM("t_selfheal.png"), 0.6, 2.25, 7.4, 2.97, "kubectl output showing a pod deleted and replaced");
  [["A pod dies", P[1]], ["K8s sees 1 of 2", P[2]], ["Starts a new pod", P[2]], ["Back to 2", GOOD]].forEach(([t, c], i) => {
    const x = 0.6 + i * 1.88;
    node(s, x, 5.45, 1.75, 1.15, t, null, { fill: c, color: WHITE, titleSize: 15 });
    if (i < 3) arrow(s, x + 1.76, 6.02, x + 1.87, 6.02);
  });
  stat(s, 8.35, 2.25, 4.35, "4 to 8 s", "for the replacement pod to become ready");
  stat(s, 8.35, 3.7, 4.35, "0 failed", "of 1,648 requests, across 3 test runs", GOOD);
  card(s, 8.35, 5.15, 4.35, 1.45, SOFT);
  txt(s, "How it was measured", { x: 8.55, y: 5.25, w: 3.95, h: 0.32, fontSize: 15, bold: true });
  txt(s, "4 parallel clients sent steady traffic while the pod was deleted.", { x: 8.55, y: 5.59, w: 3.95, h: 0.9, fontSize: 14, color: MUTED });
}
{
  const s = newSlide(3, "Scaling and Zero-Downtime Updates", "More copies on demand, and new versions with no outage.");
  txt(s, "Scaling up", { x: 0.6, y: 2.2, w: 6, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("t_scale.png"), 0.6, 2.65, 5.9, 2.52, "kubectl scale output showing 4 running pods");
  stat(s, 0.6, 5.35, 5.9, "4.8 s", "to go from 2 to 4 running pods");
  txt(s, "Rolling update", { x: 6.8, y: 2.2, w: 5.9, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("t_rolling.png"), 6.8, 2.65, 5.9, 1.37, "kubectl rollout status showing success");
  [["New pod", P[2]], ["Ready?", P[2]], ["Old pod off", P[2]]].forEach(([t, c], i) => {
    const x = 6.8 + i * 2.05;
    node(s, x, 4.2, 1.8, 0.8, t, null, { fill: c, color: WHITE, titleSize: 15 });
    if (i < 2) arrow(s, x + 1.81, 4.6, x + 2.04, 4.6);
  });
  stat(s, 6.8, 5.35, 2.85, "≈ 8 s", "for a full update");
  stat(s, 9.85, 5.35, 2.85, "0 failed", "of 1,838 requests, 3 runs", GOOD);
}
{
  const s = newSlide(3, "Data Safety and Monitoring", "The data survives, and the app reports its own health.");
  txt(s, "Data survives a database crash", { x: 0.6, y: 2.2, w: 5.9, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("t_persist.png"), 0.6, 2.65, 5.9, 2.54, "Watchlist count stays 1 after postgres pod deletion");
  card(s, 0.6, 5.35, 5.9, 1.3, SOFT);
  txt(s, "Same count before and after the pod was deleted. The app reconnected by itself within 7 seconds.", { x: 0.85, y: 5.47, w: 5.4, h: 1.06, fontSize: 16, valign: "middle" });
  txt(s, "The app reports its health", { x: 6.8, y: 2.2, w: 5.9, h: 0.4, fontSize: 20, bold: true });
  terminal(s, TERM("t_health.png"), 6.8, 2.65, 5.9, 1.84, "curl responses from healthz, readyz and metrics");
  [["/healthz", "Alive? If not, restart it."], ["/readyz", "Ready? If not, send no traffic."], ["/metrics", "Prometheus format. No server used."]].forEach(([p, d], i) => {
    const y = 4.65 + i * 0.68;
    card(s, 6.8, y, 5.9, 0.6, SOFT);
    txt(s, p, { x: 7.0, y, w: 1.6, h: 0.6, valign: "middle", fontFace: MONO, fontSize: 14, bold: true, color: P[3] });
    txt(s, d, { x: 8.65, y, w: 3.9, h: 0.6, valign: "middle", fontSize: 15 });
  });
}
{
  const s = newSlide(3, "Challenges We Hit", "Real problems from our testing, and how we fixed them.");
  [["One request failed during an update", "Pods were shutting down before traffic had moved away.", "Added a 5-second preStop delay. 0 failures in 3 re-tests."],
   ["Kubernetes undid the shutdown", "It restarts any pod that exits. That is its job.", "The button scales to 0 pods instead of exiting."],
   ["Restarts could wipe the data", "The load script always rebuilt the database from scratch.", "Added --if-empty, so a loaded database is left alone."],
   ["Redeploys kept running old code", "The cluster reused its cached image because the tag never changed.", "Every deploy now gets a unique image tag."]].forEach(([h, p, f], i) => {
    const x = 0.6 + (i % 2) * 6.15, y = 2.25 + Math.floor(i / 2) * 2.3;
    card(s, x, y, 5.95, 2.15, SOFT);
    txt(s, h, { x: x + 0.25, y: y + 0.13, w: 5.45, h: 0.38, fontSize: 18, bold: true });
    txt(s, p, { x: x + 0.25, y: y + 0.55, w: 5.45, h: 0.62, fontSize: 14, color: MUTED });
    txt(s, "FIX", { x: x + 0.25, y: y + 1.27, w: 0.55, h: 0.6, fontSize: 13, bold: true, color: GOOD, valign: "middle" });
    txt(s, f, { x: x + 0.82, y: y + 1.27, w: 4.9, h: 0.6, fontSize: 15, bold: true, color: GOOD, valign: "middle" });
  });
}
{
  const s = newSlide(3, "What DevOps Gives Us", "The manual way compared with ours, in numbers we measured ourselves.");
  const h = o => ({ bold: true, color: WHITE, fill: { color: P[3] }, fontSize: 15, ...o });
  const good = t => ({ text: t, options: { color: GOOD, bold: true } });
  const b = t => ({ text: t, options: { bold: true } });
  s.addTable([
    [{ text: "", options: h() }, { text: "Without DevOps", options: h() }, { text: "With DevOps", options: h() }],
    [b("Setting up"), "6 manual steps", good("1 command")],
    [b("Starting"), "Depends on the person doing it", good("15 s, or 68 s with first build")],
    [b("If the server crashes"), "Stays down until someone restarts it", good("New pod ready in 4 to 8 s, 0 failed requests")],
    [b("Handling more users"), "1 process, cannot grow", good("2 to 4 pods in 4.8 s")],
    [b("Releasing an update"), "Stop the app, then start it again", good("Rolling update, 0 failed requests")],
    [b("Testing"), "By hand", good("37 automated tests")],
    [b("Security checks"), "None", good("Image scan: 0 high or critical; non-root user")],
    [b("Database password"), "In a file on the laptop", good("Kubernetes Secret, random, never in Git")],
  ], { x: 0.6, y: 2.25, w: 12.1, colW: [3.1, 4.1, 4.9], rowH: 0.48, fontFace: BODY, fontSize: 15, color: INK, valign: "middle", fill: { color: WHITE }, border: { type: "solid", color: LINE, pt: 0.75 } });
}
{
  const s = newSlide(3, "Conclusion & Future Scope", "A working DevOps pipeline, and a clear path to take it further.");
  card(s, 0.6, 2.3, 5.95, 4.35, SOFT);
  txt(s, "WHAT WE DELIVERED", { x: 0.9, y: 2.5, w: 5.4, h: 0.3, fontSize: 13, bold: true, color: P[3], charSpacing: 1 });
  txt(s, ["A 225 MB, non-root Docker image", "One-command start with Docker Compose", "Kubernetes deployment that heals and scales", "CI/CD pipeline with tests and security scan", "Health checks, metrics and a live dashboard", "Shutdown control built into the UI"].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })),
    { x: 0.9, y: 2.9, w: 5.4, h: 3.55, fontSize: 17, paraSpaceAfter: 9 });
  card(s, 6.75, 2.3, 5.95, 4.35, INK);
  txt(s, "FUTURE SCOPE", { x: 7.05, y: 2.5, w: 5.4, h: 0.3, fontSize: 13, bold: true, color: "C5CAD3", charSpacing: 1 });
  txt(s, ["Deploy to a cloud cluster (AWS EKS or Google GKE)", "Run a Prometheus server with Grafana dashboards", "Autoscaling based on real load", "Automatic deployment after each pipeline run", "Package the manifests as a Helm chart"].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })),
    { x: 7.05, y: 2.9, w: 5.4, h: 3.55, fontSize: 17, color: WHITE, paraSpaceAfter: 9 });
}

/* ================================================================ THANK YOU */
{
  const s = pres.addSlide({ masterName: "Title" });
  s.addImage({ path: LOGO, x: 10.9, y: 0.35, w: 1.9, h: 1.49, altText: "NMIMS logo" });
  s.addText("Thank you", { isTextBox: true, x: 0.8, y: 0.95, w: 9, h: 1.2, fontFace: HEAD, fontSize: 60, bold: true, color: INK, margin: 0 });
  s.addText("Questions?", { isTextBox: true, x: 0.8, y: 2.15, w: 9, h: 0.6, fontFace: HEAD, fontSize: 28, color: MUTED, margin: 0 });
  TEAM.forEach(([id, nm], i) => {
    s.addText(id, { isTextBox: true, x: 0.8, y: 3.15 + i * 0.45, w: 0.9, h: 0.32, fontFace: MONO, fontSize: 15, color: P[1], margin: 0 });
    s.addText(nm, { isTextBox: true, x: 1.7, y: 3.15 + i * 0.45, w: 4, h: 0.32, fontFace: BODY, fontSize: 18, bold: true, color: INK, margin: 0 });
  });
  s.addText("BTI DS  ·  Semester 11  ·  DevOps Project", { isTextBox: true, x: 0.8, y: 4.65, w: 8, h: 0.35, fontFace: BODY, fontSize: 16, color: MUTED, margin: 0 });
  frameBox(s, 0.8, 5.65, 11.7, 1.4);
}

pres.writeFile({ fileName: OUT }).then(async () => {
  await applyTheme(OUT, THEME);
  console.log("wrote", OUT);
});
