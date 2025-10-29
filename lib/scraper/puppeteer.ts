import puppeteer, { type Browser, type LaunchOptions } from "puppeteer-core";

export const COMPRA_AGIL_BASE_URL = "https://www.mercadopublico.cl/Portal/ComprasAgiles";

/**
 * Ejecuta el scraping de Compra Ágil.
 * Retorna un arreglo con los datos extraídos.
 */
export async function scrapeCompraAgil(): Promise<any[]> {
  let browser: Browser | null = null;
  const results: any[] = [];

  try {
    // Lanzar navegador
    const launchOptions: LaunchOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
      executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
    };

    browser = await puppeteer.launch(launchOptions);

    // Abrir nueva página
    const page = await browser.newPage();

    // Navegar a la URL
    await page.goto(COMPRA_AGIL_BASE_URL, {
      waitUntil: "networkidle2",
      timeout: 60_000,
    });

    // Esperar a que el contenido dinámico cargue
    await page.waitForSelector("body", { timeout: 30_000 });

    // Procesar paginación y extraer datos
    // Ejemplo mínimo (reemplazar por selectores y extracción real)
    // const items = await page.evaluate(() => {
    //   return Array.from(document.querySelectorAll("selector-de-item")).map(el => ({
    //     // mapear campos
    //   }))
    // })
    // results.push(...items)

    return results;
  } catch (err) {
    console.error("Error en scrapeCompraAgil:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    throw new Error(`scrapeCompraAgil failed: ${message}`);
  } finally {
    // Asegurar cierre del navegador incluso si falla
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn("No se pudo cerrar el navegador de Puppeteer limpiamente:", closeErr);
      }
    }
  }
}