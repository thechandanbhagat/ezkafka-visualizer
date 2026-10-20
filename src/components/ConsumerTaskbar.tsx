'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, X, Monitor, Database, Filter } from 'lucide-react';
import ConsumerInstance from './ConsumerInstance';

// @group Types : Component data contracts
export interface ConsumerConfig {
  id: string;
  sessionName: string;
  selectedTopics: string[];
}

interface ConsumerTaskbarProps {
  topics: string[];
  connectionError?: string | null;
  onActiveConsumerChange?: (active: boolean) => void;
}

// @group BusinessLogic : Component state and interactions
export default function ConsumerTaskbar({ topics, connectionError, onActiveConsumerChange }: ConsumerTaskbarProps) {
  const [consumers, setConsumers] = useState<ConsumerConfig[]>([]);
  const [activeConsumerId, setActiveConsumerId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showCreateModal) return;
    const createButton = createButtonRef.current;
    return () => createButton?.focus();
  }, [showCreateModal]);

  useEffect(() => {
    onActiveConsumerChange?.(activeConsumerId !== null);
  }, [activeConsumerId, onActiveConsumerChange]);

  const [newSessionName, setNewSessionName] = useState('Inspection 1');
  const [newSelectedTopics, setNewSelectedTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState('');

  const filteredTopics = topics.filter(t => t.toLowerCase().includes(topicSearch.toLowerCase()));

  const handleCreateConsumer = () => {
    if (newSelectedTopics.length === 0) {
      alert("Please select at least one topic.");
      return;
    }
    const newConsumer: ConsumerConfig = {
      id: crypto.randomUUID(),
      sessionName: newSessionName.trim() || `Inspection ${consumers.length + 1}`,
      selectedTopics: newSelectedTopics,
    };
    setConsumers([...consumers, newConsumer]);
    setActiveConsumerId(newConsumer.id);
    setShowCreateModal(false);

    // Reset modal state
    setNewSelectedTopics([]);
    setNewSessionName(`Inspection ${consumers.length + 2}`);
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
      {/* @group Presentation : Consumer panels and workspace taskbar */}
      <div className="absolute bottom-10 left-0 right-0 z-30 pointer-events-none overflow-hidden h-[50vh] flex flex-col justify-end">
        {consumers.map(consumer => (
          <div
            key={consumer.id}
            className={`absolute bottom-0 left-0 right-0 h-[50vh] bg-surface border-t border-line shadow-[0_-8px_28px_rgba(23,43,77,0.10)] pointer-events-auto ${activeConsumerId === consumer.id ? 'z-10' : 'hidden'}`}
          >
            <ConsumerInstance
              config={consumer}
              active={activeConsumerId === consumer.id}
              connectionError={connectionError}
              onClose={() => setActiveConsumerId(null)}
            />
          </div>
        ))}
      </div>

      {/* Taskbar */}
      <div className="h-10 bg-subtle border-t border-line flex items-center px-2 z-40 relative select-none">
         <button
           ref={createButtonRef}
           onClick={() => setShowCreateModal(true)}
           className="p-1.5 rounded-md text-muted hover:text-accent hover:bg-accent-soft mx-1 flex items-center gap-2"
           title="New consumer"
           aria-label="New consumer"
         >
            <Plus className="w-4 h-4" />
            {consumers.length === 0 && <span className="text-xs font-semibold">New consumer</span>}
         </button>

         {consumers.length > 0 && <div className="w-px h-6 bg-line mx-2 flex-none"></div>}

         <div className="flex-1 flex items-center space-x-1 overflow-x-auto no-scrollbar">
            {consumers.map(consumer => (
               <div
                 key={consumer.id}
                 className={`flex items-center h-10 px-2 border-b-2 transition-colors ${activeConsumerId === consumer.id ? 'bg-accent-soft border-accent text-accent' : 'border-transparent text-muted hover:bg-subtle hover:text-ink'}`}
               >
                 <button
                   onClick={() => setActiveConsumerId(activeConsumerId === consumer.id ? null : consumer.id)}
                   aria-expanded={activeConsumerId === consumer.id}
                   className="flex h-full items-center px-2"
                 >
                   <Monitor className="w-3.5 h-3.5 mr-2" />
                   <span className="text-xs font-mono whitespace-nowrap">{consumer.sessionName}</span>
                 </button>
                 <button
                   onClick={(e) => { e.stopPropagation(); handleCloseConsumer(consumer.id); }}
                   className="ml-3 p-1 rounded hover:bg-line text-muted hover:text-danger transition-colors"
                   aria-label={`Close consumer ${consumer.sessionName}`}
                 >
                   <X className="w-3 h-3" />
                 </button>
               </div>
            ))}
         </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-ink/35 z-50 flex items-center justify-center p-4 backdrop-blur-sm pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-consumer-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setShowCreateModal(false);
              if (event.key !== 'Tab') return;
              const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
            className="bg-surface border border-line rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-line">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-accent" />
                <h2 id="create-consumer-title" className="text-lg font-semibold text-ink">Create consumer</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-md text-muted hover:text-ink" aria-label="Close create consumer dialog">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <div>
                <label htmlFor="consumer-session" className="block text-sm font-medium text-ink mb-2">
                  Session name
                </label>
                <input
                  id="consumer-session"
                  type="text"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="w-full dev-input py-2 px-3"
                  autoFocus
                />
                <p className="mt-2 text-xs text-muted">A display label for this panel. Kafka uses an isolated inspection group without committing offsets.</p>
              </div>

              <fieldset>
                <legend className="block text-sm font-medium text-ink mb-2">
                  Topics <span className="text-accent">*</span>
                </legend>
                <div className="border border-line rounded-lg overflow-hidden bg-surface">
                  <div className="relative border-b border-line">
                    <Filter className="absolute left-3 top-2.5 w-4 h-4 text-muted" />
                    <input
                      aria-label="Search topics"
                      type="text"
                      value={topicSearch}
                      onChange={(e) => setTopicSearch(e.target.value)}
                      placeholder="Search topics..."
                      className="w-full pl-10 pr-4 py-2 bg-transparent text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredTopics.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted">No topics found</div>
                    ) : (
                      filteredTopics.map(topic => (
                        <label key={topic} className="flex items-center gap-3 p-2 hover:bg-subtle cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newSelectedTopics.includes(topic)}
                            onChange={(e) => {
                              if (e.target.checked) setNewSelectedTopics([...newSelectedTopics, topic]);
                              else setNewSelectedTopics(newSelectedTopics.filter(t => t !== topic));
                            }}
                            className="rounded-md bg-subtle border-line text-accent focus:ring-accent focus:ring-1 focus:ring-offset-0 w-4 h-4"
                          />
                          <span className="text-xs font-mono text-ink break-all">{topic}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-muted text-right">
                  {newSelectedTopics.length} selected
                </div>
              </fieldset>
            </div>

            <div className="p-4 border-t border-line bg-surface flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="dev-btn px-6"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConsumer}
                className="dev-btn-primary px-6"
              >
                Create consumer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
