import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Toolhub',
  description: 'Your internal tools workspace.',
  icons: { icon: [{ url: '/notion.svg?v=2', type: 'image/svg+xml' }], shortcut: '/notion.svg?v=2' },
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
