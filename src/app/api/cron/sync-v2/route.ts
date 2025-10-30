import { NextResponse } from 'next/server';
import { runHybridScraper } from '../../../../../lib/api/scraper-v3';
import { supabaseAdmin } from '../../../../../lib/supabase/server';

// Añadido: tipo mínimo para la respuesta del scraper
interface HybridScraperResponse {
  payload: {
    resultados: Array<Record<string, any>>;
  };
}

export async function GET(request: Request) {
  // 1. Seguridad
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Extraer datos (¡ahora usando el scraper híbrido!)
    const apiResponse = (await runHybridScraper(1)) as HybridScraperResponse; // Página 1 por ahora

    // 3. Validar la respuesta (con la llave correcta 'resultados')
    if (
      !apiResponse ||
      !apiResponse.payload ||
      !apiResponse.payload.resultados ||
      apiResponse.payload.resultados.length === 0
    ) {
      throw new Error('No se recibieron datos de la API (payload.resultados está vacío o no existe)');
    }

    // 4. Transformar Datos (¡CON LAS LLAVES CORRECTAS!)
    const licitacionesParaGuardar = apiResponse.payload.resultados.map((item: any) => ({
      codigo: item.codigo,
      titulo: item.nombre,
      // 'descripcion' no viene en la lista, la obtendremos en la Fase 2
      organismo: item.organismo || 'No especificado',
      region: item.unidad, // 'unidad' parece ser la región o unidad compradora
      monto_clp: item.monto_disponible_CLP || 0,
      fecha_publicacion: item.fecha_publicacion, // La API ya usa formato ISO
      fecha_cierre: item.fecha_cierre, // La API ya usa formato ISO
      estado_mp: item.estado,
      url_ficha: `https://www.mercadopublico.cl/CompraAgil/Ficha?id=${item.codigo}`,
      json_raw: item, // Guardamos el JSON completo del item
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
    console.error('Error en el cron job:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}