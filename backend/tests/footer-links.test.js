/**
 * Custom footer links — admin management, uploads, public exposure and
 * regressions against the fixed legal documents.
 *
 * Own database (node --test runs files in parallel). Uploaded test files land in
 * uploads/legaldocs like real ones; every file this suite creates is removed.
 */

process.env.PAYMENT_MODE = 'mock';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'footer-links-test-secret';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const mongoose = require('mongoose');
const jwt    = require('jsonwebtoken');

const SystemSettings = require('../src/models/SystemSettings');
const LegalDocument  = require('../src/models/LegalDocument');
const AdminAuditLog  = require('../src/models/AdminAuditLog');
const User           = require('../src/models/User');
const settingsService = require('../src/utils/settingsService');
const fl             = require('../src/utils/footerLinks');

const TEST_URI = process.env.MONGO_URI_TEST_FOOTER_LINKS || 'mongodb://127.0.0.1:27017/zutsav_footer_links_test';
const DOCS_DIR = path.join(__dirname, '..', 'uploads', 'legaldocs');

let server, port, adminToken, userToken;

const url = (p) => `http://127.0.0.1:${port}${p}`;
const api = (method, p, body, token = adminToken) =>
  fetch(url(p), {
    method,
    headers: { ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body)),
  });
const pub = (p) => fetch(url(p));

/* ── fixtures ─────────────────────────────────────────────────────────────── */
const PDF  = (marker = 'one') => Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);
const DOC  = () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512, 1)]);
const DOCX = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml....')]);

const form = (fields, file) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file.buf], { type: file.type || 'application/pdf' }), file.name);
  return fd;
};
const createUrl = (label, u, extra = {}) => api('POST', '/api/admin/footer-links', { label, linkType: 'url', url: u, ...extra });
const createDoc = (label, file = { buf: PDF(), name: 'terms.pdf' }, extra = {}) =>
  api('POST', '/api/admin/footer-links', form({ label, linkType: 'document', ...extra }, file));
const must = async (res, status = 201) => {
  const body = await res.json();
  assert.equal(res.status, status, JSON.stringify(body));
  return body;
};
const publicLinks = async () => (await (await pub('/api/settings/public')).json()).settings.footerLinks;

// This suite shares uploads/legaldocs with other test files that run in parallel (and with
// real data), so it must never sweep the folder. It only touches files recorded in its own
// database, and detects leftovers by unique content markers instead of by directory diff.
const ownFileNames = async () => {
  const settings = await SystemSettings.findOne().lean();
  const fixed = await LegalDocument.find().lean();
  return [
    ...((settings && settings.footerLinks) || []).map((l) => l.document && l.document.storedFileName),
    ...fixed.map((d) => d.storedFileName),
  ].filter(Boolean);
};
const onDisk = (name) => fs.existsSync(path.join(DOCS_DIR, name));
const removeOwnFiles = async () => {
  for (const name of await ownFileNames()) { try { fs.unlinkSync(path.join(DOCS_DIR, name)); } catch { /* already gone */ } }
};
const filesContaining = (marker) => fs.readdirSync(DOCS_DIR).filter((f) => {
  try { return fs.readFileSync(path.join(DOCS_DIR, f)).includes(marker); } catch { return false; }
});
const emptyFiles = () => fs.readdirSync(DOCS_DIR).filter((f) => { try { return fs.statSync(path.join(DOCS_DIR, f)).size === 0; } catch { return false; } });


before(async () => {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  await LegalDocument.init();
  const admin = await User.create({ name: 'Footer Admin', email: 'footer-admin@example.com', phone: '9000000041', password: 'secret123', role: 'admin' });
  const user  = await User.create({ name: 'Footer User', email: 'footer-user@example.com', phone: '9000000042', password: 'secret123', role: 'user' });
  adminToken = jwt.sign({ id: admin._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  userToken  = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const app = require('../src/app');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, () => { port = server.address().port; resolve(); }));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await removeOwnFiles();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await removeOwnFiles(); // files of the previous test (their records are dropped just below)
  await Promise.all([SystemSettings.deleteMany({}), LegalDocument.deleteMany({}), AdminAuditLog.collection.deleteMany({})]);
  settingsService.invalidate();
});

/* ═══════════════════════════ URL LINKS ═══════════════════════════════════ */

test('an admin can add, edit, disable, enable and delete a URL link; the public footer follows', async () => {
  assert.deepEqual(await publicLinks(), [], 'empty configuration is an empty list');

  const { link } = await must(await createUrl('  Help   Centre ', 'https://help.example.com/start'));
  assert.equal(link.label, 'Help Centre');                   // whitespace normalized
  assert.equal(link.linkType, 'url');
  assert.equal(link.enabled, true);
  assert.deepEqual(await publicLinks(), [{ id: link.id, label: 'Help Centre', linkType: 'url', url: 'https://help.example.com/start' }]);

  const edited = await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, { label: 'Support', url: 'http://support.example.com/' }), 200);
  assert.equal(edited.link.label, 'Support');
  assert.equal((await publicLinks())[0].url, 'http://support.example.com/');

  await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, { enabled: false }), 200);
  assert.deepEqual(await publicLinks(), [], 'disabled links disappear publicly');
  const listed = await (await api('GET', '/api/admin/footer-links')).json();
  assert.equal(listed.links.length, 1, 'but stay manageable in the admin list');
  assert.equal(listed.links[0].enabled, false);

  await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, { enabled: 'true' }), 200); // multipart-style boolean
  assert.equal((await publicLinks()).length, 1);

  await must(await api('DELETE', `/api/admin/footer-links/${link.id}`), 200);
  assert.deepEqual(await publicLinks(), []);
  assert.equal((await api('DELETE', `/api/admin/footer-links/${link.id}`)).status, 404);
});

test('links persist in SystemSettings across a fresh read and cache invalidation', async () => {
  const { link } = await must(await createUrl('Persisted', 'https://example.com/p'));
  settingsService.invalidate();
  const raw = await SystemSettings.findOne().lean();
  assert.equal(raw.footerLinks.length, 1);
  assert.equal(raw.footerLinks[0].id, link.id);
  assert.equal(raw.footerLinks[0].url, 'https://example.com/p');
  assert.equal((await settingsService.all()).footerLinks.length, 1);
});

