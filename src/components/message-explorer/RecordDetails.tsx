'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, FileText } from 'lucide-react';
import type { ExplorerMessage } from '@/models/message-explorer';
import { EXPLORER_DISPLAY_CHARACTERS, formatExplorerJson, formatExplorerTimestamp } from '@/utils/message-explorer';

// @group Types : One selected record is inspected without changing its original bytes
interface RecordDetailsProps {
  message: ExplorerMessage | null;
}

// @group Components > RecordDetails : Metadata, original payload, and repeatable headers
export default function RecordDetails({ message }: RecordDetailsProps) {
  const [mode, setMode] = useState<'formatted' | 'raw'>('formatted');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const payload = useMemo(() => {
    if (!message || message.value === null) return { text: '', isJson: false, truncated: false };
    const truncated = message.value.length > EXPLORER_DISPLAY_CHARACTERS;
    const raw = message.value.slice(0, EXPLORER_DISPLAY_CHARACTERS);
    const formatted = mode === 'formatted' && message.encoding.value === 'utf8' && !truncated
      ? formatExplorerJson(raw) : { text: raw, isJson: false };
    return { ...formatted, truncated };
  }, [message, mode]);

  async function copyValue() {
    if (message?.value === null || !message) return;
    try {
      await navigator.clipboard.writeText(message.value);
      setCopyState('copied');
    } catch { setCopyState('error'); }
  }

  if (!message) {
    return (
      <aside aria-label="Record details" className="min-w-0 border-t border-line bg-subtle/50 p-4 lg:border-t-0 lg:border-l">
        <h2 className="text-sm font-semibold text-ink">Record details</h2>
        <div className="flex min-h-44 flex-col items-center justify-center text-center">
          <FileText className="mb-3 h-7 w-7 text-muted" aria-hidden="true" />
          <p className="text-sm text-muted">Select a record to inspect its value, key, and headers.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Record details" className="min-w-0 border-t border-line bg-surface lg:border-t-0 lg:border-l">
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Record details</h2>
          {message.value === null && <span className="dev-badge border-warning/30 bg-warning/5 text-warning">Tombstone</span>}
        </div>
        <dl className="mt-3 grid grid-cols-[76px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted">Topic</dt><dd className="break-all">{message.topic}</dd>
          <dt className="text-muted">Partition</dt><dd>{message.partition}</dd>
          <dt className="text-muted">Offset</dt><dd className="break-all font-mono">{message.offset}</dd>
          <dt className="text-muted">Timestamp</dt><dd className="break-all">{formatExplorerTimestamp(message.timestamp)}</dd>
        </dl>
      </div>

      <section className="border-b border-line px-4 py-3" aria-label="Record key">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-xs font-semibold">Key</h3>
          {message.key !== null && message.encoding.key === 'base64' && <span className="dev-badge">Base64</span>}
        </div>
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5">{message.key === null ? <span className="font-sans text-muted">Null key</span> : message.key === '' ? <span className="font-sans text-muted">Empty string</span> : message.key.slice(0, EXPLORER_DISPLAY_CHARACTERS)}</pre>
        {message.key !== null && message.key.length > EXPLORER_DISPLAY_CHARACTERS && <p className="mt-2 text-xs text-muted">Key preview is truncated. Export includes the full key.</p>}
      </section>

      <section aria-label="Record value" className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><h3 className="text-xs font-semibold">Value</h3>{message.value !== null && message.encoding.value === 'base64' && <span className="dev-badge">Base64</span>}</div>
          <button type="button" className="dev-btn gap-1.5 !min-h-8 !px-2 !py-1 !text-xs" onClick={() => void copyValue()} disabled={message.value === null} aria-label="Copy value">
            {copyState === 'copied' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copyState === 'copied' ? 'Copied' : 'Copy value'}
          </button>
        </div>
        {message.value !== null && message.encoding.value === 'utf8' && (
          <div className="mt-3 flex gap-4 border-b border-line" aria-label="Value display format">
            {(['formatted', 'raw'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className={`border-b-2 px-0 pb-2 text-xs font-medium ${mode === value ? 'border-accent text-accent' : 'border-transparent text-muted'}`}>{value === 'formatted' ? 'Formatted JSON' : 'Raw value'}</button>)}
          </div>
        )}
        {copyState === 'error' && <p role="alert" className="mt-2 text-xs text-danger">Clipboard access is unavailable. Select the raw value to copy it.</p>}
        {message.value === null ? <p className="mt-4 text-sm text-muted">Null value. This record is a tombstone.</p>
          : message.value === '' ? <p className="mt-4 text-sm text-muted">Empty string (0 characters).</p>
            : <pre tabIndex={0} aria-label="Message payload" className="mt-3 max-h-[480px] overflow-auto rounded border border-line bg-subtle p-3 font-mono text-xs leading-5 whitespace-pre-wrap break-all">{payload.text}</pre>}
        {payload.truncated && <p className="mt-2 text-xs text-warning">Preview limited to 256 Ki characters. Copy and export preserve the full value.</p>}
        {'formattingLimited' in payload && payload.formattingLimited && <p className="mt-2 text-xs text-muted">Showing raw JSON because its depth or formatted size exceeds the preview limit.</p>}
        {message.value && message.encoding.value === 'utf8' && mode === 'formatted' && !payload.isJson && !payload.truncated && <p className="mt-2 text-xs text-muted">Value is not JSON. Showing the original text.</p>}
        {message.value !== null && message.encoding.value === 'base64' && <p className="mt-2 text-xs text-muted">Binary value displayed and copied as Base64.</p>}
      </section>

      <section aria-label="Record headers" className="border-t border-line px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold">Headers <span className="ml-1 font-normal text-muted">{Object.keys(message.headers).length}</span></h3>
        {Object.keys(message.headers).length === 0 ? <p className="text-xs text-muted">No headers</p> : <dl className="space-y-3">
          {Object.entries(message.headers).map(([name, values]) => <div key={name}>
            <dt className="break-all font-mono text-xs font-semibold">{name}</dt>
            {(Array.isArray(values) ? values : [values]).map((value, index) => {
              const encodings = message.encoding.headers[name];
              const encoding = Array.isArray(encodings) ? encodings[index] : encodings;
              return <dd key={index} className="mt-1 break-all font-mono text-xs leading-5 text-muted">{value === null ? <span className="font-sans">Null header value</span> : value === '' ? <span className="font-sans">Empty string</span> : value.slice(0, EXPLORER_DISPLAY_CHARACTERS)}{encoding === 'base64' && <span className="dev-badge ml-2 font-sans">Base64</span>}{value !== null && value.length > EXPLORER_DISPLAY_CHARACTERS && <span className="block font-sans text-warning">Header preview is truncated. Export includes the full header.</span>}</dd>;
            })}
          </div>)}
        </dl>}
      </section>
    </aside>
  );
}
