import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const outputPath = resolve('docs-developer/ppes-lkt-js-comparison.md');
const probabilityFunctionsUrl = pathToFileURL(
  resolve('learning-components/units/learning-session/model/probabilityFunctions.ts'),
).href;

const rHarness = String.raw`
componentSpacing <- function(times) c(0, diff(times))
laggedspacing <- function(spacings) c(0, head(spacings, -1))
ppew <- function(times, wpar) {
  times^-wpar * (1 / sum(times^-wpar))
}
ppet <- function(times) {
  times[length(times)] - times
}
ppetw <- function(x, d) {
  v <- length(x)
  ppetv <- ppet(x)[1:(v - 1)]
  ppewv <- ppew(ppetv, d)
  ifelse(is.nan(crossprod(ppewv[1:(v - 1)], ppetv[1:(v - 1)])),
         1,
         crossprod(ppewv[1:(v - 1)], ppetv[1:(v - 1)]))
}
slideppetw <- function(x, d) {
  v <- c(rep(0, length(x)))
  for (i in 1:length(x)) {
    v[i] <- ppetw(x[1:i], d)
  }
  return(c(v[1:length(x)]))
}
ppes_vector <- function(cor, icor, times, par1, par2, par3, par4) {
  Nc <- cor^par1
  Tn <- times - min(times)
  spacing <- componentSpacing(times)
  space <- laggedspacing(spacing)
  space <- ifelse(space == 0, 0, 1 / log(space + exp(1)))
  space <- cumsum(space)
  total <- cor + icor
  space <- ifelse(total <= 1, 0, space / (total - 1))
  tw <- slideppetw(Tn, par4)
  Nc * tw^-(par2 + par3 * space)
}
print_case <- function(label, times, cor, icor) {
  spacing <- componentSpacing(times)
  lagged <- laggedspacing(spacing)
  Tn <- times - min(times)
  cat("\nCASE ", label, "\n", sep = "")
  cat("CF..Time.: "); dput(times)
  cat("cor: "); dput(cor)
  cat("icor: "); dput(icor)
  cat("componentSpacing(CF..Time.): "); dput(spacing)
  cat("laggedspacing: "); dput(lagged)
  cat("Tn = CF..Time. - min(CF..Time.): "); dput(Tn)
  cat("ppet(Tn): "); dput(ppet(Tn))
  cat("slideppetw(Tn,0.7191809): "); dput(slideppetw(Tn, 0.7191809))
  cat("ppes_vector(cor,icor,CF..Time.,0.6441441,0.08130677,0.1362004,0.7191809): ")
  dput(ppes_vector(cor, icor, times, 0.6441441, 0.08130677, 0.1362004, 0.7191809))
}
print_case("empty", numeric(0), numeric(0), numeric(0))
print_case("one", c(0), c(0), c(0))
print_case("two", c(0, 60), c(0, 1), c(0, 0))
print_case("three", c(0, 60, 160), c(0, 1, 2), c(0, 0, 1))
print_case("three-tight-then-wide", c(0, 2, 102), c(0, 1, 2), c(0, 0, 1))
`;