test('only admins can manage footer links (401 anonymous, 403 ordinary user)', async () => {
  const { link } = await must(await createUrl('Guarded', 'https://example.com/g'));
  const calls = [
    ['GET', '/api/admin/footer-links'], ['POST', '/api/admin/footer-links', { label: 'x', linkType: 'url', url: 'https://x.com' }],
    ['PATCH', `/api/admin/footer-links/${link.id}`, { label: 'Hacked' }], ['PUT', '/api/admin/footer-links/order', { ids: [link.id] }],
    ['DELETE', `/api/admin/footer-links/${link.id}`],
  ];
  for (const [method, p, body] of calls) {
    assert.equal((await api(method, p, body, null)).status, 401, `${method} ${p} anonymous`);
    assert.equal((await api(method, p, body, userToken)).status, 403, `${method} ${p} user`);
  }
  assert.equal((await api('PATCH', '/api/admin/settings', { footerLinks: [] }, userToken)).status, 403);
  const [after] = (await SystemSettings.findOne().lean()).footerLinks;
  assert.equal(after.label, 'Guarded');
});

test('URL validation accepts http/https and rejects unsafe or malformed values', async () => {
  for (const good of ['https://example.com', 'http://example.com/a?b=c#d', 'HTTPS://Example.COM/Path', 'https://sub.example.co.in:8443/x']) {
    const res = await createUrl(`Good ${good.length}`, good);
    assert.equal(res.status, 201, good);
  }
  const bad = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', 'ftp://example.com',
    '//evil.example.com', '/relative/path', 'example.com', 'https://', 'https://exa mple.com', 'https://example.com/a b',
    'https://user:pass@example.com', 'https://example.com\n.evil.com', '', '   ', null, 42, { href: 'https://x.com' }, `https://example.com/${'a'.repeat(2100)}`,
  ];
  for (const [i, u] of bad.entries()) {
    const res = await createUrl(`Bad ${i}`, u);
    assert.equal(res.status, 400, `must reject ${JSON.stringify(u).slice(0, 50)}`);
  }
  assert.equal((await SystemSettings.findOne().lean()).footerLinks.length, 4, 'nothing invalid was persisted');

  // Editing cannot smuggle a bad URL in either.
  const [first] = (await SystemSettings.findOne().lean()).footerLinks;
  assert.equal((await api('PATCH', `/api/admin/footer-links/${first.id}`, { url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await SystemSettings.findOne().lean()).footerLinks[0].url, first.url);
});

test('display names are validated, normalized and unique; fixed legal names are reserved', async () => {
  for (const [label, why] of [['', 'empty'], ['   ', 'blank'], ['x'.repeat(61), 'too long'], ['Bad\u0000Name', 'NUL'], ['Bad\nName', 'newline'], ['Evil‮Name', 'bidi override'], [42, 'number'], [null, 'null']]) {
    assert.equal((await createUrl(label, 'https://example.com')).status, 400, why);
  }
  assert.equal((await createUrl('x'.repeat(60), 'https://example.com')).status, 201, '60 chars is the limit');

  await must(await createUrl('Careers', 'https://example.com/careers'));
  const dup = await createUrl('  careers ', 'https://example.com/other');
  assert.equal(dup.status, 409);
  assert.match((await dup.json()).message, /already exists/);

  for (const fixed of ['Privacy Policy', 'terms & conditions', 'Refund & Cancellation Policy', 'About Us', 'Vision, Mission & Core Values']) {
    const res = await createUrl(fixed, 'https://example.com/x');
    assert.equal(res.status, 409, fixed);
    assert.match((await res.json()).message, /fixed legal document/);
  }
  // Renaming into a duplicate / reserved name is refused as well.
  const other = await must(await createUrl('Blog', 'https://example.com/blog'));
  assert.equal((await api('PATCH', `/api/admin/footer-links/${other.link.id}`, { label: 'CAREERS' })).status, 409);
  assert.equal((await api('PATCH', `/api/admin/footer-links/${other.link.id}`, { label: 'Privacy Policy' })).status, 409);
  assert.equal((await api('PATCH', `/api/admin/footer-links/${other.link.id}`, { label: 'blog' })).status, 200, 'keeping your own name (case change) is fine');
});

test('a link has exactly one destination type', async () => {
  assert.equal((await api('POST', '/api/admin/footer-links', { label: 'No type', url: 'https://example.com' })).status, 400);
  assert.equal((await api('POST', '/api/admin/footer-links', { label: 'Bad type', linkType: 'page', url: 'https://example.com' })).status, 400);
  const marked = { buf: PDF('DESTMARK'), name: 'm.pdf' };
  assert.equal((await createDoc('URL type with file', marked, { linkType: 'url', url: 'https://example.com' })).status, 400);
  assert.equal((await createDoc('Doc with url', marked, { url: 'https://example.com' })).status, 400);
  assert.equal((await api('POST', '/api/admin/footer-links', form({ label: 'Doc no file', linkType: 'document' }))).status, 400);
  assert.equal((await api('POST', '/api/admin/footer-links', { label: 'Doc no file json', linkType: 'document' })).status, 400);
  assert.equal((await SystemSettings.findOne().lean())?.footerLinks?.length || 0, 0);
  assert.deepEqual(filesContaining('DESTMARK'), [], 'rejected requests leave no uploaded file behind');
});

/* ═══════════════════════════ DOCUMENT LINKS ══════════════════════════════ */

test('uploading a PDF/DOC/DOCX creates a link anyone can open without logging in (PDF inline, Word as a download)', async () => {
  for (const [label, file, mime] of [
    ['Terms PDF', { buf: PDF('pdf-body'), name: 'terms.pdf' }, 'application/pdf'],
    ['Old Word', { buf: DOC(), name: 'old.doc', type: 'application/msword' }, 'application/msword'],
    ['New Word', { buf: DOCX(), name: 'new.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ]) {
    const { link } = await must(await createDoc(label, file));
    assert.equal(link.linkType, 'document');
    assert.equal(link.document.originalName, file.name);
    assert.equal(link.document.mimeType, mime, 'MIME comes from the verified content, not the client');
    assert.equal(link.publicPath, `/legal/link/${link.id}`);
    assert.equal(link.document.storagePath, undefined, 'no server paths in admin responses');
    assert.equal(link.document.storedFileName, undefined);

    // Public, no Authorization header.
    const meta = await (await pub(`/api/footer-links/${link.id}`)).json();
    assert.equal(meta.document.exists, true);
    assert.equal(meta.document.label, label);
    assert.equal(meta.document.viewUrl, `/api/footer-links/${link.id}/view`);
    const view = await pub(meta.document.viewUrl);
    assert.equal(view.status, 200);
    assert.equal(view.headers.get('content-type'), mime);
    assert.match(view.headers.get('content-disposition'), mime === 'application/pdf' ? /^inline; filename="/ : /^attachment; filename="/);
    assert.equal(view.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await view.arrayBuffer()), file.buf);
  }
  const pubLinks = await publicLinks();
  assert.equal(pubLinks.length, 3);
  assert.ok(pubLinks.every((l) => l.linkType === 'document' && l.path.startsWith('/legal/link/') && !('url' in l)));
});

test('executables, forged content and oversized uploads are rejected and leave nothing behind', async () => {
  const cases = [
    ['exe', { buf: Buffer.from('MZ....'), name: 'virus.exe', type: 'application/octet-stream' }],
    ['html as pdf by extension', { buf: Buffer.from('<html><script>alert(1)</script></html>'), name: 'page.pdf' }],
    ['docx that is not a docx', { buf: Buffer.from('PK\x03\x04 just a zip'), name: 'fake.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
    ['doc without OLE header', { buf: Buffer.from('plain text'), name: 'fake.doc', type: 'application/msword' }],
    ['empty pdf', { buf: Buffer.alloc(0), name: 'empty.pdf' }],
    ['double extension', { buf: Buffer.from('<?php ?>'), name: 'shell.php.pdf' }],
  ];
  for (const [why, file] of cases) {
    const buf = file.buf.length ? Buffer.concat([file.buf, Buffer.from('REJMARK')]) : file.buf; // marker lets us prove nothing was left behind
    const res = await createDoc(`Reject ${why}`, { ...file, buf });
    assert.equal(res.status, 400, why);
  }
  const big = await createDoc('Too big', { buf: Buffer.concat([PDF('REJMARK'), Buffer.alloc(10 * 1024 * 1024)]), name: 'big.pdf' });
  assert.equal(big.status, 400);
  assert.match((await big.json()).message, /large|size/i);

  assert.equal((await SystemSettings.findOne().lean())?.footerLinks?.length || 0, 0);
  assert.deepEqual(filesContaining('REJMARK'), [], 'no orphaned uploads');
  assert.deepEqual(emptyFiles(), [], 'no orphaned empty upload');
});

test('replacing a document swaps the file; a bad replacement keeps the old document intact', async () => {
  const { link } = await must(await createDoc('Guide', { buf: PDF('v1'), name: 'guide-v1.pdf' }));
  const [firstFile] = await ownFileNames();
  assert.ok(firstFile && onDisk(firstFile));

  const bad = await api('PATCH', `/api/admin/footer-links/${link.id}`, form({}, { buf: Buffer.from('not a pdf BADREPLMARK'), name: 'guide-v2.pdf' }));
  assert.equal(bad.status, 400);
  assert.deepEqual(await ownFileNames(), [firstFile], 'record still points at the old file');
  assert.ok(onDisk(firstFile), 'old file untouched');
  assert.deepEqual(filesContaining('BADREPLMARK'), [], 'bad upload cleaned up');
  assert.deepEqual(Buffer.from(await (await pub(`/api/footer-links/${link.id}/view`)).arrayBuffer()), PDF('v1'));

  const ok = await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, form({}, { buf: PDF('v2'), name: 'guide-v2.pdf' })), 200);
  assert.equal(ok.link.document.originalName, 'guide-v2.pdf');
  const files = await ownFileNames();
  assert.equal(files.length, 1);
  assert.notEqual(files[0], firstFile);
  assert.ok(onDisk(files[0]));
  assert.ok(!onDisk(firstFile), 'the old file was removed after the new one was saved');
  assert.deepEqual(Buffer.from(await (await pub(`/api/footer-links/${link.id}/view`)).arrayBuffer()), PDF('v2'));
});

test('switching destination type is explicit and cleans up the old file only when safe', async () => {
  const { link } = await must(await createDoc('Switcher', { buf: PDF(), name: 's.pdf' }));
  const [docFile] = await ownFileNames();
  assert.ok(docFile && onDisk(docFile));

  // document → url needs a valid URL; a failed attempt changes nothing.
  assert.equal((await api('PATCH', `/api/admin/footer-links/${link.id}`, { linkType: 'url' })).status, 400);
  assert.equal((await api('PATCH', `/api/admin/footer-links/${link.id}`, { linkType: 'url', url: 'javascript:1' })).status, 400);
  assert.ok(onDisk(docFile), 'a failed switch changes nothing');

  const toUrl = await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, { linkType: 'url', url: 'https://example.com/now-a-url' }), 200);
  assert.equal(toUrl.link.linkType, 'url');
  assert.equal(toUrl.link.document, null);
  assert.deepEqual(await ownFileNames(), []);
  assert.ok(!onDisk(docFile), 'the old upload was deleted once the switch was saved');
  assert.equal((await (await pub(`/api/footer-links/${link.id}`)).json()).document.exists, false);
  assert.equal((await publicLinks())[0].url, 'https://example.com/now-a-url');

  // url → document needs a file; a URL link cannot accept one without switching.
  assert.equal((await api('PATCH', `/api/admin/footer-links/${link.id}`, { linkType: 'document' })).status, 400);
  assert.equal((await api('PATCH', `/api/admin/footer-links/${link.id}`, form({}, { buf: PDF(), name: 'x.pdf' }))).status, 400);
  const toDoc = await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, form({ linkType: 'document' }, { buf: PDF('again'), name: 'again.pdf' })), 200);
  assert.equal(toDoc.link.linkType, 'document');
  assert.equal(toDoc.link.url, '');
  assert.equal((await ownFileNames()).length, 1);
  assert.equal((await publicLinks())[0].linkType, 'document');
});

