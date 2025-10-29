import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import type { Database } from "../supabase/database.types";

export const TARGET_URL = "https://buscador.mercadopublico.cl/compra-agil";

type LicitacionExtraida = Partial<Database["public"]["Tables"]["licitaciones"]["Row"]>;

/**
 * Ejecuta el scraping de Compra Ágil usando Chromium optimizado para serverless.
 * Retorna un arreglo con los datos extraídos.
 */
export async function scrapeCompraAgil(): Promise<LicitacionExtraida[]> {
  let browser: Browser | null = null;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    await page.goto(TARGET_URL);

    // Espera clave: asegurar carga del contenido dinámico
    await page.waitForSelector('div[class^="sc-eteQWc"]');

    console.log("Página cargada y contenido dinámico detectado.");

    const selectorTarjeta = 'div[class^="sc-eteQWc"]';
    const items: LicitacionExtraida[] = await page.$$eval(selectorTarjeta, (cards) => {
      const parseNumber = (text: string | null) => {
        if (!text) return null;
        const onlyDigits = text.replace(/[^\d]/g, "");
        return onlyDigits ? Number(onlyDigits) : null;
      };

      return Array.from(cards).map((card) => {
        const getText = (sel: string) =>
          (card.querySelector(sel)?.textContent || "").trim() || null;

        const titulo =
          card.querySelector('h4[title]')?.textContent?.trim() || null;

        const codigo = getText('span[class*="dvJGcM"]');

        const organismo = getText('p[class*="OrPQk"]');

        const montoText = getText('div[class*="kszCox"] h3');

        const fechaCierreText = getText('div[class*="iztDaw"] h3');

        const fechaPublicacionText = getText('div[class*="cqVaPv"] h3');

        let urlFicha: string | null = null;
        const anchor = card.querySelector('a[class^="sc-dsPRyZ"]') as HTMLAnchorElement | null;

        if (anchor && (anchor as HTMLAnchorElement).href) {
          urlFicha = (anchor as HTMLAnchorElement).href;
        } else if (codigo) {
          const codigoLimpio = codigo.replace(/\s/g, "");
          urlFicha = `https://www.mercadopublico.cl/CompraAgil/Ficha?id=${codigoLimpio}`;
        }

        return {
          codigo: codigo ?? undefined,
          titulo: titulo ?? undefined,
          organismo: organismo ?? undefined,
          monto_clp: parseNumber(montoText) ?? undefined,
          fecha_publicacion: fechaPublicacionText ?? undefined,
          fecha_cierre: fechaCierreText ?? undefined,
          url_ficha: urlFicha ?? undefined,
          es_compra_agil: true,
          json_raw: { raw: (card as HTMLElement).innerHTML }, // Guardamos el HTML para depuración
        };
      });
    });

    return items;
  } catch (error) {
    console.error("Error durante el scraping:", error);
    throw new Error("Falló el scraping de Compra Ágil");
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}