'use client';

import React, { useState, useEffect } from 'react';
import Schedule from '@/components/Schedule';
import Students from '@/components/Students';
import Tasks from '@/components/Tasks';
import Statistics from '@/components/Statistics';
import Finance from '@/components/Finance';
import Settings from '@/components/Settings';
import TabBar from '@/components/TabBar';
import Toast from '@/components/Toast';
import type { TabType } from '@/types';
import { useAppStore, initializeStore } from '@/store/appStore';

const tabs: Record<TabType, React.ComponentType> = {
  schedule: Schedule,
  students: Students,
  tasks: Tasks,
  stats: Statistics,
  finance: Finance,
  settings: Settings,
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [error, setError] = useState<string | null>(null);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    const init = async () => {
      try {
        await initializeStore();
      } catch (_error) {
        setError('Не удалось инициализировать приложение. Попробуйте перезагрузить страницу.');
      }
    };
    init();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const ActiveComponent = tabs[activeTab];

  // Global error handler
  useEffect(() => {
    const handleError = (_event: ErrorEvent) => {
      setError('Произошла ошибка. Попробуйте перезагрузить страницу.');
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) {
    return (
      <main className="flex flex-col h-screen bg-gradient-dark overflow-hidden items-center justify-center p-4">
        <div className="glass p-6 rounded-xl text-center max-w-md">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-neon-purple hover:bg-neon-purple/80 transition-colors"
          >
            Перезагрузить
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="w-full h-full bg-gradient-dark overflow-hidden" style={{ height: '100dvh' }}>
      <div className="app-shell">
        {/* Main Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ActiveComponent />
        </div>

        {/* Tab Bar */}
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Toast Notifications */}
        <Toast />
      </div>
    </main>
  );
}
