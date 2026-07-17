import React from 'react';

export default function OverviewTab({ pooja }) {
  return (
    <div>
      <h3 className="font-bold text-gray-900 text-xl mb-3" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
        About {pooja.name}
      </h3>
      {pooja.shortDesc && <p className="text-gray-600 text-sm leading-relaxed mb-3">{pooja.shortDesc}</p>}
      {pooja.description && (
        <div
          className="rte-content pooja-content text-gray-600 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: pooja.description }}
        />
      )}
      {pooja.additionalInfo && (
        <div
          className="rte-content pooja-content text-gray-600 text-sm leading-relaxed mt-4"
          dangerouslySetInnerHTML={{ __html: pooja.additionalInfo }}
        />
      )}
    </div>
  );
}
