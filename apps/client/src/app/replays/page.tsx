import { redirect } from 'next/navigation';
import { runs } from '@/fixtures';

export default function ReplaysPage() {
  redirect(`/replays/${runs[0].runId}`);
}
