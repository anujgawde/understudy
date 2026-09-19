import { redirect } from 'next/navigation';
import { shapingSession } from '@/fixtures';

export default function ShapingIndexPage() {
  redirect(`/shaping/${shapingSession.runId}`);
}
