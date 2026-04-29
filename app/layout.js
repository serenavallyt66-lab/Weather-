import "@/styles/globals.css";

export const metadata = {
  title: "Product Page Analyzer",
  description: "AI-powered product page conversion analyzer",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
