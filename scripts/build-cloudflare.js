const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");
const staticDir = path.join(root, "static");

const files = [
  "index.html",
  "line.html",
  "privacy.html",
  "terms.html",
  "support.html"
];

function copyFileIfExists(source, destination) {
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function copyDir(source, destination) {
  try {
    fs.accessSync(source);
  } catch {
    return;
  }

  fs.mkdirSync(destination, { recursive: true });
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      copyFileIfExists(sourcePath, destinationPath);
    }
  }
}

function main() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    copyFileIfExists(path.join(root, file), path.join(outDir, file));
  }
  copyDir(staticDir, path.join(outDir, "static"));

  fs.writeFileSync(
    path.join(outDir, "_headers"),
    [
      "/*",
      "  X-Content-Type-Options: nosniff",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "",
      "/static/*",
      "  Cache-Control: public, max-age=0, must-revalidate",
      ""
    ].join("\n"),
    "utf8"
  );

  console.log(`Cloudflare Pages build ready: ${path.relative(root, outDir)}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
