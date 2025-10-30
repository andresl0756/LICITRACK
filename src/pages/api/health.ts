import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  return res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    apiRoutesPresent: ['/api/cron/sync-v3'],
    router: 'pages',
  });
}