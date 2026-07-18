'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Download, Trash2, Filter, Database, Copy } from 'lucide-react';
import { useActiveProfileId } from '@/contexts/ServerContext';
import { ConsumerConfig } from './ConsumerTaskbar';

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
  onClose: () => void;
}

export default function ConsumerInstance({ config, connectionError, onClose }: ConsumerInstanceProps) {
  const selectedProfileId = useActiveProfileId();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConsuming, setIsConsuming] = useState(false);
  const [maxMessages, setMaxMessages] = useState(200);
  const [filterText, setFilterText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [pollMs, setPollMs] = useState(2000);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const startConsuming = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsConsuming(true);

    intervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/messages/consume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            topics: config.selectedTopics,
            groupId: config.groupId,
            maxMessages: 10,
            fromBeginning: false,
            profileId: selectedProfileId
          })
        });
        
        if (response.ok) {
          const newMessages = await response.json();
          if (newMessages.length > 0) {
            setMessages(prev => {
              const combined = [...prev, ...newMessages];
              return combined.slice(-maxMessages);
            });
          }
        }
      } catch (error) {
        console.error('Error consuming messages:', error);
      }
    }, pollMs);
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
    a.download = `kafka-${config.groupId}-${new Date().toISOString()}.json`;
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

  useEffect(() => {
    if (!autoScroll || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, autoScroll]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header / Tools */}
      <div className="h-12 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-4 flex-none">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2">
             <div className={`w-2 h-2 rounded-full ${isConsuming ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse' : 'bg-zinc-600'}`}></div>
             <span className="text-[10px] font-mono font-bold text-zinc-300 uppercase tracking-widest truncate max-w-[150px]">
               {config.groupId}
             </span>
          </div>
          <div className="w-px h-4 bg-zinc-800"></div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest truncate max-w-[200px]" title={config.selectedTopics.join(', ')}>
            {config.selectedTopics.length === 1 ? config.selectedTopics[0] : `${config.selectedTopics.length} TOPICS`}
          </span>
        </div>

        <div className="flex items-center gap-2">
           {!isConsuming ? (
            <button
              onClick={startConsuming}
              className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-mono font-bold uppercase tracking-widest border border-emerald-500/50 transition-colors flex items-center"
            >
              <Play className="w-3 h-3 mr-1" /> START
            </button>
          ) : (
            <button
              onClick={stopConsuming}
              className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-mono font-bold uppercase tracking-widest border border-red-500/50 transition-colors flex items-center"
            >
              <Pause className="w-3 h-3 mr-1" /> STOP
            </button>
          )}

          <div className="relative ml-2">
            <Filter className="absolute left-2 top-1.5 w-3 h-3 text-zinc-500" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="FILTER..."
              className="w-32 pl-7 pr-2 py-1 bg-black border border-zinc-800 text-[10px] font-mono text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <button onClick={clearMessages} className="p-1.5 text-zinc-500 hover:text-red-400 ml-1" title="Clear view">
             <Trash2 className="w-3.5 h-3.5" />
          </button>
          
          <button onClick={exportMessages} disabled={messages.length === 0} className="p-1.5 text-zinc-500 hover:text-emerald-400 disabled:opacity-50" title="Export JSON">
             <Download className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-zinc-800 mx-1"></div>

          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 transition-colors">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded-none bg-zinc-950 border-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-1 focus:ring-offset-0"
            />
            SCROLL
          </label>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black">
        {connectionError ? (
           <div className="flex flex-col items-center justify-center h-full text-red-500">
             <span className="text-xs font-mono font-bold uppercase tracking-widest">Connection Error</span>
             <span className="text-[10px] font-mono mt-2">{connectionError}</span>
           </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 min-h-[200px]">
            {isConsuming ? (
              <>
                <div className="w-8 h-8 border border-zinc-800 border-t-emerald-500 animate-spin mb-3"></div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400">LISTENING...</p>
              </>
            ) : (
              <>
                <Database className="w-6 h-6 text-zinc-700 mb-2" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">READY_TO_CONSUME</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMessages.map((message, index) => (
              <div key={index} className="p-3 border border-zinc-800 hover:border-zinc-700 bg-zinc-950 transition-colors">
                <div className="flex items-center justify-between mb-3 border-b border-zinc-900 pb-2">
                  <div className="flex items-center space-x-3 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    <span className="font-bold text-emerald-400">{message.topic}</span>
                    <span>P:{message.partition}</span>
                    <span>O:{message.offset}</span>
                    <span className="text-zinc-600">{new Date(message.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <button
                    className="text-zinc-500 hover:text-emerald-400"
                    title="Copy value"
                    onClick={async () => { try { await navigator.clipboard.writeText(message.value); } catch {} }}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                
                {message.key && (
                  <div className="mb-2 text-xs font-mono text-zinc-400">
                    <span className="text-[10px] font-bold text-zinc-600 mr-2">KEY:</span>{message.key}
                  </div>
                )}
                
                <div className="text-xs font-mono text-emerald-500 overflow-x-auto whitespace-pre custom-scrollbar">
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
