import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ToastState, Toast } from '@/types';

// Store timeout IDs outside of Zustand state to avoid type issues
const timeoutMap = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  showToast: (message, type = 'info', duration = 3000) => {
    const id = uuidv4();
    const toast: Toast = { id, message, type, duration };

    set((state) => ({
      toasts: [...state.toasts, toast],
    }));

    if (duration > 0) {
      const timeout = setTimeout(() => {
        get().hideToast(id);
      }, duration);
      timeoutMap.set(id, timeout);
    }
  },

  hideToast: (id) => {
    const timeout = timeoutMap.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutMap.delete(id);
    }
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
