// Builds the web version into web-dist/ (published to GitHub Pages by .github/workflows/web.yml).
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "web-dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);

const common = { bundle: true, minify: true, format: "iife", target: "chrome110", logLevel: "warning" };
esbuild.buildSync({
  ...common,
  entryPoints: ["web/webapi.js"],
  outfile: path.join(out, "webapi.js"),
  alias: { exceljs: "exceljs/dist/exceljs.min.js" }, // browser build of the spreadsheet library
});
esbuild.buildSync({ ...common, entryPoints: ["cloud.js"], outfile: path.join(out, "cloud.bundle.js") });

let html = fs.readFileSync("src/index.html", "utf8");
const replaceOnce = (from, to) => {
  if (!html.includes(from)) throw new Error("build-web: missing " + from);
  html = html.replace(from, to);
};
// The browser talks to the address services directly
replaceOnce("connect-src 'self' https://*.googleapis.com", "connect-src 'self' https://*.googleapis.com https://photon.komoot.io");
replaceOnce('<script src="cloud.bundle.js"></script>', '<script src="webapi.js"></script>\n<script src="cloud.bundle.js"></script>');
replaceOnce("<title>Simple CRM</title>", `<title>Simple CRM</title>
<link rel="icon" href="icon.png">
<link rel="apple-touch-icon" href="icon.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#1f2a37">`);
fs.writeFileSync(path.join(out, "index.html"), html);

fs.copyFileSync("build/icon.png", path.join(out, "icon.png"));
fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
  name: "Simple CRM",
  short_name: "CRM",
  start_url: ".",
  display: "standalone",
  background_color: "#f5f6f8",
  theme_color: "#1f2a37",
  icons: [{ src: "icon.png", sizes: "1024x1024", type: "image/png" }],
}, null, 2));
console.log("Web version built in web-dist/");
