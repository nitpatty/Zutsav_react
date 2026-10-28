import fs from 'fs';
import path from 'path';
import { pairForSave } from '../../../utils/locationPin';

// BookingFlowScreen is a 1,100-line wizard (calendar, slots, pricing, payment); driving it end to end is out of scope
// for the location work and would exercise booking logic that must not change. These are WIRING guards for the two
// places the location fix touches it, backed by behavioural tests of everything they call:
//   AddressPicker.location.test.jsx  — a merge-style parent (this screen) gets latitude/longitude: null after an edit
//   locationPin.test.js              — pairForSave never yields half a pair
const source = fs.readFileSync(path.join(__dirname, '..', 'BookingFlowScreen.jsx'), 'utf8');

describe('BookingFlowScreen ↔ location wiring (guards)', () => {
  it('hands the booking coordinates back to AddressPicker, so a manual edit can clear them', () => {
    expect(source).toMatch(/<AddressPicker[\s\S]*?latitude: userDetails\.latitude, longitude: userDetails\.longitude[\s\S]*?\/>/);
  });

  it('merges what the picker emits (including latitude: null / longitude: null) into the booking details', () => {
    expect(source).toMatch(/onChange=\{\(fields\) => setUserDetails\(p => \(\{ \.\.\.p, \.\.\.fields \}\)\)\}/);
  });

  it('builds the submitted userDetails with the whole-pair guard, not field by field', () => {
    expect(source).toMatch(/\.\.\.pairForSave\(userDetails\)/);
    expect(source).not.toMatch(/latitude: userDetails\.latitude \?\? null/);
  });
});

describe('what that guard produces for the booking payload', () => {
  const booking = (details) => ({ name: 'Asha', ...pairForSave(details) });

  it('a current pin is submitted whole', () => {
    expect(booking({ latitude: 19.076, longitude: 72.8777 })).toMatchObject({ latitude: 19.076, longitude: 72.8777 });
  });

  it('a pin cleared by an address edit (null / null) is submitted as null / null', () => {
    expect(booking({ latitude: null, longitude: null })).toMatchObject({ latitude: null, longitude: null });
  });

  it('a half pair, or a profile without a location, never leaves the app as half a pair', () => {
    expect(booking({ latitude: 19.076, longitude: null })).toMatchObject({ latitude: null, longitude: null });
    expect(booking({ latitude: undefined, longitude: 72.8777 })).toMatchObject({ latitude: null, longitude: null });
    expect(booking({})).toMatchObject({ latitude: null, longitude: null });
  });
});
