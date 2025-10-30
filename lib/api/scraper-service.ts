import { runHybridScraper as runHybridScraperV3 } from './scraper-v3';

export async function runHybridScraper(page: number = 1): Promise<any[]> {
  console.log('--- [CANARY V3] EXECUTING runHybridScraper ---');
  return await runHybridScraperV3(page);
}