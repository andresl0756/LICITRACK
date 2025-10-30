import { NextResponse } from 'next/server';
import { runHybridScraper } from '../../../../../lib/api/scraper-v3';
import { supabaseAdmin } from '../../../../../lib/supabase/server';

export async function GET(request: Request) {
  // 1. Seguridad
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Extraer datos (ahora el scraper devuelve un array enriquecido)
    const enrichedItems = (await runHybridScraper(1)) as Array<Record<string, any>>; // Página 1 por ahora

    // 3. Validar la respuesta (array directo)
    if (!enrichedItems || !Array.isArray(enrichedItems) || enrichedItems.length === 0) {
      throw new Error('No se recibieron items enriquecidos del scraper');
    }

    // 4. Transformar Datos (mapeando enrichedItems directamente e incluyendo descripción y productos)
    const licitacionesParaGuardar = enrichedItems.map((item: any) => ({
      codigo: item.codigo,
      titulo: item.nombre,
      descripcion: item.descripcion,
      organismo: item.organismo || 'No especificado',
      region: item.unidad,
      monto_clp: item.monto_disponible_CLP || 0,
      fecha_publicacion: item.fecha_publicacion, // La API ya usa formato ISO
      fecha_cierre: item.fecha_cierre, // La API ya usa formato ISO
      estado_mp: item.estado,
      url_ficha: `https://www.mercadopublico.cl/CompraAgil/Ficha?id=${item.codigo}`,
      // Guardamos el item enriquecido completo incluyendo productos
      json_raw: { ...item, productos: item.productos },
    }));

    // 5. Guardar en Supabase
    const { data, error } = await supabaseAdmin
      .from('licitaciones')
      .upsert(licitacionesParaGuardar, {
        onConflict: 'codigo', // Si el código ya existe, actualiza
      })
      .select();

    if (error) {
      console.error('Error al guardar en Supabase:', error);
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    // 6. Responder con Éxito
    return NextResponse.json({
      success: true,
      message: `Sincronización completa. ${data?.length || 0} registros procesados.`,
    });
  } catch (error: any) {
    console.error('Error en ROUTE.TS:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}