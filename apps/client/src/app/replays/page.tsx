import { redirect } from 'next/navigation';
import { getReplayRuns } from '@/lib/data';

export default async function ReplaysPage() {
  const runs = await getReplayRuns();
  if (runs.length === 0) redirect('/capabilities');
  redirect(`/replays/${runs[0]!.runId}`);
}
