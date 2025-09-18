'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, Trash2, Filter, Database, ChevronDown, ChevronUp, Copy } from 'lucide-react';

interface Message {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

interface MessageConsumerProps {
  topics: string[];
}

export default function MessageConsumer({ topics }: MessageConsumerProps) {
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConsuming, setIsConsuming] = useState(false);
  const [maxMessages, setMaxMessages] = useState(200);
  const [filterText, setFilterText] = useState('');
  const [consumerGroup, setConsumerGroup] = useState('ezkafka-consumer-group');
  const [fromBeginning, setFromBeginning] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [pollMs, setPollMs] = useState(2000);
  const [showConfig, setShowConfig] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const topicPickerRef = useRef<HTMLDivElement | null>(null);
  const [isTopicPickerOpen, setIsTopicPickerOpen] = useState(false);
  const [topicSearch, setTopicSearch] = useState('');

  const filteredTopics = topics.filter(t => t.toLowerCase().includes(topicSearch.toLowerCase()));
  const allSelected = selectedTopics.length === topics.length;
  const noneSelected = selectedTopics.length === 0;
  const topicSummary = (() => {
    if (allSelected) return 'All topics';
    if (noneSelected) return 'Select topics';
    if (selectedTopics.length <= 2) return selectedTopics.join(', ');
    return `${selectedTopics.slice(0, 2).join(', ')} +${selectedTopics.length - 2}`;
  })();