const jsHarness = `
import { createProbabilityFunctionHelpers } from '${probabilityFunctionsUrl}';

const pFunc = createProbabilityFunctionHelpers(() => {});
const safe = (fn) => {
  try {
    return fn();
  } catch (error) {
    return 'ERROR: ' + error.message;
  }
};
const show = (value) => JSON.stringify(value);
const ppesVector = (cor, icor, times) => times.map((_, index) => (
  pFunc.ppesFromTimes(
    cor[index],
    cor[index] + icor[index],
    times.slice(0, index + 1),
    0.6441441,
    0.08130677,
    0.1362004,
    0.7191809,
  )
));
const cases = [
  ['empty', [], [], []],
  ['one', [0], [0], [0]],
  ['two', [0, 60], [0, 1], [0, 0]],
  ['three', [0, 60, 160], [0, 1, 2], [0, 0, 1]],
  ['three-tight-then-wide', [0, 2, 102], [0, 1, 2], [0, 0, 1]],
];

for (const [label, times, cor, icor] of cases) {
  const spacing = safe(() => pFunc.componentSpacing(times));
  const lagged = safe(() => pFunc.spacingLagged(times));
  const tn = times.length ? times.map((time) => time - Math.min(...times)) : [];
  console.log('\\nCASE ' + label);
  console.log('CF..Time.: ' + show(times));
  console.log('cor: ' + show(cor));
  console.log('icor: ' + show(icor));
  console.log('componentSpacing(CF..Time.): ' + show(spacing));
  console.log('laggedspacing: ' + show(lagged));
  console.log('Tn = CF..Time. - min(CF..Time.): ' + show(tn));
  console.log('ppet(Tn): ' + show(safe(() => pFunc.ppet(tn))));
  console.log('slideppetw(Tn,0.7191809): ' + show(safe(() => pFunc.slideppetw(tn, 0.7191809))));
  console.log('ppesFromTimes scalar empty/current: ' + show(safe(() => (
    pFunc.ppesFromTimes(
      cor.at(-1) ?? 0,
      (cor.at(-1) ?? 0) + (icor.at(-1) ?? 0),
      times,
      0.6441441,
      0.08130677,
      0.1362004,
      0.7191809,
    )
  ))));
  console.log('ppes_vector(cor,icor,CF..Time.,0.6441441,0.08130677,0.1362004,0.7191809): ' +
    show(safe(() => ppesVector(cor, icor, times))));
}
`;

function normalizeOutput(output) {
  return output.replace(/\r\n/g, '\n').trim();
}

const tempDir = mkdtempSync(join(tmpdir(), 'mofacts-ppes-'));
const rHarnessPath = join(tempDir, 'ppes-comparison.R');
const jsHarnessPath = join(tempDir, 'ppes-comparison.mjs');

let rOutput;
let jsOutput;
try {
  writeFileSync(rHarnessPath, rHarness, 'utf8');
  writeFileSync(jsHarnessPath, jsHarness, 'utf8');

  rOutput = normalizeOutput(execFileSync('Rscript', [rHarnessPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));

  jsOutput = normalizeOutput(execFileSync(process.execPath, [
    '--experimental-strip-types',
    jsHarnessPath,
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const markdown = `# PPES LKT and JavaScript Runtime Comparison

Generated by \`node scripts/dev/generate-ppes-comparison.mjs\`.

This note compares the R LKT \`ppes\` feature helper behavior with the MoFaCTS JavaScript probability helper behavior.

## Source Behavior

The LKT \`ppes\` feature uses \`CF..Time.\` as its time source:

\`\`\`r
data$mintime <- ave(data$CF..Time., index, FUN = min)
data$Tn <- data$CF..Time. - data$mintime
data$space <- data[[paste0(fcomp, "spacinglagged")]]
data$space <- ifelse(data$space == 0, 0, 1 / log(data$space + exp(1)))
data$space <- ave(data$space, index, FUN = function(x) cumsum(x))
data$space <- ifelse((data$cor + data$icor) <= 1, 0, data$space / (data$cor + data$icor - 1))
data$tw <- ave(data$Tn, index, FUN = function(x) slideppetw(x, par4))
ppes_result <- data$Nc * data$tw^-(par2 + par3 * data$space)
\`\`\`

The JavaScript runtime uses existing history \`time\` values, not newly captured \`Date.now()\` values.

## Parameters

The comparison uses the runtime PPES parameters:

\`\`\`text
par1 = 0.6441441
par2 = 0.08130677
par3 = 0.1362004
par4 = 0.7191809
\`\`\`

## R Output

\`\`\`text
${rOutput}
\`\`\`

## JavaScript Output

\`\`\`text
${jsOutput}
\`\`\`

## Interpretation

For real one-row and later histories, the JavaScript helper matches the R LKT feature values, subject to normal floating-point representation differences.

The empty case differs intentionally for online scalar use:

- R vectorized feature generation returns \`numeric(0)\` for a full empty feature vector.
- JavaScript \`ppesFromTimes(...)\` returns scalar \`0\` for empty time history so it can safely participate in runtime probability calculations.

This scalar \`0\` matches the first usable PPES contribution when there is no prior correct history.
`;

writeFileSync(outputPath, markdown, 'utf8');
console.log(`Wrote ${outputPath}`);
