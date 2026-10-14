export interface ImageVariant {
  url: string;
  width: number;
}

export interface Credit {
  text: string;
  url: string;
}

export interface LatestImage {
  satelliteId: string;
  satelliteName: string;
  capturedAt: string;
  images: ImageVariant[];
  credit: Credit;
}

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
}
