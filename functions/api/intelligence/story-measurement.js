// POST /api/intelligence/story-measurement
//
// First-party counts for story discovery and reading. The body may name only
// an event and a maintained story key. No article URL, headline, client id,
// or cookie is accepted or stored.

import { STORY_MEMBERSHIP_VERSION } from '../../lib/story-membership.js';
import { listMaintainedStories } from '../../lib/story-intelligence.js';

const ALLOWED_ORIGINS = new Set([
  'https://globaldeets.com',
  'https://www.globaldeets.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);
const EVENTS = new Set(['story-opened', 'story-context-opened']);
const MAX_BODY = 512;

function headers(request) {
  const origin = request?.headers?.get('Origin');
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://globaldeets.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function rejected(status, request) {
  return new Response(JSON.stringify({ error: 'rejected' }), {
    status,
    headers: { ...headers(request), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function onRequestPost({ request }) {
  const origin = request?.headers?.get('Origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return rejected(403, request);

  let text;
  try {
    text = await request.text();
  } catch {
    return rejected(400, request);
  }
  if (text.length > MAX_BODY) return rejected(400, request);

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return rejected(400, request);
  }
  const eventName = body?.event;
  const storyKey = body?.storyKey;
  if (!EVENTS.has(eventName)) return rejected(400, request);
  const known = listMaintainedStories().some(story => story.storyKey === storyKey);
  if (!known) return rejected(400, request);

  console.log(
    JSON.stringify({
      event: 'globaldeets.story.measurement',
      name: eventName,
      storyKey,
      membershipVersion: STORY_MEMBERSHIP_VERSION,
    })
  );
  return new Response(null, { status: 204, headers: headers(request) });
}