test('deleting a document link removes its file and never touches other documents', async () => {
  const a = await must(await createDoc('Doc A', { buf: PDF('A'), name: 'a.pdf' }));
  const b = await must(await createDoc('Doc B', { buf: PDF('B'), name: 'b.pdf' }));
  const [fileA, fileB] = await ownFileNames();
  assert.ok(onDisk(fileA) && onDisk(fileB));

  await must(await api('DELETE', `/api/admin/footer-links/${a.link.id}`), 200);
  assert.ok(!onDisk(fileA), "the deleted link's file is removed");
  assert.ok(onDisk(fileB), 'the other document is untouched');
  assert.deepEqual(await ownFileNames(), [fileB]);
  const gone = await pub(`/api/footer-links/${a.link.id}/view`);
  assert.equal(gone.status, 404);
  assert.deepEqual(Buffer.from(await (await pub(`/api/footer-links/${b.link.id}/view`)).arrayBuffer()), PDF('B'));
  assert.deepEqual((await publicLinks()).map((l) => l.label), ['Doc B']);
});

test('disabled, unknown, malformed and URL-type ids never serve a document', async () => {
  const doc = await must(await createDoc('Hidden doc'));
  const urlLink = await must(await createUrl('Just a url', 'https://example.com'));
  await api('PATCH', `/api/admin/footer-links/${doc.link.id}`, { enabled: false });

  assert.equal((await pub(`/api/footer-links/${doc.link.id}/view`)).status, 404);
  assert.equal((await (await pub(`/api/footer-links/${doc.link.id}`)).json()).document.exists, false);
  for (const id of [urlLink.link.id, 'a'.repeat(16), '../../etc/passwd', 'not-an-id', '%2e%2e%2fpackage.json']) {
    const meta = await pub(`/api/footer-links/${id}`);
    assert.ok([200, 404].includes(meta.status));
    if (meta.status === 200) assert.equal((await meta.json()).document.exists, false);
    assert.equal((await pub(`/api/footer-links/${id}/view`)).status, 404, id);
  }
});

