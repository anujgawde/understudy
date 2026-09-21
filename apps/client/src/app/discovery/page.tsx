import { redirect } from 'next/navigation';
import { getCapabilities, getDiscoveryRun } from '@/lib/data';

export default async function DiscoveryPage() {
  const capabilities = await getCapabilities();
  for (const capability of capabilities) {
    const run = await getDiscoveryRun(capability.capabilityId);
    if (run) redirect(`/discovery/${run.runId}`);
  }
  redirect('/capabilities');
}
