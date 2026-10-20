'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Download, Trash2, Filter, Database, Copy, ChevronDown } from 'lucide-react';
import { useServer } from '@/contexts/ServerContext';
import { ConsumerConfig } from './ConsumerTaskbar';

// @group Types : Component data contracts
interface Message {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

interface ConsumerInstanceProps {
  config: ConsumerConfig;
  connectionError?: string | null;
  active: boolean;
  onClose: () => void;
}

// @group BusinessLogic : Component state and interactions
export default function ConsumerInstance({ config, connectionError, active, onClose }: ConsumerInstanceProps) {
  const { selectedProfileId, connectionKey } = useServer();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConsuming, setIsConsuming] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [droppedMessages, setDroppedMessages] = useState(0);
  const maxMessages = 200;
  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const pollMs = 2000;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<{ id: string; profileId: string; controller: AbortController } | null>(null);
  const generationRef = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  // @group BusinessLogic > Lifecycle : Stop the server before replacing a browser session
  const stopConsuming = useCallback(() => {
    generationRef.current += 1;
    setIsConsuming(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    const generation = generationRef.current;
    session.controller.abort();
    void fetch('/api/messages/consume', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ sessionId: session.id, profileId: session.profileId }),
    }).then(response => {
      if (!response.ok && generation === generationRef.current) setSessionError('Could not confirm session stop. Automatic cleanup will retry.');
    }).catch(() => {
      if (generation === generationRef.current) setSessionError('Could not confirm session stop. Automatic cleanup will retry.');
    });
  }, []);

  const startConsuming = () => {
    if (!selectedProfileId || !active) return;
    stopConsuming();
    const generation = generationRef.current;
    const session = { id: crypto.randomUUID(), profileId: selectedProfileId, controller: new AbortController() };
    sessionRef.current = session;
    setIsConsuming(true);
    setSessionError(null);
    setDroppedMessages(0);
    setMessages([]);

    // Sequential polls cannot race or reorder batches from the same session.
    const poll = async () => {
      try {
        const response = await fetch('/api/messages/consume', {
          method: 'POST',
          signal: session.controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topics: config.selectedTopics,
            sessionId: session.id,
            maxMessages: 100,
            fromBeginning: false,
            profileId: session.profileId,
          })
        });
        const result = await response.json();
        if (generation !== generationRef.current) return;
        if (!response.ok) throw new Error(result.error || 'Unable to load messages');
        if (result.sessionId !== session.id) throw new Error('Unexpected inspection session response');
        setDroppedMessages(result.droppedMessages ?? 0);
        if (result.messages.length > 0) setMessages(prev => [...prev, ...result.messages].slice(-maxMessages));
        timerRef.current = setTimeout(poll, result.bufferedMessages > 0 ? 0 : pollMs);
      } catch (error) {
        if (generation !== generationRef.current) return;
        stopConsuming();
        setSessionError(error instanceof Error ? error.message : 'Unable to load messages');
      }
    };
    void poll();
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const exportMessages = () => {
    const data = JSON.stringify(messages, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kafka-${config.sessionName}-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredMessages = messages.filter(msg =>
    !filterText ||
    msg.value.toLowerCase().includes(filterText.toLowerCase()) ||
    msg.key?.toLowerCase().includes(filterText.toLowerCase()) ||
    msg.topic.toLowerCase().includes(filterText.toLowerCase())
  );

  useEffect(() => {
    stopConsuming();
    setMessages([]);
    setDroppedMessages(0);
    setSessionError(null);
    return stopConsuming;
  }, [connectionKey, config.selectedTopics, stopConsuming]);

  useEffect(() => {
    if (!active) stopConsuming();
  }, [active, stopConsuming]);

  useEffect(() => {
    window.addEventListener('pagehide', stopConsuming);
    return () => window.removeEventListener('pagehide', stopConsuming);
  }, [stopConsuming]);

  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, autoScroll]);

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* @group Presentation : Consumer controls and message stream */}
      <div className="min-h-14 border-b border-line bg-subtle flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 flex-none">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isConsuming ? 'bg-success' : 'bg-muted'}`} title={isConsuming ? 'Consuming' : 'Stopped'}></div>
             <span className="text-xs font-mono text-ink truncate max-w-[150px]">
               {config.sessionName}
             </span>
          </div>
          <div className="w-px h-4 bg-line"></div>
          <span className="text-xs font-mono text-muted truncate max-w-[200px]" title={config.selectedTopics.join(', ')}>
            {config.selectedTopics.length === 1 ? config.selectedTopics[0] : `${config.selectedTopics.length} topics`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
           {!isConsuming ? (
            <button
              onClick={startConsuming}
              className="dev-btn-primary px-3 py-1.5 text-xs flex items-center"
            >
              <Play className="w-3 h-3 mr-1" /> Start
            </button>
          ) : (
            <button
              onClick={stopConsuming}
              className="dev-btn px-3 py-1.5 text-xs border-danger/30 text-danger hover:bg-danger/5 flex items-center"
            >
              <Pause className="w-3 h-3 mr-1" /> Stop
            </button>
          )}

          <div className="relative ml-2">
            <Filter className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted" />
            <input
              aria-label="Filter messages"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter messages..."
              className="w-40 dev-input pl-8 pr-2 py-2 text-xs"
            />
          </div>

          <button onClick={clearMessages} className="p-2 rounded-md text-muted hover:text-danger ml-1" title="Clear view" aria-label="Clear messages">
             <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button onClick={exportMessages} disabled={messages.length === 0} className="p-2 rounded-md text-muted hover:text-accent disabled:opacity-50" title="Export JSON" aria-label="Export messages as JSON">
             <Download className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-line mx-1"></div>

          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-muted hover:text-ink transition-colors">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded-md bg-subtle border-line text-accent focus:ring-accent focus:ring-1 focus:ring-offset-0"
            />
            Auto-scroll
          </label>
          <button onClick={onClose} className="p-2 rounded-md text-muted hover:text-ink" title="Minimize consumer" aria-label="Minimize consumer">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-line text-xs text-muted">Showing the latest {maxMessages} received messages. Inspection uses an isolated group and never commits offsets.</div>
      {droppedMessages > 0 && <div role="alert" className="px-4 py-2 border-b border-line text-xs text-danger">This session exceeded its buffer limit: {droppedMessages.toLocaleString()} records were skipped. They remain in Kafka.</div>}
      {sessionError && <div role="alert" className="px-4 py-2 border-b border-line text-xs text-danger">{sessionError}</div>}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-surface">
        {connectionError ? (
           <div className="flex flex-col items-center justify-center h-full text-danger">
             <span className="text-sm font-semibold">Connection unavailable</span>
             <span className="text-xs mt-2">{connectionError}</span>
           </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted min-h-[200px]">
            {isConsuming ? (
              <>
                <div className="w-6 h-6 rounded-full border-2 border-line border-t-accent animate-spin mb-3"></div>
                <p className="text-xs font-semibold text-accent">Listening for messages...</p>
              </>
            ) : (
              <>
                <Database className="w-6 h-6 text-muted mb-2" />
                <p className="text-xs font-semibold text-muted">Start consuming to view messages</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMessages.map((message, index) => (
              <div key={index} className="p-4 rounded-lg border border-line bg-surface">
                <div className="flex items-start justify-between gap-3 mb-3 border-b border-line pb-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="font-mono text-ink break-all">{message.topic}</span>
                    <span>Partition {message.partition}</span>
                    <span>Offset {message.offset}</span>
                    <span className="text-muted">{new Date(message.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <button
                    className="p-1 rounded text-muted hover:text-accent"
                    title="Copy value"
                    aria-label="Copy message value"
                    onClick={async () => { try { await navigator.clipboard.writeText(message.value); } catch {} }}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>

                {message.key && (
                  <div className="mb-2 text-xs font-mono text-muted break-all">
                    <span className="text-xs font-semibold text-muted mr-2">Key:</span>{message.key}
                  </div>
                )}

                <div className="text-xs font-mono leading-relaxed text-ink overflow-x-auto whitespace-pre custom-scrollbar">
{(() => {
try {
  const parsed = JSON.parse(message.value);
  return JSON.stringify(parsed, null, 2);
} catch {
  return message.value;
}
})()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
