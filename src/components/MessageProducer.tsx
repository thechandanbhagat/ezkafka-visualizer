'use client';

import { useState, useEffect, useCallback } from 'react';
import { Send, MessageSquare, Plus, X, Sparkles, FileJson, Check, AlertCircle, Code, Eye, RefreshCw, Clock, Copy, Eraser, Minimize2, Info } from 'lucide-react';

interface MessageProducerProps {
  topics: string[];
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

export default function MessageProducer({ topics }: MessageProducerProps) {
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
          maxMessages: 10
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
  }, [selectedTopic]);

  // Auto-fetch preview when topic changes and preview is enabled
  useEffect(() => {
    if (showPreview && selectedTopic) {
      fetchPreviewMessages();
    }
  }, [selectedTopic, showPreview, fetchPreviewMessages]);

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="h-12 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Message Producer</h1>
            <p className="text-[11px] text-slate-500">Send messages to Kafka topics</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:block text-right">
            <div className="text-sm font-semibold">{topics.length}</div>
            <div className="text-[10px] text-slate-500">Topics</div>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Eye className="w-4 h-4 mr-1" /> {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      </div>

      {topics.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Topics Available</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mx-auto">
            Create a topic first using the Topic Manager to start sending messages.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
            <form onSubmit={handleSendMessage} className="p-4 space-y-4">
            {/* Topic Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Topic
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
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
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Message Key (Optional)
              </label>
              <input
                type="text"
                value={messageKey}
                onChange={(e) => setMessageKey(e.target.value)}
                placeholder="Enter message key"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
              />
            </div>

            {/* Message Value */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Message Value
                </label>
                <div className="flex items-center space-x-2">
                  {/* JSON/Text Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsJsonMode(!isJsonMode)}
                    className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md transition-colors ${
                      isJsonMode
                        ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20'
                        : 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-700'
                    }`}
                  >
                    <FileJson className="w-3 h-3 mr-1" />
                    {isJsonMode ? 'JSON' : 'Text'}
                  </button>

                  {/* Format JSON Button */}
                  {isJsonMode && (
                    <button
                      type="button"
                      onClick={formatJson}
                      disabled={!messageValue.trim() || !isValidJson}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 rounded-md transition-colors disabled:cursor-not-allowed"
                    >
                      <Code className="w-3 h-3 mr-1" />
                      Format
                    </button>
                  )}

                  {/* Minify JSON Button */}
                  {isJsonMode && (
                    <button
                      type="button"
                      onClick={minifyJson}
                      disabled={!messageValue.trim() || !isValidJson}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md transition-colors disabled:cursor-not-allowed"
                    >
                      <Minimize2 className="w-3 h-3 mr-1" />
                      Minify
                    </button>
                  )}

                  {/* Generate Sample Button */}
                  <button
                    type="button"
                    onClick={generateSampleMessage}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 rounded-md transition-colors"
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
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
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md transition-colors disabled:cursor-not-allowed"
                  >
                    <Copy className="w-3 h-3 mr-1" /> {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageValue('')}
                    disabled={!messageValue}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:bg-slate-100 disabled:text-slate-400 dark:text-red-300 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-md transition-colors disabled:cursor-not-allowed"
                  >
                    <Eraser className="w-3 h-3 mr-1" /> Clear
                  </button>
                </div>
              </div>

              {/* JSON Validation Status */}
              {isJsonMode && messageValue.trim() && (
                <div className={`flex items-center space-x-1 text-xs ${
                  isValidJson
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {isValidJson ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Valid JSON</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" />
                      <span>Invalid JSON: {jsonError}</span>
                    </>
                  )}
                </div>
              )}

              {/* Enhanced Textarea with JSON Features */}
              <div className="relative">
                <textarea
                  value={messageValue}
                  onChange={(e) => handleMessageValueChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isJsonMode 
                    ? '{\n  "key": "value",\n  "timestamp": "' + new Date().toISOString() + '"\n}'
                    : "Enter message content"
                  }
                  rows={10}
                  className={`w-full px-3 py-2 border ${
                    isJsonMode && messageValue.trim() && !isValidJson
                      ? 'border-red-300 dark:border-red-600 focus:ring-red-500'
                      : 'border-slate-300 dark:border-slate-700 focus:ring-slate-500'
                  } rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:border-transparent transition-all font-mono text-sm leading-relaxed resize-none ${
                    isJsonMode ? 'pl-10' : 'pl-3'
                  }`}
                  style={{
                    lineHeight: '1.5',
                    tabSize: 2,
                  }}
                  spellCheck={false}
                  required
                />
                
                {/* Line Numbers Overlay (for JSON mode) */}
                {isJsonMode && messageValue && (
                  <div className="absolute left-2 top-2 text-xs text-slate-400 dark:text-slate-500 font-mono pointer-events-none select-none w-6 text-right">
                    {messageValue.split('\n').map((_, index) => (
                      <div key={index} style={{ lineHeight: '1.5', height: '21px' }}>
                        {index + 1}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Size meter & limit info */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-40 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`${totalBytes > maxMessageSize ? 'bg-red-500' : 'bg-emerald-500'} h-1.5`}
                      style={{ width: `${sizePercent}%` }}
                    />
                  </div>
                  <span>{totalBytes.toLocaleString()} / {maxMessageSize.toLocaleString()} bytes</span>
                </div>
                <div className="flex items-center gap-1" title="Maximum message size allowed by current settings">
                  <Info className="w-3 h-3" />
                  <span>Max payload size</span>
                </div>
              </div>
            </div>

            {/* Headers Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Headers (Optional)
                </label>
                <FileJson className="w-4 h-4 text-slate-400" />
              </div>

              {/* Existing Headers */}
              {Object.entries(headers).length > 0 && (
                <div className="space-y-2">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{key}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">{value}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHeader(key)}
                        className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Header */}
              <div className="flex items-end space-x-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newHeaderKey}
                    onChange={(e) => setNewHeaderKey(e.target.value)}
                    placeholder="Header key"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={newHeaderValue}
                    onChange={(e) => setNewHeaderValue(e.target.value)}
                    placeholder="Header value"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={addHeader}
                  disabled={!newHeaderKey.trim() || !newHeaderValue.trim()}
                  className="px-3 py-2 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Send Button */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                disabled={sending || !selectedTopic || !messageValue.trim() || (totalBytes > maxMessageSize)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-slate-900 dark:bg-slate-700 hover:bg-black/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4 mr-2" />
                {sending ? 'Sending...' : 'Send Message'}
              </button>

              {lastSentMessage && (
                <div className={`text-sm font-medium px-3 py-2 rounded-md ${
                  lastSentMessage.startsWith('Error:') 
                    ? 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/20' 
                    : 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/20'
                }`}>
                  {lastSentMessage}
                </div>
              )}
            </div>
          </form>
          </div>

          {/* Message Preview Section */}
          {showPreview && selectedTopic && (
            <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Recent Messages from &ldquo;{selectedTopic}&rdquo;
                    </h3>
                  </div>
                  <button
                    onClick={fetchPreviewMessages}
                    disabled={loadingPreview}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:disabled:bg-slate-700 dark:disabled:text-slate-500 rounded-md transition-colors disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingPreview ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {loadingPreview ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Loading messages...</span>
                    </div>
                  </div>
                ) : previewMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-8 h-8 text-slate-400" />
                    </div>
                    <h4 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No messages found</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                      No recent messages available in this topic, or the topic might be empty.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {previewMessages.map((message, index) => (
                      <div key={index} className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-md border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>Partition {message.partition} • Offset {message.offset}</span>
                            <span>•</span>
                            <span>{new Date(message.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                        
                        {message.key && (
                          <div className="mb-3">
                            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Key:</div>
                            <div className="text-sm font-mono bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                              {message.key}
                            </div>
                          </div>
                        )}
                        
                        <div className="mb-3">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Value:</div>
                          <div className="text-sm font-mono bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 max-h-32 overflow-y-auto">
                            {(() => {
                              try {
                                // Try to format as JSON if possible
                                const parsed = JSON.parse(message.value);
                                return JSON.stringify(parsed, null, 2);
                              } catch {
                                // If not JSON, display as-is
                                return message.value;
                              }
                            })()}
                          </div>
                        </div>
                        
                        {message.headers && Object.keys(message.headers).length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Headers:</div>
                            <div className="text-sm font-mono bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
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
