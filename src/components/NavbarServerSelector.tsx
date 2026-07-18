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
      <div className={`flex items-center gap-3 px-4 py-2 bg-black border border-zinc-800 rounded-none ${className}`}>
        <div className="w-3 h-3 rounded-full border-2 border-zinc-800 border-t-emerald-500 animate-spin"></div>
        <span className="text-xs font-mono font-bold text-zinc-500 tracking-wider">LOADING...</span>
      </div>
    );
  }

  if (!multiServerConfig || multiServerConfig.profiles.length === 0) {
    return (
      <div className={`flex items-center gap-3 px-4 py-2 bg-black border border-red-900 rounded-none ${className}`}>
        <Server className="w-4 h-4 text-red-500" />
        <span className="text-xs font-mono font-bold text-red-500 tracking-wider uppercase">NO_SERVERS</span>
      </div>
    );
  }

  return (
    <div className="relative group">
      <button className={`flex items-center gap-3 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-none hover:border-emerald-500/50 shadow-none transition-colors duration-150 ${className}`}>
        <div className={`flex items-center justify-center w-6 h-6 rounded-none ${activeProfile ? 'bg-emerald-500/10' : 'bg-zinc-900'}`}>
          <Server className={`w-3.5 h-3.5 ${activeProfile ? 'text-emerald-500' : 'text-zinc-600'}`} />
        </div>
        <div className="text-left flex-1 min-w-0 pr-2">
          <div className="text-xs font-mono font-bold text-zinc-100 truncate leading-tight uppercase">
            {activeProfile?.name || 'NO_SERVER'}
          </div>
          <div className="text-[10px] font-mono text-zinc-500 truncate tracking-wider mt-0.5">
            {activeProfile?.settings.brokers[0] || 'DISCONNECTED'}
          </div>
        </div>
        <ChevronDown className="w-4 h-4 text-zinc-600 group-hover:text-emerald-500 transition-colors" />
      </button>

      {/* Dropdown */}
      <div className="absolute top-full right-0 mt-1 w-80 bg-zinc-950 border border-zinc-800 rounded-none shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 transform origin-top-right scale-95 group-hover:scale-100">
        <div className="p-0">
          <div className="px-4 py-2 text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest border-b border-zinc-900 bg-black">SELECT_SERVER</div>
          <div className="max-h-72 overflow-y-auto">
            {multiServerConfig.profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => switchProfile(profile.id)}
                className={`w-full text-left px-4 py-3 border-b border-zinc-900 transition-colors duration-150 group/item ${
                  profile.id === selectedProfileId
                    ? 'bg-zinc-900 border-l-2 border-l-emerald-500'
                    : 'hover:bg-zinc-900 border-l-2 border-l-transparent'
                }`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className={`font-mono text-sm font-bold truncate pr-3 ${profile.id === selectedProfileId ? 'text-emerald-400' : 'text-zinc-300 group-hover/item:text-emerald-400'}`}>
                      {profile.name}
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-zinc-500 truncate tracking-wider">
                    {profile.settings.brokers.join(', ')}
                  </div>
                  {profile.description && (
                    <div className="text-[10px] font-mono text-zinc-600 truncate mt-1">
                      {`// ${profile.description}`}
                    </div>
                  )}
                  {profile.lastConnected && (
                    <div className="text-[10px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">
                      LAST_CONN: {new Date(profile.lastConnected).toLocaleString()}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}