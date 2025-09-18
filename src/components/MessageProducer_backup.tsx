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
        throw new Error('Failed to send message');
      }

      setLastSentMessage(`Message sent to topic "${selectedTopic}" at ${new Date().toLocaleTimeString()}`);
      setMessageValue('');
      setMessageKey('');
      setHeaders({});
    } catch (error) {
      console.error('Error sending message:', error);
      setLastSentMessage('Error sending message');
    } finally {
      setSending(false);
    }
  };

  const generateSampleMessage = () => {
    const samples = [
      '{"userId": 123, "action": "login", "timestamp": "' + new Date().toISOString() + '"}',
      '{"orderId": "ORD-456", "amount": 99.99, "currency": "USD", "status": "completed"}',
      '{"eventType": "page_view", "url": "/home", "userId": 789}',
      '{"temperature": ' + Math.round(Math.random() * 100) + ', "humidity": ' + Math.round(Math.random() * 100) + ', "location": "sensor-01"}',
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Select Topic
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Message Key (Optional)
            </label>
            <input
              type="text"
              value={messageKey}
              onChange={(e) => setMessageKey(e.target.value)}
              placeholder="Enter message key"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Message Value */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Message Value
              </label>
              <button
                type="button"
                onClick={generateSampleMessage}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Generate Sample
              </button>
            </div>
            <textarea
              value={messageValue}
              onChange={(e) => setMessageValue(e.target.value)}
              placeholder="Enter message content (JSON, text, etc.)"
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono text-sm"
              required
            />
          </div>

          {/* Headers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Headers (Optional)
            </label>
            
            {/* Existing Headers */}
            {Object.keys(headers).length > 0 && (
              <div className="mb-3 space-y-2">
                {Object.entries(headers).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded">
                    <span className="text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">{key}:</span> {value}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHeader(key)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="text"
                value={newHeaderKey}
                onChange={(e) => setNewHeaderKey(e.target.value)}
                placeholder="Header key"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <input
                type="text"
                value={newHeaderValue}
                onChange={(e) => setNewHeaderValue(e.target.value)}
                placeholder="Header value"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={addHeader}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Add Header
              </button>
            </div>
          </div>

          {/* Send Button */}
          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={sending || !selectedTopic || !messageValue.trim()}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5 mr-2" />
              {sending ? 'Sending...' : 'Send Message'}
            </button>

            {lastSentMessage && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {lastSentMessage}
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
