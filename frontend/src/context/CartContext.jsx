import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

const CART_KEY = 'zutsav_cart_v2';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    } catch { return []; }
  });

  // Persist to localStorage on every change
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  // ── Pooja booking item ─────────────────────────────────────
  // pricing: { poojaAmount, kitAmount, platformFee, taxAmount, grandTotal, commissionPercent, gstPercent }
  const addPooja = useCallback(({ pooja, kit, bookingDetails, pricing }) => {
    setItems((prev) => [
      ...prev,
      {
        id:       uuidv4(),
        type:     'POOJA',
        poojaId:  pooja._id,
        poojaName: pooja.name,
        poojaSlug: pooja.slug,
        poojaImage: pooja.image || null,
        kitId:    kit?._id   || null,
        kitName:  kit?.name  || null,
        kitImage: kit?.image || null,
        bookingDetails,   // { scheduledDate, scheduledTime, language, specialNote, userDetails, isUrgent, withKit }
        pricing,          // full price breakdown
      },
    ]);
  }, []);

  // ── Marketplace product item ───────────────────────────────
  // priceOverride lets callers pass variant-specific price instead of product-level price
  const addProduct = useCallback(({ product, variantId, variantLabel, quantity = 1, price: priceOverride, taxRate: taxRateOverride }) => {
    setItems((prev) => {
      const key = `${product._id}::${variantId || ''}`;
      const existing = prev.find((i) => i.type === 'PRODUCT' && i.key === key);
      const itemPrice = priceOverride ?? (product.salePrice || product.price);
      const itemTaxRate = taxRateOverride ?? product.taxRate ?? 0;
      if (existing) {
        return prev.map((i) => i.key === key ? { ...i, quantity: i.quantity + quantity } : i);
      }
      return [
        ...prev,
        {
          id:           uuidv4(),
          key,
          type:         'PRODUCT',
          productId:    product._id,
          name:         product.name,
          image:        product.images?.[0] || null,
          price:        itemPrice,
          taxRate:      itemTaxRate,
          variantId:    variantId    || null,
          variantLabel: variantLabel || null,
          quantity,
        },
      ];
    });
  }, []);

  const updateProductQty = useCallback((id, quantity) => {
    if (quantity < 1) return removeItem(id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, quantity } : i));
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  // ── Derived values ─────────────────────────────────────────
  const poojaItems   = items.filter((i) => i.type === 'POOJA');
  const productItems = items.filter((i) => i.type === 'PRODUCT');
  const cartCount    = items.length;

  const poojaTotal        = poojaItems.reduce((s, i) => s + (i.pricing?.grandTotal || 0), 0);
  const productSubtotal   = productItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const productTaxTotal   = productItems.reduce((s, i) => s + Math.round(i.price * i.quantity * (i.taxRate || 0) / 100), 0);
  const productTotal      = productSubtotal + productTaxTotal;
  const grandTotal        = poojaTotal + productTotal;

  const cartType = poojaItems.length > 0 && productItems.length > 0
    ? 'MIXED'
    : poojaItems.length > 0 ? 'POOJA' : productItems.length > 0 ? 'PRODUCT' : 'EMPTY';

  return (
    <CartContext.Provider value={{
      items,
      poojaItems,
      productItems,
      cartCount,
      cartType,
      poojaTotal,
      productSubtotal,
      productTaxTotal,
      productTotal,
      grandTotal,
      addPooja,
      addProduct,
      updateProductQty,
      removeItem,
      clearCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};
