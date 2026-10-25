import { safeHttpUrl, prepareFooterLinks, validateFooterLinkForm, blockedNameReason, MAX_FILE_SIZE } from './footerLinks';

describe('safeHttpUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['http://example.com/a?b=1#c', 'http://example.com/a?b=1#c'],
    [' HTTPS://Example.COM/Path ', 'https://example.com/Path'],
  ])('accepts %s', (input, expected) => expect(safeHttpUrl(input)).toBe(expected));

  it.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', 'ftp://example.com',
    '//evil.com', '/relative', 'example.com', 'https://', 'https://exa mple.com', 'https://u:p@example.com', '', '   ', null, undefined, 42, {},
    `https://example.com/${'a'.repeat(2100)}`,
  ])('rejects %p', (input) => expect(safeHttpUrl(input)).toBeNull());
});

describe('prepareFooterLinks', () => {
  const id = (c) => c.repeat(16);

  it('keeps safe links in the order given and maps destinations to hrefs', () => {
    const out = prepareFooterLinks([
      { id: id('a'), label: 'Blog', linkType: 'url', url: 'https://blog.example.com' },
      { id: id('b'), label: 'Cookie Policy', linkType: 'document', path: `/legal/link/${id('b')}` },
    ]);
    expect(out).toEqual([
      { id: id('a'), label: 'Blog', linkType: 'url', href: 'https://blog.example.com/' },
      { id: id('b'), label: 'Cookie Policy', linkType: 'document', href: `/legal/link/${id('b')}` },
    ]);
  });

  it('drops unsafe, malformed and repeated entries', () => {
    const out = prepareFooterLinks([
      { id: id('a'), label: 'Evil', linkType: 'url', url: 'javascript:alert(1)' },
      { id: id('b'), label: 'Bad path', linkType: 'document', path: 'https://evil.com/x' },
      { id: id('c'), label: 'Traversal', linkType: 'document', path: '/legal/link/../../admin' },
      { id: id('d'), label: 'Good', linkType: 'url', url: 'https://good.example.com' },
      { id: id('d'), label: 'Good again', linkType: 'url', url: 'https://good.example.com' }, // same id
      { id: id('e'), label: '   ', linkType: 'url', url: 'https://blank.example.com' },
      null, 'str', { label: 'No id', linkType: 'url', url: 'https://x.example.com' },
    ]);
    expect(out.map((l) => l.label)).toEqual(['Good']);
  });

  it('never shows a custom link that duplicates a fixed legal document already in the footer', () => {
    const fixed = [{ label: 'Privacy Policy' }, { label: 'About Us' }];
    const out = prepareFooterLinks([
      { id: id('a'), label: 'privacy  policy', linkType: 'url', url: 'https://other.example.com/privacy' },
      { id: id('b'), label: 'Careers', linkType: 'url', url: 'https://example.com/careers' },
    ], fixed);
    expect(out.map((l) => l.label)).toEqual(['Careers']);
  });

  it('handles empty or missing configuration', () => {
    expect(prepareFooterLinks(undefined)).toEqual([]);
    expect(prepareFooterLinks([])).toEqual([]);
    expect(prepareFooterLinks(null, null)).toEqual([]);
  });
});

describe('validateFooterLinkForm', () => {
  const file = (name, size = 1000) => ({ name, size });

  it('accepts a URL link and a document link', () => {
    expect(validateFooterLinkForm({ label: 'Help', linkType: 'url', url: 'https://help.example.com' })).toEqual({});
    expect(validateFooterLinkForm({ label: 'Terms', linkType: 'document', file: file('t.pdf') })).toEqual({});
  });

  it('requires a name, a type and the relevant destination only', () => {
    expect(validateFooterLinkForm({ label: '  ', linkType: 'url', url: 'https://x.com' }).label).toBeTruthy();
    expect(validateFooterLinkForm({ label: 'x'.repeat(61), linkType: 'url', url: 'https://x.com' }).label).toBeTruthy();
    expect(validateFooterLinkForm({ label: 'A', linkType: '' }).linkType).toBeTruthy();
    expect(validateFooterLinkForm({ label: 'A', linkType: 'url', url: '' }).url).toBeTruthy();
    expect(validateFooterLinkForm({ label: 'A', linkType: 'url', url: 'javascript:alert(1)' }).url).toBeTruthy();
    expect(validateFooterLinkForm({ label: 'A', linkType: 'document' }).file).toBe('Choose a file to upload');
    // A URL link ignores any leftover file; a document link ignores any leftover URL.
    expect(validateFooterLinkForm({ label: 'A', linkType: 'url', url: 'https://x.com', file: file('x.exe') })).toEqual({});
    expect(validateFooterLinkForm({ label: 'A', linkType: 'document', url: 'not a url', file: file('a.pdf') })).toEqual({});
  });

  it('accepts ordinary files of any type, and checks only safety, size and emptiness', () => {
    const check = (f) => validateFooterLinkForm({ label: 'A', linkType: 'document', file: f }).file;
    for (const name of ['report.pdf', 'logo.PNG', 'photo.jpeg', 'prices.xlsx', 'deck.pptx', 'data.csv', 'notes.txt', 'bundle.zip', 'drawing.dwg', 'LICENSE', 'archive.tar.gz']) {
      expect(check(file(name))).toBeUndefined();
    }
    expect(check(file('exactly.bin', MAX_FILE_SIZE))).toBeUndefined();
    expect(check(file('big.pdf', MAX_FILE_SIZE + 1))).toMatch(/10 MB/);
    expect(check(file('empty.txt', 0))).toMatch(/empty/);
    expect(check(file('virus.exe'))).toMatch(/Executable/);
    expect(check(file('page.html'))).toMatch(/Attach URL/);
  });

  it('lets an existing document link keep its file when editing, but requires one when switching to a document', () => {
    const existingDoc = { linkType: 'document' };
    const existingUrl = { linkType: 'url' };
    expect(validateFooterLinkForm({ label: 'A', linkType: 'document' }, existingDoc)).toEqual({});
    expect(validateFooterLinkForm({ label: 'A', linkType: 'document' }, existingUrl).file).toBeTruthy();
  });
});

describe('blockedNameReason (mirrors the server policy)', () => {
  it.each(['setup.exe', 'lib.dll', 'run.bat', 'run.sh', 'app.js', 'shell.php', 'x.jsp', 'x.py', 'macro.docm', 'macro.xlsm', 'x.jar', 'x.msi',
    'UPPER.EXE', 'invoice.php.jpg', 'photo.exe.png', 'a.html.txt', '.htaccess', 'web.config'])('refuses %s', (name) => {
    expect(blockedNameReason(name)).not.toBe('');
  });
  it.each(['report.pdf', 'Photo.JPG', 'Quarterly Report (final).xlsx', 'archive.tar.gz', 'model.dwg', 'LICENSE', 'ünïcode नमस्ते.txt', 'x.svg'])('accepts %s', (name) => {
    expect(blockedNameReason(name)).toBe('');
  });
  it('explains web pages and handles empty / over-long names', () => {
    expect(blockedNameReason('index.html')).toMatch(/Attach URL/);
    expect(blockedNameReason('')).toMatch(/no name/);
    expect(blockedNameReason(`${'x'.repeat(300)}.txt`)).toMatch(/too long/);
    expect(blockedNameReason('C:\\fakepath\\run.exe')).toMatch(/Executable/);
  });
});
