import { Playground } from '@/components/playground';
import { isBackendConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return <Playground configured={isBackendConfigured()} />;
}
