import { NextResponse } from 'next/server';
// PASO 1: Importar desde el NUEVO archivo scraper-v3
import { scrapePublicListings } from '../../../../../lib/api/scraper-v3';
import { supabaseAdmin } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';

// Agregar tamaño de lote
const BATCH_SIZE = 20;

export async function GET(request: Request) {
  // Seguridad
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. Leer el estado actual
  const { data: stateData, error: stateError } = await (supabaseAdmin as any)
    .from('app_state')
    .select('value')
    .eq('key', 'cron_sync_v2_state')
    .single();

  if (stateError) {
    console.error('Error fetching cron state:', stateError);
    return NextResponse.json({ error: 'Failed to fetch state' }, { status: 500 });
  }

  const stateValue = (stateData?.value ?? {}) as any;
  let lastProcessedPage = Number(stateValue?.last_processed_page ?? 0);
  const startPage = lastProcessedPage + 1;
  console.log(`Cron sync-v2: Starting batch from page ${startPage}.`);

  // 2. Ejecutar la primera página para obtener pageCount total
  const firstPageResponse = await scrapePublicListings({ page: startPage });
  const totalPageCount = Number(firstPageResponse.pageCount) || 1;
  let allLicitacionesInBatch = firstPageResponse.data;

  // 3. Calcular el rango del lote
  const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPageCount);
  console.log(`Processing pages ${startPage} to ${endPage} (Total pages: ${totalPageCount}).`);

  // 4. Ejecutar el resto del lote en paralelo (si hay más páginas en el lote)
  if (endPage > startPage) {
    const pagesToFetch = Array.from({ length: endPage - startPage }, (_, i) => i + startPage + 1);
    const promises = pagesToFetch.map((page) => scrapePublicListings({ page }));
    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allLicitacionesInBatch = allLicitacionesInBatch.concat(result.value.data);
      } else {
        console.error(`Failed to fetch page ${pagesToFetch[index]}:`, result.reason);
      }
    });
  }

  console.log(`Batch fetched. Total items in batch: ${allLicitacionesInBatch.length}.`);

  // 5. Mapear y hacer Upsert (lógica existente adaptada al lote)
  const licitacionesParaGuardar = allLicitacionesInBatch.map((item: any) => ({
    codigo: item.codigo,
    titulo: item.nombre,
    descripcion: item.descripcion || null,
    organismo: item.organismo || 'No especificado',
    // region no corresponde a 'unidad'; se deja en null
    region: null,
    monto_clp: item.monto_disponible_CLP || 0,
    fecha_publicacion: item.fecha_publicacion,
    fecha_cierre: item.fecha_cierre,
    estado_mp: item.estado,
    url_ficha: `https://buscador.mercadopublico.cl/ficha?code=${item.codigo}`,
    // Guardar objeto original en json_raw (productos podrían no estar presentes aquí)
    json_raw: { ...item },
  }));

  const { error: upsertError } = await supabaseAdmin
    .from('licitaciones')
    .upsert(licitacionesParaGuardar, { onConflict: 'codigo' });

  if (upsertError) {
    console.error('Error al guardar en Supabase:', upsertError);
    return NextResponse.json({ error: `Supabase upsert failed: ${upsertError.message}` }, { status: 500 });
  }

  console.log(`Batch upserted to Supabase.`);

  // 6. Actualizar el estado para la próxima ejecución
  const newLastProcessedPage = endPage >= totalPageCount ? 0 : endPage;

  const { error: updateError } = await (supabaseAdmin as any)
    .from('app_state')
    .update({
      value: { last_processed_page: newLastProcessedPage },
      updated_at: new Date().toISOString(),
    })
    .eq('key', 'cron_sync_v2_state');

  if (updateError) {
    console.error('Error updating cron state:', updateError);
  }

  console.log(
    `Cron sync-v2: Batch complete. State updated to page ${newLastProcessedPage}.`
  );

  return NextResponse.json({
    processedPages: `${startPage}-${endPage}`,
    totalItemsInBatch: allLicitacionesInBatch.length,
    nextRunStartsAt: newLastProcessedPage + 1,
  });
}