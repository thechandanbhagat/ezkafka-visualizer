'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Download, Loader2, Search, SearchX, X } from 'lucide-react';
import { useServer } from '@/contexts/ServerContext';
import type { TopicInfo } from '@/lib/kafka';
import type { BrowseMessagesRequest, BrowseMessagesResponse, ExplorerMessage } from '@/models/message-explorer';
import RecordDetails from '@/components/message-explorer/RecordDetails';
import {
  EXPLORER_MAX_RECORDS,
  createExplorerStart,
  explorerRecordId,
  formatExplorerTimestamp,
  matchesExplorerMessage,
  mergeExplorerMessages,
  previewExplorerValue,
  serializeExplorerExport,
} from '@/utils/message-explorer';
import type { ExplorerSearchField, ExplorerStartKind } from '@/utils/message-explorer';

// @group Types : Explorer workspace inputs and finite request state
interface MessageExplorerProps {
  topics: TopicInfo[];
  loading?: boolean;
  connectionError?: string | null;
  initialTopic?: string;
}
type RequestState = 'idle' | 'loading' | 'ready' | 'cancelled' | 'error';

// @group Components > MessageExplorer : Explicit partition browsing with an inspectable retained snapshot
export default function MessageExplorer({ topics, loading = false, connectionError, initialTopic = '' }: MessageExplorerProps) {
  const { selectedProfileId, connectionKey, activeProfile } = useServer();
  const [topic, setTopic] = useState(initialTopic);
  const [partition, setPartition] = useState(0);
  const [startKind, setStartKind] = useState<ExplorerStartKind>('latest');
  const [offset, setOffset] = useState('0');
  const [timestamp, setTimestamp] = useState('');
  const [batchSize, setBatchSize] = useState(50);
  const [messages, setMessages] = useState<ExplorerMessage[]>([]);
  const [result, setResult] = useState<BrowseMessagesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [limitBlocked, setLimitBlocked] = useState(false);
  const [query, setQuery] = useState('');
  const [searchField, setSearchField] = useState<ExplorerSearchField>('all');
  const [exportError, setExportError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const retryAppend = useRef(false);
  const selectedTopic = topics.find(item => item.name === topic);
  const pending = requestState === 'loading';
  const canBrowse = Boolean(selectedProfileId && selectedTopic && partition < selectedTopic.partitions && !loading && !connectionError);
  const matchingMessages = useMemo(() => messages.filter(message => matchesExplorerMessage(message, query, searchField)), [messages, query, searchField]);
  const selectedMessage = matchingMessages.find(message => explorerRecordId(message) === selectedId) || null;
  const atRecordLimit = messages.length >= EXPLORER_MAX_RECORDS;
  const nextAvailable = Boolean(result?.nextCursor && !result.complete && !atRecordLimit && !limitBlocked);

  // @group BusinessLogic > Lifecycle : Invalidate in-flight replies before clearing changed browse scopes
  const resetBrowse = useCallback(() => {
    requestSequence.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setMessages([]);
    setResult(null);
    setSelectedId(null);
    setRequestState('idle');
    setError(null);
    setLimitBlocked(false);
    setQuery('');
    setExportError(null);
  }, []);

  useEffect(() => {
    resetBrowse();
    return () => {
      requestSequence.current += 1;
      controllerRef.current?.abort();
    };
  }, [connectionKey, resetBrowse]);

  useEffect(() => {
    setTopic(initialTopic);
    setPartition(0);
    resetBrowse();
  }, [initialTopic, resetBrowse]);

  useEffect(() => {
    if (!loading && topic && (!selectedTopic || partition >= selectedTopic.partitions)) resetBrowse();
  }, [loading, topic, selectedTopic, partition, resetBrowse]);

  // @group APIEndpoints > Browse : Read a single bounded page and retain the previous cursor until it succeeds
  async function loadMessages(append = false) {
    if (controllerRef.current || !canBrowse || (append && !nextAvailable)) return;
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    retryAppend.current = append;
    setRequestState('loading');
    setError(null);
    setExportError(null);
    if (!append) {
      setMessages([]);
      setResult(null);
      setSelectedId(null);
      setLimitBlocked(false);
    }

    try {
      const request: BrowseMessagesRequest = {
        profileId: selectedProfileId,
        topic,
        partition,
        limit: append ? Math.min(batchSize, EXPLORER_MAX_RECORDS - messages.length) : batchSize,
        ...(append && result?.nextCursor ? { cursor: result.nextCursor } : { start: createExplorerStart(startKind, offset, timestamp) }),
      };
      const response = await fetch('/api/messages/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const data = await response.json();
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || 'Unable to load messages. Try again.');
      if (!Array.isArray(data.messages) || !Array.isArray(data.warnings)) throw new Error('The server returned an invalid browse response. Try again.');
      let retained: ExplorerMessage[];
      try { retained = mergeExplorerMessages(append ? messages : [], data.messages); }
      catch (limitError) {
        setLimitBlocked(true);
        throw limitError;
      }
      setMessages(retained);
      setResult(data as BrowseMessagesResponse);
      setSelectedId(current => current || (retained[0] ? explorerRecordId(retained[0]) : null));
      setRequestState('ready');
    } catch (failure) {
      if (sequence !== requestSequence.current || controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'Unable to load messages. Try again.');
      setRequestState('error');
    } finally {
      if (sequence === requestSequence.current) controllerRef.current = null;
    }
  }

  function cancelLoading() {
    requestSequence.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setRequestState('cancelled');
    setError(null);
  }

  // @group Utilities > Export : Download only the matching records currently retained in this browser
  function exportMessages() {
    let objectUrl: string | null = null;
    try {
      const content = serializeExplorerExport(matchingMessages, { profileId: selectedProfileId, topic, partition, query, searchField });
      objectUrl = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${topic}-partition-${partition}-loaded.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setExportError(null);
    } catch { setExportError('The export could not be created. Try again.'); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Message explorer</h1>
        <span className="dev-badge">Read only</span>
      </header>

      <section aria-label="Browse settings" className="dev-card p-4">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(160px,2fr)_100px_minmax(160px,1fr)_110px_auto]">
          <label className="min-w-0 text-xs font-semibold text-ink">Topic
            <select aria-label="Topic" className="dev-input mt-1.5 w-full font-normal" value={topic} disabled={loading} onChange={event => { resetBrowse(); setTopic(event.target.value); setPartition(0); }}>
              <option value="">{loading ? 'Loading topics…' : 'Choose a topic'}</option>
              {topic && !selectedTopic && <option value={topic}>{topic} (unavailable)</option>}
              {topics.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink">Partition
            <select aria-label="Partition" className="dev-input mt-1.5 w-full font-normal" value={partition} disabled={!selectedTopic} onChange={event => { resetBrowse(); setPartition(Number(event.target.value)); }}>
              {!selectedTopic && <option value={0}>—</option>}
              {Array.from({ length: selectedTopic?.partitions || 0 }, (_, index) => <option key={index} value={index}>{index}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink">Start at
            <select aria-label="Start at" className="dev-input mt-1.5 w-full font-normal" value={startKind} onChange={event => { resetBrowse(); setStartKind(event.target.value as ExplorerStartKind); }}>
              <option value="latest">Recent offsets</option><option value="earliest">Earliest available</option><option value="offset">Exact offset</option><option value="timestamp">Timestamp</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-ink">Batch size
            <select aria-label="Batch size" className="dev-input mt-1.5 w-full font-normal" value={batchSize} onChange={event => { resetBrowse(); setBatchSize(Number(event.target.value)); }}>
              {[25, 50, 100, 200].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="button" className="dev-btn-primary gap-2 whitespace-nowrap" disabled={!canBrowse || pending} onClick={() => void loadMessages()}>
              {pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}Load messages
            </button>
            {pending && <button type="button" aria-label="Cancel loading" className="dev-btn gap-1" onClick={cancelLoading}><X size={14} aria-hidden="true" />Cancel</button>}
          </div>
        </div>

        {(startKind === 'offset' || startKind === 'timestamp') && <div className="mt-4 max-w-sm">
          {startKind === 'offset' ? <label className="block text-xs font-semibold">Offset<input aria-label="Offset" inputMode="numeric" type="text" className="dev-input mt-1.5 w-full font-mono font-normal" value={offset} onChange={event => { resetBrowse(); setOffset(event.target.value); }} /></label>
            : <label className="block text-xs font-semibold">Timestamp<input aria-label="Timestamp" type="datetime-local" step="1" className="dev-input mt-1.5 w-full font-normal" value={timestamp} onChange={event => { resetBrowse(); setTimestamp(event.target.value); }} /><span className="mt-1 block font-normal text-muted">Uses your browser’s local time zone.</span></label>}
        </div>}
        <p className="mt-3 text-xs leading-5 text-muted">{startKind === 'latest' ? `Reads the last ${batchSize} offset positions in this partition. Compacted or deleted records can leave gaps.` : startKind === 'timestamp' ? 'Starts at the first retained record at or after the selected time.' : startKind === 'offset' ? 'Starts at this offset or the next retained record when there is a gap.' : 'Starts at the earliest retained offset in this partition.'} Each browse captures a fixed end offset.</p>
        {connectionError && <p role="alert" className="mt-3 text-sm text-danger">{connectionError}</p>}
        {!loading && !connectionError && topics.length === 0 && <p className="mt-3 text-sm text-muted">No topics are available in this cluster.</p>}
        {!loading && topic && !selectedTopic && <p role="alert" className="mt-3 text-sm text-danger">This topic is no longer available. Choose another topic.</p>}
      </section>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/25 bg-surface px-4 py-3 text-sm text-danger"><span>{error}</span>{!limitBlocked && <button type="button" className="dev-btn" disabled={pending || !canBrowse} onClick={() => void loadMessages(retryAppend.current)}>Retry</button>}</div>}
      {result?.warnings.map((warning, index) => <p key={`${index}-${warning}`} className="rounded-md border border-warning/25 bg-warning/5 px-4 py-3 text-xs leading-5 text-warning">{warning}</p>)}

      <section className="dev-card overflow-hidden" aria-label="Message workspace">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{result || messages.length ? `${topic} / Partition ${partition}` : 'Records'}</h2>
            <p className="mt-1 text-xs text-muted" aria-live="polite">{matchingMessages.length} matching / {messages.length} loaded{activeProfile ? ` in ${activeProfile.name}` : ''}</p>
          </div>
          <button type="button" className="dev-btn gap-2" onClick={exportMessages} disabled={matchingMessages.length === 0}><Download size={14} aria-hidden="true" />Export matching JSON</button>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line bg-subtle/50 px-4 py-2.5">
          <div className="relative min-w-0 flex-1 basis-48"><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input aria-label="Search loaded records" placeholder="Search loaded records" className="dev-input w-full !pl-9" value={query} onChange={event => setQuery(event.target.value)} /></div>
          <select aria-label="Search field" className="dev-input" value={searchField} onChange={event => setSearchField(event.target.value as ExplorerSearchField)}><option value="all">All fields</option><option value="key">Key</option><option value="value">Value</option><option value="headers">Headers</option></select>
        </div>
        {exportError && <p role="alert" className="border-b border-line px-5 py-3 text-xs text-danger">{exportError}</p>}
        <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]">
          <div className="min-w-0">
            {matchingMessages.length > 0 ? <div className="max-h-[700px] overflow-auto">
              <table className="w-full table-fixed text-left text-xs" aria-label="Loaded messages">
                <thead className="sticky top-0 z-10 border-b border-line bg-subtle text-muted"><tr><th scope="col" className="w-[31%] px-4 py-2 font-medium">Offset / Time (UTC)</th><th scope="col" className="w-[24%] px-3 py-2 font-medium">Key</th><th scope="col" className="px-3 py-2 font-medium">Value</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {matchingMessages.map(message => {
                    const id = explorerRecordId(message);
                    const selected = selectedMessage && id === explorerRecordId(selectedMessage);
                    return <tr key={id} className={selected ? 'bg-accent-soft' : 'hover:bg-subtle'}>
                      <td className="px-4 py-2.5 align-top"><button type="button" aria-label={`Inspect offset ${message.offset}`} aria-pressed={Boolean(selected)} className="max-w-full break-all text-left font-mono font-semibold text-accent underline-offset-4 hover:underline" onClick={() => setSelectedId(id)}>{message.offset}</button><span className="mt-1 block text-[11px] leading-4 text-muted">{message.timestamp ? formatExplorerTimestamp(message.timestamp).replace('T', ' ').replace('Z', '') : 'No timestamp'}</span></td>
                      <td className="px-3 py-2.5 align-top"><span className={`block truncate ${message.key === null || message.key === '' ? 'text-muted' : 'font-mono'}`}>{previewExplorerValue(message.key)}</span>{message.key !== null && message.encoding.key === 'base64' && <span className="mt-1 block text-[11px] text-muted">Base64</span>}</td>
                      <td className="px-3 py-2.5 align-top">{message.value === null ? <span className="dev-badge border-warning/30 text-warning">Tombstone</span> : <span className={`block truncate ${message.value === '' ? 'text-muted' : 'font-mono'}`}>{previewExplorerValue(message.value)}</span>}{message.value !== null && message.encoding.value === 'base64' && <span className="mt-1 block text-[11px] text-muted">Base64</span>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div> : <div className="flex min-h-56 flex-col items-center justify-center px-4 py-6 text-center">
              {pending ? <Loader2 size={22} className="mb-3 animate-spin text-accent" aria-hidden="true" /> : <SearchX size={22} className="mb-3 text-muted" aria-hidden="true" />}
              <p className="text-sm font-semibold">{pending ? 'Reading this partition…' : messages.length > 0 ? 'No loaded records match' : requestState === 'cancelled' ? 'Loading cancelled' : requestState === 'error' ? 'Messages could not be loaded' : result ? result.timedOut ? 'No records returned yet' : 'No records in this range' : 'Choose where to start'}</p>
              <p className="mt-2 max-w-sm text-xs leading-5 text-muted">{pending ? 'The request ends at the captured end offset.' : messages.length > 0 ? 'Change the search or field filter. Only loaded records are searched.' : requestState === 'cancelled' ? 'Load messages when you are ready to browse again.' : requestState === 'error' ? 'Review the error above and try again.' : result?.timedOut ? 'The read timed out. Use Next batch to continue from the returned position.' : result ? 'Choose another start position or partition, or load a fresh snapshot.' : 'Select a topic and partition, then load a bounded batch of records.'}</p>
            </div>}
          </div>
          <RecordDetails key={selectedMessage ? explorerRecordId(selectedMessage) : 'empty'} message={selectedMessage} />
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-subtle/50 px-4 py-2.5">
          <div className="min-w-0 text-xs leading-5 text-muted" aria-live="polite">
            {pending ? <p>Loading messages…</p> : requestState === 'cancelled' ? <p>Loading cancelled. Previously loaded records are retained.</p> : result ? <>
              <p>{result.complete ? 'Snapshot complete' : result.timedOut ? 'Read timed out; more offsets may remain' : 'More offsets remain'}{atRecordLimit && !result.complete ? ' · Workspace limit reached' : ''}</p>
              <p className="break-all">Retained start <span className="font-mono text-ink">{result.lowOffset}</span> · Snapshot end <span className="font-mono text-ink">{result.highOffset}</span> (exclusive)</p>
            </> : <p>Up to 1,000 records or 16 MiB per browse. Export includes loaded matching records only.</p>}
            {atRecordLimit && result?.nextCursor && <p className="text-warning">Export these records before starting another browse.</p>}
          </div>
          <button type="button" className="dev-btn gap-2" disabled={!nextAvailable || pending || !canBrowse} onClick={() => void loadMessages(true)}>Next batch<ArrowRight size={14} aria-hidden="true" /></button>
        </footer>
      </section>
    </div>
  );
}
