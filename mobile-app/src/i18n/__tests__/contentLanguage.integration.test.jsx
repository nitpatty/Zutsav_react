import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../api/axios';
import LivestreamsScreen from '../../screens/user/LivestreamsScreen';
import { useLanguageStore } from '../languageStore';
import { useNotificationStore } from '../../store/notificationStore';
import { saveCache, loadCache, clearAllCache } from '../../utils/offlineCache';

jest.mock('../../components/ScreenHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));

const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

describe('offline cache never reuses one language\'s content under another', () => {
  it('English keeps the original key format; other languages get their own', async () => {
    await saveCache('dashboard', { festivals: ['English'] });
    await setLang('hi');
    await saveCache('dashboard', { festivals: ['हिन्दी'] });
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('zutsav_cache_')).sort();
    expect(keys).toEqual(['zutsav_cache_dashboard', 'zutsav_cache_hi:dashboard']);
  });

  it('each language reads back only its own entry', async () => {
    await saveCache('notifications', ['en-1']);
    await setLang('hi');
    expect(await loadCache('notifications')).toBeNull();          // English data is not served as Hindi
    await saveCache('notifications', ['hi-1']);
    expect((await loadCache('notifications')).data).toEqual(['hi-1']);
    await setLang('ta');
    expect(await loadCache('notifications')).toBeNull();
    await setLang('en');
    expect((await loadCache('notifications')).data).toEqual(['en-1']);
    await setLang('hi');
    expect((await loadCache('notifications')).data).toEqual(['hi-1']);
  });

  it('logout/session-expiry cleanup still removes the entries of every language', async () => {
    await saveCache('profile', { a: 1 });
    await setLang('hi');
    await saveCache('profile', { a: 2 });
    await setLang('ta');
    await saveCache('profile', { a: 3 });
    await AsyncStorage.setItem('zutsav_theme', 'dark'); // not ours to clear
    await clearAllCache();
    const left = await AsyncStorage.getAllKeys();
    expect(left.filter((k) => k.startsWith('zutsav_cache_'))).toEqual([]);
    expect(left).toContain('zutsav_theme');
  });
});

