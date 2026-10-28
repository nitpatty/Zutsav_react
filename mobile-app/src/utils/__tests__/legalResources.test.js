import {
  LEGAL_DOCUMENT_TYPES, safeHttpUrl, mapLegalDocuments, prepareFooterLinks, isAllowedFilePath, fileUrl,
  describeFixedDocument, describeFooterFile, formatFileSize, safeDisplayName, isValidLinkId,
} from '../legalResources';

// Synthetic bodies in the exact shapes of the backend (legalDocument.controller.js, footerLinks.controller.js, settings.routes.js).
const doc = (type, over = {}) => ({
  documentType: type, label: `Label ${type}`, exists: true, originalName: `${type}.pdf`, mimeType: 'application/pdf',
  size: 120000, uploadedByName: 'Admin', updatedAt: '2026-03-01T10:00:00.000Z', viewUrl: `/api/documents/${type}/view`, ...over,
});
const ALL_DOCS = LEGAL_DOCUMENT_TYPES.map((t) => doc(t));
const ID_A = 'a1b2c3d4e5f60718';
const ID_B = '0123456789abcdef';

describe('the fixed document whitelist', () => {
  it('matches the five documents the backend serves (and nothing else)', () => {
    expect(LEGAL_DOCUMENT_TYPES).toEqual(['privacy', 'terms', 'refund-policy', 'about-us', 'vision']);
  });
});

describe('safeHttpUrl (same rules as the website and the server)', () => {
  it('accepts absolute http and https URLs and normalises them', () => {
    expect(safeHttpUrl('https://example.com/page')).toBe('https://example.com/page');
    expect(safeHttpUrl('  http://example.com  ')).toBe('http://example.com/');
    expect(safeHttpUrl('https://example.com:8443/a?b=c#d')).toBe('https://example.com:8443/a?b=c#d');
  });

  it.each([
    'javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'ftp://example.com', 'intent://x#Intent;end',
    'tel:+911234567890', 'mailto:a@b.co', 'zutsav://admin', 'content://contacts', 'sms:123', 'vbscript:x',
    '//example.com', 'example.com', 'https://user:pass@example.com', 'https://', 'https://exa mple.com', 'https://example.com/a b',
    'https://example.com/\u0000', '', '   ', null, undefined, 42, {}, 'x'.repeat(2049),
  ])('rejects %p', (bad) => expect(safeHttpUrl(bad)).toBeNull());
});

describe('mapLegalDocuments (GET /api/documents)', () => {
  it('lists only PUBLISHED documents, in the server order, with the server labels', () => {
    const out = mapLegalDocuments({ success: true, documents: [doc('privacy'), doc('terms', { exists: false, viewUrl: '' }), doc('about-us'), doc('vision', { exists: false, viewUrl: '' })] });
    expect(out.map((d) => [d.type, d.label])).toEqual([['privacy', 'Label privacy'], ['about-us', 'Label about-us']]);
  });

  it('maps title → document one-to-one for every supported type', () => {
    const labels = { privacy: 'Privacy Policy', terms: 'Terms & Conditions', 'refund-policy': 'Refund & Cancellation Policy', 'about-us': 'About Us', vision: 'Vision, Mission & Core Values' };
    const out = mapLegalDocuments({ documents: LEGAL_DOCUMENT_TYPES.map((t) => doc(t, { label: labels[t] })) });
    expect(out.map((d) => [d.label, d.type])).toEqual(Object.entries(labels).map(([t, l]) => [l, t]));
  });

  it('carries file facts for display', () => {
    expect(mapLegalDocuments({ documents: [doc('privacy')] })[0]).toMatchObject({ fileName: 'privacy.pdf', mimeType: 'application/pdf', size: 120000, updatedAt: '2026-03-01T10:00:00.000Z' });
  });

  it('ignores unknown types, private-looking paths, view URLs that are not the documented route, duplicates and junk', () => {
    const out = mapLegalDocuments({ documents: [
      doc('privacy'), doc('privacy', { label: 'Dup' }),
      doc('kyc'), doc('govt-id'), doc('terms', { viewUrl: '/api/admin/documents/terms' }),
      doc('refund-policy', { viewUrl: '/uploads/legaldocs/secret.pdf' }), doc('about-us', { viewUrl: 'https://evil.example/x' }),
      doc('vision', { label: '' }), null, 'x', 5, { exists: true },
    ] });
    expect(out.map((d) => d.type)).toEqual(['privacy']);
  });

  it.each([undefined, null, {}, { documents: null }, { documents: 'x' }, { documents: [] }])('returns [] for %p', (b) => expect(mapLegalDocuments(b)).toEqual([]));

  it('sanitises display text', () => {
    const out = mapLegalDocuments({ documents: [doc('privacy', { label: '  Privacy\u0000\n  Policy ', originalName: '../../etc/passwd' })] });
    expect(out[0].label).toBe('Privacy Policy');
    expect(out[0].fileName).toBe('passwd');
  });
});

