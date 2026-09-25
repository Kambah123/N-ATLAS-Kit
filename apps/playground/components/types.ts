import { type CodeRequest } from '@/lib/snippets';

export type LastAction = {
  title: string;
  request: CodeRequest;
};

export type HealthView = {
  status: 'checking' | 'unconfigured' | 'ready' | 'degraded' | 'waking' | 'offline';
  message: string;
};
