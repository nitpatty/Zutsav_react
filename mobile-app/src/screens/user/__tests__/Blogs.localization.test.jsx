import React from 'react';
import { FlatList, Share } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import BlogsScreen from '../BlogsScreen';
import BlogDetailScreen from '../BlogDetailScreen';

// F-08 Phase 7: blog list and detail. The screens' own wording is translated. The blog's title / excerpt / content / tags
// arrive translated from the backend (GET /blogs and /blogs/:slug with ?lang=) and are shown as received; the category
// name, author name, comments, slugs, ids and image paths are server data and are never touched. The real API client is
// used (only the transport is replaced).

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ title }) => <Text>{`HEADER:${title}`}</Text> };
});
jest.mock('react-native-render-html', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ source }) => <Text>{`HTML:${source.html}`}</Text> };
});
const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));

const hi = getTranslator('hi');
const ta = getTranslator('ta');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const langOf = (config) => (config.params && config.params.lang) || 'en';
const reply = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
const failWith = (config, status = 500, message) => { throw Object.assign(new Error('Request failed'), { config, response: { status, data: message ? { message } : {}, config } }); };

let calls;
const serve = (handler) => {
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params, data: config.data });
    return reply(config, await handler(config));
  };
};
const writes = () => calls.filter((c) => c.method !== 'get');
const gets = (prefix) => calls.filter((c) => c.method === 'get' && c.url.startsWith(prefix));

const T = {
  en: { title: 'Power of Gayatri', excerpt: 'A short guide', content: '<p>Full English text</p>', tags: ['mantra'] },
  hi: { title: 'गायत्री की शक्ति', excerpt: 'एक छोटी मार्गदर्शिका', content: '<p>पूरा हिंदी पाठ</p>', tags: ['मंत्र'] },
  ta: { title: 'காயத்ரியின் சக்தி', excerpt: 'ஒரு சிறிய வழிகாட்டி', content: '<p>முழு தமிழ் உரை</p>', tags: ['மந்திரம்'] },
};
// Server-owned fields (never translated by the client): category name, author, ids, slug, images.
const blog = (lang, over = {}) => ({
  _id: 'b1', slug: 'power-of-gayatri', category: { name: 'Mantras' }, authorName: 'Pt. Sharma', featuredImage: 'uploads/blogs/cover.jpg',
  publishedAt: '2026-03-01T00:00:00.000Z', readingTime: 4, likesCount: 3, isLiked: false, isBookmarked: false,
  title: T[lang].title, excerpt: T[lang].excerpt, tags: T[lang].tags, ...over,
});
const withContent = (lang, over = {}) => ({ ...blog(lang, over), content: T[lang].content });

