/**
 * Legal Documents — view-only public delivery + raw static path protection.
 *
 * The public legal documents (privacy, terms, refund-policy, about-us, vision)
 * must be readable through the intended metadata + view endpoints, while the
 * raw static path /uploads/legaldocs/<file> is no longer directly accessible
 * (mirrors the kyc/govt-id guard). Admin upload/replace must keep working.
 *
 * Uses Node's built-in test runner against a dedicated TEST database and the
 * REAL express app from src/app.js (so the static middleware wiring under test
 * is exactly what ships).
 *
 * Run:  cd backend && node --test tests/legal-documents-viewer.test.js
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'legal-docs-viewer-test-secret';

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/zutsav_legal_docs_viewer_test';

const app = require('../src/app');
const LegalDocument = require('../src/models/LegalDocument');
const User = require('../src/models/User');

const ROOT = path.resolve(__dirname, '..');
const LEGALDIR = path.join(ROOT, 'uploads', 'legaldocs');
const PRODUCTDIR = path.join(ROOT, 'uploads', 'products');
const KYCDIR = path.join(ROOT, 'uploads', 'kycdocs');

const TYPES = ['privacy', 'terms', 'refund-policy', 'about-us', 'vision'];

// Minimal but well-formed single-page PDF.
const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
  'xref\n0 4\n' +
  '0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n' +
  'trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n182\n%%EOF\n'
);

let server, baseUrl;
let adminUser, adminToken, normalUser, normalToken;
const _trackedFiles = [];
let _seq = 100;

function signToken(user) {
  return jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
}

function mapType(type, originalName) {
  return {
    documentType: type,
    originalName,
    storedFileName: `seed-${type}-${Date.now()}-${_seq++}.pdf`,
    mimeType: 'application/pdf',
    size: PDF_BYTES.length,
  };
}

async function seedDocument(defn) {
  const filePath = path.join(LEGALDIR, defn.storedFileName);
  fs.writeFileSync(filePath, PDF_BYTES);
  _trackedFiles.push(filePath);
  return LegalDocument.create({
    documentType:   defn.documentType,
    originalName:   defn.originalName,
    storedFileName: defn.storedFileName,
    mimeType:       defn.mimeType,
    size:           defn.size,
    storagePath:    `uploads/legaldocs/${defn.storedFileName}`,
    uploadedByName: 'Tester',
  });
}

async function jget(url, { token, headers } = {}) {
  const res = await fetch(`${baseUrl}${url}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body (e.g. PDF bytes) */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function upload(type, fileBuffer, name, token) {
  const fd = new FormData();
  fd.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), name);
  const res = await fetch(`${baseUrl}/api/admin/documents/${type}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await mongoose.connection.dropDatabase();

  adminUser = await User.create({
    name: 'Legal Admin', email: 'legal-admin@test.zutsav.local', phone: '9010100100',
    password: 'hashed', role: 'admin', isActive: true,
  });
  normalUser = await User.create({
    name: 'Legal User', email: 'legal-user@test.zutsav.local', phone: '9010100101',
    password: 'hashed', role: 'user', isActive: true,
  });
  adminToken = signToken(adminUser);
  normalToken = signToken(normalUser);

  for (const dir of [LEGALDIR, PRODUCTDIR, KYCDIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const f of _trackedFiles) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* best effort */ }
  }
  for (const dir of [LEGALDIR, PRODUCTDIR, KYCDIR]) {
    try { fs.rmdirSync(dir); } catch { /* not empty — leave it */ }
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Public metadata endpoints', () => {
  before(async () => {
    await LegalDocument.deleteMany({});
    for (const defn of TYPES.map((t) => mapType(t, `${t}.pdf`))) {
      await seedDocument(defn);
    }
  });

  test('GET /api/documents lists all five types with labels + safe meta only', async () => {
    const { status, json } = await jget('/api/documents');
    assert.equal(status, 200);
    assert.equal(json.success, true);
    assert.equal(json.documents.length, 5);
    for (const d of json.documents) {
      assert.equal(d.exists, true);
      assert.equal(d.viewUrl, `/api/documents/${d.documentType}/view`);
    }
    const raw = JSON.stringify(json);
    assert.ok(!raw.includes('storagePath'), 'must not expose storagePath');
    assert.ok(!raw.includes('storedFileName'), 'must not expose storedFileName');
  });

  test('GET /api/documents/:type returns metadata for each type', async () => {
    for (const type of TYPES) {
      const { status, json } = await jget(`/api/documents/${type}`);
      assert.equal(status, 200);
      assert.equal(json.document.documentType, type);
      assert.equal(json.document.exists, true);
      assert.equal(json.document.mimeType, 'application/pdf');
      assert.equal(json.document.viewUrl, `/api/documents/${type}/view`);
    }
  });

  test('GET /api/documents/unknown-type → 400', async () => {
    const { status } = await jget('/api/documents/banana');
    assert.equal(status, 400);
  });
});

describe('Public view endpoint (byte delivery)', () => {
  before(async () => {
    await LegalDocument.deleteMany({});
    for (const defn of TYPES.map((t) => mapType(t, `${t}.pdf`))) {
      await seedDocument(defn);
    }
  });

  test('view returns the PDF inline for every document type', async () => {
    for (const type of TYPES) {
      const res = await jget(`/api/documents/${type}/view`);
      assert.equal(res.status, 200, `${type} view status`);
      assert.ok(res.headers.get('content-type').includes('application/pdf'), `${type} content-type`);
      assert.ok(res.headers.get('content-disposition').includes('inline'), `${type} inline`);
      assert.ok(res.text.includes('%PDF'), `${type} body is a PDF`);
    }
  });

  test('view for unknown type → 400', async () => {
    const { status } = await jget('/api/documents/banana/view');
    assert.equal(status, 400);
  });

  test('view with no record → 404', async () => {
    await LegalDocument.deleteOne({ documentType: 'refund-policy' });
    const { status } = await jget('/api/documents/refund-policy/view');
    assert.equal(status, 404);
  });

  test('view with record but missing file on disk → 404', async () => {
    await LegalDocument.deleteMany({ documentType: 'privacy' });
    await LegalDocument.create({
      documentType:   'privacy',
      originalName:   'ghost.pdf',
      storedFileName: 'ghost.pdf',
      mimeType:       'application/pdf',
      size:           5,
      storagePath:    'uploads/legaldocs/does-not-exist.pdf',
      uploadedByName: 'Tester',
    });
    const { status } = await jget('/api/documents/privacy/view');
    assert.equal(status, 404);
  });

  test('view requires no authentication (public)', async () => {
    await LegalDocument.deleteMany({ documentType: 'privacy' });
    await seedDocument(mapType('privacy', 'privacy.pdf'));
    const { status } = await jget('/api/documents/privacy/view');
    assert.equal(status, 200);
  });
});

describe('Raw static path protection', () => {
  before(async () => {
    await LegalDocument.deleteMany({});
    for (const defn of TYPES.map((t) => mapType(t, `${t}.pdf`))) {
      await seedDocument(defn);
    }
  });

  test('GET /uploads/legaldocs/<file> is blocked (403)', async () => {
    const doc = await LegalDocument.findOne({ documentType: 'privacy' }).lean();
    const res = await jget(`/uploads/legaldocs/${doc.storedFileName}`);
    assert.equal(res.status, 403);
    assert.equal(res.json.success, false);
  });

  test('GET /uploads/legaldocs/<anything> is blocked (403) even for missing files', async () => {
    const res = await jget('/uploads/legaldocs/nope-99999.pdf');
    assert.equal(res.status, 403);
  });

  test('unrelated upload paths remain served (products)', async () => {
    const f = path.join(PRODUCTDIR, 'unrelated.png');
    fs.writeFileSync(f, Buffer.from('fake-png'));
    _trackedFiles.push(f);
    const { status } = await jget('/uploads/products/unrelated.png');
    assert.equal(status, 200);
  });

  test('KYC/govt-id blocking behavior is preserved', async () => {
    const f = path.join(KYCDIR, 'keep-blocked.jpg');
    fs.writeFileSync(f, Buffer.from('fake-jpg'));
    _trackedFiles.push(f);
    const { status } = await jget('/uploads/kycdocs/keep-blocked.jpg');
    assert.equal(status, 403);
  });
});

describe('Admin upload / replace / delete (unchanged workflow)', () => {
  before(async () => {
    await LegalDocument.deleteMany({});
  });

  test('POST upload without token → 401', async () => {
    const { status } = await upload('terms', PDF_BYTES, 'terms.pdf');
    assert.equal(status, 401);
  });

  test('POST upload with non-admin role → 403', async () => {
    const { status } = await upload('terms', PDF_BYTES, 'terms.pdf', normalToken);
    assert.equal(status, 403);
  });

  test('admin upload creates the record and the file, view serves it', async () => {
    const { status, json } = await upload('terms', PDF_BYTES, 'Terms-and-conditions.pdf', adminToken);
    assert.equal(status, 200);
    assert.equal(json.document.exists, true);
    assert.equal(json.document.originalName, 'Terms-and-conditions.pdf');
    assert.equal(json.document.viewUrl, '/api/documents/terms/view');

    const doc = await LegalDocument.findOne({ documentType: 'terms' }).lean();
    assert.equal(doc.mimeType, 'application/pdf');
    const onDisk = path.join(ROOT, doc.storagePath);
    assert.ok(fs.existsSync(onDisk), 'uploaded file exists on disk');
    _trackedFiles.push(onDisk);

    const viewRes = await jget('/api/documents/terms/view');
    assert.equal(viewRes.status, 200);
    assert.ok(viewRes.text.includes('%PDF'));
  });

  test('admin replace swaps the file and removes the old one', async () => {
    const before = await LegalDocument.findOne({ documentType: 'terms' }).lean();
    const { status } = await upload('terms', PDF_BYTES, 'terms-v2.pdf', adminToken);
    assert.equal(status, 200);

    const after = await LegalDocument.findOne({ documentType: 'terms' }).lean();
    assert.notEqual(after.storedFileName, before.storedFileName, 'stored file name changes');
    assert.equal(after.originalName, 'terms-v2.pdf');
    assert.ok(fs.existsSync(path.join(ROOT, after.storagePath)), 'new file on disk');
    assert.ok(!fs.existsSync(path.join(ROOT, before.storagePath)), 'old file removed');
    _trackedFiles.push(path.join(ROOT, after.storagePath));

    const viewRes = await jget('/api/documents/terms/view');
    assert.equal(viewRes.status, 200);
  });

  test('admin delete removes record + file; view then returns 404', async () => {
    const doc = await LegalDocument.findOne({ documentType: 'terms' }).lean();
    const res = await fetch(`${baseUrl}/api/admin/documents/terms`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(await LegalDocument.countDocuments({ documentType: 'terms' }), 0);
    assert.ok(!fs.existsSync(path.join(ROOT, doc.storagePath)), 'deleted file removed');

    const { status } = await jget('/api/documents/terms/view');
    assert.equal(status, 404);
  });

  test('all five types remain uploadable via the admin endpoint', async () => {
    for (const type of TYPES) {
      const { status, json } = await upload(type, PDF_BYTES, `${type}.pdf`, adminToken);
      assert.equal(status, 200, `${type} upload`);
      assert.equal(json.document.documentType, type);
      const doc = await LegalDocument.findOne({ documentType: type }).lean();
      _trackedFiles.push(path.join(ROOT, doc.storagePath));
    }
    const { status, json } = await jget('/api/documents');
    assert.equal(status, 200);
    assert.equal(json.documents.filter((d) => d.exists).length, 5, 'all five types present after upload');
  });
});