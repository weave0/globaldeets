/** Real-world dependencies for the collector; tests inject fakes instead. */
import { readFile } from 'node:fs/promises';
import dns from 'node:dns/promises';
import tls from 'node:tls';

export function defaultDeps() {
  return {
    fetchImpl: (...args) => fetch(...args),
    resolver: { resolve4: host => dns.resolve4(host), resolve6: host => dns.resolve6(host) },
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
