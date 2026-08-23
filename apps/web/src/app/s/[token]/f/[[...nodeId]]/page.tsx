import type { Metadata } from 'next';
import { ShareBrowserContent } from '../../ShareBrowserContent';

export const metadata: Metadata = {
  title: 'Shared item – Data Room',
};

export default async function ShareFolderPage({
  params,
}: {
  params: Promise<{ token: string; nodeId?: string[] }>;
}) {
  const { token, nodeId } = await params;
  // The catch-all only ever carries the id of the folder being viewed —
  // everything else (breadcrumbs, etc.) comes from the API, not the URL.
  return <ShareBrowserContent token={token} nodeId={nodeId?.at(-1) ?? null} />;
}
