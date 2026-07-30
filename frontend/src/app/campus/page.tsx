import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

import { MetaverseCampus } from '../../components/Metaverse';
import ErrorBoundary from '../../components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'Metaverse Campus — StarkEd',
  description: 'Immersive virtual learning campus with classrooms, social spaces, and avatar interaction.',
};

export default function CampusPage() {
  return (
    <ErrorBoundary>
      <MetaverseCampus />
    </ErrorBoundary>
  );
}
