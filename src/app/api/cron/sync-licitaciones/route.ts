import { NextResponse } from "next/server";
import { scrapeCompraAgil } from "../../../../../lib/scraper/puppeteer";

export async function GET(request: Request) {
  // REMOVED: lectura de header Authorization
  // const authHeader = request.headers.get("authorization");
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  // Nueva lógica: leer 'secret' desde query params
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const licitaciones = await scrapeCompraAgil();
    return NextResponse.json({
      success: true,
      count: licitaciones.length,
      data: licitaciones,
    });
  } catch (error) {
    console.error("Error en el cron job:", error);
    return NextResponse.json({ error: "Scraping failed" }, { status: 500 });
  }
}