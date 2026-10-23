const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const frontendRoot = path.resolve(__dirname, '..');
const resolveFromFrontend = { paths: [frontendRoot] };
const pdfjsPackage = require(require.resolve('pdfjs-dist/package.json', resolveFromFrontend));
const sourcePath = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs', resolveFromFrontend);
const publicDir = path.join(frontendRoot, 'public');
const outputName = `pdf.worker-${pdfjsPackage.version}.min.mjs`;
const outputPath = path.join(publicDir, outputName);

function fail(message) {
  console.error(`[pdfjs-worker] ${message}`);
  process.exit(1);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const source = fs.readFileSync(sourcePath);
const sourceText = source.toString('utf8');

if (source.length === 0) {
  fail(`Worker source is empty: ${sourcePath}`);
}

if (sourceText.includes('@babel/runtime')) {
  fail('Worker source already contains Babel runtime references.');
}

if (/^\s*import[\s(]/m.test(sourceText)) {
  fail('Worker source is not self-contained: import statements were found.');
}

fs.mkdirSync(publicDir, { recursive: true });

let action = 'written';
if (fs.existsSync(outputPath) && fs.readFileSync(outputPath).equals(source)) {
  action = 'up-to-date';
} else {
  fs.writeFileSync(outputPath, source);
}

console.log(`[pdfjs-worker] ${action}: public/${outputName}`);
console.log(
  `[pdfjs-worker] source=${path.relative(frontendRoot, sourcePath)} bytes=${source.length} sha256=${sha256(source)}`,
);
