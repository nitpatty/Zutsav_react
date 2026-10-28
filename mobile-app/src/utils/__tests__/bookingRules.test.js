import fs from 'fs';
import path from 'path';
import { USER_CANCELLABLE_STATUSES, canUserCancel } from '../bookingRules';

describe('canUserCancel (F-23)', () => {
  it.each(['pending_payment', 'paid', 'pandit_assigned', 'pandit_accepted', 'pending_reassignment'])(
    'allows cancelling %s', (status) => expect(canUserCancel(status)).toBe(true),
  );

  it.each(['completion_requested', 'completed', 'cancelled', 'unknown', undefined, null])(
    'does not allow cancelling %p', (status) => expect(canUserCancel(status)).toBe(false),
  );

  it('never includes completion_requested', () => {
    expect(USER_CANCELLABLE_STATUSES).not.toContain('completion_requested');
  });
});

// Drift guard: the mobile list must equal the server's authoritative rule. Reads
// the backend source (read-only) when this repo checkout includes it.
const backendFile = path.resolve(__dirname, '../../../../backend/src/controllers/booking.controller.js');
const describeIfBackend = fs.existsSync(backendFile) ? describe : describe.skip;

describeIfBackend('mobile list matches backend USER_CANCELLABLE_STATUSES', () => {
  it('has exactly the same statuses', () => {
    const src = fs.readFileSync(backendFile, 'utf8');
    const m = src.match(/const USER_CANCELLABLE_STATUSES\s*=\s*\[([^\]]+)\]/);
    expect(m).not.toBeNull();
    const backend = m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
    expect([...USER_CANCELLABLE_STATUSES].sort()).toEqual([...backend].sort());
  });
});
