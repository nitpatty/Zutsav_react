import { currentInvoiceIndex, invoiceKey, resolveSelectedIndex } from '../invoiceSelection';
import { invoice, finalInvoice } from './invoiceFixtures';

// Day 30: which of a booking's official invoices is the "current" one. The rule uses only persisted fields: ACTIVE status, then the
// latest `invoiceDate` (the time of that payment). Fixtures shaped like GET /api/invoices/booking/:id (oldest first).

const advance = (over) => invoice(over);                                  // INV-…101, 2 Mar, PARTIAL, balance 1492
const fin = (over) => finalInvoice(over);                                 // INV-…102, 5 Mar, REMAINING, balance 0
const at = (n, over = {}) => invoice({ _id: `inv-${n}`, invoiceNumber: `INV-2026-0003${n}`, ...over });

describe('currentInvoiceIndex', () => {
  it('no invoices → -1; one invoice → it', () => {
    expect(currentInvoiceIndex([])).toBe(-1);
    expect(currentInvoiceIndex(undefined)).toBe(-1);
    expect(currentInvoiceIndex(null)).toBe(-1);
    expect(currentInvoiceIndex([advance()])).toBe(0);
  });

  it('advance + final payment (the API\'s oldest-first order) → the final-payment invoice, not index 0', () => {
    expect(currentInvoiceIndex([advance(), fin()])).toBe(1);
  });

  it('does not depend on array order: the same answer for either order', () => {
    const list = [fin(), advance()];
    expect(list[currentInvoiceIndex(list)].invoiceNumber).toBe('INV-2026-000102');
  });

  it('is decided by the persisted invoice date, NOT the invoice number string (a "smaller" number can be the newer invoice)', () => {
    const olderButBiggerNumber = at('90', { invoiceDate: '2026-03-01T00:00:00.000Z' });
    const newerButSmallerNumber = at('10', { invoiceDate: '2026-03-09T00:00:00.000Z' });
    const list = [olderButBiggerNumber, newerButSmallerNumber];
    expect(list[currentInvoiceIndex(list)].invoiceNumber).toBe('INV-2026-000310');
    const reversed = [...list].reverse();
    expect(reversed[currentInvoiceIndex(reversed)].invoiceNumber).toBe('INV-2026-000310');
  });

  it('three payments (advance, instalment, final) → the last one', () => {
    const list = [advance(), at('2', { invoiceDate: '2026-03-03T10:00:00.000Z', paymentType: 'REMAINING' }), fin()];
    expect(currentInvoiceIndex(list)).toBe(2);
  });

  it('a cancelled or archived newest invoice is not "current" while an active one exists', () => {
    expect(currentInvoiceIndex([advance(), fin({ status: 'cancelled' })])).toBe(0);
    expect(currentInvoiceIndex([advance(), fin({ status: 'archived' })])).toBe(0);
    expect(currentInvoiceIndex([advance({ status: 'cancelled' }), fin()])).toBe(1);
  });

  it('when NO invoice is active (e.g. a cancelled booking) the latest one is still returned so the document stays reachable', () => {
    const list = [advance({ status: 'cancelled' }), fin({ status: 'cancelled' })];
    expect(currentInvoiceIndex(list)).toBe(1);
  });

  it('a missing status counts as active (older documents)', () => {
    const a = advance(); delete a.status;
    expect(currentInvoiceIndex([a, fin({ status: 'cancelled' })])).toBe(0);
  });

  it('equal dates → the later entry in the API\'s order; an unreadable date never beats a readable one', () => {
    const same = '2026-03-02T09:15:00.000Z';
    expect(currentInvoiceIndex([at('1', { invoiceDate: same }), at('2', { invoiceDate: same })])).toBe(1);
    expect(currentInvoiceIndex([advance(), at('3', { invoiceDate: 'not-a-date' })])).toBe(0);
    expect(currentInvoiceIndex([advance(), at('4', { invoiceDate: undefined })])).toBe(0);
    expect(currentInvoiceIndex([at('5', { invoiceDate: null }), at('6', { invoiceDate: undefined })])).toBe(1);   // nothing readable → API order
  });

  it('never mutates or reorders what it is given', () => {
    const list = Object.freeze([Object.freeze(advance()), Object.freeze(fin())]);
    const snapshot = JSON.stringify(list);
    currentInvoiceIndex(list);
    resolveSelectedIndex(list, 'inv-a');
    expect(JSON.stringify(list)).toBe(snapshot);
  });
});

describe('resolveSelectedIndex', () => {
  const list = [advance(), fin()];

  it('no explicit pick → the current invoice', () => {
    expect(resolveSelectedIndex(list, null)).toBe(1);
    expect(resolveSelectedIndex(list, undefined)).toBe(1);
  });

  it('an explicit pick wins — including the older invoice — and is tracked by id, so a reordered list keeps pointing at the same invoice', () => {
    expect(resolveSelectedIndex(list, 'inv-a')).toBe(0);
    expect(resolveSelectedIndex([...list].reverse(), 'inv-a')).toBe(1);
    expect(resolveSelectedIndex([...list].reverse(), 'inv-b')).toBe(0);
  });

  it('a pick that is not in the list any more falls back to the current invoice (never to another booking\'s)', () => {
    expect(resolveSelectedIndex(list, 'inv-from-another-booking')).toBe(1);
  });

  it('empty list → -1', () => {
    expect(resolveSelectedIndex([], 'inv-a')).toBe(-1);
  });

  it('the key is the same identifier summariseInvoice uses: _id, else the invoice number', () => {
    expect(invoiceKey(advance())).toBe('inv-a');
    expect(invoiceKey({ invoiceNumber: 'INV-X' })).toBe('INV-X');
    expect(invoiceKey(null)).toBeNull();
  });
});
