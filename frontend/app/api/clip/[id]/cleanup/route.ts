import { NextRequest, NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/backend-client';

const BACKEND_SECRET = process.env.BACKEND_SECRET || 'dev-secret';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const backendUrl = getBackendUrl();

    const backendCleanupRes = await fetch(`${backendUrl}/api/clip/${id}/cleanup`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${BACKEND_SECRET}`,
      },
    });

    if (!backendCleanupRes.ok) {
      console.warn(`[cleanup] Backend cleanup failed for ${id}:`, await backendCleanupRes.text());
      return NextResponse.json({ success: false }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[cleanup] Route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
