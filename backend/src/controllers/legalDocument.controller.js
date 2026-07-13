const fs = require('fs');
const path = require('path');
const LegalDocument = require('../models/LegalDocument');
const AdminAuditLog = require('../models/AdminAuditLog');

const DOCUMENT_TYPES = [
  { type: 'privacy',       label: 'Privacy Policy' },
  { type: 'terms',         label: 'Terms & Conditions' },
  { type: 'refund-policy', label: 'Refund & Cancellation Policy' },
  { type: 'about-us',      label: 'About Us' },
  { type: 'vision',        label: 'Vision, Mission & Core Values' },
];
const TYPE_SET = new Set(DOCUMENT_TYPES.map((d) => d.type));

function toMeta(defn, doc) {
  return {
    documentType:   defn.type,
    label:          defn.label,
    exists:         !!doc,
    originalName:   doc?.originalName || '',
    mimeType:       doc?.mimeType || '',
    size:           doc?.size || 0,
    uploadedByName: doc?.uploadedByName || '',
    updatedAt:      doc?.updatedAt || null,
    viewUrl:        doc ? `/api/documents/${defn.type}/view` : '',
  };
}

// GET /api/documents — public
exports.listPublic = async (req, res, next) => {
  try {
    const docs = await LegalDocument.find({ documentType: { $in: [...TYPE_SET] } }).lean();
    const byType = new Map(docs.map((d) => [d.documentType, d]));
    const results = DOCUMENT_TYPES.map((defn) => toMeta(defn, byType.get(defn.type)));
    res.json({ success: true, documents: results });
  } catch (err) { next(err); }
};

// GET /api/documents/:type — public
exports.getPublicOne = async (req, res, next) => {
  try {
    const defn = DOCUMENT_TYPES.find((d) => d.type === req.params.type);
    if (!defn) return res.status(400).json({ success: false, message: 'Unknown document type' });

    const doc = await LegalDocument.findOne({ documentType: defn.type }).lean();
    res.json({ success: true, document: toMeta(defn, doc) });
  } catch (err) { next(err); }
};

// GET /api/documents/:type/view — public, opens inline in a new tab
exports.viewDocument = async (req, res, next) => {
  try {
    if (!TYPE_SET.has(req.params.type)) return res.status(400).json({ success: false, message: 'Unknown document type' });

    const doc = await LegalDocument.findOne({ documentType: req.params.type }).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'No document uploaded for this type' });

    const filePath = path.join(__dirname, '../..', doc.storagePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Document file is missing on the server' });

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName.replace(/"/g, '')}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) { next(err); }
};

// POST/PUT /api/admin/documents/:type — admin
exports.uploadOrReplace = async (req, res, next) => {
  try {
    const defn = DOCUMENT_TYPES.find((d) => d.type === req.params.type);
    if (!defn) return res.status(400).json({ success: false, message: 'Unknown document type' });
    if (!req.file) return res.status(400).json({ success: false, message: 'A PDF, DOC, or DOCX file is required' });

    const existing = await LegalDocument.findOne({ documentType: defn.type });
    if (existing) {
      const oldPath = path.join(__dirname, '../..', existing.storagePath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const storagePath = `uploads/legaldocs/${req.file.filename}`;
    const update = {
      originalName:   req.file.originalname,
      storedFileName: req.file.filename,
      mimeType:       req.file.mimetype,
      size:           req.file.size,
      storagePath,
      uploadedBy:     req.user._id,
      uploadedByName: req.user.name || req.user.email || 'Admin',
    };

    const doc = await LegalDocument.findOneAndUpdate(
      { documentType: defn.type },
      { $set: update },
      { upsert: true, new: true, runValidators: true }
    ).lean();

    await AdminAuditLog.create({
      action: existing ? 'legal_document_replace' : 'legal_document_upload',
      performedBy: req.user._id,
      performedByName: req.user.name || req.user.email || 'Admin',
      performedByRole: req.user.role || '',
      targetType: 'LegalDocument',
      targetName: defn.label,
      note: `${existing ? 'Replaced' : 'Uploaded'} ${defn.label}: ${req.file.originalname}`,
    }).catch(() => {});

    res.json({ success: true, document: toMeta(defn, doc) });
  } catch (err) { next(err); }
};

// DELETE /api/admin/documents/:type — admin
exports.deleteDocument = async (req, res, next) => {
  try {
    const defn = DOCUMENT_TYPES.find((d) => d.type === req.params.type);
    if (!defn) return res.status(400).json({ success: false, message: 'Unknown document type' });

    const doc = await LegalDocument.findOne({ documentType: defn.type });
    if (!doc) return res.status(404).json({ success: false, message: 'No document uploaded for this type' });

    const filePath = path.join(__dirname, '../..', doc.storagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await LegalDocument.deleteOne({ _id: doc._id });

    await AdminAuditLog.create({
      action: 'legal_document_delete',
      performedBy: req.user._id,
      performedByName: req.user.name || req.user.email || 'Admin',
      performedByRole: req.user.role || '',
      targetType: 'LegalDocument',
      targetName: defn.label,
      note: `Deleted ${defn.label}: ${doc.originalName}`,
    }).catch(() => {});

    res.json({ success: true, document: toMeta(defn, null) });
  } catch (err) { next(err); }
};

exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
