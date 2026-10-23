const mongoose = require('mongoose');

// One document per (series, calendar year) — seq is incremented atomically via
// findOneAndUpdate + $inc. This guarantees unique sequential invoice numbers
// even under concurrent requests.
//
// Series discriminator:
//   'INV' = automatic booking invoices (historic default; legacy rows that
//           pre-date this field are claimed as 'INV' by the numbering service)
//   'MAN' = manually created offline-sale invoices
// The compound unique index on {series, year} is the concurrency backstop;
// Invoice.invoiceNumber remains globally unique on top of it.
const invoiceCounterSchema = new mongoose.Schema({
  series: { type: String, default: 'INV' },
  year:   { type: Number, required: true },
  seq:    { type: Number, default: 0 },
});

invoiceCounterSchema.index({ series: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('InvoiceCounter', invoiceCounterSchema);
