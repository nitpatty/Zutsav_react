import { safeYouTubeUrl, mapLivestream, mapLivestreams } from '../livestream';

// Synthetic body shaped like GET /api/livestreams (livestream.controller getLivestreams).
const stream = (over = {}) => ({
  _id: 's1', title: 'Evening Aarti', description: 'Live from the sanctum',
  youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isActive: true,
  templeId: { _id: 't1', name: 'Kashi Vishwanath', city: 'Varanasi', state: 'Uttar Pradesh' },
  ...over,
});

describe('safeYouTubeUrl (F-12)', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abc123', 'https://www.youtube.com/watch?v=abc123'],
    ['https://youtu.be/abc123', 'https://youtu.be/abc123'],
    ['https://m.youtube.com/live/abc123', 'https://m.youtube.com/live/abc123'],
    ['  https://youtube.com/embed/abc123  ', 'https://youtube.com/embed/abc123'],
    ['http://www.youtube.com/watch?v=abc123', 'https://www.youtube.com/watch?v=abc123'], // upgraded to https
  ])('accepts %s', (input, expected) => expect(safeYouTubeUrl(input)).toBe(expected));

  it.each([
    undefined, null, '', '   ', 'not a url', 'youtube.com/watch?v=1',
    'javascript:alert(1)', 'intent://scan/#Intent;scheme=zxing;end', 'file:///etc/passwd', 'ftp://youtube.com/x',
    'https://evil.example/watch?v=abc', 'https://youtube.com.evil.example/watch?v=abc',
    'https://www.youtube.com', 'https://www.youtube.com/',
  ])('rejects %p', (input) => expect(safeYouTubeUrl(input)).toBeNull());
});

describe('mapLivestream / mapLivestreams', () => {
  it('maps youtubeUrl and the populated temple', () => {
    expect(mapLivestream(stream())).toEqual({
      id: 's1', title: 'Evening Aarti', description: 'Live from the sanctum',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      templeName: 'Kashi Vishwanath', templeLocation: 'Varanasi, Uttar Pradesh',
    });
  });

  it('reads the `livestreams` key and keeps only active, well-formed streams', () => {
    const out = mapLivestreams({ success: true, livestreams: [stream(), stream({ _id: 's2', isActive: false }), null, { title: 'no id' }] });
    expect(out.map((s) => s.id)).toEqual(['s1']);
  });

  it('keeps a stream with an invalid URL but marks it unplayable (url null)', () => {
    const out = mapLivestreams({ livestreams: [stream({ youtubeUrl: 'javascript:alert(1)' })] });
    expect(out).toHaveLength(1);
    expect(out[0].url).toBeNull();
  });

  it('copes with a temple that is an unpopulated id, missing, or partial', () => {
    expect(mapLivestream(stream({ templeId: '507f1f77bcf86cd799439011' }))).toMatchObject({ templeName: '', templeLocation: '' });
    expect(mapLivestream(stream({ templeId: undefined }))).toMatchObject({ templeName: '' });
    expect(mapLivestream(stream({ templeId: { name: 'Only Name' } }))).toMatchObject({ templeName: 'Only Name', templeLocation: '' });
  });

  it.each([undefined, null, {}, { livestreams: null }])('returns [] for %p', (b) => expect(mapLivestreams(b)).toEqual([]));
});
