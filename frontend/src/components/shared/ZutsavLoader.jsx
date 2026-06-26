import React from 'react';

// ── Zutsav rings SVG (self-contained, no network request needed) ──
function ZutsavRings({ size }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false">
      {/* Outer rings — hexagonal arrangement */}
      <circle cx="60" cy="22" r="14" fill="none" stroke="#FF6B00" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="27" cy="41" r="14" fill="none" stroke="#CC1100" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="93" cy="41" r="14" fill="none" stroke="#F5A800" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="27" cy="79" r="14" fill="none" stroke="#7B2D8B" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="93" cy="79" r="14" fill="none" stroke="#1B8A3C" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="60" cy="98" r="14" fill="none" stroke="#1B5EB3" strokeWidth="6.5" strokeLinecap="round" />
      {/* Center filled circle */}
      <circle cx="60" cy="60" r="14" fill="#CC1100" />
      {/* Z lettermark */}
      <text
        x="60" y="66"
        textAnchor="middle"
        fill="white"
        fontSize="18"
        fontWeight="bold"
        fontFamily="Arial, Helvetica, sans-serif"
        letterSpacing="-0.5"
      >
        Z
      </text>
    </svg>
  );
}

/**
 * ZutsavLoader — primary branded loading component.
 *
 * Props:
 *   size       {number}  Logo diameter in px. Default 56.
 *   fullscreen {boolean} Centers in full viewport. Default false.
 *   message    {string}  Optional text below logo.
 *   overlay    {boolean} Translucent dark backdrop (fullscreen only). Default false.
 */
export default function ZutsavLoader({
  size       = 56,
  fullscreen = false,
  message    = '',
  overlay    = false,
}) {
  const spinning = (
    <div className="zutsav-loader-spin" style={{ display: 'inline-block', lineHeight: 0 }}>
      <ZutsavRings size={size} />
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5 ${
          overlay ? 'bg-black/50 backdrop-blur-sm' : 'bg-white'
        }`}
        role="status"
        aria-label={message || 'Loading'}
      >
        {spinning}
        {message && (
          <p
            className="text-sm text-gray-500 font-medium tracking-wide"
            style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: '1.05rem' }}
          >
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-14 gap-4" role="status" aria-label={message || 'Loading'}>
      {spinning}
      {message && (
        <p className="text-xs text-gray-400 tracking-wide">{message}</p>
      )}
    </div>
  );
}

/**
 * ZutsavLoaderInline — tiny logo for inline / button / drawer contexts.
 * size defaults to 28.
 */
export function ZutsavLoaderInline({ size = 28 }) {
  return (
    <span className="zutsav-loader-spin" style={{ display: 'inline-flex', lineHeight: 0, verticalAlign: 'middle' }} role="status" aria-label="Loading">
      <ZutsavRings size={size} />
    </span>
  );
}
