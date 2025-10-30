import { runHybridScraper as runHybridScraperV4 } from './scraper-v4';

export async function runHybridScraper(page: number = 1): Promise<any[]> {
  console.log('--- [CANARY V3] EXECUTING runHybridScraper ---');
  return await runHybridScraperV4(page);
}