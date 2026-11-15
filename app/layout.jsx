import "./globals.css";

export const metadata = {
  title: "RugReceipt: check a token before you list or buy it",
  description: "Paid Telegraph checks, audited against free sources, with every receipt. Testnet.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="banner">TESTNET: payments use test USDC on Ethereum Sepolia. Not financial advice.</div>
        <nav className="wrap nav">
          <a href="/" className="brand">RugReceipt</a>
          <a href="/about">How it works</a>
        </nav>
        <main className="wrap">{children}</main>
        <footer className="wrap muted">
          Built on <a href="https://telegraphprotocol.com">Telegraph</a> · <a href="https://github.com/gajanand27-05/rugreceipt">source</a>
        </footer>
      </body>
    </html>
  );
}
