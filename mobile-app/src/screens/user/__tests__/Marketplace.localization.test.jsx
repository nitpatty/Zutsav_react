import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import api from '../../../api/axios';
import MarketplaceScreen from '../MarketplaceScreen';
import ProductDetailScreen from '../ProductDetailScreen';
import { useCartStore } from '../../../store/cartStore';
import { useLanguageStore } from '../../../i18n/languageStore';
import { getTranslator } from '../../../i18n/translate';
import { formatCurrency } from '../../../utils/helpers';

// F-08 Phase 4: marketplace browsing and product detail. UI wording is translated; product name/description/tags arrive
// translated from the backend (?lang=) and are shown as received. Ids, slugs, sort keys, prices, stock and variants are
// never translated. The real API client is used (only its transport is replaced).

jest.mock('react-native-toast-message', () => ({ __esModule: true, default: { show: jest.fn() } }));
jest.mock('../../../components/ScreenHeader', () => {
  const { Text, View } = require('react-native');
  return { __esModule: true, default: ({ title, right }) => <View><Text>{`HEADER:${title}`}</Text>{right}</View> };
});
jest.mock('react-native-render-html', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: ({ source }) => <Text>{`HTML:${source.html}`}</Text> };
});
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

const hi = getTranslator('hi');
const en = getTranslator('en');
const setLang = (language) => act(async () => { await useLanguageStore.getState().setLanguage(language); });
const langOf = (config) => (config.params && config.params.lang) || 'en';

let calls;
const reply = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config });
const respond = (handler) => {
  api.defaults.adapter = async (config) => {
    calls.push({ method: config.method, url: config.url, params: config.params });
    return reply(config, await handler(config));
  };
};
const fail = (config) => { throw Object.assign(new Error('Request failed'), { config, response: { status: 500, data: {}, config } }); };
const productCalls = () => calls.filter((c) => c.url.startsWith('/marketplace/products'));
const cartItems = () => useCartStore.getState().items;

const NAMES = { en: 'Pure Ghee', hi: 'शुद्ध घी', ta: 'தூய நெய்' };
const DESC = { en: 'Farm fresh', hi: 'ताज़ा घी', ta: 'புதிய நெய்' };
// Synthetic product in the shape of backend/src/models/Product.js (variants and prices are never translated).
const product = (lang = 'en', over = {}) => ({
  _id: 'p1', slug: 'pure-ghee', name: NAMES[lang], description: `<p>${DESC[lang]}</p>`, price: 600, salePrice: 550, stock: 0, images: [],
  category: 'puja-samagri', isActive: true,
  variants: [
    { variantId: 'v1', quantity: '500g', price: 300, salePrice: 280, stock: 5, isActive: true },
    { variantId: 'v2', quantity: '1kg', price: 600, stock: 3, isActive: true },
  ], ...over,
});
const plain = (lang = 'en', over = {}) => ({ _id: 'p2', slug: 'incense', name: lang === 'hi' ? 'अगरबत्ती' : 'Incense', price: 250, salePrice: 200, stock: 4, images: [], variants: [], ...over });
const CATEGORIES = [{ _id: 'c1', name: 'Puja Samagri', slug: 'puja-samagri', icon: '🪔' }];

beforeEach(async () => {
  calls = []; mockNavigate.mockClear(); Toast.show.mockClear();
  await act(async () => { useCartStore.setState({ items: [] }); });
});

