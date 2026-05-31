'use client';

import { useEffect, useCallback } from 'react';
import { App } from '@capacitor/app';
import { useAppStore } from '@/store/appStore';

// Track open modals state
type ModalType = 'lesson' | 'student' | 'dailyReport' | 'settings' | 'students' | 'statistics' | 'learningHistory' | 'extraThemes';

const modalState: Record<ModalType, boolean> = {
  lesson: false,
  student: false,
  dailyReport: false,
  settings: false,
  students: false,
  statistics: false,
  learningHistory: false,
  extraThemes: false,
};

// Track which modals are currently open
let openModals: ModalType[] = [];

export function setModalOpen(modal: ModalType, isOpen: boolean) {
  modalState[modal] = isOpen;
  if (isOpen) {
    if (!openModals.includes(modal)) {
      openModals.push(modal);
    }
  } else {
    openModals = openModals.filter(m => m !== modal);
  }
}

export function useBackButtonHandler() {
  const handleBackButton = useCallback(async () => {
    // Check if any modal is open
    if (openModals.length > 0) {
      // Close the most recent modal
      const lastModal = openModals[openModals.length - 1];
      setModalOpen(lastModal, false);

      // Dispatch custom event to close the modal
      window.dispatchEvent(new CustomEvent('closeModal', { detail: lastModal }));
      return;
    }

    // If on schedule tab (default), minimize app instead of closing
    // User can use app switcher to close
    await App.minimizeApp();
  }, []);

  useEffect(() => {
    // Only register on mobile/Capacitor
    if (typeof window === 'undefined' || !(window as { Capacitor?: unknown }).Capacitor) {
      return;
    }

    // Register back button listener
    let listener: { remove: () => void } | null = null;
    App.addListener('backButton', handleBackButton).then((l) => {
      listener = l;
    });

    return () => {
      listener?.remove();
    };
  }, [handleBackButton]);
}

// Hook for individual modals to register themselves
export function useModalBackButton(modalType: ModalType, isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    setModalOpen(modalType, isOpen);
    
    const handleCloseModal = (e: CustomEvent) => {
      if (e.detail === modalType && isOpen) {
        onClose();
      }
    };

    window.addEventListener('closeModal', handleCloseModal as EventListener);
    
    return () => {
      setModalOpen(modalType, false);
      window.removeEventListener('closeModal', handleCloseModal as EventListener);
    };
  }, [modalType, isOpen, onClose]);
}

export default function BackButtonHandler() {
  useBackButtonHandler();
  return null;
}
