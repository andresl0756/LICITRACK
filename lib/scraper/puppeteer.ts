import puppeteer, { type Browser, type Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import type { Database } from "../supabase/database.types";

export const TARGET_URL = "https://buscador.mercadopublico.cl/compra-agil";

type LicitacionExtraida = Partial<Database["public"]["Tables"]["licitaciones"]["Row"]> & {
  descripcion?: string | null;
  plazo_entrega?: string | null;
  direccion_entrega?: string | null;
  productos?: any[];
};

/**
 * Ejecuta el scraping de Compra Ágil usando Chromium optimizado para serverless.
 * Retorna un arreglo con los datos extraídos.
 */
export async function scrapeCompraAgil(): Promise<LicitacionExtraida[]> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: true,
    });

    page = await browser.newPage();
    await page!.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );
    await page!.goto(TARGET_URL);

    // Espera clave: asegurar carga del contenido dinámico
    await page!.waitForSelector('div[class^="sc-eteQWc"]');

    console.log("Página cargada y contenido dinámico detectado.");

    const selectorTarjeta = 'div[class^="sc-eteQWc"]';
    const items: LicitacionExtraida[] = await page!.$$eval(selectorTarjeta, (cards) => {
      const parseNumber = (text: string | null) => {
        if (!text) return null;
        const onlyDigits = text.replace(/[^\d]/g, "");
        return onlyDigits ? Number(onlyDigits) : null;
      };

      return Array.from(cards).map((card) => {
        const getText = (sel: string) =>
          (card.querySelector(sel)?.textContent || "").trim() || null;

        // --- Selectores que SÍ funcionaron ---
        const titulo =
          card.querySelector('h4[title]')?.textContent?.trim() || null;
        const codigo = getText('span[class*="dvJGcM"]');

        // --- Selectores CORREGIDOS (basados en json_raw) ---
        const organismo = getText('p[class*="jfwXSc"]');
        const montoText = getText('h3[class*="jaayVL"]');
        const fechaCierreText = getText('div[class*="keoiAX"] h3');
        const fechaPublicacionText = getText('div[class*="cznDE"] h3');

        // --- Lógica de URL (ya funciona bien) ---
        let urlFicha: string | null = null;
        const anchor = card.querySelector('a[class^="sc-dsPRyZ"]') as HTMLAnchorElement | null;

        if (anchor && anchor.href) {
          urlFicha = anchor.href;
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
          json_raw: { raw: card.innerHTML },
        };
      });
    });

    // REFAC: single-page. REMOVED: uso de detailPage/newPage y transferencia de cookies.
    const enrichedItems: LicitacionExtraida[] = [];

    for (const item of items) {
      if (!item.url_ficha) continue;

      await page!.goto(item.url_ficha);
      await page!.waitForSelector('h1[class*="dqvMeL"]');

      const detalles = await page!.evaluate(() => {
        // Función 1: Para buscar campos de texto (Descripción, Plazo, etc.)
        const getDetailValue = (keyText: string): string | null => {
          const allRows = document.querySelectorAll('div.sc-iQLUmZ div.MuiGrid-container[class*="sc-kpQBza"]');
          const row = Array.from(allRows).find(el => el.querySelector('p')?.textContent?.trim() === keyText);
          return row?.querySelector('div[class*="MuiGrid-grid-sm-8"] p')?.textContent?.trim() || null;
        };

        // Función 2: Para extraer la lista de productos
        const getProducts = () => {
          const productContainer = document.querySelector('form[class*="sc-gjcSds"]');
          if (!productContainer) return [] as any[];

          const productItems = productContainer.querySelectorAll('div[class*="sc-iKTcqh hdEFTf"]');
          return Array.from(productItems).map(item => {
            const name = (item.querySelector('p[class*="gcqPWt"]')?.textContent || "").trim() || null;
            const desc = (item.querySelector('p[class*="fQHKbh"]')?.textContent || "").trim() || null;
            const quantity = (item.querySelector('div[class*="bQhPOs"] p')?.textContent || "").trim() || null;
            return { name, desc, quantity };
          });
        };

        const descripcion = getDetailValue('Descripción');
        const plazo_entrega = getDetailValue('Plazo de entrega');
        const direccion_entrega = getDetailValue('Dirección de entrega');
        const productos = getProducts();

        return { descripcion, plazo_entrega, direccion_entrega, productos };
      });

      enrichedItems.push({
        ...item,
        descripcion: detalles.descripcion,
        plazo_entrega: detalles.plazo_entrega,
        direccion_entrega: detalles.direccion_entrega,
        productos: detalles.productos,
      });
    }

    return enrichedItems;
  } catch (error) {
    if (page) {
      console.error("--- INICIO HTML DE PÁGINA EN ERROR ---");
      try {
        const pageHtml = await page.content();
        console.error(pageHtml);
      } catch (e) {
        console.error("No se pudo obtener el HTML de la página.");
      }
      console.error("--- FIN HTML DE PÁGINA EN ERROR ---");
    }

    console.error("Error durante el scraping:", error);
    throw new Error("Falló el scraping de Compra Ágil");
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}