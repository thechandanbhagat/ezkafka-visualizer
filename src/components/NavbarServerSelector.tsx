'use client';

// @group Configuration : Cluster selector dependencies
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Server } from 'lucide-react';
import { useServer } from '@/contexts/ServerContext';

// @group Types : Cluster selector presentation options
interface NavbarServerSelectorProps {
  className?: string;
}

// @group Components > ClusterSelector : Accessible current cluster menu
export default function NavbarServerSelector({ className = '' }: NavbarServerSelectorProps) {
  const { multiServerConfig, selectedProfileId, isLoading, switchProfile, activeProfile } = useServer();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const selected = menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (selected || menu.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (isLoading) {
    return <div className="cluster-trigger text-xs text-muted" role="status"><Server size={16} />Loading clusters…</div>;
  }

  if (!multiServerConfig?.profiles.length) {
    return <div className="cluster-trigger text-xs text-muted"><Server size={16} />No clusters configured</div>;
  }

  return (
    <div ref={container} className={`relative min-w-0 ${className}`}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      }}>
      <button ref={trigger} className="cluster-trigger" aria-label="Select cluster" title={activeProfile?.settings.brokers.join(', ')} aria-haspopup="menu" aria-expanded={open} aria-controls="cluster-menu"
        onClick={() => setOpen(value => !value)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
        }}>
        <Server size={17} className="text-muted shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-semibold text-ink truncate">{activeProfile?.name || 'Select a cluster'}</span>
        </span>
        <ChevronDown size={14} className="text-muted shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menu} id="cluster-menu" className="cluster-menu" role="menu" aria-label="Clusters"
          onKeyDown={event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') || []);
            const index = options.indexOf(document.activeElement as HTMLButtonElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options[next]?.focus();
          }}>
          <div className="text-xs text-muted px-3 py-2 border-b border-line mb-1">Switch cluster</div>
          {multiServerConfig.profiles.map(profile => (
            <button key={profile.id} role="menuitemradio" aria-checked={profile.id === selectedProfileId} className="cluster-option"
              onClick={() => {
                if (profile.id !== selectedProfileId) void switchProfile(profile.id);
                setOpen(false);
                trigger.current?.focus();
              }}>
              <span className="flex items-center justify-between gap-3 text-sm font-medium text-ink">
                <span className="truncate">{profile.name}</span>
                {profile.id === selectedProfileId && <Check size={15} className="text-accent shrink-0" aria-hidden="true" />}
              </span>
              <span className="block text-xs text-muted truncate mt-1">{profile.settings.brokers.join(', ')}</span>
              {profile.description && <span className="block text-xs text-muted mt-1">{profile.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
