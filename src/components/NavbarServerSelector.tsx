'use client';

import React from 'react';
import { ChevronDown, Server } from 'lucide-react';
import { useServer } from '@/contexts/ServerContext';

interface NavbarServerSelectorProps {
  className?: string;
  collapsed?: boolean;
}

export default function NavbarServerSelector({ className = '', collapsed = false }: NavbarServerSelectorProps) {
  const { multiServerConfig, selectedProfileId, isLoading, switchProfile, activeProfile } = useServer();

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm text-gray-500">Loading servers...</span>
      </div>
    );
  }

  if (!multiServerConfig || multiServerConfig.profiles.length === 0) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        <Server className="w-4 h-4 text-red-500" />
        <span className="text-sm text-red-500">No servers available</span>
      </div>
    );
  }

  return (
    <div className="relative group">
      <button className={`flex items-center gap-3 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${className}`}>
        <Server className={`w-4 h-4 ${activeProfile ? 'text-blue-600' : 'text-gray-500'}`} />
        <div className="text-left">
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {activeProfile?.name || 'No server'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {activeProfile?.settings.brokers[0] || 'Not connected'}
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
      </button>

      {/* Dropdown */}
      <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="p-3">
          <div className="text-sm font-medium text-gray-900 dark:text-white mb-3">Select Kafka Server</div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {multiServerConfig.profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => switchProfile(profile.id)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  profile.id === selectedProfileId
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-700 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {profile.name}
                      </div>
                      {profile.id === selectedProfileId && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {profile.settings.brokers.join(', ')}
                    </div>
                    {profile.description && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {profile.description}
                      </div>
                    )}
                  </div>
                </div>
                {profile.lastConnected && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Last connected: {new Date(profile.lastConnected).toLocaleString()}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}