test('a document whose file has vanished is handled gracefully', async () => {
  const { link } = await must(await createDoc('Vanishing'));
  for (const f of await ownFileNames()) fs.unlinkSync(path.join(DOCS_DIR, f));
  const res = await pub(`/api/footer-links/${link.id}/view`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).success, false);
});

test('a tampered storage record cannot make the server read or delete files outside legaldocs', async () => {
  const { link } = await must(await createDoc('Tampered'));
  const [realFile] = await ownFileNames(); // remembered: the record is gone after the delete below
  await SystemSettings.updateOne({}, { $set: { 'footerLinks.0.document.storagePath': 'package.json' } });
  assert.equal((await pub(`/api/footer-links/${link.id}/view`)).status, 404, 'view refuses paths outside uploads/legaldocs');
  const pkg = path.join(__dirname, '..', 'package.json');
  await api('DELETE', `/api/admin/footer-links/${link.id}`);
  assert.ok(fs.existsSync(pkg), 'delete refuses to unlink outside uploads/legaldocs');
  fs.unlinkSync(path.join(DOCS_DIR, realFile)); // the genuine upload, orphaned by the tampering above
});

/* ═══════════════════════════ ORDER / LIMITS / CONCURRENCY ════════════════ */

test('links can be reordered and the public footer follows that order', async () => {
  const ids = [];
  for (const name of ['One', 'Two', 'Three']) ids.push((await must(await createUrl(name, `https://example.com/${name}`))).link.id);
  assert.deepEqual((await publicLinks()).map((l) => l.label), ['One', 'Two', 'Three']);

  const res = await must(await api('PUT', '/api/admin/footer-links/order', { ids: [ids[2], ids[0], ids[1]] }), 200);
  assert.deepEqual(res.links.map((l) => l.label), ['Three', 'One', 'Two']);
  assert.deepEqual((await publicLinks()).map((l) => l.label), ['Three', 'One', 'Two']);
  assert.deepEqual((await (await api('GET', '/api/admin/footer-links')).json()).links.map((l) => l.label), ['Three', 'One', 'Two']);

  for (const bad of [[ids[0]], [ids[0], ids[0], ids[1]], [...ids, 'a'.repeat(16)], 'nope', [1, 2, 3]]) {
    assert.equal((await api('PUT', '/api/admin/footer-links/order', { ids: bad })).status, 400, JSON.stringify(bad));
  }
  assert.deepEqual((await publicLinks()).map((l) => l.label), ['Three', 'One', 'Two']);

  // A new link lands at the end; deleting one keeps the rest in order.
  await must(await createUrl('Four', 'https://example.com/four'));
  await api('DELETE', `/api/admin/footer-links/${ids[0]}`);
  assert.deepEqual((await publicLinks()).map((l) => l.label), ['Three', 'Two', 'Four']);
});

test('at most 20 links, and concurrent creates of the same name yield one link', async () => {
  const results = await Promise.all(Array.from({ length: 6 }, () => createUrl('Race', 'https://example.com/race')));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 5);
  assert.equal((await SystemSettings.findOne().lean()).footerLinks.length, 1);

  for (let i = 1; i < 20; i += 1) await must(await createUrl(`Link ${i}`, `https://example.com/${i}`));
  const over = await createUrl('One too many', 'https://example.com/over');
  assert.equal(over.status, 409);
  assert.match((await over.json()).message, /at most 20/);
});

/* ═══════════════════════════ PUBLIC EXPOSURE / SECURITY ══════════════════ */

test('the public settings response exposes only allowlisted fields — no secrets or storage paths', async () => {
  await SystemSettings.findOneAndUpdate({}, { $set: {
    platformName: 'Zutsav', contactEmail: 'hello@example.com',
    phonepeSaltKey: 'SALT-SECRET-123', whatsappAccessToken: 'WA-SECRET-456', emailSmtpPassword: 'SMTP-SECRET-789',
  } }, { upsert: true });
  await must(await createUrl('Public one', 'https://example.com/pub'));
  const { link } = await must(await createDoc('Public doc'));
  await must(await createUrl('Private one', 'https://example.com/private', { enabled: false }));

  const res = await pub('/api/settings/public');
  const text = await res.text();
  const { settings } = JSON.parse(text);
  assert.deepEqual(Object.keys(settings).sort(), [
    'contactEmail', 'customerCareNumber', 'deployWebsiteUrl', 'footerLinks', 'logo', 'platformName',
    'supportAddress', 'supportPhone', 'urgentBookingCutoffTime', 'whatsappNumber',
  ]);
  for (const forbidden of ['SECRET', 'storagePath', 'storedFileName', 'uploads/legaldocs', 'labelKey', 'uploadedBy', 'Private one', '"enabled"', '"order"', 'mimeType', 'originalName']) {
    assert.ok(!text.includes(forbidden), `public settings must not contain ${forbidden}`);
  }
  assert.deepEqual(settings.footerLinks.map((l) => Object.keys(l).sort()), [['id', 'label', 'linkType', 'url'], ['id', 'label', 'linkType', 'path']]);
  assert.equal(settings.footerLinks[1].path, `/legal/link/${link.id}`);
});

