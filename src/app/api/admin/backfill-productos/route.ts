import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase/server';
import { captureAuthFromDetail } from '../../../../../lib/api/mp-auth';
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

    // 2) Capturar token desde un request REAL de detalle usando el primer código
    const primerCodigo = pendientes[0]?.codigo;
    if (!primerCodigo) {
      return NextResponse.json({ success: false, message: 'No se encontró un código válido para iniciar la captura.' }, { status: 400 });
    }

    let { token, apiKey } = await captureAuthFromDetail(primerCodigo);
    let exitosos = 0;
    let procesados = 0;

    // 3) Procesamiento con reintento ante 401/403
    for (const row of pendientes) {
      procesados += 1;

      try {
        const detalle = await fetchDetalleConAuth(row.codigo, token, apiKey);
        if (!Array.isArray(detalle.productos) || detalle.productos.length === 0) {
          // Sin cambios si no trae productos
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
        // Renovar token si expira (401/403), capturando nuevamente desde un detalle REAL
        const msg = String(e?.message || e);
        if (e?.status === 401 || e?.status === 403 || /Unauthorized/.test(msg)) {
          try {
            const { token: nuevoToken, apiKey: nuevaApiKey } = await captureAuthFromDetail(row.codigo);
            token = nuevoToken;
            apiKey = nuevaApiKey;

            const detalle = await fetchDetalleConAuth(row.codigo, token, apiKey);
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
            console.warn(`Reintento con token renovado falló para ${row.codigo}: ${e2?.message || e2}`);
          }
        } else {
          console.warn(`Detalle falló para ${row.codigo}: ${msg}`);
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