import { create } from 'zustand';
import type { AgentSession } from '@marshal/core';

interface AgentsStore {
  sessions: AgentSession[];
  activeSessionId: string | null;
  addSession: (session: AgentSession) => void;
  removeSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<Omit<AgentSession, 'id'>>) => void;
  setActiveSession: (id: string | null) => void;
  getActiveSession: () => AgentSession | undefined;
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  addSession: (session) => {
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    }));
  },

  removeSession: (id) => {
    set((state) => {
      const filtered = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: filtered,
        activeSessionId:
          state.activeSessionId === id
            ? filtered[0]?.id ?? null
            : state.activeSessionId,
      };
    });
  },

  updateSession: (id, updates) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
  },

  getActiveSession: () => {
    const state = get();
    return state.sessions.find((s) => s.id === state.activeSessionId);
  },
}));
