import type { Metadata } from 'next';
import { createMetadata } from '@/lib/seo';

export async function generateMetadata({
  params,
}: {
  params: { courseId: string };
}): Promise<Metadata> {
  const courseId = encodeURIComponent(params.courseId);
  return createMetadata({
    title: `Course ${params.courseId}`,
    description: `Enroll in course ${params.courseId} and earn a verifiable StarkEd learning credential.`,
    canonical: `/enroll/${courseId}`,
    keywords: ['StarkEd course', 'blockchain course', 'verifiable credential'],
    ogType: 'course',
  });
}

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
