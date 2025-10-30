import { NextResponse } from "next/server";
import { runHybridScraper } from "../../../../../lib/api/scraper-service";
import { supabaseAdmin } from "../../../../../lib/supabase/server";
import type { Database } from "../../../../../lib/supabase/database.types";

// Función para limpiar la fecha de la API (DD/MM/YYYYHH:mm) a formato ISO (YYYY-MM-DDTHH:mm:ss)
function parseChileanDate(dateString: string): string | null {
  if (!dateString) return null;

  // Asumimos formato DD/MM/YYYYHH:mm (puede venir con o sin espacio)
  const datePart = dateString.substring(0, 10);
  const timePart = dateString.substring(10).trim();

  const [day, month, year] = datePart.split("/");
  const [hour, minute] = timePart.split(":");

  if (!year || !month || !day || !hour || !minute) return null;

  // Formato ISO: YYYY-MM-DDTHH:mm:ss
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

export async function GET(request: Request) {
  // 1. Seguridad (como la teníamos antes)
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log('--- [CANARY V7] EXECUTING ROUTE.TS ---');

  try {
    // 2. Extraer datos (¡ahora usando fetch!)
    // Por ahora, solo extraemos la página 1
    const apiResponse: any = await runHybridScraper(1);
    console.log('--- [CANARY V7] API Response.payload KEYS ---:', Object.keys(apiResponse.payload));

    if (!apiResponse || !apiResponse.payload || !apiResponse.payload.resultados || apiResponse.payload.resultados.length === 0) {
      throw new Error('No se recibieron datos de la API (payload.resultados está vacío o no existe)');
    }

    console.log('--- [CANARY V7] KEYS del primer item ---:', Object.keys(apiResponse.payload.resultados[0]));

    // 3. Transformar Datos (Limpiar y Mapear)
    const licitacionesParaGuardar: Database["public"]["Tables"]["licitaciones"]["Insert"][] =
      apiResponse.payload.resultados.map((item: any) => {
        const fecha_publicacion =
          parseChileanDate(item.Fechas?.FechaPublicacion) ??
          parseChileanDate(item.FechaPublicacion);

        const fecha_cierre =
          parseChileanDate(item.Fechas?.FechaCierre) ??
          parseChileanDate(item.FechaCierre);

        return {
          codigo: item.Codigo,
          titulo: item.Nombre,
          descripcion: item.Descripcion ?? null,
          organismo: item.Comprador?.NombreOrganismo || "No especificado",
          codigo_organismo: item.Comprador?.CodigoOrganismo ?? null,
          rut_organismo: item.Comprador?.RutOrganismo ?? null,
          region: item.Comprador?.RegionUnidad ?? null,
          comuna: item.Comprador?.ComunaUnidad ?? null,
          monto_clp: item.MontoEstimado ?? 0,
          monto_utm: item.MontoUTM ?? null,
          categoria: item.Categoria ?? null,
          rubro: item.Rubro ?? null,
          fecha_publicacion,
          fecha_cierre,
          fecha_adjudicacion:
            parseChileanDate(item.Fechas?.FechaAdjudicacion) ?? null,
          estado_mp: item.Estado || "Publicada",
          url_ficha: `https://www.mercadopublico.cl/CompraAgil/Ficha?id=${item.Codigo}`,
          es_compra_agil: true,
          json_raw: item,
          sincronizado_at: new Date().toISOString(),
        };
      });

    // 4. Guardar en Supabase
    const { data, error } = await supabaseAdmin
      .from("licitaciones")
      .upsert(licitacionesParaGuardar, {
        onConflict: "codigo", // Si el código ya existe, actualiza
      })
      .select();

    if (error) {
      console.error("Error al guardar en Supabase:", error);
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    // 5. Responder con Éxito
    return NextResponse.json({
      success: true,
      message: `Sincronización completa. ${data?.length || 0} registros procesados.`,
    });
  } catch (error: any) {
    console.error('--- [CANARY V7] Error en ROUTE.TS ---:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}