import { useQuery, keepPreviousData } from '@tanstack/react-query';
import API from '../api/axios';
import { langDebug } from '../utils/debugLog';

/**
 * Fetches a blog by slug, optionally in a target language. Backend caches
 * and generates translations on demand (see translationService.js) — this
 * hook only adds the session-level query cache: switching back to a
 * previously-fetched language within the same session is served instantly
 * from react-query's cache instead of a new request.
 *
 * `placeholderData: keepPreviousData` keeps the currently-displayed article
 * on screen while a not-yet-cached language is being generated in the
 * background (`isFetching` flips true) instead of blanking the whole page —
 * only the content itself updates once the translation arrives.
 *
 * @param {string} slug
 * @param {string} lang - ISO 639-1 code, or 'en'/falsy for the English source
 */
export function useTranslatedBlog(slug, lang) {
  const queryKey = ['blog', slug, lang || 'en'];
  return useQuery({
    queryKey,
    queryFn: async () => {
      langDebug('React Query cache miss/fetch — key:', JSON.stringify(queryKey));
      const params = lang && lang !== 'en' ? { lang } : {};
      const { data } = await API.get(`/blogs/${slug}`, { params });
      return data;
    },
    enabled: !!slug,
    placeholderData: keepPreviousData,
  });
}
