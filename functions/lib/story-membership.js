// Server-owned story membership.
//
// An approved article URL may point at one reviewed story. The match is the
// article URL itself. A similar headline, a shared host, or a feed region is
// not membership. Evaluation fixtures are not members.
//
// This module does not load a dossier. tests/story-membership.test.mjs checks
// that every approved URL is still a reporting origin on that story.

export const STORY_MEMBERSHIP_VERSION = '2026-10-08.1';

const STORY_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The only approved article is the Los Angeles Times report cited as reporting
// in the Santa Ynez dossier. Institutional URLs in that dossier are not
// news-card memberships.
const ARTICLE_MEMBERSHIPS = Object.freeze([
  Object.freeze({
    articleUrl:
      'https://www.latimes.com/environment/story/2026-08-20/judge-allows-controversial-oil-company-continue-pumping',
    storyKey: 'santa-ynez-pipeline',
    reviewedAt: '2026-09-03',
  }),
]);

export function canonicalArticleUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.hash = '';
  return url.href;
}

export function listApprovedArticleMemberships() {
  const seen = new Set();
  const memberships = [];
  for (const entry of ARTICLE_MEMBERSHIPS) {
    const articleUrl = canonicalArticleUrl(entry.articleUrl);
    if (!articleUrl || seen.has(articleUrl) || !STORY_KEY.test(entry.storyKey || '')) continue;
    seen.add(articleUrl);
    memberships.push({
      articleUrl,
      storyKey: entry.storyKey,
      reviewedAt: entry.reviewedAt,
      storyId: `story:${entry.storyKey}`,
      href: `/story/${entry.storyKey}/`,
      membershipVersion: STORY_MEMBERSHIP_VERSION,
    });
  }
  return memberships;
}

export function storyContextForArticleUrl(articleUrl) {
  const canonical = canonicalArticleUrl(articleUrl);
  if (!canonical) return null;
  const entry = listApprovedArticleMemberships().find(item => item.articleUrl === canonical);
  if (!entry) return null;
  return {
    storyId: entry.storyId,
    storyKey: entry.storyKey,
    href: entry.href,
    membershipVersion: entry.membershipVersion,
  };
}

// Drops any story object supplied with the item. Only the approved URL can add one.
export function withStoryMembership(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const next = { ...item };
  delete next.story;
  const story = storyContextForArticleUrl(next.sourceUrl);
  if (story) next.story = story;
  return next;
}
