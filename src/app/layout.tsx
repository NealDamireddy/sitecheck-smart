import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import { ViewModeWrapper } from '@/components/layout/view-mode-wrapper';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { ErrorBoundary } from '@/components/providers/error-boundary';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

const oswald = localFont({
  src: [
    {
      path: './fonts/Oswald-Variable.ttf',
      style: 'normal',
    },
  ],
  variable: '--font-oswald',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SiteCheck — AI-Powered Construction Site Intelligence',
  description:
    'Drone surveillance, blueprint analysis, progress tracking, and safety compliance in one dashboard.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${oswald.variable} dark`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased texture-concrete">
        <ErrorBoundary>
          <RealtimeProvider>
            <ViewModeWrapper>{children}</ViewModeWrapper>
          </RealtimeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
