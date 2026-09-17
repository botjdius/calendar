import { ScrollViewStyleReset } from 'expo-router/html';

const css = `
  html, body, #root {
    height: 100%;
    background: #F3EDE3;
  }
  body {
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px) + var(--safari-gap, 0px));
  }
  @supports (-webkit-touch-callout: none) {
    [role="tablist"] {
      bottom: var(--safari-gap, 0px) !important;
      padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px)) !important;
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
        <meta name="apple-mobile-web-app-title" content="쟝쟝" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
