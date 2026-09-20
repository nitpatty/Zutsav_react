/**
 * Email Render Context
 *
 * One centralized, non-secret context every outbound email render gets:
 * company identity + contact details + policy/website links, so a shared
 * email footer (and an optional transactional CTA) never has to be hardcoded
 * into each mapping's HTML, and no template has to read config/settings
 * itself. Values come from the existing config/settings sources only:
 *
 *   companyName -> settings.platformName   || company.config.name
 *   email       -> settings.contactEmail   || company.config.supportEmail
 *   phone       -> settings.supportPhone   || company.config.supportPhone
 *   privacyUrl  -> company.config.privacyUrl
 *   termsUrl    -> company.config.termsUrl
 *   websiteUrl  -> safe public website (see resolveSafeUrl below)
 *   appUrl      -> safe application URL (for transactional CTAs)
 *
 * Production URL safety (Phase 1, Part B): a template must never emit a
 * localhost link. Candidate URLs are considered in priority order — explicit
 * deployment config (company.websiteUrl / WEBSITE_URL), then runtime settings
 * (deployWebsiteUrl), then the deployment URL fallback (urls.clientUrl). The
 * first candidate that is a real, non-local host wins. If every candidate is
 * localhost/private, it is used ONLY outside production (developer machines);
 * in production the link is omitted (''), keeping the footer website link
 * absent rather than shipping a localhost URL — the caller/report surfaces
 * this as a blocker.
 *
 * The footer/CTA markup is assembled HERE, from trusted config values (each
 * value HTML-escaped), and dropped into a template via the explicit markers
 * below. This keeps the single VariableResolver escaping rule untouched:
 * template HTML is authored content, context values are escaped data. No raw
 * concatenation of user/payload data happens here.
 *
 * Dependency-injectable (`deps`) so the resolver/context can be unit-tested
 * without a database.
 */

const settings = require('../../src/utils/settingsService');
const { company: companyConfig, urls: urlsConfig, env: appEnv } = require('../../src/config');
const { escapeHtml } = require('../variables/VariableResolver');

const FOOTER_MARKER = '<!-- ZUTSAV_EMAIL_FOOTER -->';
const CTA_MARKER = '<!-- ZUTSAV_EMAIL_CTA -->';

const DEFAULT_CTA_PATH = '/my-bookings';
const DEFAULT_CTA_LABEL = 'View My Booking';

