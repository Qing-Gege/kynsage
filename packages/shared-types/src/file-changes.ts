export interface FileChangeEvent {
  path: string;
  type: 'add' | 'change' | 'unlink';
  timestamp: number;
}

export interface ChangeTracker {
  sessionId: string;
  files: Map<string, { touched: boolean; active: boolean }>;
}
