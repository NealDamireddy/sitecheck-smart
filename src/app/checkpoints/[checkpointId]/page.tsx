'use client';

import { use } from 'react';
import { CheckpointDetail } from '@/components/checkpoints/checkpoint-detail';

export default function CheckpointDetailPage({
  params,
}: {
  params: Promise<{ checkpointId: string }>;
}) {
  const { checkpointId } = use(params);
  return <CheckpointDetail checkpointId={checkpointId} />;
}
