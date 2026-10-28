import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import TemplesScreen from '../TemplesScreen';
import TempleDetailScreen from '../TempleDetailScreen';
import FestivalsScreen from '../FestivalsScreen';
import FestivalDetailScreen from '../FestivalDetailScreen';
import LivestreamsScreen from '../LivestreamsScreen';
import PanchangScreen from '../PanchangScreen';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';

// F-08 Phase 3: temples, festivals, livestreams, Panchang. UI-owned wording is translated; backend content (temple,
// festival and livestream text) arrives translated through ?lang= and is shown exactly as received; Panchang provider
// values are never translated. The real API client is used (only its transport is replaced).

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ title }) => <Text>{`HEADER:${title}`}</Text> };
});
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

const hi = getTranslator('hi');
const en = getTranslator('en');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });

let calls;
const reply = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
const respond = (handler) => {
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params });
    return reply(config, await handler(config));
  };
};
const fail = (config) => { throw Object.assign(new Error('Request failed'), { config, response: { status: 500, data: {}, config } }); };
const langOf = (config) => (config.params && config.params.lang) || 'en';

beforeEach(() => { calls = []; mockNavigate.mockClear(); Toast.show.mockClear(); });

// ── Temples ──────────────────────────────────────────────────────────────────
const templeDoc = (lang) => ({
  _id: 't1', name: { en: 'Sri Test Temple', hi: 'श्री परीक्षण मंदिर', ta: 'ஸ்ரீ சோதனை கோயில்' }[lang], address: '12 Temple Road', city: 'Madurai',
  state: 'Tamil Nadu', pincode: '625001', description: { en: 'An ancient temple.', hi: 'एक प्राचीन मंदिर।', ta: 'ஒரு பழமையான கோயில்.' }[lang],
  category: 'Shaiva', primaryDeity: 'Shiva', openingHours: '5 AM – 9 PM', images: [], latitude: 9.9, longitude: 78.1,
});

describe('TemplesScreen localization', () => {
  it('English stays as before; Hindi translates the UI wording and shows server-localized names unchanged', async () => {
    respond((c) => ({ temples: [templeDoc(langOf(c))] }));
    const first = render(<TemplesScreen />);
    expect(await screen.findByText('Sri Test Temple')).toBeTruthy();
    expect(screen.getByText('HEADER:Temples')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search temples…')).toBeTruthy();
    expect(calls[0]).toEqual({ method: 'get', url: '/temples', params: { limit: 50 } });
    first.unmount();

    await setLang('hi');
    calls = [];
    render(<TemplesScreen />);
    expect(await screen.findByText('श्री परीक्षण मंदिर')).toBeTruthy();
    expect(screen.getByText('HEADER:मंदिर')).toBeTruthy();
    expect(screen.getByPlaceholderText('मंदिर खोजें…')).toBeTruthy();
    expect(calls[0].params).toEqual({ limit: 50, lang: 'hi' });
  });

  it('switching language refetches the list; the previous language never stays on screen', async () => {
    respond((c) => ({ temples: [templeDoc(langOf(c))] }));
    render(<TemplesScreen />);
    expect(await screen.findByText('Sri Test Temple')).toBeTruthy();
    await setLang('hi');
    expect(await screen.findByText('श्री परीक्षण मंदिर')).toBeTruthy();
    expect(screen.queryByText('Sri Test Temple')).toBeNull();
    await setLang('en');
    expect(await screen.findByText('Sri Test Temple')).toBeTruthy();
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.params.lang)).toEqual([undefined, 'hi', undefined]);
  });

  it('empty and error states are translated; opening a temple passes the same id and document', async () => {
    await setLang('hi');
    respond(() => ({ temples: [] }));
    const empty = render(<TemplesScreen />);
    expect(await screen.findByText('कोई मंदिर नहीं मिला')).toBeTruthy();
    empty.unmount();

    respond(fail);
    const failed = render(<TemplesScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: 'मंदिर लोड नहीं हो सके' }));
    failed.unmount();

    respond((c) => ({ temples: [templeDoc(langOf(c))] }));
    render(<TemplesScreen />);
    fireEvent.press(await screen.findByText('श्री परीक्षण मंदिर'));
    expect(mockNavigate).toHaveBeenCalledWith('TempleDetail', { templeId: 't1', temple: expect.objectContaining({ _id: 't1', latitude: 9.9, longitude: 78.1 }) });
  });
});

