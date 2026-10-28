import './globals.css';

export const metadata = { title: 'GlobalPay.bt (prototype)' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
