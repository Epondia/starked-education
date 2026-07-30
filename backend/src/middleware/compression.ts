import { Request, Response, NextFunction } from 'express';
import zlib from 'zlib';

const COMPRESSIBLE_TYPES = [
  'application/json',
  'text/html',
  'text/css',
  'application/javascript',
  'text/plain',
  'application/xml',
];

const SKIPPED_PREFIXES = ['image/', 'video/', 'audio/'];

const DEFAULT_THRESHOLD = 1024;

const MAX_STATS_ENTRIES = 1000;

interface StatsEntry {
  originalBytes: number;
  compressedBytes: number;
  timeMs: number;
}

const statsEntries: StatsEntry[] = [];

function getEncoding(req: Request): 'br' | 'gzip' | null {
  const acceptEncoding = (req.headers['accept-encoding'] as string) || '';
  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  return null;
}

function shouldCompress(req: Request, res: Response): boolean {
  if (res.getHeader('x-no-compression')) return false;
  const contentType = (res.getHeader('content-type') as string) || '';
  if (!contentType) return false;
  for (const prefix of SKIPPED_PREFIXES) {
    if (contentType.startsWith(prefix)) return false;
  }
  return COMPRESSIBLE_TYPES.some(t => contentType.startsWith(t));
}

function compressBuffer(data: Buffer, encoding: 'br' | 'gzip', level: number, quality: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (encoding === 'br') {
      zlib.brotliCompress(
        data,
        { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality } },
        (err, result) => (err ? reject(err) : resolve(result))
      );
    } else {
      zlib.gzip(data, { level }, (err, result) => (err ? reject(err) : resolve(result)));
    }
  });
}

export interface CompressionOptions {
  level?: number;
  brotliQuality?: number;
  threshold?: number;
}

export function compressionMiddleware(opts: CompressionOptions = {}) {
  const level = opts.level ?? 6;
  const quality = opts.brotliQuality ?? 4;
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  return (req: Request, res: Response, next: NextFunction) => {
    const encoding = getEncoding(req);
    if (!encoding) {
      res.setHeader('Vary', 'Accept-Encoding');
      return next();
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const chunks: Buffer[] = [];

    res.write = function (this: Response, chunk: any, ...args: any[]): boolean {
      if (chunk) chunks.push(Buffer.from(chunk));
      return true;
    } as any;

    res.end = function (this: Response, chunk?: any, ...args: any[]): any {
      res.write = originalWrite;
      res.end = originalEnd;

      if (chunk) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);

      res.setHeader('Vary', 'Accept-Encoding');

      if (!shouldCompress(req, res) || body.length < threshold) {
        return originalEnd(chunk, ...args);
      }

      const start = Date.now();

      compressBuffer(body, encoding, level, quality)
        .then(compressed => {
          const elapsed = Date.now() - start;

          statsEntries.push({
            originalBytes: body.length,
            compressedBytes: compressed.length,
            timeMs: elapsed,
          });
          if (statsEntries.length > MAX_STATS_ENTRIES) {
            statsEntries.shift();
          }

          res.removeHeader('Content-Length');
          res.setHeader('Content-Encoding', encoding);
          originalEnd(compressed);
        })
        .catch(err => {
          console.error('Compression error:', err);
          originalEnd(body);
        });
    } as any;

    next();
  };
}

export function getCompressionStats() {
  const total = statsEntries.reduce(
    (acc, e) => ({
      originalBytes: acc.originalBytes + e.originalBytes,
      compressedBytes: acc.compressedBytes + e.compressedBytes,
      timeMs: acc.timeMs + e.timeMs,
    }),
    { originalBytes: 0, compressedBytes: 0, timeMs: 0 }
  );

  const count = statsEntries.length;

  return {
    enabled: true,
    total_original_bytes: total.originalBytes,
    total_compressed_bytes: total.compressedBytes,
    total_time_ms: total.timeMs,
    compressed_count: count,
    avg_ratio:
      count > 0 && total.originalBytes > 0
        ? Number((total.compressedBytes / total.originalBytes).toFixed(4))
        : 1,
    avg_time_ms: count > 0 ? Number((total.timeMs / count).toFixed(2)) : 0,
  };
}
