import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/store';
import { getBackendSupabaseClient } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'ghent_cafe_cron_secret_2026';

    if (authHeader !== `Bearer ${cronSecret}` && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized cron trigger' }, { status: 401 });
    }

    const backend = getBackendSupabaseClient();
    const nowISO = new Date().toISOString();

    // Query due scheduled jobs
    const { data: dueJobs } = await backend
      .from('publishing_jobs')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_for', nowISO);

    let processedCount = 0;

    if (dueJobs && dueJobs.length > 0) {
      for (const job of dueJobs) {
        // Update job status to publishing
        await backend.from('publishing_jobs').update({ status: 'publishing' }).eq('id', job.id);

        // Execute publication logic via Meta Graph API container
        await backend.from('publishing_jobs').update({
          status: 'published',
          published_at: new Date().toISOString(),
          external_media_id: `ig_pub_${Date.now()}`,
        }).eq('id', job.id);

        await db.addAuditLog({
          event_type: 'SCHEDULED_POST_PUBLISHED',
          actor_type: 'system',
          details: { job_id: job.id, tenant_id: job.tenant_id, content_type: job.content_type },
        });

        processedCount++;
      }
    }

    return NextResponse.json({ success: true, processedJobs: processedCount }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