describe('MarketplaceScreen localization', () => {
  const shop = (config) => {
    if (config.url === '/marketplace/categories') return { categories: CATEGORIES };
    const lang = langOf(config);
    return { products: [product(lang), plain(lang)] };
  };

  it('English: original labels, request shape and server content unchanged', async () => {
    respond(shop);
    render(<MarketplaceScreen />);
    expect(await screen.findByText('Pure Ghee')).toBeTruthy();
    expect(screen.getByText('HEADER:Shop')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search products…')).toBeTruthy();
    ['All', 'Featured', 'Price ↑', 'Price ↓', 'Name'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByText(`From ${formatCurrency(280)}`)).toBeTruthy();
    expect(screen.getByText('20% OFF')).toBeTruthy();                    // incense 250 → 200; the ghee has variants, so no badge
  });

  it('Hindi: labels translated; category and product text shown exactly as received; requests carry lang only', async () => {
    await setLang('hi');
    respond(shop);
    render(<MarketplaceScreen />);
    expect(await screen.findByText('शुद्ध घी')).toBeTruthy();
    expect(screen.getByText(`HEADER:${hi('nav.shop')}`)).toBeTruthy();
    expect(screen.getByPlaceholderText(hi('shop.searchPlaceholder'))).toBeTruthy();
    [hi('shop.all'), hi('shop.sortFeatured'), hi('shop.sortPriceAsc'), hi('shop.sortPriceDesc'), hi('shop.sortName')].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByText(hi('shop.priceFrom', { price: formatCurrency(280) }))).toBeTruthy();
    expect(screen.getByText(hi('shop.discountOff', { pct: 20 }))).toBeTruthy();
    expect(screen.getByText('🪔 Puja Samagri')).toBeTruthy();            // category names are not translated by the backend: as received
    expect(screen.getByText('अगरबत्ती')).toBeTruthy();
    expect(calls.map((c) => c.url).sort()).toEqual(['/marketplace/categories', '/marketplace/products']);
    expect(productCalls()[0].params).toEqual({ page: 1, limit: 12, isActive: true, lang: 'hi' });
    expect(calls.every((c) => c.method === 'get')).toBe(true);
  });

  it('sort, category and search still send the stable API values, not the translated labels', async () => {
    await setLang('hi');
    respond(shop);
    render(<MarketplaceScreen />);
    await screen.findByText('शुद्ध घी');
    fireEvent.press(screen.getByText(hi('shop.sortPriceAsc')));
    await waitFor(() => expect(productCalls().some((c) => c.params.sort === 'price_asc')).toBe(true));
    fireEvent.press(screen.getByText('🪔 Puja Samagri'));
    await waitFor(() => expect(productCalls().some((c) => c.params.category === 'puja-samagri')).toBe(true));
    fireEvent.press(screen.getByText(hi('shop.all')));
    await waitFor(() => expect(productCalls().filter((c) => c.params.category === undefined).length).toBeGreaterThan(1));
    const input = screen.getByPlaceholderText(hi('shop.searchPlaceholder'));
    fireEvent.changeText(input, 'घी ghee');
    fireEvent(input, 'submitEditing');
    await waitFor(() => expect(productCalls().some((c) => c.params.search === 'घी ghee')).toBe(true));
    productCalls().forEach((c) => expect(c.params.lang).toBe('hi'));
  });

  it('a switch refetches the products once in the new language and leaves nothing of the old one; categories are not refetched', async () => {
    respond(shop);
    render(<MarketplaceScreen />);
    expect(await screen.findByText('Pure Ghee')).toBeTruthy();
    expect(productCalls()).toHaveLength(1);
    await setLang('hi');
    expect(await screen.findByText('शुद्ध घी')).toBeTruthy();
    expect(screen.queryByText('Pure Ghee')).toBeNull();
    expect(productCalls()).toHaveLength(2);
    expect(productCalls()[1].params.lang).toBe('hi');
    expect(calls.filter((c) => c.url === '/marketplace/categories')).toHaveLength(1);
  });

  it('a slow reply for a superseded language cannot overwrite the current list', async () => {
    const pending = {};
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ method: config.method, url: config.url, params: config.params });
      const lang = langOf(config);
      const done = () => resolve(reply(config, shop(config)));
      if (config.url === '/marketplace/products' && lang !== 'en') pending[lang] = done; else done();
    });
    render(<MarketplaceScreen />);
    expect(await screen.findByText('Pure Ghee')).toBeTruthy();
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText('தூய நெய்')).toBeTruthy();
    await act(async () => { pending.hi(); });                                           // the Hindi reply arrives last and is ignored
    expect(screen.getByText('தூய நெய்')).toBeTruthy();
    expect(screen.queryByText('शुद्ध घी')).toBeNull();
    expect(screen.queryByText('अगरबत्ती')).toBeNull();
  });

  it('empty state and error toast are translated; the empty state is not an error', async () => {
    await setLang('hi');
    respond((c) => (c.url === '/marketplace/categories' ? { categories: [] } : { products: [] }));
    const empty = render(<MarketplaceScreen />);
    expect(await screen.findByText(hi('shop.empty'))).toBeTruthy();
    expect(Toast.show).not.toHaveBeenCalled();
    empty.unmount();
    respond((c) => (c.url === '/marketplace/categories' ? { categories: [] } : fail(c)));
    render(<MarketplaceScreen />);
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('shop.loadFailed') }));
  });

  it('Add (single-product, no variants): same cart item as in English, translated confirmation, in-cart label; cart survives a language switch', async () => {
    await setLang('hi');
    respond(shop);
    render(<MarketplaceScreen />);
    fireEvent.press((await screen.findAllByText(hi('shop.add')))[1]);   // [0] belongs to the multi-variant ghee, which opens the detail instead
    await waitFor(() => expect(cartItems()).toHaveLength(1));
    expect(cartItems()[0]).toEqual({ productId: 'p2', variantId: null, name: 'अगरबत्ती', price: 200, image: undefined, stock: 4, quantity: 1 });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('shop.addedToCart', { name: 'अगरबत्ती' }) });
    expect(await screen.findByText(hi('shop.inCart', { n: 1 }))).toBeTruthy();

    const before = JSON.stringify(cartItems());
    await setLang('en');
    expect(JSON.stringify(cartItems())).toBe(before);                   // ids, prices, quantities untouched by a display-language change
  });

  it('a product with several variants still opens the detail screen with the same navigation params', async () => {
    respond(shop);
    render(<MarketplaceScreen />);
    fireEvent.press(await screen.findByText('Pure Ghee'));
    expect(mockNavigate).toHaveBeenCalledWith('ProductDetail', { productId: 'p1', slug: 'pure-ghee', product: expect.objectContaining({ _id: 'p1', slug: 'pure-ghee' }) });
  });

  it('out-of-stock and discount labels are translated; availability is still decided by the stock number', async () => {
    await setLang('hi');
    respond((c) => (c.url === '/marketplace/categories' ? { categories: [] } : { products: [plain('hi', { stock: 0 })] }));
    render(<MarketplaceScreen />);
    expect(await screen.findByText(hi('shop.outOfStock'))).toBeTruthy();
    expect(screen.queryByText(hi('shop.add'))).toBeNull();
  });
});

