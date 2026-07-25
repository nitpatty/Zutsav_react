const fs   = require('fs');
const path = require('path');
const { uploadDir } = require('../config/constants');

// New dashboard KYC flow writes here; the legacy single-file registration
// flow (Pandit.govtIdImage) writes to the second folder. A given govtIdImage
// value may point into either, so lookups check both by filename only —
// never trust the folder implied by the stored string.
const KYC_DIR    = path.join(__dirname, '../..', uploadDir, 'kycdocs');
const GOVTID_DIR = path.join(__dirname, '../..', uploadDir, 'govtids');

const KYC_FIELD_MAP = {
  frontImage:   'kycFrontImage',
  backImage:    'kycBackImage',
  selfieImage:  'kycSelfieImage',
  addressProof: 'kycAddressProof',
};

// Resolves a DB-stored path to an absolute file on disk, ignoring any
// directory component in the stored value — filenames are server-generated
// (Date.now()-random), so this also rules out path traversal by construction.
function resolveStoredFile(storedPath) {
  if (!storedPath) return null;
  const filename = path.basename(storedPath);
  for (const dir of [KYC_DIR, GOVTID_DIR]) {
    const abs = path.join(dir, filename);
    if (abs.startsWith(dir + path.sep) && fs.existsSync(abs)) return abs;
  }
  return null;
}

function deleteStoredFile(storedPath) {
  const abs = resolveStoredFile(storedPath);
  if (abs) fs.unlink(abs, () => {});
}

module.exports = { KYC_FIELD_MAP, resolveStoredFile, deleteStoredFile };
