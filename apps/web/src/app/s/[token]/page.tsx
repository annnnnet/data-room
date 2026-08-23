import type { Metadata } from 'next';
import { ShareBrowserContent } from './ShareBrowserContent';

// Never the shared item's name or the token — this is a public URL, and a
// browser tab/history title is a plausible leak surface for both.
export const metadata: Metadata = {
  title: 'Shared item – Data Room',
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShareBrowserContent token={token} nodeId={null} />;
}