describe('prepareFooterLinks (GET /api/settings/public → footerLinks)', () => {
  const urlLink = (id, label, url) => ({ id, label, linkType: 'url', url });
  const fileLink = (id, label) => ({ id, label, linkType: 'document', path: `/legal/link/${id}` });

  it('shows valid links with the administrator\'s display name, in the configured order', () => {
    const out = prepareFooterLinks([urlLink(ID_A, 'Careers', 'https://example.com/jobs'), fileLink(ID_B, 'Brochure')]);
    expect(out).toEqual([
      { id: ID_A, label: 'Careers', linkType: 'url', href: 'https://example.com/jobs' },
      { id: ID_B, label: 'Brochure', linkType: 'document' },
    ]);
  });

  it('drops links with an unsafe or malformed URL, and malformed entries, without affecting the rest', () => {
    const out = prepareFooterLinks([
      urlLink(ID_A, 'Bad scheme', 'javascript:alert(1)'), urlLink('b'.repeat(16), 'Creds', 'https://u:p@example.com'),
      urlLink('c'.repeat(16), 'Empty', ''), urlLink('d'.repeat(16), 'Good', 'https://good.example.com'),
      { id: 'short', label: 'Bad id', linkType: 'url', url: 'https://example.com' },
      { id: 'e'.repeat(16), label: '', linkType: 'url', url: 'https://example.com' },
      { id: 'f'.repeat(16), label: 'Unknown type', linkType: 'script', url: 'https://example.com' },
      { id: '1'.repeat(16), label: 'Doc with a foreign path', linkType: 'document', path: '/admin/secret' },
      { id: '2'.repeat(16), label: 'Doc whose path names ANOTHER id', linkType: 'document', path: `/legal/link/${ID_B}` },
      { id: '3'.repeat(16), label: 'Doc without path', linkType: 'document' },
      null, 'x', 7, undefined,
    ]);
    expect(out.map((l) => l.label)).toEqual(['Good']);
  });

  it('removes repeated ids and titles that duplicate a published fixed document', () => {
    const fixed = mapLegalDocuments({ documents: [doc('privacy', { label: 'Privacy Policy' })] });
    const out = prepareFooterLinks([
      urlLink(ID_A, 'privacy   POLICY', 'https://example.com/p'), urlLink(ID_B, 'Press', 'https://example.com/press'), urlLink(ID_B, 'Press again', 'https://example.com/press2'),
    ], fixed);
    expect(out.map((l) => l.label)).toEqual(['Press']);
  });

  it('copes with an empty or missing configuration', () => {
    expect(prepareFooterLinks([])).toEqual([]);
    expect(prepareFooterLinks(undefined)).toEqual([]);
    expect(prepareFooterLinks(null)).toEqual([]);
    expect(prepareFooterLinks('nope')).toEqual([]);
  });

  it('validates ids with the backend\'s format', () => {
    expect(isValidLinkId(ID_A)).toBe(true);
    for (const bad of ['', 'A1B2C3D4E5F60718', 'a1b2c3d4e5f6071', 'a1b2c3d4e5f607189', 'a1b2c3d4e5f6071g', null, undefined, 5]) expect(isValidLinkId(bad)).toBe(false);
  });
});

describe('file route allow-list', () => {
  it('permits only the documented public routes', () => {
    for (const ok of ['/api/documents/privacy/view', '/api/documents/vision/view', `/api/footer-links/${ID_A}/view`, `/api/footer-links/${ID_A}/download`]) {
      expect(isAllowedFilePath(ok)).toBe(true);
      expect(fileUrl(ok)).toBe(`https://api.test.invalid${ok}`);
    }
  });

  it.each([
    '/api/documents/kyc/view', '/api/documents/privacy', '/api/documents/privacy/view/../../x', '/api/admin/documents/privacy', '/api/footer-links',
    '/api/footer-links/short/view', `/api/footer-links/${ID_A}/delete`, `/api/footer-links/${ID_A}/view?token=1`, '/uploads/legaldocs/x.pdf', '/uploads/kycdocs/x.pdf',
    '/api/pandits/me/kyc/file', 'https://evil.example/x.pdf', '//evil.example/x.pdf', '', null, undefined,
  ])('refuses %p', (p) => { expect(isAllowedFilePath(p)).toBe(false); expect(fileUrl(p)).toBeNull(); });
});

