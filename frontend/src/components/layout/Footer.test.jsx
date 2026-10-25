import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import Footer from './Footer';
import API from '../../api/axios';
import { useSettings } from '../../context/SettingsContext';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d) => d || k }) }));
jest.mock('../../api/axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../context/SettingsContext', () => ({ useSettings: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const id = (c) => c.repeat(16);
const BASE = { platformName: 'Zutsav', logoUrl: null, contactEmail: 'hi@example.com', supportPhone: '+91 99999 00000', supportAddress: 'New Delhi' };
const LEGAL = [
  { documentType: 'privacy', label: 'Privacy Policy', exists: true },
  { documentType: 'terms', label: 'Terms & Conditions', exists: true },
  { documentType: 'vision', label: 'Vision, Mission & Core Values', exists: false },
];

let container; let root;
async function renderFooter(footerLinks, legal = LEGAL) {
  useSettings.mockReturnValue({ ...BASE, footerLinks });
  API.get.mockResolvedValue({ data: { documents: legal } });
  await act(async () => { root.render(<MemoryRouter><Footer /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
}
const anchors = () => [...container.querySelectorAll('a')];
const byText = (t) => anchors().find((a) => a.textContent.trim() === t);

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('Footer custom links', () => {
  it('renders an enabled URL link with its label, safe target and rel', async () => {
    await renderFooter([{ id: id('a'), label: 'Help Centre', linkType: 'url', url: 'https://help.example.com/start' }]);
    const a = byText('Help Centre');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('https://help.example.com/start');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders a document link through the in-app viewer route (no raw file URL)', async () => {
    await renderFooter([{ id: id('b'), label: 'Cookie Policy', linkType: 'document', path: `/legal/link/${id('b')}` }]);
    const a = byText('Cookie Policy');
    expect(a.getAttribute('href')).toBe(`/legal/link/${id('b')}`);
    expect(a.getAttribute('target')).toBeNull(); // same-tab navigation inside the app
    expect(container.innerHTML).not.toContain('/api/footer-links');
    expect(container.innerHTML).not.toContain('uploads/');
  });

  it('keeps the configured order and puts custom links after the fixed legal documents in the Company column', async () => {
    await renderFooter([
      { id: id('a'), label: 'Zeta', linkType: 'url', url: 'https://z.example.com' },
      { id: id('b'), label: 'Alpha', linkType: 'url', url: 'https://a.example.com' },
    ]);
    const labels = anchors().map((a) => a.textContent.trim());
    const company = labels.slice(labels.indexOf('Home'));
    expect(company.slice(0, 7)).toEqual(['Home', 'Browse Poojas', 'Register as Pandit', 'Privacy Policy', 'Terms & Conditions', 'Zeta', 'Alpha']);
  });

  it('never renders unsafe, repeated or fixed-name-duplicate entries', async () => {
    await renderFooter([
      { id: id('a'), label: 'Evil', linkType: 'url', url: 'javascript:alert(1)' },
      { id: id('b'), label: 'Data', linkType: 'url', url: 'data:text/html,hi' },
      { id: id('c'), label: 'Privacy Policy', linkType: 'url', url: 'https://other.example.com/privacy' },
      { id: id('d'), label: 'Legit', linkType: 'url', url: 'https://legit.example.com' },
      { id: id('d'), label: 'Legit', linkType: 'url', url: 'https://legit.example.com' },
    ]);
    const labels = anchors().map((a) => a.textContent.trim());
    expect(labels).not.toContain('Evil');
    expect(labels).not.toContain('Data');
    expect(labels.filter((l) => l === 'Privacy Policy')).toHaveLength(1);
    expect(labels.filter((l) => l === 'Legit')).toHaveLength(1);
    expect(container.innerHTML).not.toContain('javascript:');
    expect(byText('Privacy Policy').getAttribute('href')).toBe('/legal/privacy'); // the fixed document keeps its route
  });

  it('renders cleanly with no custom links, undefined config, or no legal documents', async () => {
    for (const links of [[], undefined, null]) {
      act(() => root.unmount());
      root = createRoot(container);
      await renderFooter(links);
      expect(container.querySelector('footer')).toBeTruthy();
      expect(container.textContent).toContain('Services');
      expect(container.textContent).toContain('Contact');
    }
    act(() => root.unmount());
    root = createRoot(container);
    await renderFooter([], []);
    expect(container.textContent).toContain('Browse Poojas');
  });

  it('preserves the existing footer structure: columns, contact details, bottom bar and responsive grid', async () => {
    await renderFooter([{ id: id('a'), label: 'Blog', linkType: 'url', url: 'https://blog.example.com' }]);
    const text = container.textContent;
    for (const expected of ['Book a Pooja', 'Festival Calendar', 'Spiritual Marketplace', 'Company', 'Contact', 'hi@example.com', '+91 99999 00000', 'New Delhi', 'Made with 🙏 in India.']) {
      expect(text).toContain(expected);
    }
    expect(container.querySelector('.grid').className).toContain('grid-cols-1 md:grid-cols-2 lg:grid-cols-4');
    expect(byText('Privacy Policy').getAttribute('href')).toBe('/legal/privacy');
    expect(byText('Terms & Conditions').getAttribute('href')).toBe('/legal/terms');
  });

  it('does not make extra network requests for custom links', async () => {
    await renderFooter([{ id: id('a'), label: 'Blog', linkType: 'url', url: 'https://blog.example.com' }]);
    expect(API.get).toHaveBeenCalledTimes(1);
    expect(API.get).toHaveBeenCalledWith('/documents');
  });
});