describe('notification store follows the language', () => {
  const seed = () => useNotificationStore.setState({ notifications: [{ _id: 'n1', title: 'English title', isRead: false }], unreadCount: 3, loading: false });

  it('drops the previous language\'s list on a switch but keeps the unread count', async () => {
    seed();
    await setLang('hi');
    expect(useNotificationStore.getState().notifications).toEqual([]);
    expect(useNotificationStore.getState().unreadCount).toBe(3);
  });

  it('a request still in flight for the old language cannot repopulate the list afterwards', async () => {
    let release;
    api.defaults.adapter = (config) => new Promise((resolve) => {
      release = () => resolve({ data: { notifications: [{ _id: 'n1', title: 'late English' }] }, status: 200, statusText: 'OK', headers: {}, config });
    });
    const pending = useNotificationStore.getState().fetch();
    await new Promise((r) => setTimeout(r, 0));
    await setLang('hi');
    release();
    await pending;
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it('the next fetch asks for the new language', async () => {
    const seen = [];
    api.defaults.adapter = async (config) => {
      seen.push({ url: config.url, params: config.params });
      return { data: { notifications: [{ _id: 'n2', title: 'हिन्दी शीर्षक' }] }, status: 200, statusText: 'OK', headers: {}, config };
    };
    await setLang('hi');
    await useNotificationStore.getState().fetch();
    expect(seen[0]).toEqual({ url: '/notifications?limit=50', params: { lang: 'hi' } });
    expect(useNotificationStore.getState().notifications[0].title).toBe('हिन्दी शीर्षक');
  });

  it('an unchanged language leaves the list alone (a repeated set is not a change)', async () => {
    await setLang('hi');
    seed();
    await setLang('hi');
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});

describe('a content screen refetches in the new language through the real API client', () => {
  it('LivestreamsScreen: first load has no lang, the switch triggers a second GET with lang=hi and shows the translated item', async () => {
    const seen = [];
    api.defaults.adapter = async (config) => {
      seen.push({ url: config.url, params: config.params });
      const hindi = config.params && config.params.lang === 'hi';
      const title = hindi ? 'संध्या आरती' : 'Evening Aarti';
      return {
        data: { livestreams: [{ _id: 's1', title, isActive: true, youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] },
        status: 200, statusText: 'OK', headers: {}, config,
      };
    };
    render(<LivestreamsScreen />);
    expect(await screen.findByText('Evening Aarti')).toBeTruthy();
    expect(seen).toEqual([{ url: '/livestreams', params: undefined }]);

    await setLang('hi');
    expect(await screen.findByText('संध्या आरती')).toBeTruthy();
    expect(screen.queryByText('Evening Aarti')).toBeNull();      // no stale English left on screen
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ url: '/livestreams', params: { lang: 'hi' } });

    await setLang('en');
    expect(await screen.findByText('Evening Aarti')).toBeTruthy();
    expect(seen).toHaveLength(3);
    expect(seen[2].params).toBeUndefined();
  });

  it('switching language makes only GET requests (no payment, booking or other writes are re-triggered)', async () => {
    const methods = [];
    api.defaults.adapter = async (config) => {
      methods.push(config.method);
      return { data: { livestreams: [] }, status: 200, statusText: 'OK', headers: {}, config };
    };
    render(<LivestreamsScreen />);
    await waitFor(() => expect(methods).toHaveLength(1));
    await setLang('hi');
    await waitFor(() => expect(methods).toHaveLength(2));
    expect([...new Set(methods)]).toEqual(['get']);
  });
});

// Guard: every screen that reads a server-translated endpoint either refetches when the language changes or is on
// the explicit list of screens still to do — so a new content screen cannot silently stay in the old language.
describe('content screens and language refetch (coverage guard)', () => {
  const screensRoot = path.join(__dirname, '..', '..', 'screens');
  const TRANSLATED = /api\.get\(\s*[`'"]\/(poojas|festivals|livestreams|notifications|temples|marketplace\/(products|kits)|blogs)\b/;

  // Not yet refetching on a language change (documented gap): detail screens that normally receive the item through
  // navigation params, and screens that call translated endpoints as a secondary lookup. (Day 19: TempleDetail and
  // Panchang now refetch, Day 20: ProductDetail, Day 21: BookingFlow; FestivalDetail has no endpoint at all, so it is not a reader of one.)
  const PENDING = new Set([
    'pandit/PanditReferralScreen.jsx',  // /poojas picker for referral creation
    'pandit/PanditBlogEditorScreen.jsx',
    'pandit/PanditMyBlogsScreen.jsx',
  ]);

  const files = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); } else if (/Screen\.jsx$/.test(e.name)) files.push(p);
    });
  }(screensRoot));

  const readers = files
    .map((f) => ({ rel: path.relative(screensRoot, f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8') }))
    .filter(({ text }) => TRANSLATED.test(text) && !/screens[\\/]admin/.test(text));

  it('finds the content screens (guards against the scan matching nothing)', () => {
    expect(readers.length).toBeGreaterThan(8);
  });

  it('every other content screen depends on the UI language', () => {
    const missing = readers.filter(({ rel, text }) => !rel.startsWith('admin/') && !PENDING.has(rel) && !/contentLanguage/.test(text)).map(({ rel }) => rel);
    expect(missing).toEqual([]);
  });

  it('the pending list only names screens that really exist and really lack the dependency', () => {
    PENDING.forEach((rel) => {
      const hit = readers.find((r) => r.rel === rel);
      expect([rel, !!hit]).toEqual([rel, true]);
      expect([rel, /contentLanguage/.test(hit.text)]).toEqual([rel, false]);
    });
  });

  // Verified behaviour of the detail/secondary screens (Day 19), so the list above cannot drift from the code.
  it('TempleDetail, Panchang, ProductDetail and BookingFlow refetch on a language change (they are not in the pending list)', () => {
    ['user/TempleDetailScreen.jsx', 'user/PanchangScreen.jsx', 'user/ProductDetailScreen.jsx', 'user/BookingFlowScreen.jsx'].forEach((rel) => {
      expect(PENDING.has(rel)).toBe(false);
      const hit = readers.find((r) => r.rel === rel);
      expect([rel, !!hit && /contentLanguage/.test(hit.text)]).toEqual([rel, true]);
    });
  });

  it('FestivalDetail is parameter-driven: it makes no request at all, so there is nothing to refetch (documented gap)', () => {
    const text = fs.readFileSync(path.join(screensRoot, 'user', 'FestivalDetailScreen.jsx'), 'utf8');
    expect(/\bapi\.(get|post|put|delete)\b/.test(text)).toBe(false);
    expect(readers.some((r) => r.rel === 'user/FestivalDetailScreen.jsx')).toBe(false);
  });
});
