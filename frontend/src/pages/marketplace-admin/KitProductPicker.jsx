import React, { useMemo, useState } from 'react';
import { Combobox } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';

// Searchable product/variant picker (Headless UI Combobox — already a
// dependency, no new package added). Flattens each product's variants into
// individually-selectable options, mirroring the old <optgroup> select.
export default function KitProductPicker({ products, value, onSelect }) {
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const list = [];
    (products || []).forEach((p) => {
      if (p.variants?.length > 0) {
        p.variants.filter((v) => v.isActive !== false && v.stock > 0).forEach((v) => {
          list.push({
            key: `${p._id}::${v.variantId}`,
            productId: p._id,
            variantId: v.variantId,
            variantLabel: v.quantity,
            label: `${p.name} — ${v.quantity}`,
            price: v.price,
            suffix: p.visibilityType === 'kit_only' ? ' (Kit Only)' : '',
          });
        });
      } else {
        list.push({
          key: p._id,
          productId: p._id,
          variantId: null,
          variantLabel: null,
          label: p.name,
          price: p.salePrice || p.price,
          suffix: p.visibilityType === 'kit_only' ? ' (Kit Only)' : '',
        });
      }
    });
    return list;
  }, [products]);

  const selected = options.find((o) => o.key === value) || null;

  const filtered = query === ''
    ? options
    : options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <Combobox value={selected} onChange={(opt) => opt && onSelect(opt)}>
      <div className="relative flex-1">
        <div className="relative">
          <Combobox.Input
            className="input text-sm w-full pr-8"
            displayValue={(opt) => (opt ? `${opt.label}${opt.suffix || ''} — ₹${opt.price}` : '')}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product..."
          />
          <Combobox.Button className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
            <ChevronDown size={14} />
          </Combobox.Button>
        </div>
        {filtered.length > 0 && (
          <Combobox.Options className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border bg-white shadow-lg py-1 text-sm" style={{ borderColor: 'var(--t-border)' }}>
            {filtered.map((opt) => (
              <Combobox.Option
                key={opt.key}
                value={opt}
                className={({ active }) => `flex items-center justify-between gap-2 px-3 py-2 cursor-pointer ${active ? 'bg-saffron-50' : ''}`}
              >
                {({ selected: isSelected }) => (
                  <>
                    <span className="truncate">{opt.label}{opt.suffix}</span>
                    <span className="flex items-center gap-1.5 shrink-0 text-saffron-600 font-medium">
                      ₹{opt.price}
                      {isSelected && <Check size={13} />}
                    </span>
                  </>
                )}
              </Combobox.Option>
            ))}
          </Combobox.Options>
        )}
      </div>
    </Combobox>
  );
}