test('a generic settings save cannot inject footer links or storage paths', async () => {
  const { link } = await must(await createDoc('Safe doc'));
  const res = await api('PATCH', '/api/admin/settings', {
    contactEmail: 'ops@example.com',
    footerLinks: [{ id: 'f'.repeat(16), label: 'Injected', labelKey: 'injected', linkType: 'document', enabled: true,
      document: { originalName: 'x.pdf', storedFileName: 'x', mimeType: 'application/pdf', size: 1, storagePath: '../package.json' } }],
  });
  assert.equal(res.status, 200);
  const raw = await SystemSettings.findOne().lean();
  assert.equal(raw.contactEmail, 'ops@example.com');
  assert.deepEqual(raw.footerLinks.map((l) => l.id), [link.id], 'footerLinks untouched by the generic save');

  const shown = await (await api('GET', '/api/admin/settings')).json();
  assert.ok(!JSON.stringify(shown).includes('storagePath'), 'admin settings read never echoes storage paths');
  assert.ok(!JSON.stringify(shown).includes('storedFileName'));
});

test('footer link management is audited without file paths', async () => {
  const a = await must(await createUrl('Audited', 'https://example.com/a'));
  const d = await must(await createDoc('Audited doc'));
  await api('PATCH', `/api/admin/footer-links/${a.link.id}`, { enabled: false });
  await api('PUT', '/api/admin/footer-links/order', { ids: [d.link.id, a.link.id] });
  await api('DELETE', `/api/admin/footer-links/${a.link.id}`);

  let logs = [];
  for (let i = 0; i < 20 && logs.length < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 50));
    logs = await AdminAuditLog.find({ action: /^footer_link_/ }).lean();
  }
  assert.deepEqual([...new Set(logs.map((l) => l.action))].sort(),
    ['footer_link_create', 'footer_link_delete', 'footer_link_reorder', 'footer_link_toggle']);
  assert.ok(logs.every((l) => l.module === 'system_config' && l.performedByName === 'Footer Admin'));
  assert.ok(!/legaldocs|storagePath|storedFileName/.test(JSON.stringify(logs)));
});

/* ═══════════════════════════ FIXED LEGAL DOCUMENTS (REGRESSION) ══════════ */

test('fixed legal documents keep working alongside custom links', async () => {
  // Upload the fixed Privacy Policy exactly as before.
  const up = await api('POST', '/api/admin/documents/privacy', form({}, { buf: PDF('privacy'), name: 'privacy.pdf' }));
  assert.equal(up.status, 200);

  let listed = (await (await pub('/api/documents')).json()).documents;
  assert.deepEqual(listed.map((d) => d.documentType), ['privacy', 'terms', 'refund-policy', 'about-us', 'vision']);
  assert.equal(listed.find((d) => d.documentType === 'privacy').exists, true);
  assert.equal(listed.find((d) => d.documentType === 'privacy').viewUrl, '/api/documents/privacy/view');
  assert.deepEqual(Buffer.from(await (await pub('/api/documents/privacy/view')).arrayBuffer()), PDF('privacy'));

  // A custom link may not shadow it, and cannot be created under a fixed name.
  assert.equal((await createUrl('Privacy Policy', 'https://elsewhere.example.com/privacy')).status, 409);

  // Custom activity leaves the fixed documents alone.
  const custom = await must(await createDoc('Cookie Policy', { buf: PDF('cookies'), name: 'cookies.pdf' }));
  await api('PATCH', `/api/admin/footer-links/${custom.link.id}`, form({}, { buf: PDF('cookies-2'), name: 'cookies2.pdf' }));
  await api('DELETE', `/api/admin/footer-links/${custom.link.id}`);
  listed = (await (await pub('/api/documents')).json()).documents;
  assert.equal(listed.find((d) => d.documentType === 'privacy').exists, true);
  assert.deepEqual(Buffer.from(await (await pub('/api/documents/privacy/view')).arrayBuffer()), PDF('privacy'));
  assert.equal(await LegalDocument.countDocuments(), 1);

  // And the reverse: deleting the fixed document leaves custom links alone.
  const keep = await must(await createUrl('Keep me', 'https://example.com/keep'));
  assert.equal((await api('DELETE', '/api/admin/documents/privacy')).status, 200);
  assert.deepEqual((await publicLinks()).map((l) => l.id), [keep.link.id]);

  // Fixed documents are still not directly reachable as static files.
  assert.equal((await pub('/uploads/legaldocs/anything.pdf')).status, 403);
});

test('the pure helpers behave (labels, urls, public DTO ordering and filtering)', () => {
  assert.equal(fl.normalizeLabel('  A    B  '), 'A B');
  assert.equal(fl.validateUrl(' https://Example.com '), 'https://example.com/');
  const dto = fl.toPublicFooterLinks([
    { id: 'a'.repeat(16), label: 'B', linkType: 'url', url: 'https://b.example.com', order: 2 },
    { id: 'b'.repeat(16), label: 'A', linkType: 'url', url: 'https://a.example.com', order: 1 },
    { id: 'c'.repeat(16), label: 'Off', linkType: 'url', url: 'https://c.example.com', order: 0, enabled: false },
    { id: 'd'.repeat(16), label: 'Corrupt', linkType: 'url', url: 'javascript:alert(1)', order: 3 },
    { id: 'e'.repeat(16), label: 'No doc', linkType: 'document', document: null, order: 4 },
    { id: 'bad-id', label: 'Bad id', linkType: 'url', url: 'https://x.example.com', order: 5 },
  ]);
  assert.deepEqual(dto.map((l) => l.label), ['A', 'B'], 'sorted, disabled/corrupt/invalid entries dropped');
  assert.deepEqual(fl.toPublicFooterLinks(undefined), []);
});


/* ═══════════════════ GENERAL FILE TYPES (any ordinary file, safely served) ═══════════════ */

