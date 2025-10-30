import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/server';
import { capturePublicAuthToken } from '../../../../../lib/api/mp-auth';
import { fetchDetalleConAuth } from '../../../../../lib/api/mercadopublico-detail';

export const runtime = 'nodejs';

function needsProductos(jsonRaw: unknown): boolean {
  try {
    const obj = typeof jsonRaw === 'string' ? JSON.parse(jsonRaw) : (jsonRaw as any) || {};
    const productos = obj?.productos;
    return !Array.isArray(productos) || productos.length === 0;
  } catch {
    // Si json_raw es inválido, lo trataremos como faltante
    return true;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const limitParam = searchParams.get('limit');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = Math.min(Number(limitParam ?? 150), 500);

  try {
    // 1) Seleccionar últimos registros y filtrar en memoria los que necesiten productos
    const { data: rows, error: qErr } = await supabaseAdmin
      .from('licitaciones')
      .select('id, codigo, json_raw, created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (qErr) {
      throw new Error(`Error consultando licitaciones: ${qErr.message}`);
    }

    const pendientes = (rows || [])
      .filter((r: { json_raw: unknown }) => needsProductos(r.json_raw))
      .slice(0, limit);

    if (pendientes.length === 0) {
      return NextResponse.json({ success: true, message: 'No hay licitaciones pendientes de productos.' });
    }

    // 2) Capturar token una vez
    let token = await capturePublicAuthToken();

    let exitosos = 0;
    let procesados = 0;

    // 3) Procesamiento con reintento ante 401/403
    for (const row of pendientes) {
      procesados += 1;

      try {
        let detalle = await fetchDetalleConAuth(row.codigo, token);
        // Si no trae productos, lo contamos como sin cambios
        if (!Array.isArray(detalle.productos) || detalle.productos.length === 0) {
          continue;
        }

        // Merge de json_raw
        const current = row.json_raw as any;
        let obj: any = {};
        if (typeof current === 'string') {
          try {
            obj = JSON.parse(current);
          } catch {
            obj = {};
          }
        } else if (current && typeof current === 'object') {
          obj = { ...current };
        }

        const merged = { ...obj, productos: detalle.productos };

        const { error: upErr } = await supabaseAdmin
          .from('licitaciones')
          .update({ json_raw: merged, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        if (!upErr) {
          exitosos += 1;
        } else {
          console.warn(`Update falló para ${row.codigo}: ${upErr.message}`);
        }
      } catch (e: any) {
        // Si el token expiró, se renueva y reintenta 1 vez
        if (e?.status === 401 || e?.status === 403 || /Unauthorized/.test(String(e?.message))) {
          try {
            token = await capturePublicAuthToken();
            const detalle = await fetchDetalleConAuth(row.codigo, token);

            if (!Array.isArray(detalle.productos) || detalle.productos.length === 0) {
              continue;
            }

            const current = row.json_raw as any;
            let obj: any = {};
            if (typeof current === 'string') {
              try {
                obj = JSON.parse(current);
              } catch {
                obj = {};
              }
            } else if (current && typeof current === 'object') {
              obj = { ...current };
            }

            const merged = { ...obj, productos: detalle.productos };

            const { error: upErr } = await supabaseAdmin
              .from('licitaciones')
              .update({ json_raw: merged, updated_at: new Date().toISOString() })
              .eq('id', row.id);

            if (!upErr) {
              exitosos += 1;
            } else {
              console.warn(`Update (tras renovar token) falló para ${row.codigo}: ${upErr.message}`);
            }
          } catch (e2: any) {
            console.warn(`Reintento falló para ${row.codigo}: ${e2?.message || e2}`);
          }
        } else {
          console.warn(`Detalle falló para ${row.codigo}: ${e?.message || e}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      procesados,
      exitosos,
      pendientes_iniciales: pendientes.length,
    });
  } catch (error: any) {
    console.error('Error en backfill de productos:', error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}