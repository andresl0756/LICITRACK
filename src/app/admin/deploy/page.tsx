"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { RefreshCcw } from 'lucide-react';

export default function DeployAdminPage() {
  const [loading, setLoading] = React.useState(false);

  const triggerDeploy = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/vercel-refresh', { method: 'POST' });
    const data = await res.json();

    if (!res.ok || !data?.ok) {
      toast.error(data?.error ? String(data.error) : `Error al disparar deploy (status ${data?.status ?? res.status})`);
    } else {
      toast.success('Deploy disparado en Vercel. Revisa tu proyecto para ver el nuevo deployment.');
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-6">
      <Toaster />
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Deploy en Vercel</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Dispara un nuevo deployment en Vercel usando un Deploy Hook. Configura la variable de entorno
            <span className="font-semibold"> VERCEL_DEPLOY_HOOK_URL</span> con la URL del hook de tu rama.
          </p>
          <Button onClick={triggerDeploy} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {loading ? 'Disparando…' : 'Trigger Deploy'}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Si no hay hook configurado, verás un error indicando que falta la variable VERCEL_DEPLOY_HOOK_URL.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}