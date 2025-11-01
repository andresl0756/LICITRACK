import { NextResponse } from 'next/server';
import { scrapePublicListings } from '../../../../../lib/api/scraper-v4';
import { supabaseAdmin } from '../../../../../lib/supabase/server';
import { getAuthHeaders } from '../../../../../lib/api/mp-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: stateData, error: stateError } = await (supabaseAdmin as any)
    .from('app_state')
    .select('value')
    .eq('key', 'cron_sync_v3_state')
    .single();

  if (stateError) {
    console.error('Error fetching cron state:', stateError);
    return NextResponse.json({ error: 'Failed to fetch state' }, { status: 500 });
  }

  const stateValue = (stateData?.value ?? {}) as any;
  const lastProcessedPage = Number(stateValue?.last_processed_page ?? 0);
  const startPage = lastProcessedPage + 1;
  console.log(`Cron sync-v3: Starting batch from page ${startPage}.`);

  // PASO 1: Robar los tokens
  console.log('[sync-v3] Obteniendo tokens de autenticación (Fase 1.16)...');
  let authToken: string | undefined;
  let apiKey: string | undefined;
  try {
    const authData = await getAuthHeaders();
    authToken = authData.authToken;
    apiKey = authData.apiKey;
    if (!authToken || !apiKey) throw new Error('Tokens robados son nulos.');
    console.log('[sync-v3] ¡Tokens obtenidos con éxito!');
  } catch (authError: any) {
    console.error('[sync-v3] ¡CRASH! No se pudieron obtener los tokens:', authError?.message || String(authError));
    return NextResponse.json({ error: 'Fallo al obtener tokens' }, { status: 500 });
  }

  // Ejecutar la primera página para obtener pageCount total (con tokens)
  const firstPageResponse = await scrapePublicListings({ page: startPage, authToken, apiKey });
  const totalPageCount = Number(firstPageResponse.pageCount) || 1;

  // Calcular el rango del lote
  const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPageCount);
  console.log(`Processing pages ${startPage} to ${endPage} (Total pages: ${totalPageCount}).`);

  // Construir las promesas del lote (incluye primera página como promesa resuelta para manejo uniforme)
  const pagesToFetch = Array.from({ length: endPage - startPage + 1 }, (_, i) => i + startPage);
  const promises = [
    Promise.resolve(firstPageResponse),
    ...pagesToFetch.slice(1).map((page) => scrapePublicListings({ page, authToken: authToken!, apiKey: apiKey! })),
  ];

  // Ejecutar el lote en paralelo
  console.log(`[sync-v3] Ejecutando lote ${startPage}-${endPage} en paralelo...`);
  const results = await Promise.allSettled(promises);

  let allLicitacionesInBatch: any[] = [];
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      allLicitacionesInBatch = allLicitacionesInBatch.concat(result.value.data);
    } else {
      const reason: any = (result as any).reason;
      const page = idx === 0 ? startPage : pagesToFetch[idx];
      console.error(`[sync-v3] Failed to fetch page ${page}:`, reason?.message || reason || result);
    }
  });

  console.log(`Batch fetched. Total items in batch: ${allLicitacionesInBatch.length}.`);

  const licitacionesParaGuardar = allLicitacionesInBatch.map((item: any) => ({
    codigo: item.codigo,
    titulo: item.nombre,
    descripcion: item.descripcion || null,
    organismo: item.organismo || 'No especificado',
    region: null,
    monto_clp: item.monto_disponible_CLP || 0,
    fecha_publicacion: item.fecha_publicacion,
    fecha_cierre: item.fecha_cierre,
    estado_mp: item.estado,
    url_ficha: `https://buscador.mercadopublico.cl/ficha?code=${item.codigo}`,
    json_raw: { ...item },
  }));

  const { error: upsertError } = await (supabaseAdmin as any)
    .from('licitaciones')
    .upsert(licitacionesParaGuardar, { onConflict: 'codigo' });

  if (upsertError) {
    console.error('Error al guardar en Supabase:', upsertError);
    return NextResponse.json({ error: `Supabase upsert failed: ${upsertError.message}` }, { status: 500 });
  }

  console.log(`Batch upserted to Supabase.`);

  const newLastProcessedPage = endPage >= totalPageCount ? 0 : endPage;

  const { error: updateError } = await (supabaseAdmin as any)
    .from('app_state')
    .update({
      value: { last_processed_page: newLastProcessedPage },
      updated_at: new Date().toISOString(),
    })
    .eq('key', 'cron_sync_v3_state');

  if (updateError) {
    console.error('Error updating cron state:', updateError);
  }

  console.log(`Cron sync-v3: Batch complete. State updated to page ${newLastProcessedPage}.`);

  return NextResponse.json({
    processedPages: `${startPage}-${endPage}`,
    totalItemsInBatch: allLicitacionesInBatch.length,
    nextRunStartsAt: newLastProcessedPage + 1,
  });
}