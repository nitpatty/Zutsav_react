import { mapRatingHistory } from '../panditRatings';

// Synthetic body shaped like GET /api/pandits/me/ratings (pandit.controller getRatingHistory).
const body = {
  success: true,
  ratings: [
    { _id: 'b1', bookingNumber: 'ZB-1001', poojaId: { _id: 'p1', name: 'Griha Pravesh' }, scheduledDate: '2026-03-01T00:00:00.000Z', rating: 5, review: '  Wonderful ceremony  ', ratingDate: '2026-03-02T10:00:00.000Z', completedAt: '2026-03-01T12:00:00.000Z' },
    { _id: 'b2', bookingNumber: 'ZB-1002', poojaId: { name: 'Satyanarayan Katha' }, rating: 4, review: '', completedAt: '2026-03-05T12:00:00.000Z' },
  ],
  averageRating: 4.5,
  totalReviews: 2,
};

describe('mapRatingHistory (F-11)', () => {
  it('maps review, ratingDate and totalReviews from the real response', () => {
    const out = mapRatingHistory(body);
    expect(out.totalReviews).toBe(2);
    expect(out.averageRating).toBe(4.5);
    expect(out.reviews[0]).toEqual({
      id: 'b1', rating: 5, review: 'Wonderful ceremony', date: '2026-03-02T10:00:00.000Z', poojaName: 'Griha Pravesh',
    });
  });

  it('falls back to completedAt when ratingDate is absent, and keeps empty reviews empty', () => {
    expect(mapRatingHistory(body).reviews[1]).toMatchObject({ review: '', date: '2026-03-05T12:00:00.000Z', rating: 4 });
  });

  it('does not expose or invent a customer identity', () => {
    const out = mapRatingHistory({ ...body, ratings: [{ ...body.ratings[0], userId: { name: 'Should Not Appear' } }] });
    expect(JSON.stringify(out)).not.toContain('Should Not Appear');
    expect(out.reviews[0]).not.toHaveProperty('userName');
  });

  it('handles an empty collection', () => {
    expect(mapRatingHistory({ success: true, ratings: [], averageRating: 0, totalReviews: 0 }))
      .toEqual({ reviews: [], averageRating: 0, totalReviews: 0 });
  });

  it.each([undefined, null, {}, { ratings: null }, { ratings: 'oops' }])('does not crash on %p', (input) => {
    expect(mapRatingHistory(input)).toEqual({ reviews: [], averageRating: 0, totalReviews: 0 });
  });

  it('skips malformed rows, tolerates missing/null fields and clamps ratings', () => {
    const out = mapRatingHistory({ ratings: [null, 'x', { _id: 'z', rating: 9, review: null, poojaId: null }, { rating: 'abc' }], totalReviews: null, averageRating: null });
    expect(out.reviews).toHaveLength(2);
    expect(out.reviews[0]).toMatchObject({ id: 'z', rating: 5, review: '', date: null, poojaName: '' });
    expect(out.reviews[1].rating).toBe(0);
    expect(out.totalReviews).toBe(2); // falls back to the number of rows
    expect(out.averageRating).toBe(0);
  });

  it('tolerates a {data:{…}} wrapper', () => {
    expect(mapRatingHistory({ data: body }).totalReviews).toBe(2);
  });
});
