/**
 * Pandit Location Data-Integrity Tests (Phase 4)
 *
 * 1. validateCoordinatePair (pure) — pair semantics, type/range rejection,
 *    explicit clear, untouched-when-absent.
 * 2. Controller wiring — updateLanguagesAddress / updatePersonalInfo /
 *    updateMyProfile reject garbage with HTTP 400 (never 500), normalize
 *    valid numeric strings, and clear the stored pin when an address changes
 *    without a new coordinate pair (desync guard).
 * 3. Pandit schema min/max — last line of defense for any other writer.
 *
 * Controller tests stub the Pandit/User models via the require cache, so no
 * database is needed and no booking/referral/wallet code is exercised.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ── 1. Pure helper (no model dependency) ────────────────────────────────────
const { validateCoordinatePair, addressFieldsChanged } = require('../src/utils/locationValidation');

test('helper: neither coordinate provided → untouched (no updates)', () => {
  const out = validateCoordinatePair({ address: 'x' });
  assert.equal(out.ok, true);
  assert.equal(out.updates, null);
});

test('helper: both numeric strings (form input) → normalized numbers', () => {
  const out = validateCoordinatePair({ latitude: '28.5795', longitude: ' 77.3287 ' });
  assert.equal(out.ok, true);
  assert.deepEqual(out.updates, { latitude: 28.5795, longitude: 77.3287 });
});

test('helper: both numbers pass through', () => {
  const out = validateCoordinatePair({ latitude: 28.623105, longitude: 77.218474 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.updates, { latitude: 28.623105, longitude: 77.218474 });
});

test('helper: boundary values ±90 / ±180 are accepted', () => {
  for (const pair of [
    { latitude: 90, longitude: 180 },
    { latitude: -90, longitude: -180 },
    { latitude: 0, longitude: 0 },
  ]) {
    const out = validateCoordinatePair(pair);
    assert.equal(out.ok, true, JSON.stringify(pair));
    assert.deepEqual(out.updates, pair);
  }
});

test('helper: latitude alone → rejected (pair must travel together)', () => {
  const out = validateCoordinatePair({ latitude: 28.5 });
  assert.equal(out.ok, false);
  assert.match(out.message, /together/);
});

test('helper: longitude alone → rejected', () => {
  const out = validateCoordinatePair({ longitude: 77.3 });
  assert.equal(out.ok, false);
  assert.match(out.message, /together/);
});

test('helper: non-numeric strings → rejected', () => {
  const out = validateCoordinatePair({ latitude: 'abc', longitude: '77.3' });
  assert.equal(out.ok, false);
  assert.match(out.message, /numeric/);
});

test('helper: empty strings → rejected (Number("") is 0 — must not become 0,0)', () => {
  const out = validateCoordinatePair({ latitude: '', longitude: '' });
  assert.equal(out.ok, false);
  assert.match(out.message, /numeric/);
});

test('helper: booleans and arrays → rejected', () => {
  assert.equal(validateCoordinatePair({ latitude: true, longitude: 77 }).ok, false);
  assert.equal(validateCoordinatePair({ latitude: [1], longitude: [2] }).ok, false);
  assert.equal(validateCoordinatePair({ latitude: {}, longitude: 77 }).ok, false);
});

test('helper: latitude out of range → rejected', () => {
  const out = validateCoordinatePair({ latitude: 95, longitude: 77 });
  assert.equal(out.ok, false);
  assert.match(out.message, /-90 and 90/);
});

test('helper: longitude out of range → rejected', () => {
  const out = validateCoordinatePair({ latitude: 28.5, longitude: 185 });
  assert.equal(out.ok, false);
  assert.match(out.message, /-180 and 180/);
});

test('helper: centre-of-India style values are in range (they are valid coords, just the wrong pin)', () => {
  const out = validateCoordinatePair({ latitude: 20.5937, longitude: 78.9629 });
  assert.equal(out.ok, true);
});

test('helper: both null → explicit clear', () => {
  const out = validateCoordinatePair({ latitude: null, longitude: null });
  assert.equal(out.ok, true);
  assert.deepEqual(out.updates, { latitude: null, longitude: null });
});

test('helper: one null + one number → rejected', () => {
  const out = validateCoordinatePair({ latitude: null, longitude: 77 });
  assert.equal(out.ok, false);
});

test('addressFieldsChanged: true per field, false when absent', () => {
  for (const field of ['pincode', 'state', 'city', 'district', 'address']) {
    assert.equal(addressFieldsChanged({ [field]: 'x' }), true, field);
  }
  assert.equal(addressFieldsChanged({ languages: ['Hindi'] }), false);
  assert.equal(addressFieldsChanged({ latitude: 1, longitude: 2 }), false);
});

// ── 2. Controller wiring (stubbed models via require cache) ─────────────────
const realPandit = require('../src/models/Pandit');
const realUser = require('../src/models/User');

const modelCalls = [];
const panditModelPath = require.resolve('../src/models/Pandit');
const userModelPath = require.resolve('../src/models/User');
require.cache[panditModelPath] = {
  id: panditModelPath, filename: panditModelPath, loaded: true,
  exports: {
    findOneAndUpdate: async (query, updates) => {
      modelCalls.push({ model: 'Pandit', query, updates });
      return { ...updates };
    },
  },
};
require.cache[userModelPath] = {
  id: userModelPath, filename: userModelPath, loaded: true,
  exports: {
    findByIdAndUpdate: async (id, updates) => { modelCalls.push({ model: 'User', id, updates }); },
  },
};

const controller = require('../src/controllers/pandit.controller');

function mockRes() {
  const res = { statusCode: 200, body: undefined, nextErr: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

function mockReq(body) {
  return { user: { _id: '507f1f77bcf86cd799439011' }, body };
}

async function call(handler, body) {
  modelCalls.length = 0;
  const req = mockReq(body);
  const res = mockRes();
  let nextErr = null;
  await handler(req, res, (err) => { nextErr = err; });
  assert.equal(nextErr, null, 'handler must not call next(err)');
  return res;
}

test('updateLanguagesAddress: valid numeric-string pair is normalized and saved', async () => {
  const res = await call(controller.updateLanguagesAddress, {
    address: 'Sector 18, Noida, Uttar Pradesh 201301',
    city: 'Noida', state: 'Uttar Pradesh', pincode: '201301',
    latitude: '28.5708', longitude: '77.3262',
  });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.equal(saved.latitude, 28.5708);
  assert.equal(saved.longitude, 77.3262);
  assert.equal(saved.address, 'Sector 18, Noida, Uttar Pradesh 201301');
});

test('updateLanguagesAddress: out-of-range latitude → HTTP 400, model untouched', async () => {
  const res = await call(controller.updateLanguagesAddress, { latitude: 95, longitude: 77 });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(modelCalls.length, 0);
});

test('updateLanguagesAddress: latitude alone → HTTP 400, model untouched', async () => {
  const res = await call(controller.updateLanguagesAddress, { latitude: '28.5' });
  assert.equal(res.statusCode, 400);
  assert.equal(modelCalls.length, 0);
});

test('updateLanguagesAddress: address change WITHOUT coordinates clears the stored pin (desync guard)', async () => {
  const res = await call(controller.updateLanguagesAddress, { address: 'New address text', city: 'Varanasi' });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.equal(saved.latitude, null);
  assert.equal(saved.longitude, null);
  assert.equal(saved.address, 'New address text');
});

test('updateLanguagesAddress: address + valid pair → no clearing', async () => {
  const res = await call(controller.updateLanguagesAddress, { address: 'addr', latitude: 25.3, longitude: 82.97 });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.equal(saved.latitude, 25.3);
  assert.equal(saved.longitude, 82.97);
});

test('updateLanguagesAddress: languages-only change does not touch coordinates', async () => {
  const res = await call(controller.updateLanguagesAddress, { languages: ['Hindi', 'Sanskrit'] });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.ok(!('latitude' in saved), 'latitude must not be part of a languages-only update');
  assert.ok(!('longitude' in saved));
});

test('updateLanguagesAddress: explicit null pair clears coordinates', async () => {
  const res = await call(controller.updateLanguagesAddress, { latitude: null, longitude: null });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.equal(saved.latitude, null);
  assert.equal(saved.longitude, null);
});

test('updatePersonalInfo: garbage coordinates → HTTP 400, nothing saved', async () => {
  const res = await call(controller.updatePersonalInfo, { name: 'Ramesh', latitude: 'abc', longitude: '77' });
  assert.equal(res.statusCode, 400);
  assert.equal(modelCalls.length, 0);
});

test('updatePersonalInfo: valid pair + non-location field → saved together', async () => {
  const res = await call(controller.updatePersonalInfo, { fatherName: 'Shyam', latitude: '26.8467', longitude: '80.9462' });
  assert.equal(res.statusCode, 200);
  const panditCall = modelCalls.find((c) => c.model === 'Pandit');
  assert.equal(panditCall.updates.latitude, 26.8467);
  assert.equal(panditCall.updates.longitude, 80.9462);
  assert.equal(panditCall.updates.fatherName, 'Shyam');
});

test('updatePersonalInfo: address change without coordinates clears the pin', async () => {
  const res = await call(controller.updatePersonalInfo, { address: 'somewhere new' });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.equal(saved.latitude, null);
  assert.equal(saved.longitude, null);
});

test('updateMyProfile: address change clears stored coordinates (endpoint cannot write them)', async () => {
  const res = await call(controller.updateMyProfile, { address: 'changed', state: 'Bihar' });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.equal(saved.latitude, null);
  assert.equal(saved.longitude, null);
  assert.equal(saved.address, 'changed');
});

test('updateMyProfile: non-location change does not touch coordinates', async () => {
  const res = await call(controller.updateMyProfile, { bio: 'Experienced pandit' });
  assert.equal(res.statusCode, 200);
  const saved = modelCalls.find((c) => c.model === 'Pandit').updates;
  assert.ok(!('latitude' in saved));
  assert.ok(!('longitude' in saved));
});

// ── 3. Schema min/max (last line of defense, no DB needed) ──────────────────
function validBaseDoc(extra) {
  return new realPandit({
    userId: '507f1f77bcf86cd799439011',
    name: 'Test Pandit',
    email: `test-loc-${Math.random().toString(36).slice(2)}@example.com`,
    phone: '9876543210',
    ...extra,
  });
}

test('Pandit schema: latitude above 90 fails validation', () => {
  const err = validBaseDoc({ latitude: 91 }).validateSync();
  assert.ok(err && err.errors.latitude, 'expected a latitude validation error');
});

test('Pandit schema: longitude below -180 fails validation', () => {
  const err = validBaseDoc({ longitude: -181 }).validateSync();
  assert.ok(err && err.errors.longitude, 'expected a longitude validation error');
});

test('Pandit schema: valid pair and null defaults still validate', () => {
  assert.equal(validBaseDoc().validateSync(), undefined, 'null defaults must remain valid');
  assert.equal(
    validBaseDoc({ latitude: 28.5708, longitude: 77.3262 }).validateSync(),
    undefined,
    'a valid pair must validate',
  );
});