  const startConsuming = async () => {
    if (selectedTopics.length === 0) {
      alert('Please select at least one topic');
      return;
    }

    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsConsuming(true);

    // Simple polling (SSE/WebSocket would be ideal for true streaming)
    intervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/messages/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            topics: selectedTopics,
            groupId: consumerGroup,
            maxMessages: 10,
            fromBeginning: false // Always false for continuous consumption
          })
        });
        
        if (response.ok) {
          const newMessages = await response.json();
          if (newMessages.length > 0) {
            setMessages(prev => {
              const combined = [...prev, ...newMessages];
              return combined.slice(-maxMessages); // Keep only last N messages
            });
          }
        }
      } catch (error) {
        console.error('Error consuming messages:', error);
      }
    }, pollMs);
  };

  const readExistingMessages = async () => {
    if (selectedTopics.length === 0) {
      alert('Please select at least one topic');
      return;
    }

    try {
      const response = await fetch('/api/messages/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topics: selectedTopics,
          groupId: `${consumerGroup}-read-${Date.now()}`, // Unique group ID for reading
          maxMessages: Math.min(maxMessages, 50), // Limit for existing messages
          fromBeginning: fromBeginning
        })
      });
      
      if (response.ok) {
        const existingMessages = await response.json();
        setMessages(prev => {
          const combined = [...existingMessages, ...prev];
          // Remove duplicates based on topic, partition, and offset
          const unique = combined.filter((msg, index, arr) => 
            arr.findIndex(m => m.topic === msg.topic && m.partition === msg.partition && m.offset === msg.offset) === index
          );
          return unique.slice(-maxMessages);
        });
      } else {
        const error = await response.json();
        alert(`Error reading messages: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error reading existing messages:', error);
      alert('Error reading existing messages');
    }
  };

  const stopConsuming = () => {
    setIsConsuming(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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
    a.download = `kafka-messages-${new Date().toISOString()}.json`;
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
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, autoScroll]);

  // Close topic picker on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (topicPickerRef.current && !topicPickerRef.current.contains(e.target as Node)) {
        setIsTopicPickerOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsTopicPickerOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="h-12 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center">
            <Database className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Message Consumer</h1>
            <p className="text-[11px] text-slate-500">Consume and monitor Kafka topics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:block text-right">
            <div className="text-sm font-semibold">{messages.length}</div>
            <div className="text-[10px] text-slate-500">Messages</div>
          </div>
          <button
            onClick={() => setShowConfig(v => !v)}
            className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
            title={showConfig ? 'Hide controls' : 'Show controls'}
          >
            {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Controls */}
      {showConfig && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div ref={topicPickerRef} className="relative">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Topics
          </label>
          <button
            type="button"
            onClick={() => setIsTopicPickerOpen(v => !v)}
            className="w-full inline-flex items-center justify-between px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-700"
            aria-haspopup="listbox"
            aria-expanded={isTopicPickerOpen}
          >
            <span className="truncate text-left">{topicSummary}</span>
            {isTopicPickerOpen ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
          </button>

          {isTopicPickerOpen && (
            <div className="absolute z-20 mt-2 w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-lg">
              <div className="p-2 border-b border-slate-200 dark:border-slate-800">
                <div className="relative">
                  <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    autoFocus
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    placeholder="Search topics..."
                    className="w-full pl-10 pr-3 py-2 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                  <div className="space-x-2">
                    <button
                      type="button"
                      className="underline hover:text-slate-900 dark:hover:text-slate-200"
                      onClick={() => setSelectedTopics(topics)}
                    >Select all</button>
                    <button
                      type="button"
                      className="underline hover:text-slate-900 dark:hover:text-slate-200"
                      onClick={() => setSelectedTopics([])}
                    >Clear</button>
                  </div>
                  <div>{selectedTopics.length} selected</div>
                </div>
              </div>
              <div className="max-h-64 overflow-auto py-1">
                {filteredTopics.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-slate-500">No topics match your search.</div>
                ) : (
                  filteredTopics.map(topic => {
                    const checked = selectedTopics.includes(topic);
                    return (
                      <label key={topic} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setSelectedTopics(prev => {
                              if (isChecked) return Array.from(new Set([...prev, topic]));
                              return prev.filter(t => t !== topic);
                            });
                          }}
                          className="rounded border-slate-300 dark:border-slate-700"
                        />
                        <span className="text-sm text-slate-800 dark:text-slate-200">{topic}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="p-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIsTopicPickerOpen(false)}
                  className="px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
                >Done</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Consumer Group
          </label>
          <input
            type="text"
            value={consumerGroup}
            onChange={(e) => setConsumerGroup(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Max Messages
          </label>
          <input
            type="number"
            value={maxMessages}
            onChange={(e) => setMaxMessages(Number(e.target.value))}
            min="10"
            max="1000"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Filter Messages
          </label>
          <div className="relative">
            <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter by content..."
              className="w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Read From Beginning
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={fromBeginning}
              onChange={(e) => setFromBeginning(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 focus:ring-slate-500"
            />
            <span className="ml-2 text-sm text-slate-700 dark:text-slate-300">From start</span>
          </label>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {!isConsuming ? (
          <button
            onClick={startConsuming}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Consuming
          </button>
        ) : (
          <button
            onClick={stopConsuming}
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
          >
            <Pause className="w-4 h-4 mr-2" />
            Stop Consuming
          </button>
        )}

        <button
          onClick={readExistingMessages}
          disabled={selectedTopics.length === 0}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4 mr-2" />
          Read Existing Messages
        </button>

        <button
          onClick={clearMessages}
          className="inline-flex items-center px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear Messages
        </button>

        <button
          onClick={exportMessages}
          disabled={messages.length === 0}
          className="inline-flex items-center px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-sm font-medium rounded-md text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4 mr-2" />
          Export Messages
        </button>

        <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-3">
          <span>Shown: {filteredMessages.length} / {messages.length}</span>
          <span>•</span>
          <label className="flex items-center gap-1" title="Keep the view pinned to the latest messages">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200"
            />
            Auto-scroll
          </label>
          <span>•</span>
          <label className="flex items-center gap-1" title="How frequently to poll for new messages">
            Poll:
            <select
              value={pollMs}
              onChange={(e) => setPollMs(Number(e.target.value))}
              disabled={isConsuming}
              className="ml-1 px-1.5 py-0.5 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs"
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
          </label>
        </div>
      </div>
      </>
      )}

      {/* Messages Display */}
      <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
        <div ref={listRef} className="max-h-96 overflow-auto">
          {filteredMessages.length === 0 ? (
            <div className="p-6 text-center text-slate-500 dark:text-slate-400">
              {isConsuming ? 'Waiting for messages...' : 'No messages consumed yet. Start consuming to see messages here.'}
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {filteredMessages.map((message, index) => (
                <div key={index} className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-md border border-slate-200 dark:border-slate-800">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-medium">{message.topic}</span> • Partition {message.partition} • Offset {message.offset} • {new Date(message.timestamp).toLocaleString()}
                    </div>
                    <button
                      className="inline-flex items-center px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
                      title="Copy message value"
                      onClick={async () => { try { await navigator.clipboard.writeText(message.value); } catch {} }}
                    >
                      <Copy className="w-3 h-3 mr-1" /> Copy
                    </button>
                  </div>
                  {message.key && (
                    <div className="mb-2">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Key:</span>
                      <pre className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded mt-1 overflow-x-auto">{message.key}</pre>
                    </div>
                  )}
                  <div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Value:</span>
                    <pre className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded mt-1 overflow-x-auto max-h-32 overflow-y-auto">
{(() => {
  try {
    const parsed = JSON.parse(message.value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return message.value;
  }
})()}
                    </pre>
                  </div>
                  {message.headers && Object.keys(message.headers).length > 0 && (
                    <div className="mt-2">
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Headers:</span>
                      <pre className="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded mt-1 overflow-x-auto">{JSON.stringify(message.headers, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
