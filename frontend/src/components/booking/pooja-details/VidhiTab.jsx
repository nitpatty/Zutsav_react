import React from 'react';

export default function VidhiTab({ pooja }) {
  return (
    <div>
      <h3 className="font-bold text-gray-900 text-xl mb-4" style={{ fontFamily:"'Cormorant Garamond',serif" }}>
        Puja Vidhi
      </h3>
      {pooja.vidhi ? (
        <div
          className="rte-content pooja-content text-gray-600 text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: pooja.vidhi }}
        />
      ) : (
        <p className="text-sm text-gray-400">Your assigned pandit will guide the complete ceremony procedure (vidhi) on the day of the puja.</p>
      )}
    </div>
  );
}
