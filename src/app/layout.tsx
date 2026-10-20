import type { Metadata } from "next";
import "./globals.css";
import React from 'react';
import { ServerProvider } from '@/contexts/ServerContext';

// @group Configuration : Page metadata and workspace providers
export const metadata: Metadata = {
  title: "EZ Kafka Visualizer",
  description: "Kafka topic management made easy",
};

import KafkaVisualizer from '@/components/KafkaVisualizer';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="w-full h-full">
      <body
        className="antialiased w-full h-full m-0 p-0"
      >
        <ServerProvider>
          <KafkaVisualizer />
          <div className="hidden">{children}</div>
        </ServerProvider>
      </body>
    </html>
  );
}
