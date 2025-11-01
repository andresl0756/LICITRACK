import puppeteer, { type Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { getTodayFormatted, get30DaysAgoFormatted } from '../utils/dates';

const VISUAL_PAGE_URL = 'https://buscador.mercadopublico.cl/ficha';
const API_DETAIL_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
const VISUAL_LIST_PAGE_URL = 'https://buscador.mercadopublico.cl/compra-agil';
const API_LIST_URL = 'https://api.buscador.mercadopublico.cl/compra-agil';
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

function parseProxyAuth(proxyUrl?: string): { serverArg?: string; username?: string; password?: string } {
  if (!proxyUrl) return {};
  try {
    const u = new URL(proxyUrl);
    const serverArg = `${u.protocol}//${u.hostname}:${u.port}`;
    return {
      serverArg,
      username: u.username || undefined,
      password: u.password || undefined,
    };
  } catch {
    return {};
  }
}

// NUEVO: Captura headers de la API de Listado (authorization y x-api-key)
export async function getAuthHeaders(timeoutMs: number = 45000): Promise<{ authToken: string; apiKey?: string }> {
  let browser: Browser | null = null;

  try {
    const proxyUrl = process.env.PROXY_URL;
    if (!proxyUrl) {
      throw new Error('PROXY_URL no está configurada.');
    }

    const { serverArg, username, password } = parseProxyAuth(proxyUrl);

    const executablePath = await chromium.executablePath();
    browser = await puppeteer.launch({
      args: serverArg ? [...chromium.args, `--proxy-server=${serverArg}`] : chromium.args,
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    if (username && password) {
      await page.authenticate({ username, password });
    }

    const capturePromise: Promise<{ authToken: string; apiKey?: string }> = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout: request de listado no fue interceptado')), timeoutMs);

      page.on('request', async (request) => {
        try {
          const url = request.url();
          if (url.startsWith(API_LIST_URL)) {
            const headers = request.headers();
            const authorization = headers['authorization'] || headers['Authorization'];
            const apiKey = headers['x-api-key'] || headers['X-API-KEY'];
            if (authorization) {
              clearTimeout(timer);
              resolve({ authToken: authorization, apiKey });
            }
          }
        } catch {
          // Silenciar errores de lectura de headers
        }
      });
    });

    // Navegar a la página visual con filtros para disparar llamadas de lista
    const listUrl = new URL(VISUAL_LIST_PAGE_URL);
    listUrl.searchParams.append('date_from', get30DaysAgoFormatted());
    listUrl.searchParams.append('date_to', getTodayFormatted());
    listUrl.searchParams.append('order_by', 'recent');
    listUrl.searchParams.append('page_number', '1');
    listUrl.searchParams.append('status', '2');

    await page.goto(listUrl.toString(), { waitUntil: 'domcontentloaded' });

    const result = await capturePromise;

    await page.close();
    await browser.close();
    browser = null;

    return result;
  } catch (e: any) {
    throw new Error(`No fue posible capturar tokens desde la API de listado: ${e?.message || String(e)}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}