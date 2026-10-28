import { createBookingSubmitGuard } from '../bookingSubmitGuard';

const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const CREATED = { bookingId: 'bk1', merchantTransactionId: 'ZUT_1700000000000_abc123', redirectUrl: 'https://pay.example.invalid/x', chargeAmount: 500 };
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { message: 'rejected' } } });
const noResponse = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

describe('rapid taps', () => {
  it('ten taps before the response issue exactly ONE request', async () => {
    const guard = createBookingSubmitGuard();
    const first = deferred();
    const create = jest.fn(() => first.promise);

    const taps = Array.from({ length: 10 }, () => guard.submit(create));
    expect(create).toHaveBeenCalledTimes(1);
    expect(guard.isBusy()).toBe(true);

    first.resolve({ created: CREATED });
    const results = await Promise.all(taps);
    expect(results.filter((r) => r.status === 'done')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'busy')).toHaveLength(9);
    expect(create).toHaveBeenCalledTimes(1);
    expect(guard.isBusy()).toBe(false);
  });
});

describe('after the booking exists', () => {
  it('dismissing the payment prompt and tapping again re-presents the SAME booking — never a second request', async () => {
    const guard = createBookingSubmitGuard();
    const create = jest.fn().mockResolvedValue({ created: CREATED });
    await guard.submit(create);

    const again = await guard.submit(create);
    const andAgain = await guard.submit(create);
    expect(create).toHaveBeenCalledTimes(1);
    expect(again).toEqual({ status: 'existing', created: CREATED });
    expect(andAgain.created).toBe(CREATED);
    expect(guard.hasCreated()).toBe(true);
  });

  it('a response without a booking (nothing was created) leaves the guard open', async () => {
    const guard = createBookingSubmitGuard();
    const create = jest.fn().mockResolvedValue({ created: null });
    await guard.submit(create);
    await guard.submit(create);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('failures', () => {
  it('a server rejection (any HTTP status) frees the guard: the user can fix the form and try again', async () => {
    const guard = createBookingSubmitGuard();
    const create = jest.fn().mockRejectedValueOnce(httpError(400)).mockResolvedValueOnce({ created: CREATED });

    const rejected = await guard.submit(create);
    expect(rejected).toMatchObject({ status: 'failed', uncertain: false });
    expect(guard.isBusy()).toBe(false);

    expect((await guard.submit(create)).status).toBe('done');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('NO response (timeout / offline) is an unknown outcome: the booking may exist, so another request is NOT sent', async () => {
    const guard = createBookingSubmitGuard();
    const create = jest.fn().mockRejectedValue(noResponse());

    expect(await guard.submit(create)).toMatchObject({ status: 'failed', uncertain: true });
    expect(await guard.submit(create)).toEqual({ status: 'uncertain' });
    expect(await guard.submit(create)).toEqual({ status: 'uncertain' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('only an explicit acknowledgement re-opens submission after an unknown outcome', async () => {
    const guard = createBookingSubmitGuard();
    const create = jest.fn().mockRejectedValueOnce(noResponse()).mockResolvedValueOnce({ created: CREATED });
    await guard.submit(create);
    guard.acknowledgeUncertain();
    expect((await guard.submit(create)).status).toBe('done');
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('scope', () => {
  it('each guard (screen instance) is independent: a new booking screen is never blocked by an old one', async () => {
    const old = createBookingSubmitGuard();
    await old.submit(jest.fn().mockResolvedValue({ created: CREATED }));
    const fresh = createBookingSubmitGuard();
    const create = jest.fn().mockResolvedValue({ created: { ...CREATED, bookingId: 'bk2' } });
    expect((await fresh.submit(create)).status).toBe('done');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
