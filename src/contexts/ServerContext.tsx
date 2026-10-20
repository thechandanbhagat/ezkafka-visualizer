'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { MultiServerConfig, KafkaServerProfile } from '@/lib/kafka-settings';

// @group Types : Shared configuration with a browser-local cluster selection
interface ServerContextType {
  multiServerConfig: MultiServerConfig | null;
  activeProfile: KafkaServerProfile | null;
  selectedProfileId: string;
  connectionKey: string;
  isLoading: boolean;
  error: string | null;
  setSelectedProfileId: (profileId: string) => void;
  applyConfig: (config: MultiServerConfig) => void;
  refreshConfig: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
}

// @group Constants : Local preference does not change other users' selected clusters
const SELECTED_PROFILE_STORAGE_KEY = 'ezkafka.selectedProfileId';
const ServerContext = createContext<ServerContextType | undefined>(undefined);

// @group Utilities : Storage restrictions must not prevent ordinary cluster selection
function readStoredProfile(): string {
  try { return window.localStorage.getItem(SELECTED_PROFILE_STORAGE_KEY) || ''; } catch { return ''; }
}
function saveStoredProfile(profileId: string): void {
  try { window.localStorage.setItem(SELECTED_PROFILE_STORAGE_KEY, profileId); } catch { /* Session selection still works when storage is unavailable. */ }
}

// @group BusinessLogic : Centralize config changes and invalidate stale configuration reads
export function ServerProvider({ children }: { children: ReactNode }) {
  const [multiServerConfig, setMultiServerConfig] = useState<MultiServerConfig | null>(null);
  const [selectedProfileId, updateSelectedProfileId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configRef = useRef<MultiServerConfig | null>(null);
  const selectionRef = useRef('');
  const requestSequence = useRef(0);

  const applyConfig = useCallback((config: MultiServerConfig) => {
    requestSequence.current += 1;
    configRef.current = config;
    const preferred = selectionRef.current || readStoredProfile();
    const selected = config.profiles.some(profile => profile.id === preferred) ? preferred :
      config.profiles.some(profile => profile.id === config.activeProfileId) ? config.activeProfileId : config.profiles[0]?.id || '';
    selectionRef.current = selected;
    saveStoredProfile(selected);
    updateSelectedProfileId(selected);
    setMultiServerConfig(config);
    setError(null);
    setIsLoading(false);
  }, []);

  const setSelectedProfileId = useCallback((profileId: string) => {
    if (!configRef.current?.profiles.some(profile => profile.id === profileId)) {
      setError('The selected cluster profile is no longer available. Refresh settings.');
      return;
    }
    selectionRef.current = profileId;
    saveStoredProfile(profileId);
    updateSelectedProfileId(profileId);
    setError(null);
  }, []);

  const switchProfile = useCallback(async (profileId: string) => {
    setSelectedProfileId(profileId);
  }, [setSelectedProfileId]);

  const refreshConfig = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (sequence !== requestSequence.current) return;
      if (!response.ok || !data.success || !Array.isArray(data.multiServerConfig?.profiles)) {
        throw new Error(data.error || 'Failed to load server configuration');
      }
      applyConfig(data.multiServerConfig);
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load server configuration');
      setIsLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    void refreshConfig();
    return () => { requestSequence.current += 1; };
  }, [refreshConfig]);

  const activeProfile = multiServerConfig?.profiles.find(profile => profile.id === selectedProfileId) || null;
  const connectionKey = activeProfile ? JSON.stringify([activeProfile.id, activeProfile.settings]) : '';
  return (
    <ServerContext.Provider value={{ multiServerConfig, activeProfile, selectedProfileId, connectionKey, isLoading, error, setSelectedProfileId, applyConfig, refreshConfig, switchProfile }}>
      {children}
    </ServerContext.Provider>
  );
}

// @group Exports : Shared profile access for API callers and connection-aware views
export function useServer() {
  const context = useContext(ServerContext);
  if (!context) throw new Error('useServer must be used within a ServerProvider');
  return context;
}

export function useActiveProfileId(): string {
  return useServer().selectedProfileId;
}