const ZIPSIG = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLESIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const fx = {
  png:  () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]),
  jpg:  () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]),
  gif:  () => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(64, 7)]),
  webp: () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4, 1), Buffer.from('WEBP'), Buffer.alloc(32, 7)]),
  bmp:  () => Buffer.concat([Buffer.from('BM'), Buffer.alloc(64, 7)]),
  svg:  () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  txt:  () => Buffer.from('plain text notes\n'),
  csv:  () => Buffer.from('name,qty\nlamp,2\n'),
  rtf:  () => Buffer.from('{\\rtf1\\ansi hello}'),
  xls:  () => Buffer.concat([OLESIG, Buffer.alloc(64, 1)]),
  ppt:  () => Buffer.concat([OLESIG, Buffer.alloc(64, 2)]),
  xlsx: () => Buffer.concat([ZIPSIG, Buffer.from('....[Content_Types].xml....xl/workbook.xml....')]),
  pptx: () => Buffer.concat([ZIPSIG, Buffer.from('....[Content_Types].xml....ppt/presentation.xml....')]),
  odt:  () => Buffer.concat([ZIPSIG, Buffer.from('....mimetypeapplication/vnd.oasis.opendocument.text....')]),
  zip:  () => Buffer.concat([ZIPSIG, Buffer.alloc(64, 3)]),
  gz:   () => Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08]), Buffer.alloc(32, 4)]),
  '7z': () => Buffer.concat([Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), Buffer.alloc(32, 5)]),
  rar:  () => Buffer.concat([Buffer.from('Rar!'), Buffer.from([0x1a, 0x07, 0x00]), Buffer.alloc(32, 6)]),
  dwg:  () => Buffer.concat([Buffer.from('AC1027'), Buffer.alloc(64, 9)]),   // unknown extension
};
const PE = () => { const b = Buffer.alloc(256, 0); b.write('MZ', 0); b.writeUInt32LE(0x80, 0x3c); b.write('PE\0\0', 0x80, 'latin1'); return b; };
const INLINE_EXT = new Set(['png', 'jpg', 'gif', 'webp']);

test('ordinary files of many formats can be uploaded; the server derives the type from the bytes', async () => {
  const expectedMime = {
    png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    txt: 'text/plain', csv: 'text/csv', rtf: 'application/rtf', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odt: 'application/vnd.oasis.opendocument.text', zip: 'application/zip', gz: 'application/gzip',
    '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar', dwg: 'application/octet-stream',
  };
  for (const [ext, make] of Object.entries(fx)) {
    // The browser-claimed type is deliberately wrong everywhere: it must be ignored.
    const res = await createDoc(`File ${ext}`, { buf: make(), name: `report.${ext}`, type: 'text/html' });
    const { link } = await must(res);
    assert.equal(link.document.mimeType, expectedMime[ext], ext);
    assert.equal(link.document.originalName, `report.${ext}`);
    const [stored] = (await ownFileNames()).slice(-1);
    assert.ok(onDisk(stored));
    assert.ok(stored.endsWith(ext === 'dwg' ? '.bin' : `.${ext}`), `stored name for ${ext}: ${stored}`);
  }
  // A file with no extension at all is fine too (plain download).
  const bare = await must(await createDoc('Bare', { buf: Buffer.from('some data'), name: 'LICENSE' }));
  assert.equal(bare.link.document.mimeType, 'application/octet-stream');
  assert.equal((await publicLinks()).length, Object.keys(fx).length + 1);
});

test('only PDF and common raster images are shown inline; everything else is a forced download', async () => {
  for (const [ext, make] of Object.entries(fx)) {
    const { link } = await must(await createDoc(`Serve ${ext}`, { buf: make(), name: `file.${ext}` }));
    const view = await pub(`/api/footer-links/${link.id}/view`);
    const dl = await pub(`/api/footer-links/${link.id}/download`);
    assert.equal(view.status, 200, ext);
    assert.equal(view.headers.get('x-content-type-options'), 'nosniff', ext);
    assert.equal(dl.headers.get('x-content-type-options'), 'nosniff', ext);
    const inline = INLINE_EXT.has(ext);
    assert.match(view.headers.get('content-disposition'), inline ? /^inline;/ : /^attachment;/, `view ${ext}`);
    assert.match(dl.headers.get('content-disposition'), /^attachment;/, `download ${ext} is always an attachment`);
    if (!inline) {
      assert.match(view.headers.get('content-security-policy'), /sandbox/, `attachments are sandboxed: ${ext}`);
      assert.ok(!/^(text\/html|text\/javascript|application\/javascript|application\/xhtml\+xml)/.test(view.headers.get('content-type')), ext);
    }
    assert.deepEqual(Buffer.from(await dl.arrayBuffer()), make(), `${ext} bytes are served unchanged`);
    const meta = (await (await pub(`/api/footer-links/${link.id}`)).json()).document;
    assert.equal(meta.kind, inline ? 'image' : 'download', ext);
    assert.equal(meta.downloadUrl, `/api/footer-links/${link.id}/download`);
    assert.equal(meta.fileName, `file.${ext}`);
  }
  const { link: pdf } = await must(await createDoc('Serve pdf', { buf: PDF('p'), name: 'a.pdf' }));
  assert.equal((await (await pub(`/api/footer-links/${pdf.id}`)).json()).document.kind, 'pdf');
  assert.match((await pub(`/api/footer-links/${pdf.id}/view`)).headers.get('content-disposition'), /^inline;/);
});

test('SVG and other active content is never rendered inline on the site origin', async () => {
  const { link } = await must(await createDoc('Logo', { buf: fx.svg(), name: 'logo.svg', type: 'image/svg+xml' }));
  const res = await pub(`/api/footer-links/${link.id}/view`);
  assert.match(res.headers.get('content-disposition'), /^attachment;/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
});

test('executables, scripts, macro files and web pages are refused by name — including hidden double extensions', async () => {
  const blocked = ['setup.exe', 'lib.dll', 'inst.msi', 'run.bat', 'run.cmd', 'run.sh', 'x.ps1', 'x.vbs', 'app.js', 'app.mjs', 'x.jar', 'x.apk',
    'shell.php', 'x.phtml', 'x.asp', 'x.aspx', 'x.jsp', 'x.py', 'x.pl', 'x.rb', 'x.cgi', 'x.lnk', 'x.reg', 'x.hta', 'x.scr', 'x.com',
    'macro.docm', 'macro.xlsm', 'macro.pptm', 'page.html', 'page.htm', 'page.xhtml', 'page.mht', 'UPPER.EXE', 'Mixed.PhP',
    'invoice.php.jpg', 'photo.exe.png', 'a.html.txt', 'x.sh.pdf', '.htaccess', 'web.config'];
  for (const name of blocked) {
    const res = await createDoc(`Blocked ${name}`, { buf: Buffer.concat([fx.txt(), Buffer.from('BLOCKMARK')]), name });
    assert.equal(res.status, 400, name);
  }
  const html = await (await createDoc('Web page', { buf: Buffer.from('<html></html>'), name: 'page.html' })).json();
  assert.match(html.message, /Attach URL/);
  assert.equal((await SystemSettings.findOne().lean())?.footerLinks?.length || 0, 0);
  assert.deepEqual(filesContaining('BLOCKMARK'), [], 'nothing written for refused names');
});

test('executables disguised under a harmless extension are refused by content', async () => {
  const disguised = [
    ['logo.png', PE()], ['notes.txt', PE()], ['data.zip', PE()], ['blob.dat', PE()], ['report.pdf', PE()],
    ['image.jpg', Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64)])],           // ELF
    ['tool.txt', Buffer.from('#!/bin/sh\nrm -rf /\n')],                                               // shebang script
    ['mac.csv', Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.alloc(64)])],            // Mach-O
    ['Hello.bin', Buffer.concat([Buffer.from([0xca, 0xfe, 0xba, 0xbe]), Buffer.alloc(64)])],          // Java class / fat Mach-O
  ];
  for (const [name, buf] of disguised) {
    const res = await createDoc(`Disguised ${name}`, { buf: Buffer.concat([buf, Buffer.from('DISGMARK')]), name });
    assert.equal(res.status, 400, name);
    assert.match((await res.json()).message, /Executable/, name);
  }
  assert.deepEqual(filesContaining('DISGMARK'), [], 'rejected content is not left on disk');
});