beforeEach(() => {
  calls = []; mockNav.navigate.mockClear(); Toast.show.mockClear();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('BlogsScreen localization', () => {
  const listServer = (config) => (config.url === '/blogs' ? { blogs: [blog(langOf(config))] } : { success: true });

  it('English is unchanged', async () => {
    serve(listServer);
    render(<BlogsScreen />);
    expect(await screen.findByText('Power of Gayatri')).toBeTruthy();
    expect(screen.getByText('HEADER:Spiritual Blogs')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search blogs…')).toBeTruthy();
    expect(screen.getByText('4 min read')).toBeTruthy();
    expect(calls[0]).toMatchObject({ method: 'get', url: '/blogs', params: { page: 1, limit: 15, status: 'published', sort: '-publishedAt' } });
  });

  it('Hindi: title/search/read-time are translated; localized content is requested and shown as received; category and author stay server data', async () => {
    await setLang('hi');
    serve(listServer);
    render(<BlogsScreen />);
    expect(await screen.findByText(T.hi.title)).toBeTruthy();
    expect(screen.getByText(T.hi.excerpt)).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('blogs.title')}`)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi('blogs.searchPlaceholder'))).toBeTruthy();
    expect(screen.getByText(hi('blogs.minRead', { n: 4 }))).toBeTruthy();
    expect(screen.getByText('Mantras')).toBeTruthy();
    expect(screen.getByText('Pt. Sharma')).toBeTruthy();
    expect(calls[0].params).toEqual({ page: 1, limit: 15, status: 'published', sort: '-publishedAt', lang: 'hi' });
  });

  it('a blog without an author gets the translated fallback; the card still opens the detail with the same route params', async () => {
    await setLang('hi');
    serve((config) => ({ blogs: [blog(langOf(config), { authorName: undefined })] }));
    render(<BlogsScreen />);
    expect(await screen.findByText(hi('blogs.defaultAuthor'))).toBeTruthy();
    fireEvent.press(screen.getByText(T.hi.title));
    expect(mockNav.navigate).toHaveBeenCalledWith('BlogDetail', { slug: 'power-of-gayatri', blog: expect.objectContaining({ _id: 'b1', slug: 'power-of-gayatri', title: T.hi.title }) });
  });

  it('search sends the raw term and is preserved across a language switch; the clear control still resets it', async () => {
    serve(listServer);
    render(<BlogsScreen />);
    await screen.findByText(T.en.title);
    const input = screen.getByPlaceholderText('Search blogs…');
    fireEvent.changeText(input, 'gayatri');
    fireEvent(input, 'submitEditing');
    await waitFor(() => expect(gets('/blogs').some((c) => c.params.search === 'gayatri')).toBe(true));

    await setLang('hi');
    await screen.findByText(T.hi.title);
    const last = gets('/blogs').pop();
    expect(last.params).toMatchObject({ page: 1, search: 'gayatri', lang: 'hi' });          // the search term survives the refetch
    expect(screen.getByDisplayValue('gayatri')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(hi('blogs.clearSearch')));
    await waitFor(() => expect(gets('/blogs').pop().params.search).toBeUndefined());
    expect(screen.queryByDisplayValue('gayatri')).toBeNull();
  });

  it('pagination still appends the next page; a language switch starts again from page 1 in the new language', async () => {
    const page = (lang, n) => Array.from({ length: 15 }, (_, i) => blog(lang, { _id: `b${n}-${i}`, slug: `s${n}-${i}`, title: `${T[lang].title} ${n}.${i}` }));
    serve((config) => (config.url === '/blogs' ? { blogs: page(langOf(config), config.params.page) } : { success: true }));
    const { UNSAFE_getByType } = render(<BlogsScreen />);
    await screen.findByText('Power of Gayatri 1.0');
    await act(async () => { UNSAFE_getByType(FlatList).props.onEndReached(); await new Promise((r) => setTimeout(r, 20)); });
    expect(gets('/blogs').map((c) => c.params.page)).toEqual([1, 2]);
    expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(30);            // page 2 appended (the list is virtualized, so check its data)
    expect(UNSAFE_getByType(FlatList).props.data[15].title).toBe('Power of Gayatri 2.0');

    await setLang('hi');
    expect(await screen.findByText(`${T.hi.title} 1.0`)).toBeTruthy();
    expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(15);            // back to page 1 only, all in the new language
    expect(UNSAFE_getByType(FlatList).props.data.every((b) => b.title.startsWith(T.hi.title))).toBe(true);
    expect(gets('/blogs').pop().params).toMatchObject({ page: 1, lang: 'hi' });
  });

  it('a language switch refetches the list once and writes nothing', async () => {
    serve(listServer);
    render(<BlogsScreen />);
    await screen.findByText(T.en.title);
    await setLang('hi');
    await screen.findByText(T.hi.title);
    expect(screen.queryByText(T.en.title)).toBeNull();
    expect(gets('/blogs')).toHaveLength(2);
    expect(writes()).toHaveLength(0);
  });

  it('a slow reply for a superseded language cannot overwrite the newer list', async () => {
    const pending = {};
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ method: config.method, url: config.url, params: config.params });
      const lang = langOf(config);
      const done = () => resolve(reply(config, { blogs: [blog(lang)] }));
      if (lang === 'en') done(); else pending[lang] = done;
    });
    render(<BlogsScreen />);
    await screen.findByText(T.en.title);
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText(T.ta.title)).toBeTruthy();
    await act(async () => { pending.hi(); await new Promise((r) => setTimeout(r, 10)); });
    expect(screen.getByText(T.ta.title)).toBeTruthy();
    expect(screen.queryByText(T.hi.title)).toBeNull();
  });

  it('empty and error states are translated', async () => {
    await setLang('hi');
    serve(() => ({ blogs: [] }));
    const empty = render(<BlogsScreen />);
    expect(await screen.findByText(hi('blogs.emptyTitle'))).toBeTruthy();
    expect(screen.getByText(hi('blogs.emptySub'))).toBeTruthy();
    empty.unmount();
    serve((config) => failWith(config));
    render(<BlogsScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('blogs.loadFailed') }));
  });
});

describe('BlogDetailScreen localization', () => {
  const route = (over = {}) => ({ params: { slug: 'power-of-gayatri', ...over } });
  const detailServer = (config) => {
    if (config.method === 'get' && config.url === '/blogs/power-of-gayatri') return { blog: withContent(langOf(config)) };
    if (config.method === 'get' && config.url === '/blogs/b1/comments') return { comments: [{ _id: 'c1', authorName: undefined, content: 'Beautiful', createdAt: new Date().toISOString() }] };
    if (config.url === '/blogs/b1/like') return { liked: true, likesCount: 4 };
    if (config.url === '/blogs/b1/bookmark') return { bookmarked: true };
    if (config.url === '/blogs/b1/share') return { shares: 1, shareUrl: 'https://web.test.invalid/blog/power-of-gayatri' };
    if (config.url === '/blogs/b1/comments') return { comment: { _id: 'c2', authorName: 'Asha', content: 'Nice', createdAt: new Date().toISOString() } };
    return { success: true };
  };

  it('English is unchanged', async () => {
    serve(detailServer);
    render(<BlogDetailScreen route={route()} />);
    expect(await screen.findByText('HTML:<p>Full English text</p>')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    expect(await screen.findByText('Comments (1)')).toBeTruthy();
    expect(screen.getByPlaceholderText('Share your thoughts…')).toBeTruthy();
    expect(screen.getByText('Anonymous')).toBeTruthy();
    expect(calls.find((c) => c.url === '/blogs/power-of-gayatri')).toMatchObject({ method: 'get', params: undefined });
  });

  it('Hindi: controls are translated; localized title/content/tags are shown as received; category, author and image are untouched', async () => {
    await setLang('hi');
    serve(detailServer);
    render(<BlogDetailScreen route={route()} />);
    expect(await screen.findByText('HTML:<p>पूरा हिंदी पाठ</p>')).toBeTruthy();
    expect(screen.getByText(T.hi.title)).toBeTruthy();
    expect(screen.getByText('#मंत्र')).toBeTruthy();
    expect(screen.getByText('Mantras')).toBeTruthy();
    // Day 27: the publish date is shown with the Hindi month name (Latin digits), not the English one.
    const published = require('../../../i18n/formatters').formatDate('2026-03-01T00:00:00.000Z', 'dd MMM yyyy', 'hi');
    expect(published).not.toBe(require('../../../utils/helpers').formatDate('2026-03-01T00:00:00.000Z'));
    expect(published).toMatch(/[ऀ-ॿ]/);
    expect(screen.getByText(`Pt. Sharma · ${published}`)).toBeTruthy();
    expect(screen.getByText(hi('blogs.minRead', { n: 4 }))).toBeTruthy();
    expect(screen.getByText(hi('blogs.save'))).toBeTruthy();
    expect(screen.getByText(hi('blogs.share'))).toBeTruthy();
    expect(await screen.findByText(hi('blogs.comments', { n: 1 }))).toBeTruthy();
    expect(screen.getByText(hi('blogs.anonymous'))).toBeTruthy();                       // comment without an author name
    expect(screen.getByPlaceholderText(hi('blogs.commentPlaceholder'))).toBeTruthy();
    expect(screen.getByLabelText(hi('blogs.likeLabel'))).toBeTruthy();
    expect(calls.find((c) => c.url === '/blogs/power-of-gayatri').params).toEqual({ lang: 'hi' });
  });

  it('opened from a list card: the card is shown at once, then the full localized blog replaces it (same slug)', async () => {
    await setLang('hi');
    serve(detailServer);
    render(<BlogDetailScreen route={route({ blog: blog('hi') })} />);
    expect(screen.getByText(T.hi.title)).toBeTruthy();                                   // no spinner, no wait
    expect(await screen.findByText('HTML:<p>पूरा हिंदी पाठ</p>')).toBeTruthy();
    expect(gets('/blogs/power-of-gayatri')).toHaveLength(1);
  });

  it('a language switch re-reads the SAME slug in the new language while the blog stays visible, the comment draft is kept, and nothing is written', async () => {
    serve(detailServer);
    render(<BlogDetailScreen route={route()} />);
    await screen.findByText('HTML:<p>Full English text</p>');
    await screen.findByText('Comments (1)');
    fireEvent.changeText(screen.getByPlaceholderText('Share your thoughts…'), 'a half-written thought');

    await setLang('hi');
    expect(await screen.findByText('HTML:<p>पूरा हिंदी पाठ</p>')).toBeTruthy();
    expect(screen.queryByText('HTML:<p>Full English text</p>')).toBeNull();
    expect(screen.getByDisplayValue('a half-written thought')).toBeTruthy();
    const reads = gets('/blogs/power-of-gayatri');
    expect(reads).toHaveLength(2);
    expect(reads[1].params).toEqual({ lang: 'hi' });
    expect(gets('/blogs/b1/comments')).toHaveLength(1);                                  // comments are not re-fetched (same blog id)
    expect(writes()).toHaveLength(0);
  });

  it('while the localized blog is still loading, the current blog and the comment draft stay on screen (no spinner swap)', async () => {
    let release;
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ method: config.method, url: config.url, params: config.params });
      const lang = langOf(config);
      const done = () => resolve(reply(config, config.url === '/blogs/power-of-gayatri' ? { blog: withContent(lang) } : { comments: [] }));
      if (config.url === '/blogs/power-of-gayatri' && lang === 'hi') release = done; else done();
    });
    render(<BlogDetailScreen route={route()} />);
    await screen.findByText('HTML:<p>Full English text</p>');
    fireEvent.changeText(screen.getByPlaceholderText('Share your thoughts…'), 'draft kept');
    await setLang('hi');
    await waitFor(() => expect(release).toBeDefined());
    expect(screen.getByText('HTML:<p>Full English text</p>')).toBeTruthy();            // still readable while the new language loads
    expect(screen.getByDisplayValue('draft kept')).toBeTruthy();
    await act(async () => { release(); });
    expect(await screen.findByText('HTML:<p>पूरा हिंदी पाठ</p>')).toBeTruthy();
    expect(screen.getByDisplayValue('draft kept')).toBeTruthy();
  });

  it('a slow reply for a superseded language cannot overwrite the newer content', async () => {
    const pending = {};
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ method: config.method, url: config.url, params: config.params });
      const lang = langOf(config);
      const done = () => resolve(reply(config, config.url === '/blogs/power-of-gayatri' ? { blog: withContent(lang) } : { comments: [] }));
      if (config.url === '/blogs/power-of-gayatri' && lang !== 'en') pending[lang] = done; else done();
    });
    render(<BlogDetailScreen route={route()} />);
    await screen.findByText('HTML:<p>Full English text</p>');
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText('HTML:<p>முழு தமிழ் உரை</p>')).toBeTruthy();
    await act(async () => { pending.hi(); await new Promise((r) => setTimeout(r, 10)); });
    expect(screen.getByText('HTML:<p>முழு தமிழ் உரை</p>')).toBeTruthy();
    expect(screen.queryByText('HTML:<p>पूरा हिंदी पाठ</p>')).toBeNull();
  });

  it('a failed refresh keeps the blog on screen and shows the translated error', async () => {
    serve(detailServer);
    render(<BlogDetailScreen route={route()} />);
    await screen.findByText('HTML:<p>Full English text</p>');
    serve((config) => (config.url === '/blogs/power-of-gayatri' ? failWith(config) : detailServer(config)));
    await setLang('hi');
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('blogs.detailLoadFailed') }));
    expect(screen.getByText('HTML:<p>Full English text</p>')).toBeTruthy();
  });

  it('like, bookmark, share and comment keep their endpoints and payloads, with translated messages', async () => {
    await setLang('hi');
    const share = jest.spyOn(Share, 'share').mockResolvedValue({});
    serve(detailServer);
    render(<BlogDetailScreen route={route()} />);
    await screen.findByText('HTML:<p>पूरा हिंदी पाठ</p>');
    await screen.findByText(hi('blogs.comments', { n: 1 }));

    fireEvent.press(screen.getByLabelText(hi('blogs.likeLabel')));
    await waitFor(() => expect(calls.some((c) => c.method === 'post' && c.url === '/blogs/b1/like')).toBe(true));
    expect(await screen.findByText('4')).toBeTruthy();

    fireEvent.press(screen.getByText(hi('blogs.save')));
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('blogs.bookmarked') }));
    expect(screen.getByText(hi('blogs.saved'))).toBeTruthy();

    fireEvent.press(screen.getByText(hi('blogs.share')));
    await waitFor(() => expect(share).toHaveBeenCalledWith({ message: `${T.hi.title}\nhttps://web.test.invalid/blog/power-of-gayatri`, url: 'https://web.test.invalid/blog/power-of-gayatri' }));

    fireEvent.changeText(screen.getByPlaceholderText(hi('blogs.commentPlaceholder')), '  Nice  ');
    fireEvent.press(screen.getByLabelText(hi('blogs.sendComment')));
    await waitFor(() => expect(calls.some((c) => c.method === 'post' && c.url === '/blogs/b1/comments')).toBe(true));
    expect(JSON.parse(calls.find((c) => c.url === '/blogs/b1/comments' && c.method === 'post').data)).toEqual({ content: 'Nice' });
    expect(await screen.findByText(hi('blogs.comments', { n: 2 }))).toBeTruthy();
  });

  it('action failures: translated fallbacks; a server comment message is shown as received', async () => {
    await setLang('hi');
    serve((config) => (config.method === 'post' ? failWith(config, 400, config.url.endsWith('/comments') ? 'Comments are closed' : undefined) : detailServer(config)));
    render(<BlogDetailScreen route={route()} />);
    await screen.findByText('HTML:<p>पूरा हिंदी पाठ</p>');
    fireEvent.press(screen.getByLabelText(hi('blogs.likeLabel')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('blogs.likeFailed') }));
    fireEvent.press(screen.getByText(hi('blogs.save')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('blogs.bookmarkFailed') }));
    fireEvent.press(screen.getByText(hi('blogs.share')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: hi('blogs.shareFailed') }));
    fireEvent.changeText(screen.getByPlaceholderText(hi('blogs.commentPlaceholder')), 'hello');
    fireEvent.press(screen.getByLabelText(hi('blogs.sendComment')));
    await waitFor(() => expect(Toast.show).toHaveBeenLastCalledWith({ type: 'error', text1: 'Comments are closed' }));
  });

  it('a blog that cannot be loaded at all shows the translated error', async () => {
    await setLang('hi');
    serve((config) => failWith(config, 404));
    render(<BlogDetailScreen route={route()} />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('blogs.detailLoadFailed') }));
  });
});
