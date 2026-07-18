'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database, MessageSquare, Users, Settings, ChevronLeft, ChevronRight, X, RefreshCw, Github, Star, Package, Bug } from 'lucide-react';
import TopicList from './TopicList';
import MessageProducer from './MessageProducer';
import ConsumerTaskbar from './ConsumerTaskbar';
import ConsumerGroups from './ConsumerGroups';
import KafkaSettings from './KafkaSettings';
import NavbarServerSelector from './NavbarServerSelector';
import { TopicInfo } from '@/lib/kafka';
import { useServer } from '@/contexts/ServerContext';

export default function KafkaVisualizer() {
  const [currentPath, setCurrentPath] = useState<string>('');
  
  useEffect(() => {
    setCurrentPath(window.location.pathname);
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const effectivePath = currentPath || '/topics';
  const current = (effectivePath.split('/')[1] || 'topics') as 'topics' | 'producer' | 'consumer' | 'groups' | 'settings';

  const navigateTo = (path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  const [collapsed, setCollapsed] = useState(false);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showStarPrompt, setShowStarPrompt] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [issueType, setIssueType] = useState<'bug' | 'feature' | 'feedback'>('bug');
  const [isConsumerActive, setIsConsumerActive] = useState(false);
  const [appName, setAppName] = useState<string>('EZ Kafka Visualizer');

  const handleSubmitIssue = () => {
    const typeLabel = issueType === 'bug' ? '🐛 Bug' : issueType === 'feature' ? '✨ Feature Request' : '💬 Feedback';
    const bodyTemplate = `### Category
${typeLabel}

### Description
${issueBody}

---
### Environment Information
- **App Version**: v1.0.1
- **Platform**: ${navigator.userAgent}
- **Next.js Version**: 15.4.5`;

    const prefix = issueType === 'bug' ? '[BUG]' : issueType === 'feature' ? '[FEATURE]' : '[FEEDBACK]';
    const fullTitle = `${prefix} ${issueTitle}`;
    const url = `https://github.com/thechandanbhagat/ezkafka-visualizer/issues/new?title=${encodeURIComponent(fullTitle)}&body=${encodeURIComponent(bodyTemplate)}&labels=${encodeURIComponent(issueType)}`;
    window.open(url, '_blank');
    setShowFeedbackModal(false);
    setIssueTitle('');
    setIssueBody('');
  };

  useEffect(() => {
    if (error) {
      setShowToast(true);
    } else {
      setShowToast(false);
    }
  }, [error]);

  useEffect(() => {
    // Check if user has already dismissed the prompt
    const dismissed = localStorage.getItem('ezkafka_star_prompt_dismissed');
    if (dismissed === 'true') return;

    // Show prompt after 45 seconds
    const timer = setTimeout(() => {
      setShowStarPrompt(true);
    }, 45000);

    return () => clearTimeout(timer);
  }, []);
  
  // Use global server context
  const { activeProfile, selectedProfileId } = useServer();

  const fetchTopics = useCallback(async (profileId?: string) => {
    setLoading(true);
    setError(null);
    try {
      // Use the provided profileId or fall back to the globally selected one
      const targetProfileId = profileId || selectedProfileId;
      const url = targetProfileId ? `/api/topics?profileId=${encodeURIComponent(targetProfileId)}` : '/api/topics';
      const response = await fetch(url);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to fetch topics');
      }
      const data = await response.json();
      setTopics(data);
    } catch (err) {
      console.error('Failed to fetch topics:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    if (selectedProfileId) {
      fetchTopics();
    }
    // Load app name from active profile
    if (activeProfile?.settings?.appName) {
      setAppName(activeProfile.settings.appName);
    }
  }, [selectedProfileId, activeProfile, fetchTopics]); // Re-fetch when server changes

  const tabs = [
    { id: 'topics', label: 'Topics', icon: Database, path: '/topics' },
    { id: 'producer', label: 'Message Producer', icon: MessageSquare, path: '/producer' },
    { id: 'groups', label: 'Consumer Groups', icon: Users, path: '/groups' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ] as const;

  return (
    <div className="flex flex-col w-full h-screen bg-black text-zinc-300 font-sans">
      {/* Top Navbar */}
      <nav className="h-14 dev-nav flex items-center justify-between px-4 relative z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 flex items-center justify-center">
            <Database className="w-5 h-5 text-black" />
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight">{appName}</h1>
            <span className="text-[9px] font-mono font-bold text-zinc-500 bg-zinc-900 border border-zinc-800 px-1 py-0.5 uppercase tracking-wider">v1.0.1</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* External Links */}
          <div className="flex items-center gap-2 border-r border-zinc-800 pr-3 mr-1">
            <a
              href="https://github.com/thechandanbhagat/ezkafka-visualizer"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-90 transition-opacity flex items-center cursor-pointer"
              title="Star on GitHub"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://img.shields.io/github/stars/thechandanbhagat/ezkafka-visualizer?style=flat&logo=github&color=10b981" alt="GitHub Stars" className="h-5" />
            </a>
            <a
              href="https://hub.docker.com/repository/docker/chandanbhagat/ezkafka-visualizer"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-90 transition-opacity flex items-center cursor-pointer"
              title="Docker Hub Image"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://img.shields.io/docker/pulls/chandanbhagat/ezkafka-visualizer?style=flat&logo=docker&color=099cec" alt="Docker Pulls" className="h-5" />
            </a>
            <button
              onClick={() => setShowFeedbackModal(true)}
              className="p-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900 transition-colors focus:outline-none flex items-center justify-center cursor-pointer"
              title="Report an Issue"
            >
              <Bug className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 border border-zinc-800 bg-zinc-950">
            <div className={`w-2 h-2 rounded-full ${error ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : loading ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`}></div>
            <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
              {error ? 'Disconnected' : loading ? 'Connecting...' : 'Connected'}
            </span>
          </div>
          
          {/* Server Selector */}
          <div className="relative">
            <NavbarServerSelector />
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
      <div className={`${collapsed ? 'w-16' : 'w-64'} relative bg-black border-r border-zinc-800 flex-shrink-0 transition-all duration-300 ease-in-out`}>
        {/* Sidebar header */}
        <div className="h-14 px-3 border-b border-zinc-800 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Navigation</span>
            </div>
          )}
          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(v => !v)}
            className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900 transition-colors duration-150 rounded-none focus:outline-none"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="py-2 px-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = current === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigateTo(tab.path)}
                className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-start'} gap-3 px-3 py-3 mb-1 transition-all duration-150 group border-l-2 ${
                  active
                    ? 'border-emerald-500 bg-zinc-900 text-emerald-400 font-bold'
                    : 'border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
                }`}
                title={collapsed ? tab.label : undefined}
              >
                <Icon className="w-4 h-4" />
                {!collapsed && <span className="text-sm font-mono">{tab.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className={`absolute bottom-0 left-0 right-0 ${collapsed ? 'px-2 py-3' : 'px-4 py-4'} border-t border-zinc-800 bg-black`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed && (
              <div className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase">
                Kafka Viz v1.0
              </div>
            )}
            {error && !collapsed && (
              <button
                onClick={() => fetchTopics()}
                className="px-2 py-1 text-[10px] font-mono font-bold text-red-400 border border-red-900 hover:bg-red-950/30 uppercase tracking-wider"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Tab Content */}
        <div className={`flex-1 overflow-auto bg-transparent w-full p-6 transition-all duration-300 ${isConsumerActive ? 'pb-[calc(50vh+1.5rem)]' : ''}`}>
          <div className="w-full">
            {current === 'topics' && (
              <TopicList topics={topics} loading={loading} onRefresh={fetchTopics} />
            )}
            {current === 'producer' && <MessageProducer topics={topics.map((t) => t.name)} connectionError={error} />}
            {current === 'groups' && <ConsumerGroups onRefresh={() => fetchTopics()} />}
            {current === 'settings' && (
              <KafkaSettings
                onSettingsUpdate={(multiServerConfig) => {
                  console.log('Settings updated:', multiServerConfig);
                  // Get the active profile and use its app name
                  const activeProfile = multiServerConfig?.profiles.find(p => p.id === multiServerConfig.activeProfileId);
                  if (activeProfile?.settings?.appName) {
                    setAppName(activeProfile.settings.appName);
                  }
                  fetchTopics();
                }}
              />
            )}
          </div>
        </div>

        {/* Persistent Taskbar / Bottom Panel */}
        <div className="flex-none bg-black z-40 relative">
          <ConsumerTaskbar topics={topics.map((t) => t.name)} connectionError={error} onActiveConsumerChange={setIsConsumerActive} />
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-20 right-6 z-50 max-w-sm w-96 bg-zinc-950/95 backdrop-blur-md border border-red-900/50 p-4 shadow-[0_0_30px_rgba(239,68,68,0.15)] animate-toast-slide-in flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-red-950/50 border border-red-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider">Connection Error</h3>
                <p className="text-xs font-mono text-zinc-400 mt-1 break-words leading-relaxed">{error}</p>
              </div>
            </div>
            <button
              onClick={() => setShowToast(false)}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors focus:outline-none cursor-pointer"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex justify-end gap-2 border-t border-zinc-900 pt-3">
            <button
              onClick={() => {
                fetchTopics();
              }}
              className="dev-btn py-1 px-3 text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              RETRY
            </button>
          </div>
        </div>
      )}

      {/* GitHub Star Prompt Modal */}
      {showStarPrompt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_50px_rgba(16,185,129,0.15)] animate-modal-scale-in flex flex-col gap-6 relative rounded-none">
            {/* Close button top right */}
            <button
              onClick={() => {
                localStorage.setItem('ezkafka_star_prompt_dismissed', 'true');
                setShowStarPrompt(false);
              }}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none cursor-pointer"
              aria-label="Dismiss prompt"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Star className="w-8 h-8 fill-current text-emerald-400 animate-pulse" />
              </div>
              <h2 className="text-lg font-bold font-mono text-zinc-100 uppercase tracking-wider mt-2">
                Support EZ Kafka Visualizer!
              </h2>
              <p className="text-xs font-mono text-zinc-400 leading-relaxed max-w-sm mt-1">
                If you find this project useful, please support us by starring our repository on GitHub and pulling our official image from Docker Hub!
              </p>
              <div className="flex gap-2 justify-center mt-1">
                <a href="https://github.com/thechandanbhagat/ezkafka-visualizer" target="_blank" rel="noopener noreferrer" className="hover:opacity-90 transition-opacity">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="https://img.shields.io/github/stars/thechandanbhagat/ezkafka-visualizer?style=flat&logo=github&color=10b981" alt="GitHub Stars" className="h-5" />
                </a>
                <a href="https://hub.docker.com/repository/docker/chandanbhagat/ezkafka-visualizer" target="_blank" rel="noopener noreferrer" className="hover:opacity-90 transition-opacity">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="https://img.shields.io/docker/pulls/chandanbhagat/ezkafka-visualizer?style=flat&logo=docker&color=099cec" alt="Docker Pulls" className="h-5" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-2">
              <a
                href="https://github.com/thechandanbhagat/ezkafka-visualizer"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  localStorage.setItem('ezkafka_star_prompt_dismissed', 'true');
                  setShowStarPrompt(false);
                }}
                className="dev-btn-primary py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-mono cursor-pointer"
              >
                <Github className="w-4 h-4" />
                STAR ON GITHUB
              </a>
              <a
                href="https://hub.docker.com/repository/docker/chandanbhagat/ezkafka-visualizer"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  localStorage.setItem('ezkafka_star_prompt_dismissed', 'true');
                  setShowStarPrompt(false);
                }}
                className="dev-btn py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-mono cursor-pointer"
              >
                <Package className="w-4 h-4" />
                DOCKER HUB
              </a>
            </div>

            <div className="flex justify-center mt-2 border-t border-zinc-900 pt-4">
              <button
                onClick={() => {
                  localStorage.setItem('ezkafka_star_prompt_dismissed', 'true');
                  setShowStarPrompt(false);
                }}
                className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 uppercase tracking-widest cursor-pointer underline underline-offset-4"
              >
                Already starred or close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Issue / Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 p-6 shadow-[0_0_50px_rgba(16,185,129,0.1)] animate-modal-scale-in flex flex-col gap-4 relative rounded-none">
            {/* Close button top right */}
            <button
              onClick={() => setShowFeedbackModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors focus:outline-none cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-500">
                <Bug className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-mono font-bold text-zinc-100 uppercase tracking-widest">
                Create GitHub Issue
              </h2>
            </div>

            <div className="flex flex-col gap-4 mt-2">
              <div>
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                  Issue Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['bug', 'feature', 'feedback'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setIssueType(t)}
                      className={`py-1.5 px-3 border text-xs font-mono tracking-wider transition-colors cursor-pointer uppercase ${
                        issueType === t
                          ? 'bg-zinc-900 border-emerald-500 text-emerald-400 font-bold'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="Summarize the issue..."
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  className="w-full dev-input py-2 px-3 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
                  Details
                </label>
                <textarea
                  rows={4}
                  placeholder="Provide steps to reproduce or feature description..."
                  value={issueBody}
                  onChange={(e) => setIssueBody(e.target.value)}
                  className="w-full dev-input py-2 px-3 focus:border-emerald-500 min-h-[100px] resize-y"
                />
                <div className="text-[10px] font-mono text-zinc-500 mt-2 flex items-start gap-1.5 bg-zinc-950/40 p-2 border border-zinc-900 leading-normal">
                  <span className="text-emerald-500 flex-shrink-0">💡</span>
                  <span><strong>Tip:</strong> You can drag & drop or paste (<code>Ctrl + V</code>) screenshots directly into the GitHub issue description editor after clicking submit.</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-900 bg-black/50 flex justify-end gap-3 -mx-6 -mb-6 mt-2">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="dev-btn px-6 py-1.5 text-xs cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleSubmitIssue}
                disabled={!issueTitle.trim() || !issueBody.trim()}
                className="dev-btn-primary px-6 py-1.5 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                REPORT ON GITHUB
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