describe('TempleDetailScreen localization and language refetch', () => {
  const route = (params) => ({ params: { templeId: 't1', ...params } });

  it('Hindi labels; the temple text received from the server is shown as is; coordinates are not displayed', async () => {
    await setLang('hi');
    render(<TempleDetailScreen route={route({ temple: templeDoc('hi') })} />);
    expect(screen.getByText('श्री परीक्षण मंदिर')).toBeTruthy();
    ['temples.gallery', 'temples.about', 'temples.information', 'temples.address', 'temples.openingHours', 'temples.primaryDeity', 'temples.category']
      .forEach((k) => { expect(hi(k)).not.toBe(en(k)); expect(screen.getByText(hi(k))).toBeTruthy(); });
    expect(screen.getByText(hi('gallery.empty'))).toBeTruthy();
    expect(screen.queryByText(/9\.9|78\.1/)).toBeNull();
    expect(calls).toHaveLength(0);                       // opened in hi with the item in hand: no request
  });

  it('English with the item in hand makes no request on mount (unchanged), then one GET in the new language on a switch', async () => {
    respond((c) => ({ temple: templeDoc(langOf(c)) }));
    render(<TempleDetailScreen route={route({ temple: templeDoc('en') })} />);
    expect(screen.getByText('Sri Test Temple')).toBeTruthy();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toHaveLength(0);

    await setLang('hi');
    expect(await screen.findByText('श्री परीक्षण मंदिर')).toBeTruthy();
    expect(screen.getByText('एक प्राचीन मंदिर।')).toBeTruthy();
    expect(screen.queryByText('Sri Test Temple')).toBeNull();
    expect(calls).toEqual([{ method: 'get', url: '/temples/t1', params: { lang: 'hi' } }]);   // same endpoint and id; no repeats
    expect(screen.getByText(hi('temples.information'))).toBeTruthy();
  });

  it('opened by id only: loads once on mount, and again after a language switch', async () => {
    respond((c) => ({ data: templeDoc(langOf(c)) }));
    render(<TempleDetailScreen route={route()} />);
    expect(await screen.findByText('Sri Test Temple')).toBeTruthy();
    expect(calls).toHaveLength(1);
    await setLang('ta');
    expect(await screen.findByText('ஸ்ரீ சோதனை கோயில்')).toBeTruthy();
    expect(calls.map((c) => c.params && c.params.lang)).toEqual([undefined, 'ta']);
  });

  it('a late reply for a superseded language cannot overwrite the current one', async () => {
    const pending = {};
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ url: config.url, params: config.params });
      pending[langOf(config)] = () => resolve(reply(config, { temple: templeDoc(langOf(config)) }));
    });
    render(<TempleDetailScreen route={route({ temple: templeDoc('en') })} />);
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText('ஸ்ரீ சோதனை கோயில்')).toBeTruthy();
    await act(async () => { pending.hi(); });                 // the Hindi reply arrives last and is ignored
    expect(screen.getByText('ஸ்ரீ சோதனை கோயில்')).toBeTruthy();
    expect(screen.queryByText('श्री परीक्षण मंदिर')).toBeNull();
  });

  it('a failed refetch keeps the content already on screen and shows the translated error', async () => {
    respond(fail);
    render(<TempleDetailScreen route={route({ temple: templeDoc('en') })} />);
    await setLang('hi');
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('temples.detailLoadFailed') }));
    expect(screen.getByText('Sri Test Temple')).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('the language switch only ever issues GET requests', async () => {
    respond((c) => ({ temple: templeDoc(langOf(c)) }));
    render(<TempleDetailScreen route={route({ temple: templeDoc('en') })} />);
    await setLang('hi');
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls.every((c) => c.method === 'get')).toBe(true);
  });
});

// ── Festivals ────────────────────────────────────────────────────────────────
const todayIso = () => new Date().toISOString();
const festivalDoc = (lang, over = {}) => ({
  _id: 'f1', name: lang === 'hi' ? 'दिवाली' : 'Diwali', description: lang === 'hi' ? 'रोशनी का त्योहार' : 'Festival of lights',
  date: todayIso(), tithiDate: 'Amavasya', hinduMonth: 'Kartik', paksha: 'Krishna', vrat: 'Yes', ...over,
});

