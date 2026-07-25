import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Single hop: job status already includes public_url when ready
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:3001';
    const statusRes = await fetch(`${backendUrl}/api/clip/${id}`, {
      headers: {
        "Authorization": `Bearer ${process.env.BACKEND_SECRET || 'dev-secret'}`
      }
    });

    if (!statusRes.ok) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const jobData = await statusRes.json();

    if (jobData.status !== 'ready' || !jobData.url) {
      return NextResponse.json({ error: 'Job not ready' }, { status: 409 });
    }

    const filename = request.nextUrl.searchParams.get('filename') || 'clip.mp4';
    const downloadUrl = new URL(jobData.url);
    downloadUrl.searchParams.set('download', filename);

    return NextResponse.redirect(downloadUrl.toString());
  } catch (error) {
    console.error('Download route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
