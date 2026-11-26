import { buildDiscovery } from '../../lib/source-discovery.js';

export async function onRequestGet() {
  const data = buildDiscovery();
  return new Response(JSON.stringify(data || {error:'discovery-registry-unavailable',validation:{valid:false}}), {
    status:data ? 200 : 503,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','CDN-Cache-Control':'no-store'},
  });
}
