import { redirect } from 'next/navigation';
import { getCapabilities } from '@/lib/data';

export default async function ShapingIndexPage() {
  const capabilities = await getCapabilities();
  const first = capabilities[0];

  // Shaping is a view of one artifact, so with nothing recorded there is
  // nothing to review — the catalog is the honest place to land.
  redirect(first ? `/shaping/${first.capabilityId}` : '/capabilities');
}
