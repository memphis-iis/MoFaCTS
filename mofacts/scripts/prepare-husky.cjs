const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const packageDir = process.cwd();
const huskyBin = path.join(packageDir, "node_modules", "husky", "bin.js");

if (!fs.existsSync(huskyBin)) {
  process.exit(0);
}

const gitRootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: packageDir,
  encoding: "utf8",
});

if (gitRootResult.error || gitRootResult.status !== 0) {
  process.exit(0);
}

const gitRoot = gitRootResult.stdout.trim();
const huskyDir = path.resolve(packageDir, "..", ".husky");
const huskyDirRelative = path.relative(gitRoot, huskyDir).replace(/\\/g, "/");

if (
  !fs.existsSync(huskyDir) ||
  huskyDirRelative.startsWith("..") ||
  path.isAbsolute(huskyDirRelative)
) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [huskyBin, huskyDirRelative], {
  cwd: gitRoot,
  stdio: "inherit",
});

process.exit(result.status ?? 0);
