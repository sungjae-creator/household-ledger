import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * 모바일 및 PWA(독립 실행형 웹앱) 최적화 뷰포트 설정
 */
export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * PWA 및 검색엔진 메타데이터 설정
 * 1. manifest: '/manifest.json' (안드로이드/PC PWA 설치 스펙)
 * 2. appleWebApp: iOS 사파리 홈 화면 추가 시 전체화면 네이티브 앱 모드 구동
 * 3. icons: 192x192, 512x512 고화질 PNG 앱 아이콘 지정
 */
export const metadata: Metadata = {
  title: '스마트 가계부',
  description: '수입·지출 관리부터 AI 재무 보고서까지 한 번에 관리하는 스마트 가계부',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '스마트가계부',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full antialiased font-sans">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="스마트가계부" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        {/* PWA 서비스 워커 자동 등록 (크롬 WebAPK 정식 앱 패키징 요건) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.log('SW registration error:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
