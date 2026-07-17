import React from 'react';

// Only two real states exist on the Product schema (isActive boolean) — no
// Draft/Published/Hidden/Pending enum. isEditing=false always reads as Draft
// (nothing saved yet); isEditing=true reflects the saved product's isActive.
export default function ProductStatusCard({ isEditing, editingProd }) {
  const isPublished = isEditing ? !!editingProd?.isActive : false;

  return (
    <div className="rounded-2xl p-4" style={{ background: isPublished ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${isPublished ? '#BBF7D0' : '#FDE68A'}` }}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Product Status</p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isPublished ? 'bg-green-500 text-white' : 'bg-amber-500 text-white'}`}>
          {isPublished ? 'Published' : 'Draft'}
        </span>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">
        {isPublished
          ? 'This product is live on the marketplace.'
          : 'This product is saved as draft. Publish to make it live on the marketplace.'}
      </p>
    </div>
  );
}
