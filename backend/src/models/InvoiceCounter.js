const mongoose = require('mongoose');

// One document per calendar year — seq is incremented atomically via findOneAndUpdate + $inc.
// This guarantees unique sequential invoice numbers even under concurrent requests.
const invoiceCounterSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true },
  seq:  { type: Number, default: 0 },
});

module.exports = mongoose.model('InvoiceCounter', invoiceCounterSchema);
