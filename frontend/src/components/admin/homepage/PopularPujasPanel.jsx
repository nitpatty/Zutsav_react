import React, { useEffect, useState } from 'react';
import { Search, Plus, X, ArrowUp, ArrowDown, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../../../api/axios';
import { getImageUrl } from '../../../config';
import { ZutsavLoaderInline } from '../../shared/ZutsavLoader';

const MAX_ITEMS = 8;

export default function PopularPujasPanel() {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    API.get('/poojas/homepage-popular')
      .then(({ data }) => setSelected(data.poojas || []))
      .catch(() => toast.error('Could not load curated Popular Pujas'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      API.get('/poojas/admin-catalog', { params: { search, status: 'active' } })
        .then(({ data }) => setResults(data.poojas || []))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const add = (pooja) => {
    if (selected.some((p) => p._id === pooja._id)) return;
    if (selected.length >= MAX_ITEMS) { toast.error(`Maximum ${MAX_ITEMS} poojas`); return; }
    setSelected((s) => [...s, pooja]);
  };

  const remove = (id) => setSelected((s) => s.filter((p) => p._id !== id));

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    setSelected(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await API.put('/poojas/homepage-popular', { poojaIds: selected.map((p) => p._id) });
      setSelected(data.poojas || []);
      toast.success('Popular Pujas updated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  if (loading) return <ZutsavLoaderInline />;

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-xs text-amber-800">
        Pick up to {MAX_ITEMS} poojas to feature on the homepage, in the order shown below. If nothing is selected, the homepage automatically shows the most-booked / featured poojas instead.
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Curated Set ({selected.length}/{MAX_ITEMS})</h2>
          <button type="button" onClick={save} disabled={saving} className="btn-primary text-xs px-4 py-2 flex items-center gap-2 disabled:opacity-60">
            <Save size={13} /> {saving ? 'Saving…' : 'Save Order'}
          </button>
        </div>
        {selected.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">No poojas curated yet — search below to add some.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {selected.map((p, i) => (
              <li key={p._id} className="px-6 py-3 flex items-center gap-4">
                <span className="w-6 h-6 rounded-full bg-saffron-50 text-saffron-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                {p.image && <img src={getImageUrl(p.image)} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">₹{p.price?.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === selected.length - 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => remove(p._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" aria-label="Remove"><X size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search poojas to add…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {searching && <div className="px-6 py-4 text-sm text-gray-400">Searching…</div>}
        {!searching && results.length > 0 && (
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {results.map((p) => {
              const already = selected.some((s) => s._id === p._id);
              return (
                <li key={p._id} className="px-6 py-3 flex items-center gap-4">
                  {p.image && <img src={getImageUrl(p.image)} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">₹{p.price?.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => add(p)}
                    disabled={already}
                    className="btn-outline text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-40"
                  >
                    <Plus size={12} /> {already ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
