const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDir } = require('../config/constants');

const createStorage = (folder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../..', uploadDir, folder);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    },
  });

const imageFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, webp) are allowed'));
  }
};

const logoFilter = (req, file, cb) => {
  const extOk  = /\.(jpeg|jpg|png|webp|svg)$/i.test(file.originalname);
  const mimeOk = /^image\/(jpeg|jpg|png|webp|svg\+xml)$/.test(file.mimetype);
  if (extOk && mimeOk) { cb(null, true); }
  else { cb(new Error('Only PNG, JPG, WEBP, or SVG images are allowed for logo')); }
};

const csvFilter = (req, file, cb) => {
  if (path.extname(file.originalname).toLowerCase() === '.csv') {
    cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed'));
  }
};

const uploadLogo     = multer({ storage: createStorage('logos'),     fileFilter: logoFilter,  limits: { fileSize: 5 * 1024 * 1024 } });
const uploadProfile  = multer({ storage: createStorage('profiles'),  fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadGovtId   = multer({ storage: createStorage('govtids'),    fileFilter: imageFilter, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadProducts = multer({ storage: createStorage('products'),   fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadKits      = multer({ storage: createStorage('kits'),      fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadCSV      = multer({ storage: createStorage('csv'),        fileFilter: csvFilter,   limits: { fileSize: 5 * 1024 * 1024 } });

const uploadKYCDocs = multer({
  storage: createStorage('kycdocs'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: 'frontImage',   maxCount: 1 },
  { name: 'backImage',    maxCount: 1 },
  { name: 'selfieImage',  maxCount: 1 },
  { name: 'addressProof', maxCount: 1 },
]);

const uploadBlog = multer({ storage: createStorage('blogs'), fileFilter: imageFilter, limits: { fileSize: 8 * 1024 * 1024 } });
const uploadPooja = multer({ storage: createStorage('poojas'), fileFilter: imageFilter, limits: { fileSize: 8 * 1024 * 1024 } });
const uploadHeroBanner = multer({ storage: createStorage('herobanners'), fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadTemple = multer({ storage: createStorage('temples'), fileFilter: imageFilter, limits: { fileSize: 8 * 1024 * 1024 } })
  .fields([{ name: 'coverImage', maxCount: 1 }, { name: 'images', maxCount: 8 }]);

const legalDocFilter = (req, file, cb) => {
  const extOk = /\.(pdf|doc|docx)$/i.test(file.originalname);
  const mimeOk = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(file.mimetype);
  if (extOk && mimeOk) cb(null, true);
  else cb(new Error('Only PDF, DOC, or DOCX files are allowed'));
};
const uploadLegalDocument = multer({ storage: createStorage('legaldocs'), fileFilter: legalDocFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Custom footer link files ─────────────────────────────────────────────────
// General-purpose files (documents, images, spreadsheets, archives, …) up to 10 MB.
// There is no extension allowlist; instead executable / script / macro / web-page
// names are refused here, and the controller verifies the real bytes afterwards
// (utils/footerLinks.js → inspectUpload). Stored under a server-generated name with
// a known-safe extension (or .bin) in the same non-web-accessible legaldocs folder.
const footerLinks = require('../utils/footerLinks');
const footerFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../..', uploadDir, 'legaldocs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${footerLinks.storedExtension(file.originalname)}`);
  },
});
const footerFileFilter = (req, file, cb) => {
  const reason = footerLinks.blockedNameReason(file.originalname);
  if (reason) cb(new Error(reason));
  else cb(null, true);
};
const uploadFooterFile = multer({
  storage: footerFileStorage,
  fileFilter: footerFileFilter,
  // multer rejects a file whose size EQUALS `fileSize`, so +1 makes the advertised 10 MB limit inclusive
  // (a file of exactly 10 MB is accepted, 10 MB + 1 byte is refused).
  limits: { fileSize: footerLinks.MAX_FILE_SIZE + 1, files: 1, fields: 20 },
});

module.exports = { uploadFooterFile, uploadLogo, uploadProfile, uploadGovtId, uploadProducts, uploadKits, uploadCSV, uploadKYCDocs, uploadBlog, uploadPooja, uploadHeroBanner, uploadLegalDocument, uploadTemple };
