import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign in – Data Room',
};

export default function LoginPage() {
  return <LoginForm />;
}
