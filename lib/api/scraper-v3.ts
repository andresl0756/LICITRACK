import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const API_LIST_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const API_DETAIL_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const AUTH_API_URL = 'https://servicios-prd.mercadopublico.cl/v1/auth/publico';
const X_API_KEY = 'e93089e4-437c-4723-b343-4fa20045e3bc';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function runHybridScraper(page: number = 1): Promise<any[]> {
  console.log('--- [CANARY V18] EJECUTANDO SCRAPER V7 (Robo de Token Auth + Fetch) ---');
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

    // Promesa para robar el Token de Autorización desde la API de auth
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
          // Ignora errores de parseo de otras respuestas
        }
      });
    });

    // Promesa para robar el JSON de la Lista
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

    // --- 2. Navegar y Obtener Datos de la Lista ---
    const listUrl = new URL(VISUAL_PAGE_URL);
    listUrl.searchParams.append('date_from', get30DaysAgoFormatted());
    listUrl.searchParams.append('date_to', getTodayFormatted());
    listUrl.searchParams.append('order_by', 'recent');
    listUrl.searchParams.append('page_number', page.toString());
    listUrl.searchParams.append('status', '2');

    console.log(`Navegando a la página visual: ${listUrl.toString()}`);
    await listPage.goto(listUrl.toString(), { waitUntil: 'domcontentloaded' });

    // Esperamos que ambas promesas se completen
    const [apiResponse, capturedAuthToken] = await Promise.all([listPromise, tokenPromise]);

    const items = (apiResponse as any)?.payload?.resultados ?? [];
    await listPage.close();
    await browser.close();
    browser = null;

    // --- 3. Iterar y Obtener Detalles con Fetch (RÁPIDO) ---
    const enrichedItems: any[] = [];
    for (const item of items) {
      const detailUrl = `${API_DETAIL_URL}?action=ficha&code=${item.codigo}`;

      try {
        console.log(`Haciendo Fetch a la API de detalle para: ${item.codigo}`);
        const detailResponse = await fetch(detailUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            Authorization: `Bearer ${capturedAuthToken}`,
            'x-api-key': X_API_KEY,
            'User-Agent': USER_AGENT,
          },
        });

        if (!detailResponse.ok) {
          throw new Error(`API de detalle falló con status: ${detailResponse.status}`);
        }

        const detailJson = await detailResponse.json();

        const detalles = {
          descripcion: detailJson.payload?.descripcion ?? null,
          plazo_entrega: detailJson.payload?.plazo_entrega ?? null,
          direccion_entrega: detailJson.payload?.direccion_entrega ?? null,
          productos: detailJson.payload?.productos_solicitados ?? [],
        };

        enrichedItems.push({ ...item, ...detalles });
      } catch (e: any) {
        console.warn(`--- [CANARY V18] Falló FETCH de detalle ${item.codigo}: ${e.message}. Omitiendo.`);
        enrichedItems.push(item);
      }
    }

    return enrichedItems;
  } catch (error: any) {
    console.error('Error durante el scraping híbrido (V18):', error);
    throw new Error(`Scraping híbrido V18 falló: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}