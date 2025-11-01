import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios from 'axios';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const API_LIST_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const API_DETAIL_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const X_API_KEY = 'e93089e4-437c-4723-b343-4fa20045e3bc';

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

  const detalles = extractDetail(detailJson);

  // El modo público solo se considera disponible si trae productos.
  if (!Array.isArray(detalles.productos) || detalles.productos.length === 0) {
    const err = new Error('Public detail missing productos_solicitados');
    (err as any).status = 200;
    throw err;
  }

  return detalles;
}

async function fetchDetailWithAuth(code: string, token: string, apiKey?: string): Promise<DetailResult> {
  const detailUrl = `${API_DETAIL_URL}?action=ficha&code=${code}`;
  const response = await fetch(detailUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json, text/plain, */*',
      Authorization: `Bearer ${token}`,
      'x-api-key': apiKey ?? X_API_KEY,
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

/**
 * Captura Authorization y x-api-key abriendo una ficha real en una nueva página.
 * Reutiliza el mismo browser ya iniciado para no pagar costos extra.
 */
async function captureDetailAuth(browser: Browser, code: string, timeoutMs: number = 45000): Promise<{ token: string; apiKey?: string }> {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);

  const capturePromise: Promise<{ token: string; apiKey?: string }> = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout: request de detalle no interceptado')), timeoutMs);

    page.on('request', async (request) => {
      try {
        const url = request.url();
        if (url.startsWith(API_DETAIL_URL) && url.includes('action=ficha') && url.includes('code=')) {
          const headers = request.headers();
          const authorization = headers['authorization'] || headers['Authorization'];
          const apiKey = headers['x-api-key'] || headers['X-API-KEY'];
          if (authorization && authorization.startsWith('Bearer ')) {
            clearTimeout(timer);
            resolve({ token: authorization.replace('Bearer ', ''), apiKey });
          }
        }
      } catch {
        // Silenciar errores de lectura
      }
    });
  });

  const fichaUrl = `https://buscador.mercadopublico.cl/ficha?code=${encodeURIComponent(code)}`;
  await page.goto(fichaUrl, { waitUntil: 'domcontentloaded' });

  const result = await capturePromise;
  await page.close();
  return result;
}

async function probePublicDetail(code: string): Promise<boolean> {
  try {
    const detalles = await fetchDetailPublic(code);
    // El modo público solo se considera disponible si trae productos.
    return Array.isArray(detalles.productos) && detalles.productos.length > 0;
  } catch {
    // Cualquier error en el probe desactiva el modo público para el lote.
    return false;
  }
}

export async function scrapePublicListings(options: { page?: number } = {}): Promise<{ data: any[]; pageCount: number }> {
  const { page: targetPage = 1 } = options;
  const dateFrom = get30DaysAgoFormatted();
  const dateTo = getTodayFormatted();
  const LIST_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  const url = `https://api.buscador.mercadopublico.cl/compra-agil?date_from=${dateFrom}&date_to=${dateTo}&order_by=recent&status=2&region=all&page_number=${targetPage}`;

  // Configurar Proxy (requerido)
  const proxyUrl = process.env.PROXY_URL;
  if (!proxyUrl) {
    console.error('[scraper-v4] Error: PROXY_URL no está configurada.');
    throw new Error('PROXY_URL no está configurada.');
  }
  const httpsAgent = new HttpsProxyAgent(proxyUrl);

  try {
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': LIST_USER_AGENT,
        Referer: 'https://buscador.mercadopublico.cl/',
      },
      httpsAgent,
      timeout: 10000,
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    const jsonResponse = response.data;
    const payload = (jsonResponse as any)?.payload ?? jsonResponse;
    const resultados = Array.isArray(payload?.resultados) ? payload.resultados : [];
    const pageCount = Number(payload?.pageCount ?? 0) || 0;

    return { data: resultados, pageCount };
  } catch (error: any) {
    console.error(`[scraper-v4] Falló el fetch (axios) para página ${targetPage}:`, error?.message || String(error));
    throw new Error(`Listado (página ${targetPage}) falló: ${error?.message || String(error)}`);
  }
}

export async function runHybridScraper(page: number = 1): Promise<any[]> {
  console.log('--- [HYBRID MODE] Public-first; si falla, captura Authorization desde request de detalle y usa token + x-api-key ---');
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

    // Navegación para disparar llamadas de lista
    const listUrl = new URL(VISUAL_PAGE_URL);
    listUrl.searchParams.append('date_from', get30DaysAgoFormatted());
    listUrl.searchParams.append('date_to', getTodayFormatted());
    listUrl.searchParams.append('order_by', 'recent');
    listUrl.searchParams.append('page_number', page.toString());
    listUrl.searchParams.append('status', '2');

    console.log(`Navegando a la página visual: ${listUrl.toString()}`);
    await listPage.goto(listUrl.toString(), { waitUntil: 'domcontentloaded' });

    // Esperamos la lista
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

    // Token & x-api-key capturados cuando haga falta
    let capturedAuthToken: string | null = null;
    let capturedApiKey: string | undefined;

    const ensureToken = async (codeForCapture: string) => {
      if (capturedAuthToken) return capturedAuthToken;
      const { token, apiKey } = await captureDetailAuth(browser!, codeForCapture);
      capturedAuthToken = token;
      capturedApiKey = apiKey;
      console.log('[Intercepción]: Authorization capturado desde request de detalle.');
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
            const token = await ensureToken(code);
            const detallesAuth = await fetchDetailWithAuth(code, token, capturedApiKey);
            enrichedItems.push({ ...item, ...detallesAuth });
          } catch (e2: any) {
            console.warn(`--- [AUTH FALLBACK] También falló detalle ${code}: ${e2?.message}. Omitiendo detalles.`);
            enrichedItems.push(item);
          }
        }
      } else {
        try {
          const token = await ensureToken(code);
          const detalles = await fetchDetailWithAuth(code, token, capturedApiKey);
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
    console.error('Error durante el scraping híbrido (public-first + token desde detalle):', error);
    throw new Error(`Scraping híbrido falló: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}