test('files whose content does not match their claimed type are refused', async () => {
  const bad = [
    ['fake.png', Buffer.from('definitely not a png')], ['fake.jpg', Buffer.from('nope')], ['fake.gif', Buffer.from('nope')],
    ['fake.webp', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])],
    ['fake.pdf', Buffer.from('<html>')], ['fake.xlsx', Buffer.concat([ZIPSIG, Buffer.from('just a zip')])],
    ['fake.pptx', Buffer.concat([ZIPSIG, Buffer.from('[Content_Types].xml word/ only')])],
    ['fake.zip', Buffer.from('not a zip')], ['fake.gz', Buffer.from('not gzip')], ['fake.xls', Buffer.from('plain')],
    ['fake.txt', Buffer.concat([Buffer.from('text'), Buffer.alloc(10, 0), Buffer.from('then binary')])],
  ];
  for (const [name, buf] of bad) {
    const res = await createDoc(`Forged ${name}`, { buf: Buffer.concat([buf, Buffer.from('FORGEMARK')]), name });
    assert.equal(res.status, 400, name);
  }
  assert.deepEqual(filesContaining('FORGEMARK'), []);
});

test('malicious or awkward file names cannot reach the filesystem or inject headers', async () => {
  const awkward = ['../../etc/passwd.txt', '..\\..\\windows\\system32\\notes.txt', 'a"b;c.txt', 'x%00.txt', "o'neil (final) *draft*.txt", 'ünïcode — नमस्ते.txt'];
  for (const [i, name] of awkward.entries()) {
    const { link } = await must(await createDoc(`Awkward name ${i}`, { buf: fx.txt(), name }));
    const shown = link.document.originalName;
    assert.ok(!/[\\/]/.test(shown) && !shown.includes('"') && !shown.includes('..'), `sanitized display name: ${shown}`);
    const stored = (await ownFileNames()).slice(-1)[0];
    assert.match(stored, /^\d+-\d+\.txt$/, 'the disk name is server-generated, never the client name');
    assert.ok(onDisk(stored));
    const res = await pub(`/api/footer-links/${link.id}/download`);
    const cd = res.headers.get('content-disposition');
    assert.match(cd, /^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]*$/, `header is well-formed: ${cd}`);
    assert.ok(!/[\r\n]/.test(cd));
  }
  assert.equal(fs.existsSync(path.join(__dirname, '..', '..', 'etc')), false);
  // The unicode name is preserved for the download via filename*.
  const res = await pub(`/api/footer-links/${(await publicLinks()).slice(-1)[0].id}/download`);
  assert.ok(decodeURIComponent(res.headers.get('content-disposition').split("UTF-8''")[1]).includes('नमस्ते'));
});

test('the 10 MB limit is enforced by the server: exactly 10 MB passes, one byte more is refused', async () => {
  const TEN_MB = 10 * 1024 * 1024;
  const ok = await createDoc('Exactly ten', { buf: Buffer.alloc(TEN_MB, 0x61), name: 'ten.txt' });
  assert.equal(ok.status, 201);
  const tooBig = await createDoc('Ten plus one', { buf: Buffer.concat([Buffer.alloc(TEN_MB, 0x61), Buffer.from('BIGMARK')]), name: 'big.txt' });
  assert.equal(tooBig.status, 400);
  assert.match((await tooBig.json()).message, /too large|10 MB/i);
  assert.deepEqual(filesContaining('BIGMARK'), [], 'the oversized upload is not kept');
  assert.equal((await SystemSettings.findOne().lean()).footerLinks.length, 1);
});

test('a document can be replaced with a different file type; a failed replacement keeps the saved file', async () => {
  const { link } = await must(await createDoc('Rolling', { buf: PDF('first'), name: 'first.pdf' }));
  const [pdfFile] = await ownFileNames();

  const toPng = await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, form({}, { buf: fx.png(), name: 'banner.png' })), 200);
  assert.equal(toPng.link.document.mimeType, 'image/png');
  assert.equal(toPng.link.document.originalName, 'banner.png');
  assert.ok(!onDisk(pdfFile), 'the previous file is removed after a successful replacement');
  assert.equal((await (await pub(`/api/footer-links/${link.id}`)).json()).document.kind, 'image');
  const [pngFile] = await ownFileNames();

  for (const [name, buf] of [['evil.exe', PE()], ['forged.png', Buffer.from('FAILMARK not png')], ['disguised.txt', PE()], ['empty.zip', Buffer.alloc(0)]]) {
    const bad = await api('PATCH', `/api/admin/footer-links/${link.id}`, form({}, { buf, name }));
    assert.equal(bad.status, 400, name);
  }
  assert.deepEqual(await ownFileNames(), [pngFile], 'record still points at the last good file');
  assert.ok(onDisk(pngFile));
  assert.deepEqual(Buffer.from(await (await pub(`/api/footer-links/${link.id}/view`)).arrayBuffer()), fx.png());
  assert.deepEqual(filesContaining('FAILMARK'), []);

  const toZip = await must(await api('PATCH', `/api/admin/footer-links/${link.id}`, form({}, { buf: fx.zip(), name: 'bundle.zip' })), 200);
  assert.equal(toZip.link.document.mimeType, 'application/zip');
  assert.ok(!onDisk(pngFile));
  assert.match((await pub(`/api/footer-links/${link.id}/view`)).headers.get('content-disposition'), /^attachment;/);
});

