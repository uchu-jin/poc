import { useState, type FormEvent } from 'react';
import { SyncNotFound, type SyncApi } from '../hooks/useSync';
import { formatCode, normalizeCode } from '../lib/sync';

const time = (at: number) =>
  new Date(at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

export function SyncPanel({ sync }: { sync: SyncApi }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const run = async (task: () => Promise<void>, message: string) => {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof SyncNotFound
          ? 'この同期コードは見つかりませんでした。コードを確かめてください。'
          : message,
      );
    } finally {
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(input);
    if (!code) {
      setError('同期コードは英数字16文字です。');
      return;
    }
    if (
      !window.confirm(
        'この端末のサイト一覧を、同期コードに保存されている一覧に置き換えます。よろしいですか？',
      )
    )
      return;
    void run(async () => {
      await sync.join(code);
      setInput('');
    }, 'サーバーにつながりませんでした。通信状況を確かめて、もう一度お試しください。');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatCode(sync.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピーできない環境では、表示されたコードを手で写してもらう
    }
  };

  if (!sync.code) {
    return (
      <section className="panel sync-panel">
        <h3>ほかの端末と同期</h3>
        <p className="muted small">
          同期コードを使うと、ほかの端末やブラウザでも同じサイト一覧を使えます。登録は要りません。
        </p>
        {sync.lost && (
          <p className="form-message is-error">
            同期コードの保存内容がサーバーから削除されたため、同期をやめました。
          </p>
        )}
        <div className="sync-actions">
          <button
            className="primary-btn"
            disabled={busy}
            onClick={() =>
              void run(sync.start, '同期を始められませんでした。時間をおいてお試しください。')
            }
          >
            同期を始める
          </button>
          <form className="sync-join" onSubmit={join}>
            <input
              type="text"
              placeholder="ほかの端末の同期コード"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="同期コード"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="ghost-btn" type="submit" disabled={busy || !input.trim()}>
              この端末で使う
            </button>
          </form>
        </div>
        {error && <p className="form-message is-error">{error}</p>}
      </section>
    );
  }

  return (
    <section className="panel sync-panel">
      <h3>ほかの端末と同期</h3>
      <div className="sync-code-row">
        <code className="sync-code" translate="no">
          {formatCode(sync.code)}
        </code>
        <button className="ghost-btn small-btn" onClick={() => void copy()}>
          {copied ? 'コピーしました' : 'コピー'}
        </button>
      </div>
      <p className="muted small">
        ほかの端末の「サイト管理」でこのコードを入れると、同じサイト一覧になります。コードを知っている人は誰でも一覧を見たり変えたりできるので、人に教えないでください。
      </p>
      <p className={`sync-status is-${sync.status}`} role="status">
        {sync.status === 'loading' && '読み込み中…'}
        {sync.status === 'saving' && '保存中…'}
        {sync.status === 'synced' && `同期済み${sync.syncedAt ? `(${time(sync.syncedAt)})` : ''}`}
        {sync.status === 'error' && (
          <>
            同期できませんでした。
            <button className="link-btn" onClick={sync.retry}>
              もう一度試す
            </button>
          </>
        )}
      </p>
      <div className="sync-actions">
        <button className="ghost-btn small-btn" disabled={busy} onClick={sync.stop}>
          この端末の同期をやめる
        </button>
        <button
          className="link-btn danger-link"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'サーバーに保存した一覧を削除します。このコードを使っているほかの端末も同期できなくなります。よろしいですか？',
              )
            )
              void run(sync.destroy, '削除できませんでした。時間をおいてお試しください。');
          }}
        >
          サーバーから削除
        </button>
      </div>
      {error && <p className="form-message is-error">{error}</p>}
    </section>
  );
}