describe('FestivalsScreen localization', () => {
  it('English unchanged; Hindi translates labels, countdown badge and empty state; backend fields untouched', async () => {
    respond((c) => ({ festivals: [festivalDoc(langOf(c))] }));
    const first = render(<FestivalsScreen />);
    expect(await screen.findByText('Diwali')).toBeTruthy();
    expect(screen.getByText('Today!')).toBeTruthy();
    expect(screen.getByText('HEADER:Festivals')).toBeTruthy();
    first.unmount();

    await setLang('hi');
    calls = [];
    render(<FestivalsScreen />);
    expect(await screen.findByText('दिवाली')).toBeTruthy();
    expect(screen.getByText(hi('festivals.today'))).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('festivals.title')}`)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi('festivals.searchPlaceholder'))).toBeTruthy();
    expect(calls[0].params).toEqual({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, lang: 'hi' });

    fireEvent.changeText(screen.getByPlaceholderText(hi('festivals.searchPlaceholder')), 'zzz');
    expect(await screen.findByText(hi('festivals.empty'))).toBeTruthy();
  });

  it('refetches on a language switch; error toast is translated; tapping opens the detail with the same document', async () => {
    respond((c) => ({ festivals: [festivalDoc(langOf(c))] }));
    render(<FestivalsScreen />);
    expect(await screen.findByText('Diwali')).toBeTruthy();
    await setLang('hi');
    expect(await screen.findByText('दिवाली')).toBeTruthy();
    expect(screen.queryByText('Diwali')).toBeNull();
    fireEvent.press(screen.getByText('दिवाली'));
    expect(mockNavigate).toHaveBeenCalledWith('FestivalDetail', { festival: expect.objectContaining({ _id: 'f1', tithiDate: 'Amavasya', vrat: 'Yes' }) });

    respond(fail);
    await setLang('ta');
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: getTranslator('ta')('festivals.loadFailed') }));
  });
});

describe('FestivalDetailScreen localization', () => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();

  it('English unchanged; singular and plural countdowns; provider fields shown as given; no request', () => {
    const view = render(<FestivalDetailScreen route={{ params: { festival: festivalDoc('en', { date: day(1) }) } }} />);
    expect(screen.getByText('In 1 day')).toBeTruthy();
    ['Tithi', 'Hindu Month', 'Paksha', 'Vrat', 'About', 'Panchang Details', 'HEADER:Festival Detail'].forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    ['Amavasya', 'Kartik', 'Krishna', 'Yes'].forEach((v) => expect(screen.getByText(v)).toBeTruthy());
    view.unmount();
    render(<FestivalDetailScreen route={{ params: { festival: festivalDoc('en', { date: day(3) }) } }} />);
    expect(screen.getByText('In 3 days')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('Hindi labels; server-localized name/description and the provider values stay as received', async () => {
    await setLang('hi');
    render(<FestivalDetailScreen route={{ params: { festival: festivalDoc('hi', { date: day(3) }) } }} />);
    expect(screen.getByText('दिवाली')).toBeTruthy();
    expect(screen.getByText('रोशनी का त्योहार')).toBeTruthy();
    expect(screen.getByText(hi('festivals.inDays', { n: 3 }))).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('festivals.detailTitle')}`)).toBeTruthy();
    ['festivals.hinduMonth', 'festivals.paksha', 'festivals.vrat', 'festivals.about', 'festivals.panchangDetails']
      .forEach((k) => expect(screen.getByText(hi(k))).toBeTruthy());
    ['Amavasya', 'Kartik', 'Krishna', 'Yes'].forEach((v) => expect(screen.getByText(v)).toBeTruthy());
  });

  it('with no festival, only the localized header fallback renders', async () => {
    await setLang('hi');
    render(<FestivalDetailScreen route={{ params: {} }} />);
    expect(screen.getByText(`HEADER:${hi('festivals.detailFallbackTitle')}`)).toBeTruthy();
  });
});

