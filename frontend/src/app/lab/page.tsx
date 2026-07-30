import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

import { VirtualScienceLab } from '../../components/Lab';
import ErrorBoundary from '../../components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'Virtual Science Laboratory — StarkEd',
  description: 'Interactive virtual lab for experiments with 3D equipment, guided steps, safety warnings, and collaboration.'
};

export default function LabPage() {
  return (
    <ErrorBoundary>
      <VirtualScienceLab />
    </ErrorBoundary>
  );
}
