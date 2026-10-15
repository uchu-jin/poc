import { describe, expect, it } from 'vitest';
import {
  failed,
  initialState,
  loaded,
  refreshStarted,
  select,
  shouldReplace,
  type ViewerState,
} from '../../src/features/viewer/state';
import type { ViewerImage } from '../../src/features/viewer/latestClient';

function image(capturedAt: string, satelliteId = 'himawari9'): ViewerImage {
  return {
    satelliteId,
    satelliteName: 'ひまわり9号',
    capturedAt,
    images: [{ url: `https://slider.cira.colostate.edu/${capturedAt}.png`, width: 688 }],
    credit: { text: 'CSU/CIRA & JMA', linkUrl: null },
  };
}

const A = image('2026-10-14T14:00:00Z');
const B = image('2026-10-14T14:10:00Z');

function okState(img: ViewerImage = A): ViewerState {
  const s = initialState('himawari9');
  return loaded(s, s.requestId, img);
}

describe('state', () => {
  it('初期状態は loading で画像は null', () => {
    expect(initialState('goes-east')).toEqual({
      satelliteId: 'goes-east',
      image: null,
      status: 'loading',
      requestId: 0,
    });
  });

  it('loaded で ok になり画像が入る', () => {
    expect(okState()).toMatchObject({ status: 'ok', image: A });
  });

  it('別の衛星を select すると画像が空になり loading に戻り requestId が進む', () => {
    const s = select(okState(), 'goes-east');
    expect(s).toEqual({ satelliteId: 'goes-east', image: null, status: 'loading', requestId: 1 });
  });

  it('同じ衛星を select しても何も変わらない', () => {
    const s = okState();
    expect(select(s, 'himawari9')).toBe(s);
  });

  it('refreshStarted で requestId が進み、画像と status は変わらない', () => {
    const s = refreshStarted(okState());
    expect(s).toMatchObject({ status: 'ok', image: A, requestId: 1 });
  });

  it('切り替えのあとに、前の衛星の結果が返っても無視する', () => {
    const before = okState();
    const switched = select(before, 'goes-east');
    expect(loaded(switched, before.requestId, B)).toBe(switched);
    expect(failed(switched, before.requestId)).toBe(switched);
  });

  it('refreshStarted のあとに、前の要求の failed が返っても無視する', () => {
    const first = refreshStarted(okState());
    const second = refreshStarted(first);
    const done = loaded(second, second.requestId, B);
    expect(failed(done, first.requestId)).toBe(done);
  });

  it('画像あり・error の状態で同じ撮影日時を loaded すると、画像はそのままで ok になる', () => {
    let s = refreshStarted(okState());
    s = failed(s, s.requestId);
    expect(s.status).toBe('error');
    s = refreshStarted(s);
    const same = image('2026-10-14T14:00:00.000Z');
    const next = loaded(s, s.requestId, same);
    expect(next.status).toBe('ok');
    expect(next.image).toBe(A);
  });

  it('撮影日時が古いものを loaded しても差し替えない', () => {
    let s = refreshStarted(okState(B));
    s = loaded(s, s.requestId, A);
    expect(s.image).toBe(B);
  });

  it('撮影日時が新しいものを loaded すると差し替える', () => {
    let s = refreshStarted(okState(A));
    s = loaded(s, s.requestId, B);
    expect(s.image).toBe(B);
  });

  it('画像がある状態で failed すると画像を残して error', () => {
    let s = refreshStarted(okState());
    s = failed(s, s.requestId);
    expect(s).toMatchObject({ status: 'error', image: A });
  });

  it('画像がない状態で failed すると error で画像は null', () => {
    const s = initialState('himawari9');
    expect(failed(s, s.requestId)).toMatchObject({ status: 'error', image: null });
  });
});

describe('shouldReplace', () => {
  it.each([
    ['画像なし', null, A, true],
    ['新しい', A, B, true],
    ['同じ', A, image('2026-10-14T14:00:00Z'), false],
    ['表記の揺れでも同じ', A, image('2026-10-14T14:00:00.000Z'), false],
    ['古い', B, A, false],
  ])('%s のとき %s', (_label, current, next, expected) => {
    const s = { ...initialState('himawari9'), image: current };
    expect(shouldReplace(s, next)).toBe(expected);
  });
});
