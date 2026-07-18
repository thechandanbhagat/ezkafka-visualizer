'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Monitor, Database, Filter } from 'lucide-react';
import ConsumerInstance from './ConsumerInstance';

export interface ConsumerConfig {
  id: string;
  groupId: string;
  selectedTopics: string[];
}

interface ConsumerTaskbarProps {
  topics: string[];
  connectionError?: string | null;
  onActiveConsumerChange?: (active: boolean) => void;
}

export default function ConsumerTaskbar({ topics, connectionError, onActiveConsumerChange }: ConsumerTaskbarProps) {
  const [consumers, setConsumers] = useState<ConsumerConfig[]>([]);
  const [activeConsumerId, setActiveConsumerId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    onActiveConsumerChange?.(activeConsumerId !== null);
  }, [activeConsumerId, onActiveConsumerChange]);

  const [newGroupId, setNewGroupId] = useState(`ezkafka-${Math.random().toString(36).substring(2, 7)}`);
  const [newSelectedTopics, setNewSelectedTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState('');

  const filteredTopics = topics.filter(t => t.toLowerCase().includes(topicSearch.toLowerCase()));

  const handleCreateConsumer = () => {
    if (newSelectedTopics.length === 0) {
      alert("Please select at least one topic.");
      return;
    }
    const newConsumer: ConsumerConfig = {
      id: Math.random().toString(36).substring(7),
      groupId: newGroupId,
      selectedTopics: newSelectedTopics,
    };
    setConsumers([...consumers, newConsumer]);
    setActiveConsumerId(newConsumer.id);
    setShowCreateModal(false);
    
    // Reset modal state
    setNewSelectedTopics([]);
    setTopicSearch('');
  };

  const handleCloseConsumer = (id: string) => {
    setConsumers(consumers.filter(c => c.id !== id));
    if (activeConsumerId === id) {
      setActiveConsumerId(null);
    }
  };

  return (
    <>
      {/* Consumer Instances (Floating Panels) */}
      <div className="absolute bottom-10 left-0 right-0 z-30 pointer-events-none overflow-hidden h-[50vh] flex flex-col justify-end">
        {consumers.map(consumer => (
          <div 
            key={consumer.id} 
            className={`absolute bottom-0 left-0 right-0 h-[50vh] bg-black border-t border-zinc-800 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] pointer-events-auto transition-transform duration-300 ease-in-out ${activeConsumerId === consumer.id ? 'translate-y-0 opacity-100 z-10' : 'translate-y-full opacity-0 -z-10'}`}
          >
            <ConsumerInstance 
              config={consumer} 
              connectionError={connectionError} 
              onClose={() => setActiveConsumerId(null)}
            />
          </div>
        ))}
      </div>

      {/* Taskbar */}
      <div className="h-10 bg-zinc-950 border-t border-zinc-800 flex items-center px-2 z-40 relative select-none">
         <button 
           onClick={() => setShowCreateModal(true)} 
           className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 mx-1 flex items-center gap-2" 
           title="New Consumer"
         >
            <Plus className="w-4 h-4" />
            {consumers.length === 0 && <span className="text-[10px] font-mono font-bold uppercase tracking-widest">NEW_CONSUMER</span>}
         </button>
         
         {consumers.length > 0 && <div className="w-px h-6 bg-zinc-800 mx-2 flex-none"></div>}
         
         <div className="flex-1 flex items-center space-x-1 overflow-x-auto no-scrollbar">
            {consumers.map(consumer => (
               <div 
                 key={consumer.id} 
                 onClick={() => setActiveConsumerId(activeConsumerId === consumer.id ? null : consumer.id)}
                 className={`flex items-center h-10 px-4 cursor-pointer border-b-2 transition-colors ${activeConsumerId === consumer.id ? 'bg-zinc-900 border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'}`}
               >
                 <Monitor className="w-3.5 h-3.5 mr-2" />
                 <span className="text-[10px] font-mono font-bold uppercase tracking-widest whitespace-nowrap">{consumer.groupId}</span>
                 <button 
                   onClick={(e) => { e.stopPropagation(); handleCloseConsumer(consumer.id); }}
                   className="ml-3 p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                 >
                   <X className="w-3 h-3" />
                 </button>
               </div>
            ))}
         </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm pointer-events-auto">
          <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-emerald-500" />
                <h2 className="text-sm font-mono font-bold text-zinc-100 uppercase tracking-widest">Create Consumer</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <div>
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  CONSUMER_GROUP
                </label>
                <input
                  type="text"
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  className="w-full dev-input py-2 px-3"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  TOPICS <span className="text-emerald-500">*</span>
                </label>
                <div className="border border-zinc-800 bg-black">
                  <div className="relative border-b border-zinc-800">
                    <Filter className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                      placeholder="SEARCH_TOPICS..."
                      className="w-full pl-10 pr-4 py-2 bg-transparent text-sm font-mono text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredTopics.length === 0 ? (
                      <div className="p-4 text-center text-xs font-mono text-zinc-500">NO_TOPICS_FOUND</div>
                    ) : (
                      filteredTopics.map(topic => (
                        <label key={topic} className="flex items-center gap-3 p-2 hover:bg-zinc-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newSelectedTopics.includes(topic)}
                            onChange={(e) => {
                              if (e.target.checked) setNewSelectedTopics([...newSelectedTopics, topic]);
                              else setNewSelectedTopics(newSelectedTopics.filter(t => t !== topic));
                            }}
                            className="rounded-none bg-zinc-950 border-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-1 focus:ring-offset-0 w-4 h-4"
                          />
                          <span className="text-xs font-mono text-zinc-300">{topic}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="mt-2 text-[10px] font-mono font-bold text-zinc-500 tracking-widest text-right">
                  {newSelectedTopics.length} SELECTED
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-black flex justify-end gap-3">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="dev-btn px-6"
              >
                CANCEL
              </button>
              <button 
                onClick={handleCreateConsumer}
                className="dev-btn-primary px-6"
              >
                CREATE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
