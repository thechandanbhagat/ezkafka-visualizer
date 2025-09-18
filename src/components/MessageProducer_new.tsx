'use client';

import { useState } from 'react';
import { Send, MessageSquare, Plus, X, Sparkles, FileJson } from 'lucide-react';

interface MessageProducerProps {
  topics: string[];
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
      setLastSentMessage(`Message sent successfully to partition ${result.partition} at offset ${result.offset}`);
      
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
    setMessageValue(samples[Math.floor(Math.random() * samples.length)]);
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Message Producer</h1>
              <p className="text-blue-100 mt-1">Send messages to Kafka topics</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{topics.length}</div>
            <div className="text-blue-100 text-sm">Available Topics</div>
          </div>
        </div>
      </div>

      {topics.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <MessageSquare className="w-12 h-12 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Topics Available</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Create a topic first using the Topic Manager to start sending messages.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 overflow-hidden">
          <form onSubmit={handleSendMessage} className="p-8 space-y-8">
            {/* Topic Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Select Topic
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Message Key (Optional)
              </label>
              <input
                type="text"
                value={messageKey}
                onChange={(e) => setMessageKey(e.target.value)}
                placeholder="Enter message key"
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Message Value */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Message Value
                </label>
                <button
                  type="button"
                  onClick={generateSampleMessage}
                  className="inline-flex items-center px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  Generate Sample
                </button>
              </div>
              <textarea
                value={messageValue}
                onChange={(e) => setMessageValue(e.target.value)}
                placeholder="Enter message content (JSON, text, etc.)"
                rows={8}
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all font-mono text-sm"
                required
              />
            </div>

            {/* Headers Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Headers (Optional)
                </label>
                <FileJson className="w-5 h-5 text-slate-400" />
              </div>

              {/* Existing Headers */}
              {Object.entries(headers).length > 0 && (
                <div className="space-y-3">
                  {Object.entries(headers).map(([key, value]) => (
                    <div key={key} className="flex items-center space-x-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{key}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">{value}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeHeader(key)}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Header */}
              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newHeaderKey}
                    onChange={(e) => setNewHeaderKey(e.target.value)}
                    placeholder="Header key"
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={newHeaderValue}
                    onChange={(e) => setNewHeaderValue(e.target.value)}
                    placeholder="Header value"
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl shadow-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={addHeader}
                  disabled={!newHeaderKey.trim() || !newHeaderValue.trim()}
                  className="px-4 py-3 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-xl font-medium transition-colors disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Send Button */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                type="submit"
                disabled={sending || !selectedTopic || !messageValue.trim()}
                className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transform transition-all hover:scale-105 disabled:hover:scale-100 shadow-lg"
              >
                <Send className="w-6 h-6 mr-3" />
                {sending ? 'Sending...' : 'Send Message'}
              </button>

              {lastSentMessage && (
                <div className={`text-sm font-medium px-4 py-2 rounded-lg ${
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
      )}
    </div>
  );
}
