const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const frontendRoot = path.resolve(__dirname, '..');
const resolveFromFrontend = { paths: [frontendRoot] };
const pdfjsPackage = require(require.resolve('pdfjs-dist/package.json', resolveFromFrontend));
const sourcePath = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs', resolveFromFrontend);
const source = fs.readFileSync(sourcePath);
const workerName = `pdf.worker-${pdfjsPackage.version}.min.mjs`;
const buildPath = path.resolve(frontendRoot, process.env.BUILD_PATH || 'build');
const publicWorkerPath = path.join(frontendRoot, 'public', workerName);
const builtWorkerPath = path.join(buildPath, workerName);

function fail(message) {
  console.error(`[pdfjs-worker] ${message}`);
  process.exit(1);
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

if (!fs.existsSync(publicWorkerPath)) {
  fail(`Missing public/${workerName}. Run npm run prepare:pdfjs-worker first.`);
}

const publicWorker = fs.readFileSync(publicWorkerPath);
if (!publicWorker.equals(source)) {
  fail(`public/${workerName} does not match pdfjs-dist/build/pdf.worker.min.mjs.`);
}

if (!fs.existsSync(builtWorkerPath)) {
  fail(`Missing ${path.relative(frontendRoot, builtWorkerPath)}. The build did not copy public/${workerName}.`);
}

const builtWorker = fs.readFileSync(builtWorkerPath);
const builtWorkerText = builtWorker.toString('utf8');

if (!builtWorker.equals(source)) {
  fail(
    `Built worker differs from the package source (built sha256=${sha256(builtWorker)}, source sha256=${sha256(source)}).`,
  );
}

if (builtWorkerText.includes('@babel/runtime')) {
  fail('Built worker contains Babel runtime imports.');
}

if (/^\s*import[\s(]/m.test(builtWorkerText)) {
  fail('Built worker is not self-contained: import statements were found.');
}

const staticJsDir = path.join(buildPath, 'static', 'js');
if (!fs.existsSync(staticJsDir)) {
  fail(`Missing ${path.relative(frontendRoot, staticJsDir)}.`);
}

const referencingBundles = fs
  .readdirSync(staticJsDir)
  .filter((name) => name.endsWith('.js'))
  .filter((name) => fs.readFileSync(path.join(staticJsDir, name), 'utf8').includes('pdf.worker-'));

if (referencingBundles.length === 0) {
  fail('No production JavaScript bundle references the versioned PDF.js worker URL.');
}

console.log(`[pdfjs-worker] verified ${path.relative(frontendRoot, builtWorkerPath)}`);
console.log(`[pdfjs-worker] bytes=${builtWorker.length} sha256=${sha256(builtWorker)}`);
console.log(`[pdfjs-worker] bundle references: ${referencingBundles.join(', ')}`);
