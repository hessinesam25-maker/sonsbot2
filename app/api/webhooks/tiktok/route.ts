import { NextRequest, NextResponse } from 'next/server';
import { TikTokConnector } from '@/lib/connectors/tiktok';

const connector = new TikTokConnector();

export async function GET(req: NextRequest) {
  const status = connector.getConnectionStatus();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const status = connector.getConnectionStatus();
  if (!status.officialConnectionVerified) {
    return NextResponse.json({
      error: 'TikTok Business Messaging API is not connected. Official credentials and authorization required.',
      details: status
    }, { status: 400 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
