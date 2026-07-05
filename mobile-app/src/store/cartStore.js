import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Flat item shape (variant-aware): { productId, variantId, name, price, image, stock, quantity }.
// variantId is null for non-variant products. A product+variant pair is the
// unique key for a cart line, so the same product with two different
// variants correctly becomes two separate lines.
const sameLine = (i, productId, variantId) => i.productId === productId && (i.variantId || null) === (variantId || null);

export const useCartStore = create((set, get) => ({
  items: [],

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem('zutsav_cart');
      if (raw) set({ items: JSON.parse(raw) });
    } catch {}
  },

  _save: async (items) => {
    await AsyncStorage.setItem('zutsav_cart', JSON.stringify(items));
    set({ items });
  },

  addItem: async (item, quantity = 1) => {
    const { productId, variantId = null, name, price, image, stock } = item;
    const items = get().items;
    const idx = items.findIndex((i) => sameLine(i, productId, variantId));
    let next;
    if (idx >= 0) {
      next = items.map((i, j) => j === idx ? { ...i, quantity: i.quantity + quantity } : i);
    } else {
      next = [...items, { productId, variantId, name, price, image, stock, quantity }];
    }
    await get()._save(next);
  },

  removeItem: async (productId, variantId = null) => {
    const next = get().items.filter((i) => !sameLine(i, productId, variantId));
    await get()._save(next);
  },

  updateQuantity: async (productId, variantId, quantity) => {
    if (quantity <= 0) { return get().removeItem(productId, variantId); }
    const next = get().items.map((i) => sameLine(i, productId, variantId) ? { ...i, quantity } : i);
    await get()._save(next);
  },

  clear: async () => {
    await AsyncStorage.removeItem('zutsav_cart');
    set({ items: [] });
  },

  get total() {
    return get().items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  },

  get count() {
    return get().items.reduce((sum, i) => sum + i.quantity, 0);
  },
}));
