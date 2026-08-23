'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { ShareTokenProvider } from '@/lib/share-token';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toast';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 10_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ShareTokenProvider token={null}>
          <TooltipProvider>
            <Toaster>{children}</Toaster>
          </TooltipProvider>
        </ShareTokenProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
