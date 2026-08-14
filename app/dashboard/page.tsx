'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OverviewDashboard() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/ai-settings');
  }, [router]);

  return null;
}

