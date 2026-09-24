/** Real-world dependencies for the collector; tests inject fakes instead. */
import { readFile } from 'node:fs/promises';
import dns from 'node:dns/promises';
import tls from 'node:tls';

/**
 * c-ares (dns.resolve*) can fail with resolver-level errors (ECONNREFUSED, ESERVFAIL, ETIMEOUT) on hosts
 * whose stub resolver it cannot reach. Fall back to the OS resolver (getaddrinfo) so a resolver quirk is
 * never mistaken for a property failure. ENODATA/ENOTFOUND from c-ares are authoritative answers.
 */
async function resolveWithFallback(host, family, resolve) {
  try {
    return await resolve(host);
  } catch (error) {
    if (error?.code === 'ENODATA' || error?.code === 'ENOTFOUND') throw error;
    try {
      const answers = await dns.lookup(host, { family, all: true });
      return answers.map(item => item.address);
    } catch (lookupError) {
      if (lookupError?.code === 'ENOTFOUND' || lookupError?.code === 'ENODATA') throw lookupError;
      throw error;
    }
  }
}

export function defaultDeps() {
  return {
    fetchImpl: (...args) => fetch(...args),
    resolver: {
      resolve4: host => resolveWithFallback(host, 4, dns.resolve4),
      resolve6: host => resolveWithFallback(host, 6, dns.resolve6),
    },
    tlsInspect: (host, port, timeoutMs) =>
      new Promise((resolve, reject) => {
        const socket = tls.connect({ host, port, servername: host, timeout: timeoutMs }, () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || !cert.valid_to) reject(new Error('no certificate'));
          else resolve({ validTo: cert.valid_to });
        });
        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('tls timeout'));
        });
        socket.on('error', reject);
      }),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    readFile: (path, encoding) => readFile(path, encoding),
    now: () => Date.now(),
  };
}
