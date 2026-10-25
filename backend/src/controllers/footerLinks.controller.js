/**
 * Custom footer links (System Configuration → Frontend).
 *
 * Admin (mounted under /api/admin/footer-links, behind protect + authorize('admin')):
 *   GET    /            list
 *   POST   /            create  (JSON for URL links, multipart for documents)
 *   PATCH  /:id         edit label / URL / enabled / replace document / switch type
 *   PUT    /order       reorder  { ids: [...] }
 *   DELETE /:id         delete (also removes the stored file)
 *
 * Public (mounted at /api/footer-links, no auth):
 *   GET /:id            viewer metadata for an enabled file link
 *   GET /:id/view       the file: inline only for PDF/images, otherwise a download
 *   GET /:id/download   the file as a forced download
 *
 * Storage: links live in SystemSettings.footerLinks (no new collection). Uploaded
 * documents reuse the existing legal-document storage folder, which is not
 * directly web-accessible. Every write is a single atomic update; a failed request
 * never leaves a half-configured link or an orphaned upload behind.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SystemSettings = require('../models/SystemSettings');
const LegalDocument = require('../models/LegalDocument');
const settingsService = require('../utils/settingsService');
const { audit } = require('../services/auditService');
const { DOCUMENT_TYPES } = require('./legalDocument.controller');
const fl = require('../utils/footerLinks');

const FIXED_LABEL_KEYS = new Set(DOCUMENT_TYPES.map((d) => fl.labelKeyOf(d.label)));
const STORAGE_ROOT = path.join(__dirname, '../..');

/* ── helpers ──────────────────────────────────────────────────────────────── */

const fail = (message, status = 400) => new fl.FooterLinkError(message, status);

function removeFile(relativePath) {
  if (!relativePath) return;
  try {
    const full = path.resolve(STORAGE_ROOT, relativePath);
    // Only ever delete inside the legal-documents folder, whatever the record says.
    if (full.startsWith(path.resolve(STORAGE_ROOT, 'uploads', 'legaldocs') + path.sep)) fs.unlinkSync(full);
  } catch { /* already gone */ }
}

/**
 * Delete a stored file only when NOTHING else still references it (another footer link or
 * a fixed legal document). Call it after the configuration change that dropped this
 * reference has been persisted. Uploads get unique names, so a shared reference should
 * never happen — this protects against hand-edited or migrated data.
 */
async function releaseFile(storagePath) {
  if (!storagePath) return;
  const stillUsedByLink = await SystemSettings.exists({ footerLinks: { $elemMatch: { 'document.storagePath': storagePath } } });
  const stillUsedByLegal = await LegalDocument.exists({ storagePath });
  if (!stillUsedByLink && !stillUsedByLegal) removeFile(storagePath);
}

const removeUpload = (file) => file && file.path && (() => { try { fs.unlinkSync(file.path); } catch { /* ignore */ } })();

async function loadLinks() {
  const s = await SystemSettings.findOne().select('footerLinks').lean();
  return (s && s.footerLinks) || [];
}

async function findLink(id) {
  if (!fl.ID_RE.test(String(id || ''))) return null;
  const links = await loadLinks();
  return links.find((l) => l.id === id) || null;
}

function assertNotReserved(label) {
  if (FIXED_LABEL_KEYS.has(fl.labelKeyOf(label))) {
    throw fail(`"${label}" is already a fixed legal document in the footer. Upload it in the Legal Documents section above instead, or choose a different name.`, 409);
  }
}

/** Build the verified document subdocument for an uploaded file (throws if invalid). */
function buildDocument(file, user) {
  const { mimeType } = fl.inspectUpload(file.path, file.originalname); // blocks unsafe names, verifies real bytes
  return {
    originalName:   fl.safeFileName(fl.decodeUploadName(file.originalname)),
    storedFileName: file.filename,
    mimeType,
    size:           file.size,
    storagePath:    `uploads/legaldocs/${file.filename}`,
    uploadedByName: (user && (user.name || user.email)) || 'Admin',
    uploadedAt:     new Date(),
  };
}

function auditLink(req, action, link, note, extra = {}) {
  audit(req, {
    module: 'system_config', action, severity: 'info',
    targetType: 'FooterLink', targetName: link ? link.label : '', targetId: null,
    newValues: link ? { id: link.id, linkType: link.linkType, enabled: link.enabled !== false, ...extra } : extra,
    note,
  }).catch(() => {});
}

