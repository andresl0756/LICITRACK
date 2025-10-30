import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const AUTH_API_URL = 'https://servicios-prd.mercadopublico.cl/v1/auth/publico';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export async function capturePublicAuthToken(timeoutMs: number = 45000): Promise<string> {
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

    const tokenPromise: Promise<string> = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout: Token de Auth (auth/publico) no encontrado.')), timeoutMs);

      page.on('response', async (response) => {
        try {
          if (response.url().startsWith(AUTH_API_URL) && response.status() === 200) {
            const json = await response.json().catch(() => null);
            if (json && (json as any).access_token) {
              clearTimeout(timeout);
              resolve((json as any).access_token as string);
            }
          }
        } catch {
          // Silenciar parseos fallidos
        }
      });
    });

    // Navegar para disparar la llamada de auth/publico
    const url = new URL(VISUAL_PAGE_URL);
    url.searchParams.append('date_from', '2025-01-01'); // el rango no es crítico, solo dispara la app
    url.searchParams.append('date_to', '2025-12-31');
    url.searchParams.append('order_by', 'recent');
    url.searchParams.append('page_number', '1');
    url.searchParams.append('status', '2');

    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });

    const token = await tokenPromise;

    await page.close();
    await browser.close();
    browser = null;

    return token;
  } catch (e: any) {
    throw new Error(`No fue posible capturar token de autenticación: ${e?.message || String(e)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}