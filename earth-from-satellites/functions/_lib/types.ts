export type { Credit, ImageVariant, LatestImage } from '../../shared/contract';

export type SourceErrorKind = 'upstream' | 'timeout' | 'invalid';

export class SourceError extends Error {
  constructor(
    readonly kind: SourceErrorKind,
    message: string = kind,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export interface SourceDeps {
  fetch: typeof fetch;
  signal: AbortSignal;
  now: Date;
}
