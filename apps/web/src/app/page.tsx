import type { Metadata } from 'next';
import { HomeContent } from './HomeContent';

export const metadata: Metadata = {
  title: 'Data Room',
};

export default function Home() {
  return <HomeContent />;
}
