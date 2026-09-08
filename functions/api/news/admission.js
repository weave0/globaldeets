// Cloudflare Pages Function - GET /api/news/admission
import { SOURCE_FINGERPRINT } from '../news.js';
import {
  ADMISSION_FINGERPRINT,
  ADMISSION_REVIEW_DATE,
  SOURCE_ADMISSIONS,
  SOURCE_RESEARCH_CANDIDATES,
  admissionSummary,
  validateSourceAdmissions,
} from '../../lib/news-source-admission.js';

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

const BASE_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=3600',
};

function getCorsHeaders(request) {
  const origin = request?.headers?.get('Origin');
  return {
    ...BASE_HEADERS,
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://globaldeets.com',
    Vary: 'Origin',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function onRequestGet({ request }) {
  const validation = validateSourceAdmissions();
  return new Response(
    JSON.stringify({
      sourceFingerprint: SOURCE_FINGERPRINT,
      admissionFingerprint: ADMISSION_FINGERPRINT,
      reviewedAt: ADMISSION_REVIEW_DATE,
      validation,
      summary: admissionSummary(),
      liveAdmissions: SOURCE_ADMISSIONS,
      researchCandidates: SOURCE_RESEARCH_CANDIDATES,
      rules: {
        newSourcesRequireReviewedAdmission: true,
        legacyUnreviewedMayRemainTemporarily: true,
        endpointAuthorityIsUsagePermission: false,
        feedHealthIsUsagePermission: false,
        itemRestrictionsOverrideSourcePermission: true,
        admissionMetadataChangesNewsCacheIdentity: false,
      },
    }),
    { headers: getCorsHeaders(request) }
  );
}
