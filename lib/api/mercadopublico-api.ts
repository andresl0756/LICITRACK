import { getTodayFormatted, get30DaysAgoFormatted } from "../utils/dates";

const API_BASE_URL = "https://api.buscador.mercadopublico.cl/compra-agil";

/**
 * Busca licitaciones en la API de Compra Ágil por un rango de fechas.
 */
export async function fetchLicitaciones(page: number = 1): Promise<unknown> {
  const dateTo = getTodayFormatted();
  const dateFrom = get30DaysAgoFormatted();

  // Construimos la URL dinámica
  const url = new URL(API_BASE_URL);
  url.searchParams.append("date_from", dateFrom);
  url.searchParams.append("date_to", dateTo);
  url.searchParams.append("order_by", "recent");
  url.searchParams.append("page_number", page.toString());
  url.searchParams.append("status", "2"); // "Publicada"

  console.log(`Fetching API: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      // Usamos el mismo User-Agent que nos funcionó para evitar bloqueos
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`API call failed with status: ${response.status}`);
  }

  const data = await response.json();
  return data;
}