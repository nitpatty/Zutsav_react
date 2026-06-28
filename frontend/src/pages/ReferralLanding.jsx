import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BadgeCheck, MapPin, Star, Clock, Share2, Copy, MessageCircle, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ZutsavLoader from '../components/shared/ZutsavLoader';

const IMG_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function PanditAvatar({ pandit }) {
  if (pandit?.profilePhoto) {
    return (
      <img
        src={`${IMG_BASE}/${pandit.profilePhoto}`}
        alt={pandit.name}
        className="w-28 h-28 rounded-full object-cover border-4 border-white shadow-xl"
      />
    );
  }
  return (
    <div className="w-28 h-28 rounded-full bg-orange-100 border-4 border-white shadow-xl flex items-center justify-center text-5xl">
      🙏
    </div>
  );
}

export default function ReferralLanding() {
  const { token } = useParams();
  const navigate  = useNavigate();
  const { isAuthenticated } = useAuth();

  const [loading,  setLoading]  = useState(true);
  const [referral, setReferral] = useState(null);
  const [error,    setError]    = useState(null);
  const [expired,  setExpired]  = useState(false);
  const [used,     setUsed]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await API.get(`/referral/validate/${token}`);
        setReferral(data.referral);
        // Persist referral context so it survives login, registration, and page navigation
        // within the same browser tab. Cleared by BookingFlow after booking is created.
        try {
          sessionStorage.setItem('zutsav_referral', JSON.stringify({
            token,
            expiresAt: data.referral.expiresAt,
          }));
        } catch { /* storage unavailable — non-fatal */ }
      } catch (err) {
        if (err.response?.data?.expired) {
          setExpired(true);
        } else if (err.response?.data?.alreadyBooked) {
          setUsed(true);
        } else {
          setError(err.response?.data?.message || 'Invalid referral link.');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const pandit = referral?.panditId;
  const pooja  = referral?.poojaId;

  // Build the booking URL — carry referralToken into BookingFlow
  const buildBookingUrl = () => {
    if (!pooja?.slug) return null;
    return `/book/${pooja.slug}?referralToken=${token}`;
  };

  const handleBookNow = () => {
    const url = buildBookingUrl();
    if (!url) {
      // No specific pooja — go to pooja catalogue
      if (isAuthenticated) {
        navigate(`/poojas?referralToken=${token}`);
      } else {
        navigate(`/login?next=${encodeURIComponent(`/poojas?referralToken=${token}`)}`);
      }
      return;
    }
    if (isAuthenticated) {
      navigate(url);
    } else {
      navigate(`/login?next=${encodeURIComponent(url)}`);
    }
  };

  const handleShare = async () => {
    const link = `${window.location.origin}/r/${token}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Zutsav Pooja Booking', text: `Book a pooja with ${pandit?.name} via Zutsav`, url: link });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard!');
    }
  };

  const handleWhatsApp = () => {
    const link = encodeURIComponent(`${window.location.origin}/r/${token}`);
    const text  = encodeURIComponent(`Book a pooja via ${pandit?.name || 'Zutsav'}: ${window.location.origin}/r/${token}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/r/${token}`);
    toast.success('Referral link copied!');
  };

  const daysLeft = referral ? Math.max(0, Math.ceil((new Date(referral.expiresAt) - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  // ── Error states ───────────────────────────────────────────────────
  if (loading) return <ZutsavLoader />;

  if (expired) return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Referral Link Expired</h1>
        <p className="text-gray-500 mb-6">This referral link is no longer valid. Referral links expire after 30 days.</p>
        <Link to="/poojas" className="inline-block bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors">
          Browse Poojas
        </Link>
      </div>
    </div>
  );

  if (used) return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={32} className="text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Referral Already Used</h1>
        <p className="text-gray-500 mb-6">This referral link has already been used for a booking.</p>
        <Link to="/poojas" className="inline-block bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors">
          Browse Poojas
        </Link>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <XCircle size={32} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Invalid Referral Link</h1>
        <p className="text-gray-500 mb-6">{error}</p>
        <Link to="/" className="inline-block bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors">
          Go Home
        </Link>
      </div>
    </div>
  );

  // ── Valid referral ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      {/* Top Zutsav brand bar */}
      <div className="bg-white border-b border-orange-100 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🪔</span>
          <span className="font-bold text-xl" style={{ color: '#1B1F3B', fontFamily: "'Cormorant Garamond', serif" }}>Zutsav</span>
        </Link>
        <span className="text-xs text-gray-500 bg-orange-50 px-3 py-1 rounded-full border border-orange-200">Referral Invitation</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Expiry badge */}
        <div className="flex justify-center">
          <span className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold ${
            daysLeft <= 3 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}>
            <Clock size={14} />
            {daysLeft > 0 ? `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'Expires today'}
          </span>
        </div>

        {/* Pandit card */}
        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          {/* Header gradient */}
          <div className="h-24 bg-gradient-to-r from-orange-400 to-amber-500 relative">
            <div className="absolute -bottom-14 left-1/2 -translate-x-1/2">
              <PanditAvatar pandit={pandit} />
            </div>
          </div>

          <div className="pt-16 pb-6 px-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-gray-800" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                {pandit?.name || 'Pandit'}
              </h1>
              {pandit?.kycStatus === 'approved' && (
                <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                  <BadgeCheck size={11} /> Verified
                </span>
              )}
            </div>

            {pandit?.city && (
              <p className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-3">
                <MapPin size={13} /> {pandit.city}
              </p>
            )}

            {/* Stats row */}
            <div className="flex items-center justify-center gap-6 mb-4">
              {pandit?.experience > 0 && (
                <div className="text-center">
                  <p className="font-bold text-gray-800">{pandit.experience}+</p>
                  <p className="text-xs text-gray-500">Years Exp.</p>
                </div>
              )}
              {pandit?.languages?.length > 0 && (
                <div className="text-center">
                  <p className="font-bold text-gray-800">{pandit.languages.length}</p>
                  <p className="text-xs text-gray-500">Languages</p>
                </div>
              )}
              {pandit?.specializations?.length > 0 && (
                <div className="text-center">
                  <p className="font-bold text-gray-800">{pandit.specializations.length}</p>
                  <p className="text-xs text-gray-500">Specializations</p>
                </div>
              )}
            </div>

            {/* Languages */}
            {pandit?.languages?.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                {pandit.languages.slice(0, 5).map((lang) => (
                  <span key={lang} className="text-xs bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full border border-orange-200">
                    {lang}
                  </span>
                ))}
              </div>
            )}

            {/* Specializations */}
            {pandit?.specializations?.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mb-4">
                {pandit.specializations.slice(0, 4).map((s, i) => (
                  <span key={s._id || s.name || i} className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
                    {s.name || s}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm text-gray-500 italic">
              has personally invited you to book a pooja through Zutsav.
            </p>
          </div>
        </div>

        {/* Recommended pooja */}
        {pooja && (
          <div className="bg-white rounded-2xl shadow p-5 flex gap-4 items-start">
            {pooja.image && (
              <img src={`${IMG_BASE}/${pooja.image}`} alt={pooja.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-orange-600 mb-0.5 uppercase tracking-wide">Recommended Pooja</p>
              <h3 className="font-bold text-gray-800">{pooja.name}</h3>
              {pooja.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{pooja.description}</p>
              )}
              {(pooja.salePrice || pooja.price) && (
                <p className="text-sm font-bold text-green-700 mt-1">
                  ₹{(pooja.salePrice || pooja.price).toLocaleString('en-IN')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Referral note */}
        <div className="bg-gradient-to-r from-orange-100 to-amber-100 rounded-2xl p-4 text-center border border-orange-200">
          <p className="text-sm text-orange-800 font-medium">
            🙏 This is a personal referral from <strong>{pandit?.name}</strong>.
            Your booking will be linked to their referral automatically.
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={handleBookNow}
          className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95"
        >
          Book Now 🪔
        </button>

        {!isAuthenticated && (
          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link
              to={`/login?next=${encodeURIComponent(buildBookingUrl() || `/poojas?referralToken=${token}`)}`}
              className="text-orange-600 font-semibold hover:underline"
            >
              Log in
            </Link>
          </p>
        )}

        {/* Share actions */}
        <div className="bg-white rounded-2xl shadow p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 text-center">Share this referral link</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={handleWhatsApp}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-green-50 border border-green-200 hover:bg-green-100 transition-colors"
            >
              <MessageCircle size={20} className="text-green-600" />
              <span className="text-xs font-semibold text-green-700">WhatsApp</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              <Copy size={20} className="text-gray-600" />
              <span className="text-xs font-semibold text-gray-700">Copy Link</span>
            </button>
            <button
              onClick={handleShare}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              <Share2 size={20} className="text-blue-600" />
              <span className="text-xs font-semibold text-blue-700">Share</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-6">
          Powered by Zutsav — India's Premium Pooja Platform
        </p>
      </div>
    </div>
  );
}
