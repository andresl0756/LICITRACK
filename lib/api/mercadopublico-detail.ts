const API_DETAIL_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const X_API_KEY = 'e93089e4-437c-4723-b343-4fa20045e3bc';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export type DetalleCompraAgil = {
  productos: any[];
};

export async function fetchDetalleConAuth(codigo: string, token: string): Promise<DetalleCompraAgil> {
  const detailUrl = `${API_DETAIL_URL}?action=ficha&code=${encodeURIComponent(codigo)}`;
  const res = await fetch(detailUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${token}`,
      'x-api-key': X_API_KEY,
      'User-Agent': USER_AGENT,
      Referer: 'https://buscador.mercadopublico.cl/',
    },
  });

  if (res.status === 401 || res.status === 403) {
    const err = new Error(`Unauthorized: ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Detalle HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json?.success !== 'OK' || !json?.payload) {
    throw new Error('Estructura de detalle inválida');
  }

  const productos = json.payload?.productos_solicitados ?? [];
  return { productos: Array.isArray(productos) ? productos : [] };
}