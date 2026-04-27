import { Link, useLocation } from 'react-router-dom';
import { TonConnectButton } from '@tonconnect/ui-react';
import { useNetwork } from '../network';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/give-loan', label: 'Give a Loan' },
  { to: '/get-loan', label: 'Get a Loan' },
  { to: '/profile', label: 'Profile' },
];

export default function Header() {
  const location = useLocation();
  const { network, isTestnet, toggleNetwork } = useNetwork();

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link to="/" className="text-xl font-bold text-white no-underline flex items-center gap-2">
          <span className="text-[var(--color-primary)]">TON</span> NFT Loans
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-4 py-2 rounded-lg text-sm font-medium no-underline transition-colors ${
                location.pathname === link.to
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleNetwork}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors cursor-pointer ${
              isTestnet
                ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/25'
                : 'bg-green-500/15 border-green-500/40 text-green-400 hover:bg-green-500/25'
            }`}
          >
            {network}
          </button>
          <TonConnectButton />
        </div>
      </div>
    </header>
  );
}
