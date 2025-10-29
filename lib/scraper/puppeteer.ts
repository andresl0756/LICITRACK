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
    await page.waitForSelector('div[class*="ListadoResultados"]');

    console.log("Página cargada y contenido dinámico detectado.");

    const selectorTarjeta = "article";
    const items: LicitacionExtraida[] = await page.$$eval(selectorTarjeta, (cards) => {
      const parseNumber = (text: string | null) => {
        if (!text) return null;
        const onlyDigits = text.replace(/[^\d]/g, "");
        return onlyDigits ? Number(onlyDigits) : null;
      };

      return Array.from(cards).map((card) => {
        const getText = (sel: string) =>
          (card.querySelector(sel)?.textContent || "").trim() || null;

        const codigo =
          getText("[data-codigo]") ||
          getText(".codigo") ||
          getText(".id") ||
          null;

        const titulo =
          getText("h2") ||
          getText("h3") ||
          getText(".titulo") ||
          getText(".title") ||
          null;

        const organismo =
          getText(".organismo") ||
          getText(".buyer") ||
          getText(".entidad") ||
          null;

        const montoText =
          getText(".monto") ||
          getText(".amount") ||
          getText("[data-monto]") ||
          getText(".price") ||
          null;

        const fecha_publicacion =
          getText(".fecha-publicacion") ||
          getText("[data-fecha-publicacion]") ||
          null;

        const fecha_cierre =
          getText(".fecha-cierre") ||
          getText("[data-fecha-cierre]") ||
          null;

        const anchor = card.querySelector('a[href*="mercadopublico"]') as HTMLAnchorElement | null;
        const url_ficha = anchor ? anchor.href : null;

        return {
          codigo: codigo ?? undefined,
          titulo: titulo ?? undefined,
          organismo: organismo ?? undefined,
          monto_clp: parseNumber(montoText) ?? undefined,
          fecha_publicacion: fecha_publicacion ?? undefined,
          fecha_cierre: fecha_cierre ?? undefined,
          url_ficha: url_ficha ?? undefined,
          es_compra_agil: true,
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