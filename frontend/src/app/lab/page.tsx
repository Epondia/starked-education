import type { Metadata } from 'next';
import { createMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

import { VirtualScienceLab } from '../../components/Lab';
import ErrorBoundary from '../../components/ErrorBoundary';

export const metadata: Metadata = createMetadata({
  title: 'Virtual Science Laboratory',
  description: 'Interactive virtual lab for experiments with 3D equipment, guided steps, safety warnings, and collaboration.',
  keywords: ['virtual laboratory', 'science education', 'interactive learning'],
});

export default function LabPage() {
  return (
    <ErrorBoundary>
      <VirtualScienceLab />
    </ErrorBoundary>
  );
}
