import { ScrollViewStyleReset } from 'expo-router/html';

const css = `
  html, body, #root {
    height: 100%;
    width: 100%;
    margin: 0;
    padding: 0;
    background: #F3EDE3;
  }
  @supports (height: 100dvh) {
    html, body, #root {
      height: 100dvh;
    }
  }
  [role="tablist"] {
    box-sizing: border-box !important;
    flex-shrink: 0 !important;
  }
  @supports (-webkit-touch-callout: none) {
    [role="tablist"] {
      bottom: var(--safari-gap, 0px) !important;
      height: calc(94px + env(safe-area-inset-bottom, 0px)) !important;
      min-height: calc(94px + env(safe-area-inset-bottom, 0px)) !important;
      padding-bottom: calc(30px + env(safe-area-inset-bottom, 0px)) !important;
    }
  }
`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="Cache-Control" content="no-store" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#F3EDE3" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="쟝쟝" />
        <meta name="application-name" content="쟝쟝" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: serviceWorkerRegistration }} />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const serviceWorkerRegistration = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (error) {
        console.error('Service worker registration failed:', error);
      });
    });
  }
`;
