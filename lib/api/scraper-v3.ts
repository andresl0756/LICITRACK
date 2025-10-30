import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const API_TARGET_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function runHybridScraper(page: number = 1): Promise<any[]> {
  console.log('--- [CANARY V19] EJECUTANDO SCRAPER V5 (New Page + Cookies) ---');
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

    // --- 1. Interceptar la Lista de Resultados ---
    const licitacionesPromise: Promise<unknown> = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout: La API interna nunca respondió.'));
      }, 45000); // 45 segundos

      listPage.on('response', async (response) => {
        const url = response.url();
        if (url.startsWith(API_TARGET_URL) && response.status() === 200) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              const json = await response.json();
              clearTimeout(timeout);
              resolve(json); // Resuelve con el JSON
            }
          } catch {
            reject(new Error('Falló al parsear el JSON de la API interceptada'));
          }
        }
      });
    });

    // Construir y navegar a la página de lista
    const dateTo = getTodayFormatted();
    const dateFrom = get30DaysAgoFormatted();
    const listUrl = new URL(VISUAL_PAGE_URL);
    listUrl.searchParams.append('date_from', dateFrom);
    listUrl.searchParams.append('date_to', dateTo);
    listUrl.searchParams.append('order_by', 'recent');
    listUrl.searchParams.append('page_number', page.toString());
    listUrl.searchParams.append('status', '2');

    console.log(`Navegando a la página visual: ${listUrl.toString()}`);
    await listPage.goto(listUrl.toString(), { waitUntil: 'domcontentloaded' });

    const apiResponse = (await licitacionesPromise) as any;
    const items = apiResponse?.payload?.resultados ?? [];

    // --- 2. Iterar y Scrapear Detalles ---
    const enrichedItems: any[] = [];

    for (const item of items) {
      const urlFicha = `https://buscador.mercadopublico.cl/ficha?code=${item.codigo}`;
      let detailPage: Page | null = null;

      try {
        detailPage = await browser.newPage();
        await detailPage.setUserAgent(USER_AGENT);

        // Copia las cookies de la página de lista a la nueva pestaña
        const cookies = await listPage.cookies();
        await detailPage.setCookie(...cookies);

        console.log(`Navegando al detalle: ${urlFicha}`);
        await detailPage.goto(urlFicha, { waitUntil: 'domcontentloaded' });

        // Esperamos el H1 del detalle (selector de título)
        await detailPage.waitForSelector('h1[class*="dqvMeL"]', { timeout: 15000 });

        const detalles = await detailPage.evaluate(() => {
          const getDetailValue = (keyText: string): string | null => {
            const allRows = document.querySelectorAll('div.sc-iQLUmZ div.MuiGrid-container[class*="sc-kpQBza"]');
            const row = Array.from(allRows).find(el => el.querySelector('p')?.textContent?.trim() === keyText);
            const valueEl = row?.querySelector('div[class*="MuiGrid-grid-sm-8"] p') as HTMLElement | null;
            return valueEl?.textContent?.trim() || null;
          };

          const getProducts = () => {
            const productContainer = document.querySelector('form[class*="sc-gjcSds"]');
            if (!productContainer) return [];
            const productItems = productContainer.querySelectorAll('div[class*="sc-iKTcqh hdEFTf"]');
            return Array.from(productItems).map(item => {
              const name = (item.querySelector('p[class*="gcqPWt"]') as HTMLElement | null)?.textContent?.trim() || null;
              const desc = (item.querySelector('p[class*="fQHKbh"]') as HTMLElement | null)?.textContent?.trim() || null;
              const quantity = (item.querySelector('div[class*="bQhPOs"] p') as HTMLElement | null)?.textContent?.trim() || null;
              return { name, desc, quantity };
            });
          };

          const descripcion = getDetailValue('Descripción');
          const plazo_entrega = getDetailValue('Plazo de entrega');
          const direccion_entrega = getDetailValue('Dirección de entrega');
          const productos = getProducts();
          return { descripcion, plazo_entrega, direccion_entrega, productos };
        });

        enrichedItems.push({ ...item, ...detalles });
      } catch (e: any) {
        console.error(`--- [CANARY V19] ERROR EN DETALLE PARA ${item.codigo} ---`);
        console.error(`--- ERROR: ${e.message} ---`);

        if (detailPage) {
          console.error('--- HTML DE LA PÁGINA DE ERROR (DETALLE) ---');
          try {
            const pageHtml = await detailPage.content();
            console.error(pageHtml);
          } catch (htmlError: any) {
            console.error(`No se pudo obtener el HTML de la página: ${htmlError.message}`);
          }
          console.error('--- FIN DEL HTML DE ERROR (DETALLE) ---');
        }
        enrichedItems.push(item); // Guardar solo los datos de la lista
      } finally {
        if (detailPage) {
          await detailPage.close(); // Cierra la pestaña de detalle
        }
      }
    }

    await listPage.close(); // Cerramos la página de lista tras terminar los detalles

    return enrichedItems; // Devuelve el array de items enriquecidos
  } catch (error: any) {
    console.error('Error durante el scraping híbrido (V5):', error);
    throw new Error(`Scraping híbrido V5 falló: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}