describe('describeFixedDocument (GET /api/documents/:type)', () => {
  it('describes a published PDF and its single documented route', () => {
    expect(describeFixedDocument('privacy', { document: doc('privacy') })).toMatchObject({
      title: 'Label privacy', fileName: 'privacy.pdf', isPdf: true, mode: 'external',
      openUrl: 'https://api.test.invalid/api/documents/privacy/view', downloadUrl: 'https://api.test.invalid/api/documents/privacy/view',
    });
  });

  it('treats Word documents as downloads (not PDF)', () => {
    for (const mimeType of ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) {
      expect(describeFixedDocument('terms', { document: doc('terms', { mimeType, originalName: 'terms.docx' }) })).toMatchObject({ isPdf: false, mode: 'external' });
    }
  });

  it('is null for unpublished, unknown or tampered documents', () => {
    expect(describeFixedDocument('terms', { document: { ...doc('terms'), exists: false, viewUrl: '' } })).toBeNull();
    expect(describeFixedDocument('kyc', { document: doc('privacy') })).toBeNull();
    expect(describeFixedDocument('privacy', { document: doc('privacy', { viewUrl: '/uploads/legaldocs/x.pdf' }) })).toBeNull();
    expect(describeFixedDocument('privacy', { document: doc('terms') })).toBeNull();
    expect(describeFixedDocument('privacy', undefined)).toBeNull();
    expect(describeFixedDocument('privacy', {})).toBeNull();
  });
});

describe('describeFooterFile (GET /api/footer-links/:id)', () => {
  const meta = (id, over = {}) => ({
    exists: true, label: 'Brochure', mimeType: 'application/pdf', kind: 'pdf', fileName: 'brochure.pdf', size: 250000,
    updatedAt: '2026-03-01T10:00:00.000Z', viewUrl: `/api/footer-links/${id}/view`, downloadUrl: `/api/footer-links/${id}/download`, ...over,
  });
  const base = 'https://api.test.invalid/api/footer-links';

  it('PDF: opens in the device viewer, with a download option', () => {
    expect(describeFooterFile(ID_A, { document: meta(ID_A) })).toMatchObject({
      mode: 'pdf', title: 'Brochure', fileName: 'brochure.pdf', openUrl: `${base}/${ID_A}/view`, downloadUrl: `${base}/${ID_A}/download`, imageUrl: null,
    });
  });

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])('safe raster image %s is shown in the app', (mimeType) => {
    expect(describeFooterFile(ID_A, { document: meta(ID_A, { kind: 'image', mimeType, fileName: 'a.img' }) })).toMatchObject({ mode: 'image', imageUrl: `${base}/${ID_A}/view`, openUrl: null });
  });

  it.each(['image/svg+xml', 'image/bmp', 'text/html', 'application/octet-stream'])('an "image" of unsafe type %s is never rendered — download only', (mimeType) => {
    const d = describeFooterFile(ID_A, { document: meta(ID_A, { kind: 'image', mimeType }) });
    expect(d.mode).toBe('download');
    expect(d.imageUrl).toBeNull();
  });

  it.each([
    ['Word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx'],
    ['Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx'],
    ['text', 'text/plain', 'a.txt'], ['zip', 'application/zip', 'a.zip'], ['svg', 'image/svg+xml', 'a.svg'],
  ])('%s files are offered as a download only', (_n, mimeType, fileName) => {
    const d = describeFooterFile(ID_A, { document: meta(ID_A, { kind: 'download', mimeType, fileName }) });
    expect(d).toMatchObject({ mode: 'download', imageUrl: null, openUrl: null, downloadUrl: `${base}/${ID_A}/download`, fileName });
  });

  it('is null (unavailable) for deleted/disabled links, bad ids, unknown kinds, oversized files and tampered routes', () => {
    expect(describeFooterFile(ID_A, { document: { exists: false } })).toBeNull();
    expect(describeFooterFile('not-an-id', { document: meta(ID_A) })).toBeNull();
    expect(describeFooterFile(ID_A, { document: meta(ID_A, { kind: 'video' }) })).toBeNull();
    expect(describeFooterFile(ID_A, { document: meta(ID_A, { size: 11 * 1024 * 1024 }) })).toBeNull();
    expect(describeFooterFile(ID_A, { document: meta(ID_A, { viewUrl: '/uploads/legaldocs/x.pdf' }) })).toBeNull();
    expect(describeFooterFile(ID_A, { document: meta(ID_A, { downloadUrl: 'https://evil.example/x' }) })).toBeNull();
    expect(describeFooterFile(ID_A, { document: meta(ID_B) })).toBeNull(); // routes belong to a different link
    expect(describeFooterFile(ID_A, undefined)).toBeNull();
    expect(describeFooterFile(ID_A, {})).toBeNull();
  });
});

describe('small helpers', () => {
  it('formatFileSize', () => {
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize(500)).toBe('1 KB');
    expect(formatFileSize(250000)).toBe('244 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
  it('safeDisplayName strips paths and control characters', () => {
    expect(safeDisplayName('C:\\temp\\evil\\file.pdf')).toBe('file.pdf');
    expect(safeDisplayName('a/b/c.docx')).toBe('c.docx');
    expect(safeDisplayName(undefined)).toBe('');
  });
});
