import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';

// 1. LA PÁGINA VISUAL (la que cargamos)
const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';

// 2. LA API INTERNA (la que interceptamos)
const API_TARGET_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';

/**
 * Lanza un navegador, carga la página visual e intercepta la
 * respuesta JSON de la API interna para obtener los datos.
 */
export async function fetchLicitaciones(page: number = 1): Promise<unknown> {
  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const browserPage = await browser.newPage();

    // Configurar el User-Agent (¡Crítico!)
    await browserPage.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    // Encabezados adicionales para parecer navegador real
    await browserPage.setExtraHTTPHeaders({
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-CL,es;q=0.9',
      'Referer': 'https://buscador.mercadopublico.cl/',
    });

    // Intercepción de requests para bloquear recursos pesados
    await browserPage.setRequestInterception(true);
    browserPage.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    // --- Lógica de Intercepción de respuestas ---
    const licitacionesPromise: Promise<unknown> = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: La API interna nunca respondió.'));
      }, 30000); // 30 segundos

      browserPage.on('response', async (response) => {
        try {
          const url = response.url();

          // Si la respuesta es de la API que buscamos y es JSON...
          if (url.startsWith(API_TARGET_URL) && response.status() === 200) {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const json = await response.json();
              clearTimeout(timeout);
              resolve(json); // ¡Resuelto con el JSON interceptado!
            }
          }
        } catch {
          reject(new Error('Falló al parsear el JSON de la API interceptada'));
        }
      });
    });
    // --- Fin Lógica de Intercepción ---

    // Construir la URL de la página visual con parámetros de fecha y filtros
    const dateTo = getTodayFormatted();
    const dateFrom = get30DaysAgoFormatted();
    const url = new URL(VISUAL_PAGE_URL);
    url.searchParams.append('date_from', dateFrom);
    url.searchParams.append('date_to', dateTo);
    url.searchParams.append('order_by', 'recent');
    url.searchParams.append('page_number', page.toString());
    url.searchParams.append('status', '2'); // Publicadas

    console.log(`Navegando a la página visual: ${url.toString()}`);

    // Navegar a la página visual (esto disparará la llamada a la API)
    await browserPage.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 60000 });

    // Esperar a que la promesa de intercepción se resuelva
    const licitacionesData = await licitacionesPromise;
    return licitacionesData;
  } catch (error: any) {
    console.error('Error durante el scraping híbrido:', error);
    throw new Error(`Scraping híbrido falló: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}