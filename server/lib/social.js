import { config } from '../config.js';

const PLATFORM_DOMAINS = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  youtube: ['youtube.com', 'youtu.be'],
  linkedin: ['linkedin.com'],
};

function normalizeHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

// Placeholder values that point back at our own site are skipped until a real
// profile URL is configured for the platform.
export function isRealSocialUrl(key, raw) {
  const host = normalizeHost(raw);
  if (!host) return false;
  if (host === normalizeHost(config.siteUrl)) return false;
  return (PLATFORM_DOMAINS[key] || []).some((domain) => host === domain || host.endsWith(`.${domain}`));
}
