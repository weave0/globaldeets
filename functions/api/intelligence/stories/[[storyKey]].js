// GET /api/intelligence/stories
// GET /api/intelligence/stories/:storyKey
// Reader projection of a maintained dossier. Not a second evidence graph.

import {
  listMaintainedStories,
  projectMaintainedStory,
  STORY_MODEL_VERSION,
} from '../../../lib/story-intelligence.js';

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);
const STORY_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function headers(request) {
  const origin = request?.headers?.get('Origin');
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://globaldeets.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    Vary: 'Origin',
  };
}

function json(body, status, request) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

export function storyKeyFrom(params) {
  const raw = params?.storyKey;
  if (raw == null || raw === '') return null;
  const key = Array.isArray(raw) ? (raw.length === 1 ? raw[0] : '') : raw;
  return typeof key === 'string' && STORY_KEY.test(key) ? key : '';
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function onRequestGet({ request, params }) {
  const storyKey = storyKeyFrom(params);
  if (storyKey === null) {
    return json(
      {
        modelVersion: STORY_MODEL_VERSION,
        note: 'A story groups maintained records. It is not an event identity, and headlines are not clustered into it by resemblance.',
        stories: listMaintainedStories(),
      },
      200,
      request
    );
  }
  if (storyKey === '') return json({ error: 'story-not-found' }, 404, request);

  let view;
  try {
    view = projectMaintainedStory(storyKey);
  } catch {
    return json({ error: 'story-unavailable', storyKey }, 500, request);
  }
  if (!view) return json({ error: 'story-not-found', storyKey }, 404, request);
  if (view.graphValid !== true || view.identityMismatch === true || view.rules?.truthScore !== false) {
    return json({ error: 'story-integrity-failed', storyKey }, 500, request);
  }
  return json(view, 200, request);
}
