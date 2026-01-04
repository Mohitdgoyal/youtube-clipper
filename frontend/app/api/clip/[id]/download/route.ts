import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Step 1: Get the job status and public URL from backend
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

    // Step 2: Get signed URL from backend with custom filename
    const filename = request.nextUrl.searchParams.get('filename') || 'clip.mp4';
    const signedUrlRes = await fetch(`${backendUrl}/api/clip/${id}/url?filename=${encodeURIComponent(filename)}`, {
      headers: {
        "Authorization": `Bearer ${process.env.BACKEND_SECRET || 'dev-secret'}`
      }
    });

    if (!signedUrlRes.ok) {
      // Fallback to public URL if signed URL fails
      return NextResponse.redirect(jobData.url);
    }

    const { url: signedUrl } = await signedUrlRes.json();

    // Step 3: Redirect directly to the Signed Supabase URL
    return NextResponse.redirect(signedUrl);

  } catch (error) {
    console.error('Download route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 