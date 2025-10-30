import type { Database } from "../supabase/database.types";
import { fetchLicitaciones } from "../api/mercadopublico-api";

type LicitacionExtraida = Partial<Database["public"]["Tables"]["licitaciones"]["Row"]> & {
  descripcion?: string | null;
  plazo_entrega?: string | null;
  direccion_entrega?: string | null;
  productos?: any[];
};

type CompraAgilAPIResponse = {
  results?: any[];
  items?: any[];
  page?: number;
  total_pages?: number;
};

/**
 * Obtiene licitaciones usando la API interna (fetch) en vez de Puppeteer.
 * Por ahora obtiene sólo la primera página y retorna el arreglo de resultados.
 */
export async function scrapeCompraAgil(): Promise<LicitacionExtraida[]> {
  const data = (await fetchLicitaciones(1)) as CompraAgilAPIResponse | any[];
  const list = Array.isArray(data) ? data : data?.results ?? (data as CompraAgilAPIResponse)?.items ?? [];
  return list as LicitacionExtraida[];
}