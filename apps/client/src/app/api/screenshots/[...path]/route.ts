import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { evidenceDirectory } from '@/lib/evidence-reader';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const segments = await params;
  const filePath = join(evidenceDirectory(), ...segments.path);

  if (!filePath.endsWith('.png')) {
    return NextResponse.json({ error: 'only PNG files are served' }, { status: 400 });
  }

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
