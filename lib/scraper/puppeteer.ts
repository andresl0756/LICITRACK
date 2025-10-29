import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const TARGET_URL = "https://buscador.mercadopublico.cl/compra-agil";

/**
 * Ejecuta el scraping de Compra Ágil usando Chromium optimizado para serverless.
 * Retorna un arreglo con los datos extraídos.
 */
export async function scrapeCompraAgil(): Promise<any[]> {
  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto(TARGET_URL);

    // Espera clave: asegurar carga del contenido dinámico
    await page.waitForSelector('div[class*="ListadoResultados"]');

    console.log("Página cargada y contenido dinámico detectado.");

    // Placeholder para datos extraídos
    return [];
  } catch (error) {
    console.error("Error durante el scraping:", error);
    throw new Error("Falló el scraping de Compra Ágil");
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}