// ── Livestreams ──────────────────────────────────────────────────────────────
describe('LivestreamsScreen localization', () => {
  let openURL;
  beforeEach(() => { openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true); });
  afterEach(() => openURL.mockRestore());

  const stream = (over = {}) => ({ _id: 's1', title: 'संध्या आरती', isActive: true, youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', ...over });

  it('Hindi: WATCH badge and labels translated; the YouTube URL passed to Linking is unchanged', async () => {
    await setLang('hi');
    respond(() => ({ livestreams: [stream()] }));
    render(<LivestreamsScreen />);
    expect(await screen.findByText('संध्या आरती')).toBeTruthy();
    expect(screen.getByText(hi('livestreams.watch'))).toBeTruthy();
    expect(screen.queryByText('WATCH')).toBeNull();
    expect(screen.getByText(`HEADER:${hi('livestreams.title')}`)).toBeTruthy();
    fireEvent.press(screen.getByLabelText(hi('livestreams.watchLabel', { title: 'संध्या आरती' })));
    expect(openURL).toHaveBeenCalledWith('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(calls[0]).toEqual({ method: 'get', url: '/livestreams', params: { lang: 'hi' } });
  });

  it('an unusable link is shown as unavailable (translated), is not opened, and a stream is never presented as live', async () => {
    await setLang('hi');
    respond(() => ({ livestreams: [stream({ youtubeUrl: 'javascript:alert(1)' })] }));
    render(<LivestreamsScreen />);
    expect(await screen.findByText(hi('livestreams.unavailableBadge'))).toBeTruthy();
    expect(screen.getByText(hi('livestreams.linkUnavailable'))).toBeTruthy();
    fireEvent.press(screen.getByLabelText(hi('livestreams.unavailableLabel', { title: 'संध्या आरती' })));
    expect(openURL).not.toHaveBeenCalled();
    expect(screen.queryByText(/LIVE NOW|Live now/i)).toBeNull();
  });

  it('a stream without a title shows the localized fallback title', async () => {
    await setLang('hi');
    respond(() => ({ livestreams: [stream({ title: '' })] }));
    render(<LivestreamsScreen />);
    expect(await screen.findByText(hi('livestreams.defaultTitle'))).toBeTruthy();
  });

  it('English fallback title stays "Live Darshan"', async () => {
    respond(() => ({ livestreams: [stream({ title: '' })] }));
    render(<LivestreamsScreen />);
    expect(await screen.findByText('Live Darshan')).toBeTruthy();
  });

  it('empty and error states are translated, English keeps its original wording', async () => {
    respond(() => ({ livestreams: [] }));
    const english = render(<LivestreamsScreen />);
    expect(await screen.findByText('No live streams right now')).toBeTruthy();
    expect(screen.getByText('Check back later for live poojas')).toBeTruthy();
    english.unmount();

    await setLang('hi');
    const empty = render(<LivestreamsScreen />);
    expect(await screen.findByText(hi('livestreams.empty'))).toBeTruthy();
    expect(screen.getByText(hi('livestreams.emptyHint'))).toBeTruthy();
    empty.unmount();

    respond(fail);
    render(<LivestreamsScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('livestreams.loadFailed') }));
  });
});