describe('ProductDetailScreen localization and language refetch', () => {
  const detail = (params) => render(<ProductDetailScreen route={{ params: { productId: 'p1', slug: 'pure-ghee', ...params } }} />);
  const serve = (config) => ({ product: product(langOf(config)) });

  it('Hindi labels around backend-localized content; no request when opened with the item in the same language', async () => {
    await setLang('hi');
    respond(serve);
    detail({ product: product('hi') });
    expect(screen.getAllByText('शुद्ध घी').length).toBeGreaterThan(0);
    expect(screen.getByText('HTML:<p>ताज़ा घी</p>')).toBeTruthy();
    [hi('shop.selectOption'), hi('shop.description'), hi('shop.stock'), hi('shop.addToCart')].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    expect(screen.getByText(hi('shop.available', { n: 5 }))).toBeTruthy();
    expect(screen.getByText('500g')).toBeTruthy();                       // variant labels are product data
    expect(screen.getByText(formatCurrency(280))).toBeTruthy();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(calls).toHaveLength(0);
  });

  it('English unchanged: labels, price and add-to-cart item', async () => {
    detail({ product: product('en') });
    ['Select Option', 'Description', 'Stock', 'Add to Cart', '5 available'].forEach((l) => expect(screen.getByText(l)).toBeTruthy());
    fireEvent.press(screen.getByText('Add to Cart'));
    await waitFor(() => expect(cartItems()).toHaveLength(1));
    expect(cartItems()[0]).toEqual({ productId: 'p1', variantId: 'v1', name: 'Pure Ghee (500g)', price: 280, image: undefined, stock: 5, quantity: 1 });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Pure Ghee added to cart' });
    expect(await screen.findByText('View in Cart (1)')).toBeTruthy();
  });

  it('a switch makes exactly one GET for the same product slug in the new language (no loop, no repeat)', async () => {
    respond(serve);
    detail({ product: product('en') });
    await setLang('hi');
    expect(await screen.findByText('HTML:<p>ताज़ा घी</p>')).toBeTruthy();
    expect(screen.queryByText('HTML:<p>Farm fresh</p>')).toBeNull();
    expect(calls).toEqual([{ method: 'get', url: '/marketplace/products/pure-ghee', params: { lang: 'hi' } }]);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(calls).toHaveLength(1);
    expect(screen.getByText(hi('shop.selectOption'))).toBeTruthy();
  });

  it('the selected variant, its price and the cart payload are the same after the switch', async () => {
    respond(serve);
    detail({ product: product('en') });
    fireEvent.press(screen.getByText('1kg'));
    expect(screen.getByText(formatCurrency(600))).toBeTruthy();
    expect(screen.getByText('3 available')).toBeTruthy();

    await setLang('hi');
    await screen.findByText('HTML:<p>ताज़ा घी</p>');
    expect(screen.getByText(hi('shop.available', { n: 3 }))).toBeTruthy();   // still the 1kg variant
    expect(screen.getByText(formatCurrency(600))).toBeTruthy();
    fireEvent.press(screen.getByText(hi('shop.addToCart')));
    await waitFor(() => expect(cartItems()).toHaveLength(1));
    expect(cartItems()[0]).toEqual({ productId: 'p1', variantId: 'v2', name: 'शुद्ध घी (1kg)', price: 600, image: undefined, stock: 3, quantity: 1 });
    expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: hi('shop.addedToCart', { name: 'शुद्ध घी' }) });
  });

  it('cart quantity for the product is untouched by a refresh (View in Cart count stays)', async () => {
    await act(async () => { useCartStore.setState({ items: [{ productId: 'p1', variantId: 'v1', name: 'Pure Ghee (500g)', price: 280, quantity: 3, stock: 5 }] }); });
    respond(serve);
    detail({ product: product('en') });
    expect(screen.getByText('View in Cart (3)')).toBeTruthy();
    await setLang('hi');
    await screen.findByText('HTML:<p>ताज़ा घी</p>');
    expect(screen.getByText(hi('shop.viewInCart', { n: 3 }))).toBeTruthy();
    expect(cartItems()).toEqual([{ productId: 'p1', variantId: 'v1', name: 'Pure Ghee (500g)', price: 280, quantity: 3, stock: 5 }]);
    expect(calls.every((c) => c.method === 'get')).toBe(true);
  });

  it('if the refreshed product no longer has the selected variant, nothing is silently picked instead', async () => {
    respond(() => ({ product: product('hi', { stock: 7, variants: [{ variantId: 'v3', quantity: '2kg', price: 900, stock: 2, isActive: true }] }) }));
    detail({ product: product('en') });
    fireEvent.press(screen.getByText('1kg'));
    await setLang('hi');
    await screen.findByText('HTML:<p>ताज़ा घी</p>');
    fireEvent.press(screen.getByText(hi('shop.addToCart')));
    expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('shop.selectVariant') });
    expect(cartItems()).toEqual([]);
  });

  it('a late reply for a superseded language cannot overwrite the current one', async () => {
    const pending = {};
    api.defaults.adapter = (config) => new Promise((resolve) => {
      calls.push({ url: config.url, params: config.params });
      pending[langOf(config)] = () => resolve(reply(config, serve(config)));
    });
    detail({ product: product('en') });
    await setLang('hi');
    await setLang('ta');
    await waitFor(() => expect(pending.hi && pending.ta).toBeTruthy());
    await act(async () => { pending.ta(); });
    expect(await screen.findByText('HTML:<p>புதிய நெய்</p>')).toBeTruthy();
    await act(async () => { pending.hi(); });
    expect(screen.getByText('HTML:<p>புதிய நெய்</p>')).toBeTruthy();
    expect(screen.queryByText('HTML:<p>ताज़ा घी</p>')).toBeNull();
  });

  it('a failed refresh keeps the product already shown, shows the translated error and invents no translation', async () => {
    respond(fail);
    detail({ product: product('en') });
    await setLang('hi');
    await waitFor(() => expect(Toast.show).toHaveBeenCalledWith({ type: 'error', text1: hi('shop.detailLoadFailed') }));
    expect(screen.getAllByText('Pure Ghee').length).toBeGreaterThan(0);
    expect(screen.getByText('HTML:<p>Farm fresh</p>')).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('opened by slug only: loads once on mount and once more after a switch', async () => {
    respond(serve);
    detail();
    expect(await screen.findByText('HTML:<p>Farm fresh</p>')).toBeTruthy();
    expect(calls).toHaveLength(1);
    await setLang('hi');
    expect(await screen.findByText('HTML:<p>ताज़ा घी</p>')).toBeTruthy();
    expect(calls.map((c) => c.params && c.params.lang)).toEqual([undefined, 'hi']);
    expect(calls.every((c) => c.url === '/marketplace/products/pure-ghee')).toBe(true);
  });

  it('with no slug in the params, the slug carried by the item is used (the endpoint is slug-based)', async () => {
    respond(serve);
    render(<ProductDetailScreen route={{ params: { productId: 'p1', product: product('en') } }} />);
    await setLang('hi');
    await screen.findByText('HTML:<p>ताज़ा घी</p>');
    expect(calls[0].url).toBe('/marketplace/products/pure-ghee');
  });

  it('out-of-stock label for a variant is translated and that variant stays unselectable', async () => {
    await setLang('hi');
    detail({ product: product('hi', { variants: [{ variantId: 'v1', quantity: '500g', price: 300, stock: 0, isActive: true }, { variantId: 'v2', quantity: '1kg', price: 600, stock: 3, isActive: true }] }) });
    expect(screen.getByText(hi('shop.variantOutOfStock'))).toBeTruthy();
    expect(en('shop.variantOutOfStock')).toBe('Out of stock');
  });
});
