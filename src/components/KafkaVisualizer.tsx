'use client';

// @group Configuration : Workspace dependencies and navigation
import { useState, useEffect, useCallback, useRef } from 'react';
import { Database, MessageSquare, ScanSearch, Users, Settings, PanelLeftClose, PanelLeftOpen, X, RefreshCw, Github, Package, Bug, Network, CircleAlert } from 'lucide-react';
import TopicList from './TopicList';
import MessageProducer from './MessageProducer';
import MessageExplorer from './MessageExplorer';
import ConsumerTaskbar from './ConsumerTaskbar';
import ConsumerGroups from './ConsumerGroups';
import KafkaSettings from './KafkaSettings';
import NavbarServerSelector from './NavbarServerSelector';
import type { TopicInfo } from '@/lib/kafka';
import { useServer } from '@/contexts/ServerContext';

const NAVIGATION = [
  { id: 'topics', label: 'Topics', icon: Database, path: '/topics' },
  { id: 'explorer', label: 'Message explorer', icon: ScanSearch, path: '/explorer' },
  { id: 'producer', label: 'Message producer', icon: MessageSquare, path: '/producer' },
  { id: 'groups', label: 'Consumer groups', icon: Users, path: '/groups' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
] as const;

// @group BusinessLogic > Workspace : Navigation, connection state and feedback
export default function KafkaVisualizer() {
  const [currentPath, setCurrentPath] = useState('/topics');
  const [collapsed, setCollapsed] = useState(false);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectedConnectionKey, setConnectedConnectionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [issueType, setIssueType] = useState<'bug' | 'feature' | 'feedback'>('bug');
  const [isConsumerActive, setIsConsumerActive] = useState(false);
  const requestSequence = useRef(0);
  const feedbackDialog = useRef<HTMLDivElement>(null);
  const { activeProfile, selectedProfileId, connectionKey, isLoading: configLoading, error: configError } = useServer();
  const visibleTopics = connectedConnectionKey === connectionKey ? topics : [];
  const current = NAVIGATION.find(tab => tab.id === currentPath.split('?')[0].split('/')[1]) || NAVIGATION[0];
  const explorerTopic = new URLSearchParams(currentPath.split('?')[1] || '').get('topic') || '';
  const appName = activeProfile?.settings.appName || 'EZ Kafka Visualizer';

  useEffect(() => {
    setCurrentPath(window.location.pathname + window.location.search);
    try { setCollapsed(window.localStorage.getItem('ezkafka.sidebar-collapsed') === 'true'); } catch { /* Storage is optional. */ }
    const handlePopState = () => setCurrentPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (window.location.pathname + window.location.search !== path) window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  // @group BusinessLogic > Preferences : Remember the navigation width on this browser
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem('ezkafka.sidebar-collapsed', String(next)); } catch { /* Navigation also works without storage. */ }
  };

  // @group DatabaseOperations : Load topics for the selected cluster
  const fetchTopics = useCallback(async () => {
    const request = ++requestSequence.current;
    if (!selectedProfileId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/topics?profileId=${encodeURIComponent(selectedProfileId)}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || 'Unable to load topics. Check your cluster settings.');
      }
      const data = await response.json();
      if (request !== requestSequence.current) return;
      setTopics(data);
      setConnectedConnectionKey(connectionKey);
    } catch (err) {
      if (request !== requestSequence.current) return;
      setConnectedConnectionKey(null);
      setError(err instanceof Error ? err.message : 'Unable to connect to this cluster.');
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }, [selectedProfileId, connectionKey]);

  useEffect(() => {
    setTopics([]);
    setConnectedConnectionKey(null);
    setError(null);
    void fetchTopics();
    return () => { requestSequence.current += 1; };
  }, [connectionKey, fetchTopics]);

  useEffect(() => { setShowToast(Boolean(error)); }, [error]);

  // @group Accessibility > Feedback : Restore focus and contain dialog keyboard navigation
  useEffect(() => {
    if (!showFeedbackModal) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    feedbackDialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowFeedbackModal(false);
      if (event.key !== 'Tab') return;
      const controls = feedbackDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [showFeedbackModal]);

  const handleSubmitIssue = () => {
    const prefix = issueType === 'bug' ? '[BUG]' : issueType === 'feature' ? '[FEATURE]' : '[FEEDBACK]';
    const body = `### Description\n${issueBody}\n\n### Environment\n- App version: v1.0.1\n- Platform: ${navigator.userAgent}`;
    window.open(`https://github.com/thechandanbhagat/ezkafka-visualizer/issues/new?title=${encodeURIComponent(`${prefix} ${issueTitle}`)}&body=${encodeURIComponent(body)}&labels=${issueType}`, '_blank', 'noopener,noreferrer');
    setShowFeedbackModal(false);
    setIssueTitle('');
    setIssueBody('');
  };

  const connectionError = error || configError;
  const connectionLabel = connectionError ? 'Disconnected' : configLoading || loading ? 'Connecting' : connectedConnectionKey === connectionKey && selectedProfileId ? 'Connected' : 'No cluster';
  const statusColor = connectionError ? 'var(--color-danger)' : connectionLabel === 'Connected' ? 'var(--color-success)' : 'var(--color-warning)';

  // @group Components > Shell : Navigation rail, cluster bar and route content
  return (
    <div className="workspace">
      <a href="#workspace-content" className="skip-link">Skip to content</a>
      <aside id="workspace-sidebar" className={`workspace-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Workspace sidebar">
        <div className="workspace-brand" title={appName}>
          <div className="brand-symbol"><Network size={23} strokeWidth={1.6} aria-hidden="true" /></div>
          <div className="sidebar-label min-w-0">
            <div className="brand-name">{appName === 'EZ Kafka Visualizer' ? 'EZ Kafka' : appName}</div>
          </div>
        </div>
        <nav className="workspace-navigation" aria-label="Main navigation">
          {NAVIGATION.map(tab => {
            const Icon = tab.icon;
            return (
              <a key={tab.id} href={tab.path} aria-label={tab.label} aria-current={current.id === tab.id ? 'page' : undefined}
                title={tab.label} className="workspace-nav-link"
                onClick={event => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  navigateTo(tab.path);
                }}>
                <Icon aria-hidden="true" />
                <span className="sidebar-label">{tab.label}</span>
                {tab.id === 'topics' && connectedConnectionKey === connectionKey && !error && <span className="workspace-nav-count">{visibleTopics.length}</span>}
              </a>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-utility" onClick={() => setShowFeedbackModal(true)} aria-label="Send feedback" title="Send feedback">
            <Bug size={16} aria-hidden="true" />
          </button>
          <a className="sidebar-utility" href="https://github.com/thechandanbhagat/ezkafka-visualizer" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub"><Github size={16} aria-hidden="true" /></a>
          <a className="sidebar-utility" href="https://hub.docker.com/repository/docker/chandanbhagat/ezkafka-visualizer" target="_blank" rel="noopener noreferrer" aria-label="Docker" title="Docker"><Package size={16} aria-hidden="true" /></a>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-actions">
            <button className="sidebar-collapse icon-button" onClick={toggleSidebar} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-sidebar">
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <NavbarServerSelector />
          </div>
          <div className="connection-status" role="status" aria-label={connectionLabel} title={connectionLabel}>
            <span className="status-dot" style={{ background: statusColor }} /><span>{connectionLabel}</span>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className={`workspace-content ${isConsumerActive ? 'has-consumer' : ''}`}>
          <div className="workspace-page">
            {current.id === 'topics' && <TopicList key={connectionKey} topics={visibleTopics} loading={loading} onRefresh={fetchTopics} onOpenSettings={() => navigateTo('/settings')} onExploreTopic={topic => navigateTo(`/explorer?topic=${encodeURIComponent(topic)}`)} connectionError={connectionError} />}
            {current.id === 'explorer' && <MessageExplorer key={`${connectionKey}:${explorerTopic}`} topics={visibleTopics} loading={loading} connectionError={connectionError} initialTopic={explorerTopic} />}
            {current.id === 'producer' && <MessageProducer key={connectionKey} topics={visibleTopics.map(topic => topic.name)} connectionError={connectionError} />}
            {current.id === 'groups' && <ConsumerGroups key={connectionKey} onRefresh={() => fetchTopics()} />}
            {current.id === 'settings' && <KafkaSettings />}
          </div>
        </main>
        <div className="workspace-taskbar">
          <ConsumerTaskbar key={connectionKey} topics={visibleTopics.map(topic => topic.name)} connectionError={connectionError} onActiveConsumerChange={setIsConsumerActive} />
        </div>
      </div>

      {/* @group Components > Notifications : Recover from connection failures */}
      {showToast && error && (
        <div className="connection-notice" role="alert">
          <div className="flex items-start gap-3">
            <CircleAlert size={19} className="text-danger shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0"><h2 className="text-sm font-semibold">Unable to connect</h2><p className="text-xs text-muted leading-relaxed mt-1 break-words">{error}</p></div>
            <button className="icon-button -mt-1 -mr-1" aria-label="Close notification" onClick={() => setShowToast(false)}><X size={16} /></button>
          </div>
          <div className="flex gap-3 justify-end mt-4">
            <button className="text-xs font-medium text-muted" onClick={() => { setShowToast(false); navigateTo('/settings'); }}>Open settings</button>
            <button className="dev-btn gap-2" onClick={() => fetchTopics()}><RefreshCw size={13} />Retry connection</button>
          </div>
        </div>
      )}

      {/* @group Components > Feedback : Prepare an issue for review on GitHub */}
      {showFeedbackModal && (
        <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setShowFeedbackModal(false); }}>
          <div ref={feedbackDialog} className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-heading">
            <button className="icon-button absolute right-4 top-4" onClick={() => setShowFeedbackModal(false)} aria-label="Close feedback"><X size={18} /></button>
            <h2 id="feedback-heading" className="text-xl font-semibold">Send feedback</h2>
            <p className="text-sm text-muted mt-2">Report a problem or suggest an improvement.</p>
            <fieldset className="mt-6"><legend className="text-xs font-semibold mb-2">Category</legend>
              <div className="flex gap-2">{(['bug', 'feature', 'feedback'] as const).map(type => (
                <button key={type} aria-pressed={issueType === type} onClick={() => setIssueType(type)}
                  className={`dev-btn flex-1 ${issueType === type ? '!bg-accent-soft !text-accent !border-accent/30' : ''}`}>{type === 'bug' ? 'Bug report' : type === 'feature' ? 'Feature' : 'Feedback'}</button>
              ))}</div>
            </fieldset>
            <label htmlFor="issue-title" className="block text-xs font-semibold mt-5 mb-2">Title</label>
            <input id="issue-title" className="dev-input w-full" placeholder="Summarize your feedback" value={issueTitle} onChange={event => setIssueTitle(event.target.value)} />
            <label htmlFor="issue-details" className="block text-xs font-semibold mt-5 mb-2">Details</label>
            <textarea id="issue-details" className="dev-input w-full min-h-28" rows={4} placeholder="What happened, or what would you like to see?" value={issueBody} onChange={event => setIssueBody(event.target.value)} />
            <p className="text-xs text-muted leading-relaxed mt-2">You can review your issue and attach screenshots on GitHub before posting.</p>
            <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-line">
              <button className="dev-btn" onClick={() => setShowFeedbackModal(false)}>Cancel</button>
              <button className="dev-btn-primary" disabled={!issueTitle.trim() || !issueBody.trim()} onClick={handleSubmitIssue}>Continue to GitHub</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