test('unauthorized users cannot upload or replace files, and nothing is written', async () => {
  const { link } = await must(await createDoc('Protected', { buf: PDF('keep'), name: 'keep.pdf' }));
  const [kept] = await ownFileNames();
  for (const token of [null, userToken]) {
    const expected = token ? 403 : 401;
    const post = await api('POST', '/api/admin/footer-links', form({ label: 'Sneaky', linkType: 'document' }, { buf: Buffer.concat([fx.txt(), Buffer.from('UNAUTHMARK')]), name: 's.txt' }), token);
    assert.equal(post.status, expected);
    const patch = await api('PATCH', `/api/admin/footer-links/${link.id}`, form({}, { buf: Buffer.concat([fx.txt(), Buffer.from('UNAUTHMARK')]), name: 's.txt' }), token);
    assert.equal(patch.status, expected);
  }
  assert.deepEqual(filesContaining('UNAUTHMARK'), [], 'the upload middleware never ran');
  assert.deepEqual(await ownFileNames(), [kept]);
  assert.deepEqual(Buffer.from(await (await pub(`/api/footer-links/${link.id}/view`)).arrayBuffer()), PDF('keep'));
});

test('disabled and deleted links never expose their files, for any file type', async () => {
  const { link } = await must(await createDoc('Gone soon', { buf: fx.xlsx(), name: 'prices.xlsx' }));
  await api('PATCH', `/api/admin/footer-links/${link.id}`, { enabled: false });
  for (const suffix of ['', '/view', '/download']) {
    const res = await pub(`/api/footer-links/${link.id}${suffix}`);
    if (suffix === '') assert.equal((await res.json()).document.exists, false);
    else assert.equal(res.status, 404, `disabled ${suffix}`);
  }
  await api('PATCH', `/api/admin/footer-links/${link.id}`, { enabled: true });
  assert.equal((await pub(`/api/footer-links/${link.id}/download`)).status, 200);
  await api('DELETE', `/api/admin/footer-links/${link.id}`);
  assert.equal((await pub(`/api/footer-links/${link.id}/download`)).status, 404);
  assert.deepEqual(await ownFileNames(), []);
});

test('public file requests cannot reach arbitrary paths or other uploads', async () => {
  await must(await createDoc('Only one', { buf: PDF('x'), name: 'x.pdf' }));
  for (const id of ['../legaldocs', '..%2F..%2Fpackage.json', '%2e%2e/%2e%2e/package.json', 'a'.repeat(16), '../../.env']) {
    for (const suffix of ['/view', '/download']) {
      const res = await pub(`/api/footer-links/${id}${suffix}`);
      assert.equal(res.status, 404, `${id}${suffix}`);
    }
  }
  assert.equal((await pub('/uploads/legaldocs/anything')).status, 403);
});

test('a file shared by two configuration entries is not deleted while one still uses it', async () => {
  const a = await must(await createDoc('Owner A', { buf: PDF('shared'), name: 'a.pdf' }));
  const b = await must(await createDoc('Owner B', { buf: PDF('b-own'), name: 'b.pdf' }));
  const [fileA, fileB] = await ownFileNames();
  // Simulate hand-edited/migrated data: B now points at A's file.
  await SystemSettings.updateOne({ 'footerLinks.id': b.link.id }, { $set: {
    'footerLinks.$.document.storagePath': `uploads/legaldocs/${fileA}`, 'footerLinks.$.document.storedFileName': fileA } });

  await api('DELETE', `/api/admin/footer-links/${a.link.id}`);
  assert.ok(onDisk(fileA), "A's file must survive because B still references it");
  assert.deepEqual(Buffer.from(await (await pub(`/api/footer-links/${b.link.id}/view`)).arrayBuffer()), PDF('shared'));

  // Replacing B releases the reference; now nothing uses the file, so it can go.
  await must(await api('PATCH', `/api/admin/footer-links/${b.link.id}`, form({}, { buf: fx.png(), name: 'new.png' })), 200);
  assert.ok(!onDisk(fileA));
  fs.unlinkSync(path.join(DOCS_DIR, fileB)); // B's original upload, orphaned by the simulated edit
});

test('the fixed legal documents keep their stricter PDF/DOC/DOCX-only rule', async () => {
  const png = await api('POST', '/api/admin/documents/privacy', form({}, { buf: fx.png(), name: 'privacy.png', type: 'image/png' }));
  assert.equal(png.status, 400);
  assert.match((await png.json()).message, /PDF, DOC, or DOCX/);
  const zip = await api('POST', '/api/admin/documents/terms', form({}, { buf: fx.zip(), name: 'terms.zip', type: 'application/zip' }));
  assert.equal(zip.status, 400);
  const ok = await api('POST', '/api/admin/documents/privacy', form({}, { buf: PDF('legal'), name: 'privacy.pdf' }));
  assert.equal(ok.status, 200);
  assert.equal(await LegalDocument.countDocuments(), 1);
});

test('the pure upload helpers: names, stored extensions, kinds and headers', () => {
  assert.equal(fl.blockedNameReason('photo.PNG'), '');
  assert.equal(fl.blockedNameReason('Quarterly Report (final).xlsx'), '');
  assert.equal(fl.blockedNameReason('archive.tar.gz'), '');
  assert.match(fl.blockedNameReason('x.exe'), /Executable/);
  assert.match(fl.blockedNameReason('a.b.php.c.jpg'), /php/);
  assert.match(fl.blockedNameReason(''), /no name/);
  assert.match(fl.blockedNameReason('x'.repeat(300) + '.txt'), /too long/);
  assert.equal(fl.storedExtension('Photo.JPG'), '.jpg');
  assert.equal(fl.storedExtension('model.dwg'), '.bin');
  assert.equal(fl.storedExtension('x.php.PDF'), '.pdf');
  assert.equal(fl.kindOf('application/pdf'), 'pdf');
  assert.equal(fl.kindOf('image/png'), 'image');
  assert.equal(fl.kindOf('image/svg+xml'), 'download');
  assert.equal(fl.kindOf('application/zip'), 'download');
  assert.equal(fl.kindOf(undefined), 'download');
  assert.ok(fl.INLINE_MIMES.has('image/webp') && !fl.INLINE_MIMES.has('image/svg+xml') && !fl.INLINE_MIMES.has('text/plain'));
  assert.equal(fl.MAX_FILE_SIZE, 10 * 1024 * 1024);
  const cd = fl.contentDisposition('attachment', 'we"ird\r\nname.txt');
  assert.ok(!/[\r\n]/.test(cd) && cd.startsWith('attachment; filename="'));
});
