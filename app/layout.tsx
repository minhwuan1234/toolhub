import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Toolhub — Account',
  description: 'Account interface prototype for your internal tools workspace.',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