// ── Panchang ─────────────────────────────────────────────────────────────────
describe('PanchangScreen localization and language refetch', () => {
  const panchangDoc = {
    sunrise: '06:00 AM', sunset: '06:30 PM', nakshatra: 'Rohini', moonPhase: 'Full Moon', tithi: 'Purnima', paksha: 'Shukla',
    moonSign: 'Taurus', sunSign: 'Leo', masa: 'Magha',
    tithiEntries: [{ name: 'Purnima', start: '05:00 AM', end: 'Next Day' }],
    auspiciousTimings: [{ name: 'Abhijit Muhurat', start: '11:50 AM', end: '12:40 PM' }],
    inauspiciousTimings: [{ name: 'Rahu Kaal', start: '01:00 PM', end: '02:30 PM' }],
  };
  const festival = (lang) => ({ _id: 'f1', name: lang === 'hi' ? 'दिवाली' : lang === 'ta' ? 'தீபாவளி' : 'Diwali', description: 'x' });
  const panchangServer = (config) => {
    if (config.url.startsWith('/panchang/week')) return { panchang: [{ tithi: 'Purnima', nakshatra: 'Rohini', rahuKaal: { start: '01:00 PM', end: '02:30 PM' }, sunrise: '06:00 AM', sunset: '06:30 PM' }] };
    if (config.url.startsWith('/panchang')) return { panchang: panchangDoc };
    return { festivals: [festival(langOf(config))] };
  };

  it('English unchanged: labels, provider values and the "Next Day" marker', async () => {
    respond(panchangServer);
    render(<PanchangScreen />);
    expect(await screen.findByText('Rohini')).toBeTruthy();
    ['Daily', 'Weekly', 'Sunrise', 'Sunset', 'Nakshatra', 'Moon Phase', 'Auspicious Timings', 'Inauspicious Timings', 'Festivals', 'Avoid', 'HEADER:Panchang']
      .forEach((l) => expect(screen.getAllByText(l).length).toBeGreaterThan(0));
    expect(screen.getByText('Shukla Paksha')).toBeTruthy();
    expect(screen.getByText('Moon: Taurus')).toBeTruthy();
    expect(screen.getByText('05:00 AM – Next Day')).toBeTruthy();
    expect(screen.getByText('Diwali')).toBeTruthy();
  });

  it('Hindi: UI wording translated; every provider value (names, times, signs) is left exactly as supplied', async () => {
    await setLang('hi');
    respond(panchangServer);
    render(<PanchangScreen />);
    expect(await screen.findByText('Rohini')).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('panchang.title')}`)).toBeTruthy();
    ['panchang.daily', 'panchang.weekly', 'panchang.sunrise', 'panchang.sunset', 'panchang.nakshatra', 'panchang.moonPhase', 'panchang.auspicious', 'panchang.inauspicious']
      .forEach((k) => expect(screen.getAllByText(hi(k)).length).toBeGreaterThan(0));
    expect(screen.getByText(hi('panchang.pakshaValue', { value: 'Shukla' }))).toBeTruthy();
    expect(screen.getByText(hi('panchang.moonSign', { value: 'Taurus' }))).toBeTruthy();
    ['06:00 AM', '06:30 PM', 'Purnima', 'Full Moon', 'Abhijit Muhurat', 'Rahu Kaal', '11:50 AM – 12:40 PM', 'Magha'].forEach((v) => expect(screen.getAllByText(v).length).toBeGreaterThan(0));
    expect(screen.getByText(`05:00 AM – ${hi('panchang.nextDay')}`)).toBeTruthy();   // marker words localized; the provider value is not changed
    expect(screen.getByText('दिवाली')).toBeTruthy();                                    // festivals are server-translated
    expect(calls.filter((c) => c.url.startsWith('/panchang')).every((c) => c.method === 'get')).toBe(true);
  });

  it('a language switch reloads the daily view once; festivals follow the language, provider data is unchanged', async () => {
    respond(panchangServer);
    render(<PanchangScreen />);
    expect(await screen.findByText('Diwali')).toBeTruthy();
    expect(calls).toHaveLength(2);                      // /panchang + /festivals on mount, nothing duplicated
    await setLang('hi');
    expect(await screen.findByText('दिवाली')).toBeTruthy();
    expect(screen.queryByText('Diwali')).toBeNull();
    expect(screen.getByText('Rohini')).toBeTruthy();
    expect(calls).toHaveLength(4);
    expect(calls[3].url.startsWith('/festivals?date=')).toBe(true);
    expect(calls[3].params).toEqual({ lang: 'hi' });
  });

  it('does not show the previous language\'s festivals when the reload in the new language fails', async () => {
    respond(panchangServer);
    render(<PanchangScreen />);
    expect(await screen.findByText('Diwali')).toBeTruthy();
    respond(fail);
    await setLang('hi');
    await waitFor(() => expect(screen.queryByText('Diwali')).toBeNull());
    expect(screen.getByText('Rohini')).toBeTruthy();     // language-independent provider data may stay
  });

  it('a slow reply for a superseded language is ignored', async () => {
    const pending = {};
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ url: config.url, params: config.params });
      const lang = langOf(config);
      const done = () => resolve(reply(config, panchangServer(config)));
      if (!config.url.startsWith('/festivals') || lang === 'en') done();
      else pending[lang] = done;
    });
    render(<PanchangScreen />);
    expect(await screen.findByText('Diwali')).toBeTruthy();
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText('தீபாவளி')).toBeTruthy();
    await act(async () => { pending.hi(); });
    expect(screen.getByText('தீபாவளி')).toBeTruthy();
    expect(screen.queryByText('दिवाली')).toBeNull();
  });

  it('the weekly view does not refetch on a language switch; toggling the view still uses the same endpoint', async () => {
    respond(panchangServer);
    render(<PanchangScreen />);
    await screen.findByText('Diwali');
    fireEvent.press(screen.getByText('Weekly'));
    await waitFor(() => expect(calls.some((c) => c.url.startsWith('/panchang/week?date='))).toBe(true));
    const before = calls.length;
    await setLang('hi');
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toHaveLength(before);
    expect(screen.getByText(hi('panchang.weekly'))).toBeTruthy();
    expect(screen.getByText(hi('panchang.rahuKaal', { start: '01:00 PM', end: '02:30 PM' }))).toBeTruthy();
  });

  it('error state: translated unavailable text and Retry still reloads', async () => {
    await setLang('hi');
    respond(fail);
    render(<PanchangScreen />);
    expect(await screen.findByText(hi('panchang.unavailable'))).toBeTruthy();
    respond(panchangServer);
    fireEvent.press(screen.getByText(hi('common.retry')));
    expect(await screen.findByText('Rohini')).toBeTruthy();
  });
});
