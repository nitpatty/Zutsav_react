/**
 * Maps GET /api/pandits/me/ratings (pandit.controller.js → getRatingHistory) to
 * what the Customer Reviews screen renders.
 *
 * Real response:
 *   { success, ratings: [{ _id, bookingNumber, poojaId: { name }, scheduledDate,
 *       rating, review, ratingDate, completedAt }], averageRating, totalReviews }
 *
 * The endpoint deliberately does NOT return the customer (no userId/name), and
 * this mapper never invents one — reviews are identified by pooja + date.
 * Mirrors the working Earnings → Reviews tab (`r.review`, `r.ratingDate || r.completedAt`).
 */
export function mapRatingHistory(body) {
  const src = body?.data && !body.ratings ? body.data : body; // tolerate a {data:{…}} wrapper
  const list = Array.isArray(src?.ratings) ? src.ratings : [];

  const reviews = list
    .filter((r) => r && typeof r === 'object')
    .map((r, i) => ({
      id: r._id || r.bookingNumber || `rating-${i}`,
      rating: Math.min(5, Math.max(0, Math.round(Number(r.rating) || 0))),
      review: typeof r.review === 'string' ? r.review.trim() : '',
      date: r.ratingDate || r.completedAt || null,
      poojaName: r.poojaId?.name || '',
    }));

  return {
    reviews,
    averageRating: Number(src?.averageRating) || 0,
    // null/undefined/garbage → fall back to the rows we actually have (Number(null) is 0, so check explicitly)
    totalReviews: src?.totalReviews != null && Number.isFinite(Number(src.totalReviews)) ? Number(src.totalReviews) : reviews.length,
  };
}
