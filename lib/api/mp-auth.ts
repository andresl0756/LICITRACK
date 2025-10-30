import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/ficha';
const API_DETAIL_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Captura el token (Authorization) y x-api-key escuchando el request de detalle real:
 * https://api.buscador.mercadopublico.cl/compra-agil?action=ficha&code=...
 * 
 * Estrategia:
 * - Abre una página con Puppeteer.
 * - Escucha "request".
 * - Navega a https://buscador.mercadopublico.cl/ficha?code=CODIGO.
 * - Cuando la SPA dispare el request de detalle, lee headers y devuelve { token, apiKey }.
 */
export async function captureAuthFromDetail(
  code: string,
  timeoutMs: number = 45000
): Promise<{ token: string; apiKey?: string }> {
  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    const capturePromise: Promise<{ token: string; apiKey?: string }> = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout: request de detalle no fue interceptado')), timeoutMs);

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
          // Silenciar errores de lectura de headers
        }
      });
    });

    const fichaUrl = `${VISUAL_PAGE_URL}?code=${encodeURIComponent(code)}`;
    await page.goto(fichaUrl, { waitUntil: 'domcontentloaded' });

    const result = await capturePromise;

    await page.close();
    await browser.close();
    browser = null;

    return result;
  } catch (e: any) {
    throw new Error(`No fue posible capturar token desde el detalle: ${e?.message || String(e)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}