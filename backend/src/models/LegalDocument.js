const mongoose = require('mongoose');

const legalDocumentSchema = new mongoose.Schema({
  documentType: {
    type: String,
    enum: ['privacy', 'terms', 'refund-policy', 'about-us', 'vision'],
    required: true,
    unique: true,
  },
  originalName:   { type: String, required: true },
  storedFileName: { type: String, required: true },
  mimeType:       { type: String, required: true },
  size:           { type: Number, required: true },
  storagePath:    { type: String, required: true }, // relative path, e.g. 'uploads/legaldocs/<file>'
  uploadedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  uploadedByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('LegalDocument', legalDocumentSchema);
