import type { Metadata } from 'next';
import { createMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

import { MetaverseCampus } from '../../components/Metaverse';
import ErrorBoundary from '../../components/ErrorBoundary';

export const metadata: Metadata = createMetadata({
  title: 'Metaverse Campus',
  description: 'Immersive virtual learning campus with classrooms, social spaces, and avatar interaction.',
  keywords: ['virtual campus', 'collaborative learning', 'online classroom'],
});

export default function CampusPage() {
  return (
    <ErrorBoundary>
      <MetaverseCampus />
    </ErrorBoundary>
  );
}
