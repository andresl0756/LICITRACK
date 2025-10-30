import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const API_LIST_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const API_DETAIL_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const AUTH_API_URL = 'https://servicios-prd.mercadopublico.cl/v1/auth/publico';
const X_API_KEY = 'e93089e4-437c-4723-b343-4fa20045e3bc';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

type DetailResult = {
  descripcion: string | null;
  plazo_entrega: number | null;
  direccion_entrega: string | null;
  productos: any[];
};

function extractDetail(detailJson: any): DetailResult {
  const root = detailJson?.payload ?? detailJson ?? {};
  return {
    descripcion: root.descripcion ?? null,
    plazo_entrega: root.plazo_entrega ?? null,
    direccion_entrega: root.direccion_entrega ?? null,
    productos: root.productos_solicitados ?? [],
  };
}

async function fetchDetailPublic(code: string): Promise<DetailResult> {
  const detailUrl = `${API_DETAIL_URL}?action=ficha&code=${code}`;
  const response = await fetch(detailUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': USER_AGENT,
      Referer: 'https://buscador.mercadopublico.cl/',
    },
  });

  if (!response.ok) {
    const err = new Error(`Public detail failed: ${response.status}`);
    (err as any).status = response.status;
    throw err;
  }

  const detailJson = await response.json();
  if (detailJson?.success !== 'OK' || (!detailJson?.payload && !detailJson?.productos_solicitados)) {
    const err = new Error('Public detail invalid structure');
    (err as any).status = response.status;
    throw err;
  }

  return extractDetail(detailJson);
}

async function fetchDetailWithAuth(code: string, token: string): Promise<DetailResult> {
  const detailUrl = `${API_DETAIL_URL}?action=ficha&code=${code}`;
  const response = await fetch(detailUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${token}`,
      'x-api-key': X_API_KEY,
      'User-Agent': USER_AGENT,
      Referer: 'https://buscador.mercadopublico.cl/',
    },
  });

  if (!response.ok) {
    const err = new Error(`Auth detail failed: ${response.status}`);
    (err as any).status = response.status;
    throw err;
  }

  const detailJson = await response.json();
  if (detailJson?.success !== 'OK' || !detailJson?.payload) {
    const err = new Error('Auth detail invalid structure');
    (err as any).status = response.status;
    throw err;
  }

  return extractDetail(detailJson);
}

async function probePublicDetail(code: string): Promise<boolean> {
  try {
    await fetchDetailPublic(code);
    return true;
  } catch (e: any) {
    const status = e?.status;
    return !(status === 401 || status === 403);
  }
}

export async function runHybridScraper(page: number = 1): Promise<any[]> {
  console.log('--- [HYBRID MODE] Public-first with probe & circuit breaker, fallback to token + x-api-key ---');
  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const listPage = await browser.newPage();
    await listPage.setUserAgent(USER_AGENT);

    // Captura de token de autenticación (body JSON) con timeout claro
    const tokenPromise: Promise<string> = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout: Token de Auth (auth/publico) no encontrado.')), 45000);

      listPage.on('response', async (response) => {
        try {
          if (response.url().startsWith(AUTH_API_URL) && response.status() === 200) {
            const json = await response.json().catch(() => null);
            if (json && (json as any).access_token) {
              clearTimeout(timeout);
              console.log('[Intercepción]: Token de Auth capturado!');
              resolve((json as any).access_token as string);
            }
          }
        } catch {
          // Ignorar parseos inválidos
        }
      });
    });

    // Captura del JSON de la lista
    const listPromise: Promise<any> = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout: La API de lista nunca respondió.')), 45000);

      listPage.on('response', async (response) => {
        const url = response.url();
        if (url.startsWith(API_LIST_URL) && url.includes('date_from') && response.status() === 200) {
          try {
            console.log('[Intercepción]: JSON de Lista capturado!');
            const json = await response.json();
            clearTimeout(timeout);
            resolve(json);
          } catch {
            reject(new Error('Falló al parsear el JSON de la API de lista'));
          }
        }
      });
    });

    // Navegación para disparar llamadas de lista y auth
    const listUrl = new URL(VISUAL_PAGE_URL);
    listUrl.searchParams.append('date_from', get30DaysAgoFormatted());
    listUrl.searchParams.append('date_to', getTodayFormatted());
    listUrl.searchParams.append('order_by', 'recent');
    listUrl.searchParams.append('page_number', page.toString());
    listUrl.searchParams.append('status', '2');

    console.log(`Navegando a la página visual: ${listUrl.toString()}`);
    await listPage.goto(listUrl.toString(), { waitUntil: 'domcontentloaded' });

    // Esperamos la lista; el token lo pediremos sólo si hace falta
    const apiResponse = await listPromise;
    const items = (apiResponse as any)?.payload?.resultados ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      await listPage.close();
      await browser.close();
      browser = null;
      return [];
    }

    // Probe público con el primer código
    const probeCode = items[0]?.codigo;
    let publicAllowed = false;
    try {
      publicAllowed = await probePublicDetail(probeCode);
      console.log(`[Probe] Modo público ${publicAllowed ? 'DISPONIBLE' : 'NO disponible'}`);
    } catch {
      publicAllowed = false;
      console.log('[Probe] Modo público falló inesperadamente; usaremos autenticación.');
    }

    // El token sólo si lo necesitaremos
    let capturedAuthToken: string | null = null;
    const ensureToken = async () => {
      if (capturedAuthToken) return capturedAuthToken;
      capturedAuthToken = await tokenPromise;
      return capturedAuthToken;
    };

    // Circuit breaker: si el público falla tempranamente, conmutamos
    const breakerThreshold = 2;
    let publicFailures = 0;

    const enrichedItems: any[] = [];
    for (const item of items) {
      const code: string = item?.codigo;
      if (!code) {
        enrichedItems.push(item);
        continue;
      }

      if (publicAllowed) {
        try {
          const detalles = await fetchDetailPublic(code);
          enrichedItems.push({ ...item, ...detalles });
        } catch (e: any) {
          const status = e?.status;
          console.warn(`--- [PUBLIC] Falló detalle ${code}: ${e?.message || status}. Intentando fallback auth.`);
          publicFailures += (status === 401 || status === 403) ? 1 : 0;

          // Conmutar si supera umbral
          if (publicFailures >= breakerThreshold) {
            console.log('[Circuit Breaker] Demasiados fallos públicos. Conmutando a modo autenticado para el resto del lote.');
            publicAllowed = false;
          }

          // Fallback inmediato para este ítem
          try {
            const token = await ensureToken();
            const detallesAuth = await fetchDetailWithAuth(code, token);
            enrichedItems.push({ ...item, ...detallesAuth });
          } catch (e2: any) {
            console.warn(`--- [AUTH FALLBACK] También falló detalle ${code}: ${e2?.message}. Omitiendo detalles.`);
            enrichedItems.push(item);
          }
        }
      } else {
        try {
          const token = await ensureToken();
          const detalles = await fetchDetailWithAuth(code, token);
          enrichedItems.push({ ...item, ...detalles });
        } catch (e: any) {
          console.warn(`--- [AUTH] Falló detalle ${code}: ${e?.message}. Omitiendo.`);
          enrichedItems.push(item);
        }
      }
    }

    await listPage.close();
    await browser.close();
    browser = null;

    return enrichedItems;
  } catch (error: any) {
    console.error('Error durante el scraping híbrido (public-first + fallback):', error);
    throw new Error(`Scraping híbrido falló: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}