import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin, ArrowLeft, Clock, Landmark, Tag, ExternalLink, Share2, Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import API from '../api/axios';
import ZutsavLoader from '../components/shared/ZutsavLoader';
import { getImageUrl, handleImageError } from '../config';

export default function TempleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [temple,  setTemple]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [mainImg, setMainImg] = useState(0);

  useEffect(() => {
    setLoading(true);
    setMainImg(0);
    API.get(`/temples/${id}`)
      .then(({ data }) => setTemple(data.temple))
      .catch(() => setTemple(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ZutsavLoader fullscreen size={60} />;

  if (!temple) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--t-bg)' }}>
        <div className="text-center px-4">
          <div className="text-6xl mb-4">🛕</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}>
            {t('temples.notFound', 'Temple not found')}
          </h1>
          <Link to="/temples" className="text-sm font-semibold" style={{ color: 'var(--t-primary)' }}>
            ← {t('temples.backToDirectory', 'Back to Temple Directory')}
          </Link>
        </div>
      </div>
    );
  }

  const images = temple.images?.length ? temple.images : [];
  const gallery = temple.coverImage ? [temple.coverImage, ...images] : images;
  const activeImg = gallery[mainImg] || null;

  const hasCoords = (typeof temple.latitude === 'number' && typeof temple.longitude === 'number') ||
    (temple.latitude && temple.longitude);
  const mapUrl = hasCoords
    ? `https://www.google.com/maps?q=${temple.latitude},${temple.longitude}`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${temple.address}, ${temple.city}, ${temple.state}`)}`;

  const details = [
    { icon: MapPin,  label: t('temples.detailAddress', 'Address'), value: [temple.address, temple.city, temple.state, temple.pincode].filter(Boolean).join(', ') },
    { icon: Clock,   label: t('temples.detailTimings', 'Opening Hours'), value: temple.openingHours },
    { icon: Landmark, label: t('temples.detailDeity', 'Primary Deity'), value: temple.primaryDeity },
    { icon: Tag,     label: t('temples.detailCategory', 'Category'), value: temple.category },
  ].filter((d) => d.value);

  return (
    <div className="min-h-screen" style={{ background: 'var(--t-bg)' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <button onClick={() => navigate('/temples')}
          className="flex items-center gap-2 text-sm font-semibold mb-8 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--t-muted)' }}>
          <ArrowLeft size={16} /> {t('temples.backToDirectory', 'Back to Temple Directory')}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* ── Gallery ── */}
          <div>
            <div className="rounded-3xl overflow-hidden border aspect-[4/3] mb-4 bg-saffron-50" style={{ borderColor: 'var(--t-border)' }}>
              {activeImg
                ? <img src={getImageUrl(activeImg)} alt={temple.name} className="w-full h-full object-cover" onError={handleImageError} />
                : <div className="w-full h-full flex items-center justify-center text-9xl">🛕</div>}
            </div>
            {gallery.length > 1 && (
              <div className="flex gap-3 flex-wrap">
                {gallery.map((img, i) => (
                  <button key={i} onClick={() => setMainImg(i)}
                    className={`w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${i === mainImg ? 'border-saffron-500' : 'border-transparent'}`}>
                    <img src={getImageUrl(img)} alt="" className="w-full h-full object-cover" onError={handleImageError} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Info ── */}
          <div className="space-y-6">
            <div>
              {temple.category && (
                <p className="text-xs font-semibold uppercase tracking-widest mb-2 font-sans" style={{ color: 'var(--t-primary)' }}>
                  {temple.category}
                </p>
              )}
              <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--t-text)', fontFamily: "'Cormorant Garamond', serif" }}>
                {temple.name}
              </h1>
              <div className="flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--t-muted)' }}>
                <MapPin size={14} style={{ color: 'var(--t-primary)' }} />
                <span>{temple.city}{temple.state ? `, ${temple.state}` : ''}</span>
              </div>
              {temple.description && (
                <p className="text-sm leading-relaxed font-sans whitespace-pre-line" style={{ color: 'var(--t-muted)' }}>
                  {temple.description}
                </p>
              )}
            </div>

            {details.length > 0 && (
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--t-border)' }}>
                <div className="px-4 py-2.5 border-b" style={{ background: 'var(--t-surface)', borderColor: 'var(--t-border)' }}>
                  <p className="text-xs font-bold uppercase tracking-wide font-sans" style={{ color: 'var(--t-muted)' }}>
                    {t('temples.detailsTitle', 'Temple Information')}
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--t-border)' }}>
                  {details.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-start gap-3 px-4 py-3">
                      <Icon size={15} style={{ color: 'var(--t-primary)' }} className="mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider font-sans" style={{ color: 'var(--t-muted)' }}>{label}</p>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--t-text)' }}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {hasCoords && (
                <a href={mapUrl} target="_blank" rel="noreferrer"
                  className="btn-primary flex items-center gap-2 font-sans">
                  <MapPin size={14} /> {t('temples.viewOnMap', 'View on Map')} <ExternalLink size={12} />
                </a>
              )}
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: temple.name, url: window.location.href }).catch(() => {});
                  } else {
                    navigator.clipboard?.writeText(window.location.href).then(() => {}).catch(() => {});
                  }
                }}
                className="btn-outline flex items-center gap-2 font-sans">
                <Share2 size={14} /> {t('temples.share', 'Share')}
              </button>
            </div>

            {temple.images?.length === 0 && !temple.coverImage && (
              <p className="text-xs flex items-center gap-1.5 font-sans" style={{ color: 'var(--t-muted)' }}>
                <ImageIcon size={12} /> {t('temples.noGallery', 'No gallery images available')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
