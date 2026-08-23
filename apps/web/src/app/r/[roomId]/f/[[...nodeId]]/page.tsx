import type { Metadata } from 'next';
import { RoomBrowserContent } from './RoomBrowserContent';

export const metadata: Metadata = {
  title: 'Browse – Data Room',
};

export default async function FolderPage({
  params,
}: {
  params: Promise<{ roomId: string; nodeId?: string[] }>;
}) {
  const { roomId, nodeId } = await params;
  // The catch-all only ever carries the id of the folder being viewed — the
  // rest of the path (for breadcrumbs, etc.) comes from the API, not the URL.
  return <RoomBrowserContent roomId={roomId} nodeId={nodeId?.at(-1) ?? null} />;
}
