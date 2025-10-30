import type { NextApiRequest, NextApiResponse } from 'next';
import { scrapePublicListings } from '../../../../lib/api/scraper-v4';
import { supabaseAdmin } from '../../../../lib/supabase/server';

const BATCH_SIZE = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const secret = req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: stateData, error: stateError } = await (supabaseAdmin as any)
    .from('app_state')
    .select('value')
    .eq('key', 'cron_sync_v3_state')
    .single();

  if (stateError) {
    console.error('Error fetching cron state:', stateError);
    return res.status(500).json({ error: 'Failed to fetch state' });
  }

  const stateValue = (stateData?.value ?? {}) as any;
  const lastProcessedPage = Number(stateValue?.last_processed_page ?? 0);
  const startPage = lastProcessedPage + 1;

  const firstPageResponse = await scrapePublicListings({ page: startPage });
  const totalPageCount = Number(firstPageResponse.pageCount) || 1;
  let allLicitacionesInBatch = firstPageResponse.data;

  const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPageCount);

  if (endPage > startPage) {
    const pagesToFetch = Array.from({ length: endPage - startPage }, (_, i) => i + startPage + 1);
    const results = await Promise.allSettled(pagesToFetch.map((page) => scrapePublicListings({ page })));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allLicitacionesInBatch = allLicitacionesInBatch.concat(result.value.data);
      } else {
        console.error(`Failed to fetch page ${pagesToFetch[index]}:`, result.reason);
      }
    });
  }

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
    return res.status(500).json({ error: `Supabase upsert failed: ${upsertError.message}` });
  }

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

  return res.status(200).json({
    processedPages: `${startPage}-${endPage}`,
    totalItemsInBatch: allLicitacionesInBatch.length,
    nextRunStartsAt: newLastProcessedPage + 1,
    router: 'pages',
  });
}