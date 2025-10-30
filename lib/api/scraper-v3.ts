import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const API_LIST_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const API_DETAIL_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const X_API_KEY = 'e93089e4-437c-4723-b343-4fa20045e3bc';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function runHybridScraper(page: number = 1): Promise<any[]> {
  console.log('--- [CANARY V17] EJECUTANDO SCRAPER V6 (Robo de Token + Fetch) ---');
  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: true,
    });

    const listPage = await browser.newPage();
    await listPage.setUserAgent(USER_AGENT);

    let authToken: string | null = null;

    // --- 1. Configurar Interceptores ---
    await listPage.setRequestInterception(true);

    // Promesa para robar el Token de Autorización
    const tokenPromise: Promise<string> = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout: Token de Auth no encontrado.')), 45000);

      listPage.on('request', (request) => {
        try {
          if (request.url().startsWith(API_LIST_URL)) {
            const headers = request.headers();
            if (headers.authorization) {
              console.log('[Intercepción Request]: Token de Auth capturado!');
              authToken = headers.authorization;
              clearTimeout(timer);
              resolve(headers.authorization);
            }
          }
        } finally {
          // Continuar todas las solicitudes
          request.continue();
        }
      });
    });

    // Promesa para robar el JSON de la Lista
    const listPromise: Promise<unknown> = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout: La API de lista nunca respondió.')), 45000);

      listPage.on('response', async (response) => {
        const url = response.url();
        if (url.startsWith(API_LIST_URL) && url.includes('date_from') && response.status() === 200) {
          try {
            console.log('[Intercepción Response]: JSON de Lista capturado!');
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
    await listPage.close(); // Cerramos la página de lista

    // --- 3. Iterar y Obtener Detalles con Fetch ---
    const enrichedItems: any[] = [];

    for (const item of items) {
      const detailUrl = `${API_DETAIL_URL}?action=ficha&code=${item.codigo}`;

      try {
        console.log(`Haciendo Fetch a la API de detalle para: ${item.codigo}`);
        const detailResponse = await fetch(detailUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            Authorization: capturedAuthToken, // ¡El token robado!
            'x-api-key': X_API_KEY, // ¡La llave estática!
            'User-Agent': USER_AGENT,
          },
        });

        if (!detailResponse.ok) {
          throw new Error(`API de detalle falló con status: ${detailResponse.status}`);
        }

        const detailJson = await detailResponse.json();

        // Extraemos los detalles del JSON de la API de detalle
        const detalles = {
          descripcion: detailJson.payload?.descripcion ?? null,
          plazo_entrega: detailJson.payload?.plazo_entrega ?? null,
          direccion_entrega: detailJson.payload?.direccion_entrega ?? null,
          // Usamos la llave correcta que vimos en la respuesta de la API de detalle
          productos: detailJson.payload?.productos_solicitados ?? [],
        };

        enrichedItems.push({ ...item, ...detalles });
      } catch (e: any) {
        console.warn(`--- [CANARY V17] Falló FETCH de detalle ${item.codigo}: ${e.message}. Omitiendo.`);
        enrichedItems.push(item); // Guardar solo los datos de la lista
      }
    }

    return enrichedItems; // Devuelve el array de items enriquecidos
  } catch (error: any) {
    console.error('Error durante el scraping híbrido (V17):', error);
    throw new Error(`Scraping híbrido V17 falló: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}