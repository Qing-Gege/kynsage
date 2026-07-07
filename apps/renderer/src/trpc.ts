import type { AppRouter } from '@kynsage/ipc-contract';

declare global {
  interface Window {
    electronTRPC: {
      sendMessage: (op: { type: string; input: unknown; path: string; id: number }) => void;
      onMessage: (callback: (data: unknown) => void) => void;
    };
  }
}

type TRPCResponse = { id: number; result?: unknown; error?: { message: string } };

let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

if (typeof window !== 'undefined' && window.electronTRPC) {
  window.electronTRPC.onMessage((data) => {
    const msg = data as TRPCResponse;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) {
      entry.reject(new Error(msg.error.message));
    } else {
      entry.resolve(msg.result);
    }
  });
}

function call(type: 'query' | 'mutation', path: string, input: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.electronTRPC) {
      reject(new Error('electronTRPC not available'));
      return;
    }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    window.electronTRPC.sendMessage({ type, input, path, id });
  });
}

// 递归 Proxy：trpc.fs.readdir.query({...}) → call('query', 'fs.readdir', {...})
function createProxy(path: string[]): any {
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'query') {
          return (input?: unknown) => call('query', path.join('.'), input);
        }
        if (prop === 'mutate') {
          return (input?: unknown) => call('mutation', path.join('.'), input);
        }
        return createProxy([...path, prop]);
      },
    }
  );
}

export const trpc = createProxy([]) as unknown as AppRouter;
