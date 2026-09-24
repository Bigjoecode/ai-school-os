import type { AiAgent } from '@aischool/shared';
import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  provider?: string;
  model?: string;
  at: number;
}

interface Thread {
  conversationId?: string;
  messages: ChatMessage[];
}

interface AiState {
  threads: Partial<Record<AiAgent, Thread>>;
  append: (agent: AiAgent, message: ChatMessage) => void;
  setConversation: (agent: AiAgent, conversationId: string) => void;
  reset: (agent: AiAgent) => void;
}

/** Conversations live in memory for the session, one thread per agent. */
export const useAiStore = create<AiState>((set) => ({
  threads: {},
  append: (agent, message) =>
    set((s) => {
      const t = s.threads[agent] ?? { messages: [] };
      return { threads: { ...s.threads, [agent]: { ...t, messages: [...t.messages, message] } } };
    }),
  setConversation: (agent, conversationId) =>
    set((s) => {
      const t = s.threads[agent] ?? { messages: [] };
      return { threads: { ...s.threads, [agent]: { ...t, conversationId } } };
    }),
  reset: (agent) =>
    set((s) => ({ threads: { ...s.threads, [agent]: { messages: [] } } })),
}));

let counter = 0;
export const msgId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;
