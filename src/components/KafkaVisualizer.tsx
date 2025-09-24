'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Database, MessageSquare, Monitor, Users, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import TopicList from './TopicList';
import MessageProducer from './MessageProducer';
import MessageConsumer from './MessageConsumer';
import ConsumerGroups from './ConsumerGroups';
import KafkaSettings from './KafkaSettings';
import NavbarServerSelector from './NavbarServerSelector';
import { TopicInfo } from '@/lib/kafka';
import { useServer } from '@/contexts/ServerContext';

export default function KafkaVisualizer() {
  const router = useRouter();
  const pathname = usePathname() || '/topics';
  const current = (pathname.split('/')[1] || 'topics') as 'topics' | 'producer' | 'consumer' | 'groups' | 'settings';
  const [collapsed, setCollapsed] = useState(false);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appName, setAppName] = useState<string>('EZ Kafka Visualizer');
  
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
    { id: 'consumer', label: 'Message Consumer', icon: Monitor, path: '/consumer' },
    { id: 'groups', label: 'Consumer Groups', icon: Users, path: '/groups' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ] as const;

  return (
    <div className="flex flex-col w-full h-screen bg-slate-50 dark:bg-slate-900">
      {/* Top Navbar */}
      <nav className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 relative z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
            <Database className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{appName}</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'}`}></div>
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {error ? 'Disconnected' : 'Connected'}
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
      <div className={`${collapsed ? 'w-16' : 'w-64'} relative bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 transition-all duration-200`}>
        {/* Sidebar header */}
        <div className="h-14 px-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Navigation</span>
            </div>
          )}
          <button
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(v => !v)}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
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
                onClick={() => router.push(tab.path)}
                className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-start'} gap-3 px-2 py-2 mb-1 rounded-md transition-colors ${
                  active
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={collapsed ? tab.label : undefined}
              >
                <Icon className="w-4 h-4" />
                {!collapsed && <span className="text-sm font-medium">{tab.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className={`absolute bottom-0 left-0 right-0 ${collapsed ? 'px-2 py-2' : 'px-3 py-3'} border-t border-slate-200 dark:border-slate-800`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Kafka Visualizer v1.0
              </div>
            )}
            {error && !collapsed && (
              <button
                onClick={() => fetchTopics()}
                className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 rounded-md"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3 w-full">
            <div className="flex items-center">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full mr-2"></div>
              <div>
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">Connection Error</h3>
                <div className="mt-0.5 text-xs text-red-700 dark:text-red-300">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 w-full p-4">
          <div className="max-w-7xl mx-auto">
            {current === 'topics' && (
              <TopicList topics={topics} loading={loading} onRefresh={fetchTopics} />
            )}
            {current === 'producer' && <MessageProducer topics={topics.map((t) => t.name)} />}
            {current === 'consumer' && <MessageConsumer topics={topics.map((t) => t.name)} />}
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
      </div>
    </div>
  </div>
  );
}
