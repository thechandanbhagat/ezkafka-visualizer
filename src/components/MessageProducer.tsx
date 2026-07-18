'use client';

import { useState, useEffect, useCallback } from 'react';
import { Send, MessageSquare, Plus, X, Sparkles, FileJson, Check, AlertCircle, Code, Eye, RefreshCw, Clock, Copy, Eraser, Minimize2, Info } from 'lucide-react';
import { useActiveProfileId } from '@/contexts/ServerContext';

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

export default function MessageProducer({ topics, connectionError }: MessageProducerProps) {
  const selectedProfileId = useActiveProfileId();
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
  const [maxMessageSize, setMaxMessageSize] = useState<number>(1048576); // default 1MB
  const [copied, setCopied] = useState(false);

  // JSON validation and formatting
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

  useEffect(() => {
    // Load settings to get maxMessageSize
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (data?.settings?.maxMessageSize) setMaxMessageSize(data.settings.maxMessageSize);
      } catch {
        // keep default
      }
    })();
  }, []);

  const removeHeader = (key: string) => {
    setHeaders(prev => {
      const newHeaders = { ...prev };
      delete newHeaders[key];
      return newHeaders;
    });
  };

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

  const fetchPreviewMessages = useCallback(async () => {
    if (!selectedTopic) return;
    
    setLoadingPreview(true);
    try {
      const response = await fetch('/api/messages/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topics: [selectedTopic],
          groupId: 'preview-consumer-group',
          maxMessages: 10,
          profileId: selectedProfileId
        })
      });
      
      if (response.ok) {
        const messages = await response.json();
        setPreviewMessages(messages);
      } else {
        console.error('Failed to fetch preview messages');
        setPreviewMessages([]);
      }
    } catch (error) {
      console.error('Error fetching preview messages:', error);
      setPreviewMessages([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [selectedTopic, selectedProfileId]);

  // Auto-fetch preview when topic changes and preview is enabled
  useEffect(() => {
    if (showPreview && selectedTopic) {
      fetchPreviewMessages();
    }
  }, [selectedTopic, showPreview, fetchPreviewMessages]);

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="h-16 px-5 dev-card flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight uppercase">Message Producer</h1>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Send messages to Kafka topics</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden md:block text-right mr-2">
            <div className="text-xl font-bold font-mono text-emerald-400 leading-none">{topics.length}</div>
            <div className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mt-1">TOPICS</div>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="dev-btn inline-flex items-center"
          >
            <Eye className="w-4 h-4 mr-2 text-emerald-500" /> {showPreview ? 'HIDE_PREVIEW' : 'SHOW_PREVIEW'}
          </button>
        </div>
      </div>

      {connectionError ? (
        <div className="text-center py-16 dev-card">
          <div className="w-24 h-24 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h3 className="text-sm font-mono font-bold text-zinc-300 mb-2 uppercase tracking-widest">CONNECTION_ERROR</h3>
          <p className="text-xs font-mono text-zinc-500 max-w-md mx-auto uppercase tracking-widest">
            Unable to connect to the Kafka server.
          </p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16 dev-card">
          <div className="w-24 h-24 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
            <MessageSquare className="w-10 h-10 text-zinc-600" />
          </div>
          <h3 className="text-sm font-mono font-bold text-zinc-300 mb-2 uppercase tracking-widest">NO_TOPICS_AVAILABLE</h3>
          <p className="text-xs font-mono text-zinc-500 max-w-md mx-auto uppercase tracking-widest">
            Create a topic first to start sending messages.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="dev-card">
            <form onSubmit={handleSendMessage} className="p-6 space-y-6">
            {/* Topic Selection */}
            <div className="space-y-2">
              <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                TOPIC <span className="text-emerald-500">*</span>
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full dev-input"
                required
              >
                <option value="">CHOOSE_A_TOPIC...</option>
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>

            {/* Message Key */}
            <div className="space-y-2">
              <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                MESSAGE_KEY <span className="text-zinc-600 font-normal">(OPTIONAL)</span>
              </label>
              <input
                type="text"
                value={messageKey}
                onChange={(e) => setMessageKey(e.target.value)}
                placeholder="Enter message key"
                className="w-full dev-input"
              />
            </div>

            {/* Message Value */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                  MESSAGE_VALUE <span className="text-emerald-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  {/* JSON/Text Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsJsonMode(!isJsonMode)}
                    className={`dev-btn py-1 px-3 inline-flex items-center text-[10px] ${
                      isJsonMode
                        ? 'border-emerald-500/50 text-emerald-400 bg-emerald-950/20'
                        : ''
                    }`}
                  >
                    <FileJson className="w-3.5 h-3.5 mr-1.5" />
                    {isJsonMode ? 'JSON_MODE' : 'TEXT_MODE'}
                  </button>

                  {/* Format JSON Button */}
                  {isJsonMode && (
                    <button
                      type="button"
                      onClick={formatJson}
                      disabled={!messageValue.trim() || !isValidJson}
                      className="dev-btn py-1 px-3 inline-flex items-center text-[10px] disabled:opacity-50"
                    >
                      <Code className="w-3.5 h-3.5 mr-1.5" />
                      FORMAT
                    </button>
                  )}

                  {/* Minify JSON Button */}
                  {isJsonMode && (
                    <button
                      type="button"
                      onClick={minifyJson}
                      disabled={!messageValue.trim() || !isValidJson}
                      className="dev-btn py-1 px-3 inline-flex items-center text-[10px] disabled:opacity-50"
                    >
                      <Minimize2 className="w-3.5 h-3.5 mr-1.5" />
                      MINIFY
                    </button>
                  )}

                  {/* Generate Sample Button */}
                  <button
                    type="button"
                    onClick={generateSampleMessage}
                    className="dev-btn py-1 px-3 inline-flex items-center text-[10px] border-cyan-500/30 text-cyan-400 hover:border-cyan-500 hover:bg-cyan-950/30"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    SAMPLE
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
                    className="dev-btn py-1 px-3 inline-flex items-center text-[10px] disabled:opacity-50"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" /> {copied ? 'COPIED' : 'COPY'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageValue('')}
                    disabled={!messageValue}
                    className="dev-btn py-1 px-3 inline-flex items-center text-[10px] disabled:opacity-50 border-red-500/30 text-red-400 hover:border-red-500 hover:bg-red-950/30"
                  >
                    <Eraser className="w-3.5 h-3.5 mr-1.5" /> CLEAR
                  </button>
                </div>
              </div>

              {/* JSON Validation Status */}
              {isJsonMode && messageValue.trim() && (
                <div className={`flex items-center space-x-1.5 text-xs font-mono font-bold uppercase tracking-widest ${
                  isValidJson
                    ? 'text-emerald-500'
                    : 'text-red-500'
                }`}>
                  {isValidJson ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>VALID_JSON</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span>INVALID_JSON: {jsonError}</span>
                    </>
                  )}
                </div>
              )}

              {/* Enhanced Textarea with JSON Features */}
              <div className="relative group">
                <textarea
                  value={messageValue}
                  onChange={(e) => handleMessageValueChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isJsonMode 
                    ? '{\n  "key": "value",\n  "timestamp": "' + new Date().toISOString() + '"\n}'
                    : "Enter message content"
                  }
                  rows={10}
                  className={`w-full dev-input leading-relaxed resize-none ${
                    isJsonMode && messageValue.trim() && !isValidJson
                      ? '!border-red-500 !focus:border-red-500'
                      : ''
                  } ${isJsonMode ? 'pl-12' : 'pl-4'}`}
                  style={{
                    lineHeight: '1.5',
                    tabSize: 2,
                  }}
                  spellCheck={false}
                  required
                />
                
                {/* Line Numbers Overlay (for JSON mode) */}
                {isJsonMode && messageValue && (
                  <div className="absolute left-3 top-3 text-xs text-zinc-600 font-mono pointer-events-none select-none w-6 text-right opacity-70 group-hover:opacity-100 transition-opacity">
                    {messageValue.split('\n').map((_, index) => (
                      <div key={index} style={{ lineHeight: '1.5', height: '21px' }}>
                        {index + 1}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Size meter & limit info */}
              <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500">
                <div className="flex items-center gap-3">
                  <div className="w-48 h-1 bg-zinc-900 overflow-hidden">
                    <div
                      className={`${totalBytes > maxMessageSize ? 'bg-red-500' : 'bg-emerald-500'} h-full transition-all duration-300 ease-out`}
                      style={{ width: `${sizePercent}%` }}
                    />
                  </div>
                  <span>{totalBytes.toLocaleString()} / {maxMessageSize.toLocaleString()} BYTES</span>
                </div>
                <div className="flex items-center gap-1 text-zinc-600" title="Maximum message size allowed by current settings">
                  <Info className="w-3 h-3" />
                  <span>MAX_PAYLOAD_SIZE</span>
                </div>
              </div>
            </div>

            {/* Headers Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                  HEADERS <span className="text-zinc-600 font-normal">(OPTIONAL)</span>
                </label>
                <FileJson className="w-4 h-4 text-zinc-600" />
              </div>

              {/* Existing Headers */}
              {Object.entries(headers).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-3 p-3 bg-zinc-950 border border-zinc-800">
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="text-xs font-mono font-bold text-zinc-300 truncate">{key}</div>
                        <div className="text-xs font-mono text-zinc-500 truncate">{value}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHeader(key)}
                        className="p-1.5 text-zinc-600 hover:text-red-500 hover:bg-zinc-900 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Header */}
              <div className="flex items-start space-x-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newHeaderKey}
                    onChange={(e) => setNewHeaderKey(e.target.value)}
                    placeholder="HEADER_KEY"
                    className="w-full dev-input uppercase tracking-widest text-[10px]"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={newHeaderValue}
                    onChange={(e) => setNewHeaderValue(e.target.value)}
                    placeholder="HEADER_VALUE"
                    className="w-full dev-input uppercase tracking-widest text-[10px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={addHeader}
                  disabled={!newHeaderKey.trim() || !newHeaderValue.trim()}
                  className="dev-btn px-4 py-2 disabled:opacity-50"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Send Button */}
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-zinc-800">
              <div className="flex items-center space-x-3">
                <button
                  type="submit"
                  disabled={sending || !selectedTopic || !messageValue.trim() || (totalBytes > maxMessageSize)}
                  className="dev-btn-primary inline-flex items-center disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 mr-2 ${sending ? 'animate-pulse' : ''}`} />
                  {sending ? 'SENDING...' : 'SEND_MESSAGE'}
                </button>
                
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedTopic) return;
                    setSending(true);
                    try {
                      const response = await fetch(`/api/topics/${selectedTopic}/cleanup?profileId=${encodeURIComponent(selectedProfileId || '')}`, { method: 'POST' });
                      if (!response.ok) throw new Error('Failed to purge topic');
                      setLastSentMessage('Topic purged successfully');
                    } catch (err) {
                      setLastSentMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    } finally {
                      setSending(false);
                      if (showPreview) fetchPreviewMessages();
                    }
                  }}
                  disabled={sending || !selectedTopic}
                  className="dev-btn inline-flex items-center border-red-500/30 text-red-400 hover:border-red-500 hover:bg-red-950/30 disabled:opacity-50"
                  title="Clear all messages from this topic (1 click)"
                >
                  <Eraser className="w-4 h-4 mr-2" />
                  PURGE_TOPIC
                </button>
              </div>

              {lastSentMessage && (
                <div className={`text-xs font-mono font-bold px-4 py-2 border uppercase tracking-widest ${
                  lastSentMessage.startsWith('Error:') 
                    ? 'text-red-400 bg-red-950/30 border-red-900' 
                    : 'text-emerald-400 bg-emerald-950/30 border-emerald-900'
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
              <div className="p-6">
                <div className="flex items-center justify-between mb-6 border-b border-zinc-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      <Eye className="w-4 h-4 text-emerald-500" />
                    </div>
                    <h3 className="text-sm font-bold font-mono text-zinc-100 uppercase tracking-widest">
                      RECENT_MESSAGES: <span className="text-emerald-400">{selectedTopic}</span>
                    </h3>
                  </div>
                  <button
                    onClick={fetchPreviewMessages}
                    disabled={loadingPreview}
                    className="dev-btn inline-flex items-center"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingPreview ? 'animate-spin text-emerald-500' : ''}`} />
                    REFRESH
                  </button>
                </div>

                {loadingPreview ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
                    <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">LOADING_MESSAGES...</span>
                  </div>
                ) : previewMessages.length === 0 ? (
                  <div className="text-center py-12 bg-black border border-zinc-900">
                    <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h4 className="text-sm font-bold font-mono text-zinc-300 mb-2 uppercase tracking-widest">NO_MESSAGES_FOUND</h4>
                    <p className="text-[10px] font-mono text-zinc-500 max-w-sm mx-auto uppercase tracking-widest">
                      TOPIC MIGHT BE EMPTY OR NO RECENT MESSAGES.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {previewMessages.map((message, index) => (
                      <div key={index} className="p-4 bg-black border border-zinc-800 hover:border-zinc-700 transition-colors">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-900">
                          <div className="flex items-center space-x-3 text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(message.timestamp).toLocaleString()}
                            </span>
                            <span className="bg-zinc-900 border border-zinc-800 px-2 py-1">PARTITION: {message.partition}</span>
                            <span className="bg-zinc-900 border border-zinc-800 px-2 py-1">OFFSET: {message.offset}</span>
                          </div>
                        </div>
                        
                        {message.key && (
                          <div className="mb-4">
                            <div className="text-[10px] font-mono font-bold text-zinc-600 mb-1.5 uppercase tracking-widest">KEY</div>
                            <div className="text-xs font-mono bg-zinc-950 p-3 border border-zinc-800 text-zinc-300">
                              {message.key}
                            </div>
                          </div>
                        )}
                        
                        <div className="mb-4">
                          <div className="text-[10px] font-mono font-bold text-zinc-600 mb-1.5 uppercase tracking-widest">VALUE</div>
                          <div className="text-xs font-mono bg-zinc-950 p-4 border border-zinc-800 text-emerald-500 max-h-64 overflow-y-auto custom-scrollbar whitespace-pre">
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
                            <div className="text-[10px] font-mono font-bold text-zinc-600 mb-1.5 uppercase tracking-widest">HEADERS</div>
                            <div className="text-xs font-mono bg-zinc-950 p-3 border border-zinc-800 text-zinc-400 whitespace-pre">
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