/** Is this URL a loopback/private/dev address that must never reach a real customer? */
function isLocalhostUrl(url) {
  if (!url) return false;
  const raw = String(url).trim();
  const host = (() => {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      const m = raw.match(/^(?:https?:\/\/)?([^/:?#]+)/i);
      return m ? m[1].toLowerCase() : '';
    }
  })();
  if (!host) return false;
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '0.0.0.0'
    || host === '::1'
    || host.endsWith('.local');
}

/**
 * Resolve the first safe (non-localhost) candidate, in priority order.
 * Falls back to the first candidate only when NOT in production; in
 * production an all-localhost candidate set resolves to '' (link omitted).
 */
function pickSafeUrl(candidates, production = false) {
  const clean = (candidates || [])
    .filter(Boolean)
    .map((c) => String(c).trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const safe = clean.find((c) => !isLocalhostUrl(c));
  if (safe) return safe;
  return production ? '' : (clean[0] || '');
}

const DEFAULT_DEPS = {
  get: (field, fallback) => settings.get(field, fallback),
  company: companyConfig,
  urls: urlsConfig,
  production: appEnv === 'production',
};

/** Build the footer context object from config/settings (never secrets). */
async function buildFooter(deps = {}) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const company = d.company || {};
  const urls = d.urls || {};
  const get = d.get || DEFAULT_DEPS.get;

  const [platformName, contactEmail, supportPhone, deployWebsiteUrl] = await Promise.all([
    get('platformName', company.name),
    get('contactEmail', company.supportEmail),
    get('supportPhone', company.supportPhone),
    get('deployWebsiteUrl', urls.clientUrl),
  ]);

  return {
    companyName: platformName || company.name || '',
    email: contactEmail || company.supportEmail || '',
    phone: supportPhone || company.supportPhone || '',
    privacyUrl: company.privacyUrl || '',
    termsUrl: company.termsUrl || '',
    websiteUrl: pickSafeUrl([company.websiteUrl, deployWebsiteUrl, urls.clientUrl], d.production),
    appUrl: pickSafeUrl([deployWebsiteUrl, urls.clientUrl], d.production),
  };
}

/** Assemble the shared footer strip (trusted markup, escaped values). */
function buildFooterHtml(footer) {
  const f = footer || {};
  const links = [];
  if (f.websiteUrl) {
    links.push(`<a href="${escapeHtml(f.websiteUrl)}" style="color:#b91c1c;text-decoration:none;font-weight:bold;">${escapeHtml(f.companyName || f.websiteUrl)}</a>`);
  }
  if (f.privacyUrl) {
    links.push(`<a href="${escapeHtml(f.privacyUrl)}" style="color:#6b7280;text-decoration:underline;">Privacy Policy</a>`);
  }
  if (f.termsUrl) {
    links.push(`<a href="${escapeHtml(f.termsUrl)}" style="color:#6b7280;text-decoration:underline;">Terms &amp; Conditions</a>`);
  }

  const contactParts = [];
  if (f.email) {
    contactParts.push(`<a href="mailto:${escapeHtml(f.email)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(f.email)}</a>`);
  }
  if (f.phone) contactParts.push(escapeHtml(f.phone));

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr><td style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#6b7280;">
              ${contactParts.join(' &nbsp;&middot;&nbsp; ')}
            </td></tr>
            ${links.length ? `<tr><td style="padding:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7280;">
              ${links.join(' &nbsp;&middot;&nbsp; ')}
            </td></tr>` : ''}
            <tr><td style="padding:12px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af;">
              You are receiving this transactional email because of activity on your ${escapeHtml(f.companyName || 'account')} account.
            </td></tr>
          </table>`;
}

/**
 * Assemble the optional transactional CTA button. Returns '' when there is
 * no safe application URL (production, unresolvable) — an empty button is
 * never emitted.
 */
function buildCtaHtml(footer, opts = {}) {
  const f = footer || {};
  if (!f.appUrl) return '';
  const path = opts.path || DEFAULT_CTA_PATH;
  const label = opts.label || DEFAULT_CTA_LABEL;
  const href = `${f.appUrl}${path.startsWith('/') ? path : `/${path}`}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:24px 0 4px 0;">
              <tr><td align="center" bgcolor="#b91c1c" style="border-radius:8px;">
                <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
              </td></tr>
            </table>`;
}

/**
 * Attach the render context to a payload.
 * @returns {{ payload: object, footer: object, footerHtml: string, ctaHtml: string }}
 */
async function attach(payload, deps = {}) {
  const footer = await buildFooter(deps);
  return {
    payload: { ...(payload || {}), footer },
    footer,
    footerHtml: buildFooterHtml(footer),
    ctaHtml: buildCtaHtml(footer),
  };
}

/** Replace the footer/CTA markers with the assembled blocks (drop when absent). */
function apply(html, ctx) {
  let out = String(html == null ? '' : html);
  if (ctx && typeof ctx.footerHtml === 'string') {
    out = out.split(FOOTER_MARKER).join(ctx.footerHtml);
  } else {
    out = out.split(FOOTER_MARKER).join('');
  }
  if (ctx && typeof ctx.ctaHtml === 'string') {
    out = out.split(CTA_MARKER).join(ctx.ctaHtml);
  } else {
    out = out.split(CTA_MARKER).join('');
  }
  return out;
}

module.exports = {
  FOOTER_MARKER,
  CTA_MARKER,
  DEFAULT_CTA_PATH,
  DEFAULT_CTA_LABEL,
  isLocalhostUrl,
  pickSafeUrl,
  buildFooter,
  buildFooterHtml,
  buildCtaHtml,
  attach,
  apply,
};
