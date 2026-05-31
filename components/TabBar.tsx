'use client';

import React from 'react';
import { Calendar, Users, ListTodo, BarChart3, Settings, Wallet } from 'lucide-react';
import type { TabType } from '@/types';

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'schedule', label: 'Расписан.', icon: Calendar },
  { id: 'students', label: 'Ученики', icon: Users },
  { id: 'tasks', label: 'Дела', icon: ListTodo },
  { id: 'finance', label: 'Финансы', icon: Wallet },
  { id: 'stats', label: 'Статистик.', icon: BarChart3 },
  { id: 'settings', label: 'Настройки', icon: Settings },
];

export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const [tabIcons, setTabIcons] = React.useState<Record<string, string>>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('tab_icons');
        if (saved) return JSON.parse(saved);
      }
    } catch {}
    return {};
  });

  React.useEffect(() => {
    const handleStorageChange = () => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const saved = localStorage.getItem('tab_icons');
          if (saved) setTabIcons(JSON.parse(saved));
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageUpdated', handleStorageChange);
    };
  }, []);

  return (
    <div className="tab-bar safe-area-bottom">
      <div className="flex items-center justify-around px-1 pt-1 pb-safe" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const customIcon = tabIcons[tab.id];
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl transition-all duration-200 flex-1 min-w-0 ${
                isActive
                  ? 'text-neon-purple bg-neon-purple/10'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {customIcon ? (
                <span className={`text-xl ${isActive ? 'neon-glow-purple' : ''}`}>{customIcon}</span>
              ) : (
                <Icon className={`w-5 h-5 ${isActive ? 'neon-glow-purple' : ''}`} />
              )}
              <span className="text-[8px] font-medium truncate w-full text-center leading-tight">{tab.label}</span>
              {isActive && (
                <div className="w-1 h-1 rounded-full bg-neon-purple" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