// Wraps handlers: maps FooterLinkError to its status, everything else to next(err).
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    removeUpload(req.file); // never leave an upload behind on a failed request
    if (err instanceof fl.FooterLinkError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/* ── Admin ────────────────────────────────────────────────────────────────── */

exports.listLinks = handle(async (req, res) => {
  const links = await loadLinks();
  const sorted = links.map((l, i) => ({ l, i })).sort((a, b) => ((a.l.order || 0) - (b.l.order || 0)) || (a.i - b.i));
  res.json({ success: true, max: fl.MAX_LINKS, links: sorted.map(({ l }, i) => fl.toAdminLink(l, i)) });
});

exports.createLink = handle(async (req, res) => {
  const body = req.body || {};
  const label = fl.normalizeLabel(body.label);
  assertNotReserved(label);

  const linkType = body.linkType;
  if (linkType !== 'url' && linkType !== 'document') throw fail('Choose a link type: URL or document');
  const enabled = body.enabled === undefined ? true : fl.parseBool(body.enabled, 'enabled');

  const link = { id: crypto.randomBytes(8).toString('hex'), label, labelKey: fl.labelKeyOf(label), linkType, url: '', document: null, enabled, updatedAt: new Date() };
  if (linkType === 'url') {
    if (req.file) throw fail('A URL link cannot also have an uploaded file. Choose "Upload Document" to attach a file.');
    link.url = fl.validateUrl(body.url);
  } else {
    if (body.url !== undefined && String(body.url).trim() !== '') throw fail('A document link cannot also have a URL. Choose "Attach URL" instead.');
    if (!req.file) throw fail('Choose a PDF, DOC, or DOCX file to upload');
    link.document = buildDocument(req.file, req.user);
  }

  const existing = await loadLinks();
  link.order = existing.reduce((m, l) => Math.max(m, l.order || 0), -1) + 1;

  await SystemSettings.findOneAndUpdate({}, { $setOnInsert: { platformName: 'Zutsav' } }, { upsert: true });
  const saved = await SystemSettings.findOneAndUpdate(
    {
      $expr: { $lt: [{ $size: { $ifNull: ['$footerLinks', []] } }, fl.MAX_LINKS] },
      footerLinks: { $not: { $elemMatch: { labelKey: link.labelKey } } },
    },
    { $push: { footerLinks: link } },
    { new: true }
  ).select('footerLinks').lean();

  if (!saved) {
    removeUpload(req.file);
    const current = await loadLinks();
    if (current.length >= fl.MAX_LINKS) throw fail(`You can have at most ${fl.MAX_LINKS} custom footer links`, 409);
    throw fail(`A custom footer link named "${label}" already exists`, 409);
  }
  settingsService.invalidate();
  const stored = saved.footerLinks.find((l) => l.id === link.id);
  auditLink(req, 'footer_link_create', stored, `Added footer link "${label}" (${linkType})`);
  res.status(201).json({ success: true, link: fl.toAdminLink(stored) });
});

exports.updateLink = handle(async (req, res) => {
  const { id } = req.params;
  const current = await findLink(id);
  if (!current) throw fail('Footer link not found', 404);
  const body = req.body || {};

  const set = {};
  let label = current.label;
  if (body.label !== undefined) {
    label = fl.normalizeLabel(body.label);
    if (fl.labelKeyOf(label) !== current.labelKey) assertNotReserved(label);
    set['footerLinks.$[el].label'] = label;
    set['footerLinks.$[el].labelKey'] = fl.labelKeyOf(label);
  }
  if (body.enabled !== undefined) set['footerLinks.$[el].enabled'] = fl.parseBool(body.enabled, 'enabled');

  const nextType = body.linkType === undefined ? current.linkType : body.linkType;
  if (nextType !== 'url' && nextType !== 'document') throw fail('Choose a link type: URL or document');
  const switching = nextType !== current.linkType;
  let oldFileToRemove = null;

  if (nextType === 'url') {
    if (req.file) throw fail('A URL link cannot also have an uploaded file. Choose "Upload Document" to attach a file.');
    if (switching || body.url !== undefined) {
      set['footerLinks.$[el].url'] = fl.validateUrl(body.url);
    }
    if (switching) {
      set['footerLinks.$[el].linkType'] = 'url';
      set['footerLinks.$[el].document'] = null;
      oldFileToRemove = current.document && current.document.storagePath;
    }
  } else {
    if (body.url !== undefined && String(body.url).trim() !== '') throw fail('A document link cannot also have a URL. Choose "Attach URL" instead.');
    if (switching && !req.file) throw fail('Choose a PDF, DOC, or DOCX file to upload');
    if (req.file) {
      set['footerLinks.$[el].document'] = buildDocument(req.file, req.user);
      oldFileToRemove = current.document && current.document.storagePath;
    }
    if (switching) {
      set['footerLinks.$[el].linkType'] = 'document';
      set['footerLinks.$[el].url'] = '';
    }
  }
  if (Object.keys(set).length === 0) throw fail('Nothing to update');
  set['footerLinks.$[el].updatedAt'] = new Date();

  const newKey = set['footerLinks.$[el].labelKey'];
  const filter = { footerLinks: { $elemMatch: { id } } };
  if (newKey) filter.$and = [{ footerLinks: { $not: { $elemMatch: { labelKey: newKey, id: { $ne: id } } } } }];

  const saved = await SystemSettings.findOneAndUpdate(filter, { $set: set }, { new: true, arrayFilters: [{ 'el.id': id }] })
    .select('footerLinks').lean();
  if (!saved) {
    removeUpload(req.file);
    if (!(await findLink(id))) throw fail('Footer link not found', 404);
    throw fail(`A custom footer link named "${label}" already exists`, 409);
  }

  if (oldFileToRemove) await releaseFile(oldFileToRemove); // only after the new state is persisted
  settingsService.invalidate();
  const stored = saved.footerLinks.find((l) => l.id === id);
  auditLink(req, body.enabled !== undefined && Object.keys(set).length <= 2 ? 'footer_link_toggle' : 'footer_link_update', stored, `Updated footer link "${stored.label}"`);
  res.json({ success: true, link: fl.toAdminLink(stored) });
});

exports.deleteLink = handle(async (req, res) => {
  const { id } = req.params;
  if (!fl.ID_RE.test(String(id || ''))) throw fail('Footer link not found', 404);
  const before = await SystemSettings.findOneAndUpdate(
    { footerLinks: { $elemMatch: { id } } },
    { $pull: { footerLinks: { id } } },
    { new: false }
  ).select('footerLinks').lean();
  const removed = before && before.footerLinks.find((l) => l.id === id);
  if (!removed) throw fail('Footer link not found', 404);

  if (removed.document) await releaseFile(removed.document.storagePath);
  settingsService.invalidate();
  auditLink(req, 'footer_link_delete', removed, `Deleted footer link "${removed.label}"`);
  res.json({ success: true });
});

exports.reorderLinks = handle(async (req, res) => {
  const ids = (req.body || {}).ids;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) throw fail('ids must be an array of link ids');
  const current = await loadLinks();
  const known = new Set(current.map((l) => l.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((i) => !known.has(i))) {
    throw fail('ids must list every existing footer link exactly once');
  }
  if (ids.length === 0) return res.json({ success: true, links: [] });

  const set = {};
  const arrayFilters = [];
  ids.forEach((id, index) => {
    set[`footerLinks.$[e${index}].order`] = index;
    arrayFilters.push({ [`e${index}.id`]: id });
  });
  const saved = await SystemSettings.findOneAndUpdate({}, { $set: set }, { new: true, arrayFilters }).select('footerLinks').lean();
  settingsService.invalidate();
  auditLink(req, 'footer_link_reorder', null, 'Reordered footer links', { order: ids });
  const links = [...saved.footerLinks].sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({ success: true, links: links.map((l, i) => fl.toAdminLink(l, i)) });
});

/* ── Public ───────────────────────────────────────────────────────────────── */

async function findPublicDocumentLink(id) {
  const link = await findLink(id);
  return link && link.enabled !== false && link.linkType === 'document' && link.document ? link : null;
}

exports.getPublicLinkMeta = handle(async (req, res) => {
  const link = await findPublicDocumentLink(req.params.id);
  if (!link) return res.json({ success: true, document: { exists: false } });
  res.json({
    success: true,
    document: {
      exists: true,
      label: link.label,
      mimeType: link.document.mimeType,
      kind: fl.kindOf(link.document.mimeType), // 'pdf' | 'image' | 'download' — how the viewer should present it
      fileName: fl.safeFileName(link.document.originalName),
      size: link.document.size,
      updatedAt: link.updatedAt || link.document.uploadedAt || null,
      viewUrl: `/api/footer-links/${link.id}/view`,
      downloadUrl: `/api/footer-links/${link.id}/download`,
    },
  });
});

async function sendLinkFile(req, res, { forceDownload }) {
  const link = await findPublicDocumentLink(req.params.id);
  if (!link) return res.status(404).json({ success: false, message: 'This file is not available' });

  const filePath = path.resolve(STORAGE_ROOT, link.document.storagePath);
  if (!filePath.startsWith(path.resolve(STORAGE_ROOT, 'uploads', 'legaldocs') + path.sep) || !fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'This file is not available' });
  }

  // Only deliberately supported, safely renderable formats (PDF, common raster images)
  // may display inline on the app's origin. Everything else — Office files, archives,
  // SVG, text, unknown types — is a download, so uploaded content is never rendered
  // (or executed) in the site's context.
  const inline = !forceDownload && fl.INLINE_MIMES.has(link.document.mimeType);
  res.setHeader('Content-Type', inline ? link.document.mimeType : (link.document.mimeType || 'application/octet-stream'));
  res.setHeader('Content-Disposition', fl.contentDisposition(inline ? 'inline' : 'attachment', link.document.originalName));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  if (!inline) res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); });
  stream.pipe(res);
}

exports.viewPublicLink = handle((req, res) => sendLinkFile(req, res, { forceDownload: false }));
exports.downloadPublicLink = handle((req, res) => sendLinkFile(req, res, { forceDownload: true }));
