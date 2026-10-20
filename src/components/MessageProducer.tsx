'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Send, MessageSquare, Plus, X, FileJson, Check, AlertCircle, Code, Eye, RefreshCw, Clock, Copy, Eraser, Minimize2, Info } from 'lucide-react';
import { useServer } from '@/contexts/ServerContext';

// @group Types : Component data contracts
interface MessageProducerProps {
  topics: string[];
  connectionError?: string | null;
}

interface PreviewMessage {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

// @group BusinessLogic : Component state and interactions
export default function MessageProducer({ topics, connectionError }: MessageProducerProps) {
  const { selectedProfileId, activeProfile, connectionKey } = useServer();
  const [selectedTopic, setSelectedTopic] = useState('');
  const [messageKey, setMessageKey] = useState('');
  const [messageValue, setMessageValue] = useState('');
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSentMessage, setLastSentMessage] = useState<string | null>(null);
  const [isValidJson, setIsValidJson] = useState(true);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isJsonMode, setIsJsonMode] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDropped, setPreviewDropped] = useState(0);
  const maxMessageSize = activeProfile?.settings.maxMessageSize ?? 1048576;
  const [copied, setCopied] = useState(false);
  const exitEditorRef = useRef(false);
  const topicProfileRef = useRef(selectedProfileId);
  const previewSessionRef = useRef<{ id: string; profileId: string; controller: AbortController } | null>(null);
  const previewGenerationRef = useRef(0);

  // @group Validation : Validate and format message JSON
  const validateJson = (value: string) => {
    if (!isJsonMode || !value.trim()) {
      setIsValidJson(true);
      setJsonError(null);
      return;
    }

    try {
      JSON.parse(value);
      setIsValidJson(true);
      setJsonError(null);
    } catch (error) {
      setIsValidJson(false);
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  };

  const formatJson = () => {
    if (!messageValue.trim() || !isJsonMode) return;

    try {
      const parsed = JSON.parse(messageValue);
      const formatted = JSON.stringify(parsed, null, 2);
      setMessageValue(formatted);
      setIsValidJson(true);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON - cannot format');
    }
  };

  const minifyJson = () => {
    if (!messageValue.trim() || !isJsonMode) return;
    try {
      const parsed = JSON.parse(messageValue);
      const minified = JSON.stringify(parsed);
      setMessageValue(minified);
      setIsValidJson(true);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid JSON - cannot minify');
    }
  };

  const handleMessageValueChange = (value: string) => {
    setMessageValue(value);
    validateJson(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      exitEditorRef.current = true;
      return;
    }
    if (e.key === 'Tab' && (exitEditorRef.current || !isJsonMode)) {
      exitEditorRef.current = false;
      return;
    }
    exitEditorRef.current = false;

    // Auto-format JSON with Ctrl+Shift+F
    if (e.ctrlKey && e.shiftKey && e.key === 'F' && isJsonMode) {
      e.preventDefault();
      formatJson();
    }

    // Enhanced tab behavior for JSON
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (e.shiftKey) {
        // Shift+Tab: Remove indentation
        const lines = messageValue.split('\n');
        const startLine = messageValue.substring(0, start).split('\n').length - 1;
        const endLine = messageValue.substring(0, end).split('\n').length - 1;

        for (let i = startLine; i <= endLine; i++) {
          if (lines[i].startsWith('  ')) {
            lines[i] = lines[i].substring(2);
          }
        }

        const newValue = lines.join('\n');
        setMessageValue(newValue);
        validateJson(newValue);
      } else {
        // Tab: Add indentation
        const lines = messageValue.split('\n');
        const startLine = messageValue.substring(0, start).split('\n').length - 1;
        const endLine = messageValue.substring(0, end).split('\n').length - 1;

        for (let i = startLine; i <= endLine; i++) {
          lines[i] = '  ' + lines[i];
        }

        const newValue = lines.join('\n');
        setMessageValue(newValue);
        validateJson(newValue);
      }
    }
  };

  const addHeader = () => {
    if (newHeaderKey.trim() && newHeaderValue.trim()) {
      setHeaders(prev => ({
        ...prev,
        [newHeaderKey]: newHeaderValue,
      }));
      setNewHeaderKey('');
      setNewHeaderValue('');
    }
  };

  const byteLength = (str: string) => new TextEncoder().encode(str).length;
  const valueBytes = byteLength(messageValue || '');
  const totalBytes = valueBytes; // Kafka max.message.bytes applies to the record value payload commonly; keys/headers are small
  const sizePercent = Math.min(100, Math.round((totalBytes / maxMessageSize) * 100));

  const removeHeader = (key: string) => {
    setHeaders(prev => {
      const newHeaders = { ...prev };
      delete newHeaders[key];
      return newHeaders;
    });
  };

  // @group APIEndpoints : Publish messages and load previews
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopic || !messageValue.trim()) return;
    if (totalBytes > maxMessageSize) {
      setLastSentMessage(`Error: Message is ${totalBytes.toLocaleString()} bytes, exceeds limit of ${maxMessageSize.toLocaleString()} bytes`);
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: selectedTopic,
          key: messageKey || undefined,
          profileId: selectedProfileId,
          value: messageValue,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to send message');
      }

  const result = await response.json();
  setLastSentMessage(typeof result?.message === 'string' ? result.message : 'Message sent successfully');

      // Reset form
  setMessageKey('');
  setMessageValue('');
  setHeaders({});
    } catch (error) {
      console.error('Failed to send message:', error);
      setLastSentMessage(error instanceof Error ? `Error: ${error.message}` : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const generateSampleMessage = () => {
    const samples = [
      '{"userId": 12345, "action": "page_view", "timestamp": "' + new Date().toISOString() + '", "page": "/dashboard"}',
      '{"orderId": "ORD-789", "customerId": "CUST-456", "amount": 99.99, "currency": "USD", "items": [{"sku": "ITEM-001", "quantity": 2}]}',
      '{"level": "info", "message": "User authentication successful", "userId": 98765, "timestamp": "' + new Date().toISOString() + '"}',
      '{"temperature": 23.5, "humidity": 65, "location": "sensor-01", "timestamp": "' + new Date().toISOString() + '"}',
      '{"eventType": "user_signup", "email": "user@example.com", "source": "web", "timestamp": "' + new Date().toISOString() + '"}'
    ];
    const sampleValue = samples[Math.floor(Math.random() * samples.length)];
    setMessageValue(sampleValue);
    if (isJsonMode) {
      validateJson(sampleValue);
    }
  };

  // @group BusinessLogic > Preview : A one-shot isolated sample always releases its consumer
  const cancelPreview = useCallback(() => {
    previewGenerationRef.current += 1;
    const session = previewSessionRef.current;
    previewSessionRef.current = null;
    if (!session) return;
    session.controller.abort();
    void fetch('/api/messages/consume', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ sessionId: session.id, profileId: session.profileId }),
    }).catch(() => undefined);
  }, []);

  const fetchPreviewMessages = useCallback(async () => {
    if (!selectedTopic || !selectedProfileId || topicProfileRef.current !== selectedProfileId) return;
    cancelPreview();
    const generation = previewGenerationRef.current;
    const session = { id: crypto.randomUUID(), profileId: selectedProfileId, controller: new AbortController() };
    previewSessionRef.current = session;
    setLoadingPreview(true);
    setPreviewError(null);
    setPreviewDropped(0);
    setPreviewMessages([]);
    try {
      const response = await fetch('/api/messages/consume', {
        method: 'POST',
        signal: session.controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topics: [selectedTopic],
          sessionId: session.id,
          fromBeginning: true,
          maxMessages: 10,
          profileId: session.profileId,
        })
      });
      const result = await response.json();
      if (generation !== previewGenerationRef.current) return;
      if (!response.ok) throw new Error(result.error || 'Unable to load preview');
      if (result.sessionId !== session.id) throw new Error('Unexpected inspection session response');
      setPreviewMessages(result.messages);
      setPreviewDropped(result.droppedMessages ?? 0);
    } catch (error) {
      if (generation === previewGenerationRef.current) setPreviewError(error instanceof Error ? error.message : 'Unable to load preview');
    } finally {
      try {
        const response = await fetch('/api/messages/consume', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ sessionId: session.id, profileId: session.profileId }),
        });
        if (!response.ok) throw new Error('Could not confirm preview cleanup. Automatic cleanup will retry.');
      } catch {
        if (generation === previewGenerationRef.current) setPreviewError('Could not confirm preview cleanup. Automatic cleanup will retry.');
      }
      if (generation === previewGenerationRef.current) {
        previewSessionRef.current = null;
        setLoadingPreview(false);
      }
    }
  }, [selectedTopic, selectedProfileId, cancelPreview]);

  useEffect(() => {
    cancelPreview();
    setSelectedTopic('');
    setPreviewMessages([]);
    setLastSentMessage(null);
  }, [connectionKey, cancelPreview]);

  // @group BusinessLogic > Lifecycle : Selection changes and unmount discard late responses
  useEffect(() => {
    setPreviewMessages([]);
    setPreviewError(null);
    setLoadingPreview(false);
    if (showPreview && selectedTopic) void fetchPreviewMessages();
    return cancelPreview;
  }, [selectedTopic, showPreview, fetchPreviewMessages, cancelPreview]);

  useEffect(() => {
    window.addEventListener('pagehide', cancelPreview);
    return () => window.removeEventListener('pagehide', cancelPreview);
  }, [cancelPreview]);

  return (
    <div className="space-y-4">
      {/* @group Presentation : Page header and workspace controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink tracking-tight">Message producer</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            aria-pressed={showPreview}
            className="dev-btn inline-flex items-center"
          >
            <Eye className="w-4 h-4 mr-2 text-accent" /> {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
      </div>

      {connectionError ? (
        <div className="text-center px-4 py-10 dev-card">
          <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6 text-danger" />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-2">Connection unavailable</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Unable to connect to the Kafka server.
          </p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center px-4 py-10 dev-card">
          <div className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-6 h-6 text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-2">No topics available</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Create a topic first to start sending messages.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="dev-card">
            <form onSubmit={handleSendMessage} className="p-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
            {/* Topic Selection */}
            <div className="space-y-1.5">
              <label htmlFor="producer-topic" className="block text-sm font-medium text-ink">
                Topic <span className="text-muted" aria-hidden="true">*</span>
              </label>
              <select
                id="producer-topic"
                value={selectedTopic}
                onChange={(e) => { topicProfileRef.current = selectedProfileId; setSelectedTopic(e.target.value); }}
                className="w-full dev-input font-mono"
                required
              >
                <option value="">Choose a topic...</option>
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>

            {/* Message Key */}
            <div className="space-y-1.5">
              <label htmlFor="producer-key" className="block text-sm font-medium text-ink">
                Message key <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                id="producer-key"
                type="text"
                value={messageKey}
                onChange={(e) => setMessageKey(e.target.value)}
                placeholder="Enter message key"
                className="w-full dev-input font-mono"
              />
            </div>
            </div>

            {/* Message Value */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="producer-value" className="block text-sm font-medium text-ink">
                  Message value <span className="text-muted" aria-hidden="true">*</span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {/* JSON/Text Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsJsonMode(!isJsonMode)}
                    aria-pressed={isJsonMode}
                    className={`dev-btn py-1 px-3 inline-flex items-center text-xs ${
                      isJsonMode
                        ? 'border-accent/40 text-accent bg-accent-soft'
                        : ''
                    }`}
                  >
                    <FileJson className="w-3.5 h-3.5 mr-1.5" />
                    {isJsonMode ? 'JSON mode' : 'Text mode'}
                  </button>

                  {/* Format JSON Button */}
                  {isJsonMode && (
                    <button
                      type="button"
                      onClick={formatJson}
                      disabled={!messageValue.trim() || !isValidJson}
                      className="dev-btn py-1 px-3 inline-flex items-center text-xs disabled:opacity-50"
                    >
                      <Code className="w-3.5 h-3.5 mr-1.5" />
                      Format
                    </button>
                  )}

                  {/* Minify JSON Button */}
                  {isJsonMode && (
                    <button
                      type="button"
                      onClick={minifyJson}
                      disabled={!messageValue.trim() || !isValidJson}
                      className="dev-btn py-1 px-3 inline-flex items-center text-xs disabled:opacity-50"
                    >
                      <Minimize2 className="w-3.5 h-3.5 mr-1.5" />
                      Minify
                    </button>
                  )}

                  {/* Generate Sample Button */}
                  <button
                    type="button"
                    onClick={generateSampleMessage}
                    className="dev-btn py-1 px-3 inline-flex items-center text-xs border-line text-accent hover:border-accent hover:bg-accent-soft"
                  >
                    <FileJson className="w-3.5 h-3.5 mr-1.5" />
                    Sample
                  </button>

                  {/* Copy & Clear */}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(messageValue);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1200);
                      } catch {}
                    }}
                    disabled={!messageValue}
                    className="dev-btn py-1 px-3 inline-flex items-center text-xs disabled:opacity-50"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageValue('')}
                    disabled={!messageValue}
                    className="dev-btn py-1 px-3 inline-flex items-center text-xs disabled:opacity-50 border-danger/30 text-danger hover:border-danger hover:bg-danger/5"
                  >
                    <Eraser className="w-3.5 h-3.5 mr-1.5" /> Clear
                  </button>
                </div>
              </div>

              {/* JSON Validation Status */}
              {isJsonMode && messageValue.trim() && (
                <div id="producer-validation" role="status" className={`flex items-center space-x-1.5 text-xs font-medium ${
                  isValidJson
                    ? 'text-success'
                    : 'text-danger'
                }`}>
                  {isValidJson ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Valid JSON</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span>Invalid JSON: {jsonError}</span>
                    </>
                  )}
                </div>
              )}

              {/* Enhanced Textarea with JSON Features */}
              <div className="relative group">
                <textarea
                  id="producer-value"
                  aria-invalid={isJsonMode && !!messageValue.trim() && !isValidJson}
                  aria-describedby={isJsonMode && messageValue.trim() ? 'producer-keyboard-hint producer-validation' : 'producer-keyboard-hint'}
                  value={messageValue}
                  onChange={(e) => handleMessageValueChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isJsonMode
                    ? '{\n  "key": "value",\n  "timestamp": "' + new Date().toISOString() + '"\n}'
                    : "Enter message content"
                  }
                  rows={10}
                  className={`w-full dev-input font-mono text-sm leading-relaxed resize-y min-h-64 ${
                    isJsonMode && messageValue.trim() && !isValidJson
                      ? '!border-danger focus:!border-danger'
                      : ''
                  }`}
                  style={{
                    lineHeight: '1.5',
                    tabSize: 2,
                  }}
                  spellCheck={false}
                  required
                />

              </div>

              <p id="producer-keyboard-hint" className="text-xs text-muted">
                {isJsonMode ? 'Ctrl+Shift+F to format. Press Escape, then Tab to leave the editor.' : 'Enter the message exactly as it should be published.'}
              </p>

              {/* Size meter & limit info */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-28 h-1 rounded-full bg-line overflow-hidden">
                    <div
                      className={`${totalBytes > maxMessageSize ? 'bg-danger' : 'bg-success'} h-full transition-all duration-300 ease-out`}
                      style={{ width: `${sizePercent}%` }}
                    />
                  </div>
                  <span>{totalBytes.toLocaleString()} / {maxMessageSize.toLocaleString()} bytes</span>
                </div>
                <div className="flex items-center gap-1 text-muted" title="Maximum message size allowed by current settings">
                  <Info className="w-3 h-3" />
                  <span>Maximum payload size</span>
                </div>
              </div>
            </div>

            {/* Headers Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="block text-sm font-medium text-ink">
                  Headers <span className="text-muted font-normal">(optional)</span>
                </h2>
                <FileJson className="w-4 h-4 text-muted" />
              </div>

              {/* Existing Headers */}
              {Object.entries(headers).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-3 p-3 bg-subtle border border-line">
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="text-xs font-mono text-ink truncate">{key}</div>
                        <div className="text-xs font-mono text-muted truncate">{value}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHeader(key)}
                        aria-label={`Remove header ${key}`}
                        className="p-1.5 text-muted hover:text-danger hover:bg-subtle transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Header */}
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-40 flex-1">
                  <input
                    aria-label="Header key"
                    type="text"
                    value={newHeaderKey}
                    onChange={(e) => setNewHeaderKey(e.target.value)}
                    placeholder="Header key"
                    className="w-full dev-input font-mono text-sm"
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <input
                    aria-label="Header value"
                    type="text"
                    value={newHeaderValue}
                    onChange={(e) => setNewHeaderValue(e.target.value)}
                    placeholder="Header value"
                    className="w-full dev-input font-mono text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={addHeader}
                  aria-label="Add header"
                  disabled={!newHeaderKey.trim() || !newHeaderValue.trim()}
                  className="dev-btn px-4 py-2 disabled:opacity-50"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Send Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={sending || !selectedTopic || !messageValue.trim() || (totalBytes > maxMessageSize)}
                  className="dev-btn-primary inline-flex items-center disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 mr-2 ${sending ? 'animate-pulse' : ''}`} />
                  {sending ? 'Sending...' : 'Send message'}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedTopic) return;
                    if (!window.confirm(`Purge retained records from topic "${selectedTopic}" on cluster "${activeProfile?.name || selectedProfileId}"? This cannot be undone. The topic and its configuration will be preserved.`)) return;
                    setSending(true);
                    try {
                      const response = await fetch(`/api/topics/${encodeURIComponent(selectedTopic)}/cleanup?profileId=${encodeURIComponent(selectedProfileId)}`, { method: 'POST' });
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error || 'Failed to purge topic');
                      setLastSentMessage('Topic purged successfully');
                    } catch (err) {
                      setLastSentMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    } finally {
                      setSending(false);
                      if (showPreview) fetchPreviewMessages();
                    }
                  }}
                  disabled={sending || !selectedTopic}
                  className="dev-btn inline-flex items-center border-danger/30 text-danger hover:border-danger hover:bg-danger/5 disabled:opacity-50"
                  title="Purge retained records after confirmation"
                >
                  <Eraser className="w-4 h-4 mr-2" />
                  Purge topic
                </button>
              </div>

              {lastSentMessage && (
                <div role="status" className={`text-sm rounded-md px-4 py-2 border ${
                  lastSentMessage.startsWith('Error:')
                    ? 'text-danger bg-danger/5 border-danger/20'
                    : 'text-success bg-success/10 border-success/20'
                }`}>
                  {lastSentMessage}
                </div>
              )}
            </div>
          </form>
          </div>

          {/* Message Preview Section */}
          {showPreview && selectedTopic && (
            <div className="dev-card">
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-line pb-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="w-8 h-8 shrink-0 rounded-md bg-subtle border border-line flex items-center justify-center">
                      <Eye className="w-4 h-4 text-accent" />
                    </div>
                    <h3 className="min-w-0 text-sm font-semibold text-ink">
                      Message sample: <span className="font-mono text-muted break-all">{selectedTopic}</span>
                    </h3>
                  </div>
                  <button
                    onClick={fetchPreviewMessages}
                    disabled={loadingPreview}
                    className="dev-btn inline-flex items-center"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingPreview ? 'animate-spin text-accent' : ''}`} />
                    Refresh
                  </button>
                </div>

                <p className="mb-4 text-xs text-muted">Up to 10 records from the earliest retained offsets. Refresh starts a new isolated sample.</p>
                {previewError && <p role="alert" className="mb-4 text-sm text-danger">{previewError}</p>}
                {previewDropped > 0 && <p role="alert" className="mb-4 text-sm text-danger">The preview buffer overflowed; {previewDropped.toLocaleString()} records were skipped. They remain in Kafka.</p>}

                {loadingPreview ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin text-accent mb-4" />
                    <span className="text-xs font-semibold text-muted">Loading messages...</span>
                  </div>
                ) : previewMessages.length === 0 ? (
                  <div className="text-center px-4 py-8 bg-surface border border-line">
                    <div className="w-10 h-10 bg-subtle border border-line flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-5 h-5 text-muted" />
                    </div>
                    <h4 className="text-sm font-semibold text-ink mb-2">No messages found</h4>
                    <p className="text-xs text-muted max-w-sm mx-auto">
                      No records arrived during the preview window. Refresh to retry.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {previewMessages.map((message, index) => (
                      <div key={index} className="p-4 rounded-lg bg-surface border border-line">
                        <div className="flex items-center justify-between mb-3 pb-3 border-b border-line">
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                            <span className="flex items-center gap-1 text-accent">
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(message.timestamp).toLocaleString()}
                            </span>
                            <span className="bg-subtle border border-line px-2 py-1">Partition: {message.partition}</span>
                            <span className="bg-subtle border border-line px-2 py-1">Offset: {message.offset}</span>
                          </div>
                        </div>

                        {message.key && (
                          <div className="mb-4">
                            <div className="text-xs font-semibold text-muted mb-1.5">Key</div>
                            <div className="text-xs font-mono break-all rounded-md bg-subtle p-3 border border-line text-ink">
                              {message.key}
                            </div>
                          </div>
                        )}

                        <div className="mb-4">
                          <div className="text-xs font-semibold text-muted mb-1.5">Value</div>
                          <div className="text-xs font-mono leading-relaxed rounded-md bg-subtle p-4 border border-line text-ink max-h-64 overflow-y-auto custom-scrollbar whitespace-pre">
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

                        {message.headers && Object.keys(message.headers).length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-muted mb-1.5">Headers</div>
                            <div className="text-xs font-mono rounded-md bg-subtle p-3 border border-line text-muted overflow-x-auto whitespace-pre">
                              {JSON.stringify(message.headers, null, 2)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
