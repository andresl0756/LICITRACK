import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hookUrl) {
    return NextResponse.json(
      { error: 'Falta configurar la variable de entorno VERCEL_DEPLOY_HOOK_URL con la URL del Deploy Hook de Vercel.' },
      { status: 400 }
    );
  }

  const resp = await fetch(hookUrl, { method: 'POST' });
  const text = await resp.text();

  return NextResponse.json({
    ok: resp.ok,
    status: resp.status,
    bodyPreview: text?.slice(0, 300) ?? null,
  }, { status: resp.ok ? 200 : resp.status });
}