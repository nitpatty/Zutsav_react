import { mapTemple, mapTemples } from '../temple';

// Synthetic temple shaped like backend/src/models/Temple.js (lean document).
const temple = (over = {}) => ({
  _id: 't1', name: 'Sri Test Temple', address: '12 Temple Road', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001',
  description: 'An ancient temple.', category: 'Shaiva', primaryDeity: 'Shiva', openingHours: '5:00 AM – 9:00 PM',
  coverImage: 'uploads/temples/cover.jpg', images: ['uploads/temples/a.jpg', 'uploads/temples/b.jpg'],
  isActive: true, ...over,
});

describe('mapTemple (F-13)', () => {
  it('maps the real field names', () => {
    expect(mapTemple(temple())).toMatchObject({
      id: 't1', name: 'Sri Test Temple', location: 'Madurai, Tamil Nadu',
      fullAddress: '12 Temple Road, Madurai, Tamil Nadu, 625001',
      primaryDeity: 'Shiva', openingHours: '5:00 AM – 9:00 PM', category: 'Shaiva', description: 'An ancient temple.',
    });
  });

  it('builds the gallery as coverImage first, then images, without duplicates', () => {
    expect(mapTemple(temple()).images).toEqual(['uploads/temples/cover.jpg', 'uploads/temples/a.jpg', 'uploads/temples/b.jpg']);
    expect(mapTemple(temple({ images: ['uploads/temples/cover.jpg', 'uploads/temples/a.jpg'] })).images)
      .toEqual(['uploads/temples/cover.jpg', 'uploads/temples/a.jpg']);
  });

  it('does not read or fabricate fields the model does not have', () => {
    const out = mapTemple(temple({ deity: 'WRONG', street: 'WRONG', timings: 'WRONG', phone: '9999999999', website: 'https://x.invalid' }));
    expect(JSON.stringify(out)).not.toMatch(/WRONG|9999999999|x\.invalid/);
    expect(out).not.toHaveProperty('phone');
    expect(out).not.toHaveProperty('website');
  });

  it('handles missing optional data', () => {
    const out = mapTemple({ _id: 't2', name: 'Bare', address: '', city: 'Pune', state: '' });
    expect(out).toMatchObject({ location: 'Pune', fullAddress: 'Pune', primaryDeity: '', openingHours: '', category: '', description: '', images: [] });
  });

  it('ignores blank / non-string images and tolerates null input', () => {
    expect(mapTemple(temple({ coverImage: '', images: ['', null, 42, 'uploads/x.jpg'] })).images).toEqual(['uploads/x.jpg']);
    expect(mapTemple(null)).toMatchObject({ name: '', images: [], fullAddress: '' });
  });
});

describe('mapTemples', () => {
  it('maps the `temples` list, keeps the raw document for navigation, and skips malformed rows', () => {
    const raw = temple();
    const out = mapTemples({ success: true, temples: [raw, null, { name: 'no id' }] });
    expect(out).toHaveLength(1);
    expect(out[0].raw).toBe(raw);
  });

  it.each([undefined, {}, { temples: null }])('returns [] for %p', (b) => expect(mapTemples(b)).toEqual([]));
});
