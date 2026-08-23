import type { ReactNode } from 'react';
import { UploadProvider } from '@/components/upload/UploadProvider';

/**
 * Hosts the upload queue above the routed `f/[[...nodeId]]` segment. Next
 * remounts `page.tsx` (and everything under it) on every navigation, even
 * between two matches of the same page file — only a shared `layout.tsx`
 * keeps its subtree mounted across those transitions. Living here (keyed
 * only by `roomId`, which doesn't change while browsing one room's
 * folders) is what lets in-flight uploads — and their XHRs, abort handles,
 * and the dock UI — survive the user navigating from folder to folder.
 */
export default function RoomLayout({ children }: { children: ReactNode }) {
  return <UploadProvider>{children}</UploadProvider>;
}
