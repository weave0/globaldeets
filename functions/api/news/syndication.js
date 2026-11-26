// GD-054: live-only authority, deliberately outside the cached news payload.
import { SOURCE_FINGERPRINT } from '../news.js';
import { validateSourceProvenance } from '../../lib/news-source-provenance.js';
import { distributionPayload } from '../../lib/article-distribution.js';

export async function onRequestGet() {
  const payload = validateSourceProvenance().valid ? distributionPayload(SOURCE_FINGERPRINT) : null;
  return new Response(JSON.stringify(payload || {
    error: 'article-distribution-evidence-unavailable', validation: { valid: false },
  }), {
    status: payload ? 200 : 503,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
    },
  });
}
