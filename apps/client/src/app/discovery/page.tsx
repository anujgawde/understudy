import { redirect } from 'next/navigation';
import { discoveryRun } from '@/fixtures';

export default function DiscoveryPage() {
  redirect(`/discovery/${discoveryRun.runId}`);
}
