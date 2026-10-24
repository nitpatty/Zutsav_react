const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

// Keep the real model for the schema-level gender assertion, then replace the
// controller's model dependency so these tests need no database.
const RealPandit = require('../src/models/Pandit');
const modelCalls = [];
let storedPandit;
const panditModelPath = require.resolve('../src/models/Pandit');
require.cache[panditModelPath] = {
  id: panditModelPath, filename: panditModelPath, loaded: true,
  exports: {
    findOne: () => ({ select: async () => storedPandit }),
    findOneAndUpdate: async (query, update, options) => {
      modelCalls.push({ query, update, options });
      return { _id: 'pandit-id', ...update.$set, gender: storedPandit.gender, city: storedPandit.city };
    },
  },
};
const controller = require('../src/controllers/pandit.controller');

const firstPoojaId = new mongoose.Types.ObjectId().toString();
const secondPoojaId = new mongoose.Types.ObjectId().toString();

function mockRes() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function call(body, pandit = {}) {
  modelCalls.length = 0;
  storedPandit = { gender: 'female', city: 'Varanasi', poojaCharges: [], ...pandit };
  const res = mockRes();
  let nextError;
  await controller.updatePoojaServices({ user: { _id: 'user-id' }, body }, res, (err) => { nextError = err; });
  assert.equal(nextError, undefined);
  return res;
}

test('pooja services: valid update writes only service fields and preserves gender', async () => {
  const res = await call({
    selectedPoojas: [firstPoojaId],
    poojaCharges: [{ poojaId: firstPoojaId, expectedCharges: 500 }],
  });
  assert.equal(res.statusCode, 200);
  const write = modelCalls[0];
  assert.deepEqual(write.query, { userId: 'user-id' });
  assert.deepEqual(Object.keys(write.update.$set).sort(), ['poojaCharges', 'selectedPoojas']);
  assert.equal(write.update.$set.poojaCharges[0].expectedCharges, 500);
  assert.equal(write.options.runValidators, true);
  assert.equal(res.body.pandit.gender, 'female');
  assert.equal(res.body.pandit.city, 'Varanasi');
});

test('pooja services: legacy empty gender does not block a valid scoped update', async () => {
  const res = await call({
    selectedPoojas: [firstPoojaId],
    poojaCharges: [{ poojaId: firstPoojaId, expectedCharges: 0 }],
  }, { gender: '' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.pandit.gender, '');
  assert.equal(modelCalls.length, 1);
});

test('pooja services: existing approval metadata is retained for a selected pooja', async () => {
  const res = await call({
    selectedPoojas: [firstPoojaId],
    poojaCharges: [{ poojaId: firstPoojaId, expectedCharges: 750 }],
  }, { poojaCharges: [{ poojaId: firstPoojaId, expectedCharges: 300, approvedPrice: 450, priceApprovalStatus: 'approved', approvedByName: 'Admin' }] });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls[0].update.$set.poojaCharges[0];
  assert.equal(saved.expectedCharges, 750);
  assert.equal(saved.approvedPrice, 450);
  assert.equal(saved.priceApprovalStatus, 'approved');
});

test('pooja services: malformed Pooja IDs and invalid charges are client errors', async () => {
  let res = await call({ selectedPoojas: ['not-an-id'] });
  assert.equal(res.statusCode, 400);
  assert.equal(modelCalls.length, 0);
  res = await call({ selectedPoojas: [firstPoojaId], poojaCharges: [{ poojaId: firstPoojaId, expectedCharges: -1 }] });
  assert.equal(res.statusCode, 400);
  assert.equal(modelCalls.length, 0);
});

test('pooja services: request cannot overwrite gender through an unrelated field', async () => {
  const res = await call({
    selectedPoojas: [secondPoojaId],
    poojaCharges: [{ poojaId: secondPoojaId, expectedCharges: 100 }],
    gender: '',
  });
  assert.equal(res.statusCode, 200);
  assert.ok(!('gender' in modelCalls[0].update.$set));
});

test('dedicated gender schema validation still rejects an invalid value', async () => {
  const pandit = new RealPandit({
    userId: new mongoose.Types.ObjectId(), name: 'Synthetic Pandit',
    email: `synthetic-${Date.now()}@example.test`, phone: '9876543210', gender: '',
  });
  await assert.rejects(pandit.validate(), /gender/);
});
