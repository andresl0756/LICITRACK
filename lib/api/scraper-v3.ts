import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const API_TARGET_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';

export async function runHybridScraper(page: number = 1): Promise<unknown> {
  console.log('--- [CANARY V9] EJECUTANDO SCRAPER V3 ---');
  console.log('--- [CANARY V3] EXECUTING runHybridScraper ---');
  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const browserPage = await browser.newPage();

    await browserPage.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    await browserPage.setExtraHTTPHeaders({
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-CL,es;q=0.9',
      'Referer': 'https://buscador.mercadopublico.cl/',
    });

    await browserPage.setRequestInterception(true);
    browserPage.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    const licitacionesPromise: Promise<unknown> = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: La API interna nunca respondió.'));
      }, 30000);

      browserPage.on('response', async (response) => {
        const url = response.url();
        console.log(`[Intercepción]: ${response.status()} ${url}`);
        try {
          if (url.startsWith(API_TARGET_URL) && response.status() === 200) {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const json = await response.json();
              clearTimeout(timeout);
              resolve(json);
            }
          }
        } catch {
          reject(new Error('Falló al parsear el JSON de la API interceptada'));
        }
      });
    });

    const dateTo = getTodayFormatted();
    const dateFrom = get30DaysAgoFormatted();
    const url = new URL(VISUAL_PAGE_URL);
    url.searchParams.append('date_from', dateFrom);
    url.searchParams.append('date_to', dateTo);
    url.searchParams.append('order_by', 'recent');
    url.searchParams.append('page_number', page.toString());
    url.searchParams.append('status', '2');

    console.log(`Navegando a la página visual: ${url.toString()}`);

    // Inicia la navegación, pero no la espera
    browserPage.goto(url.toString());
    // Ahora esperamos a que la promesa de intercepción se resuelva
    return await licitacionesPromise;
  } catch (error: any) {
    console.error('Error durante el scraping híbrido:', error);
    throw new Error(`Scraping híbrido falló: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}