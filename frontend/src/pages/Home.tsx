import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="text-center py-16">
        <h1 className="text-5xl font-bold mb-4">
          NFT-Backed Loans on <span className="text-[var(--color-primary)]">TON</span>
        </h1>
        <p className="text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-8">
          Use your NFTs as collateral to get instant liquidity, or earn interest by funding loans secured by NFT assets.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/get-loan"
            className="px-8 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl font-semibold no-underline transition-colors"
          >
            Get a Loan
          </Link>
          <Link
            to="/give-loan"
            className="px-8 py-3 border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white rounded-xl font-semibold no-underline transition-colors"
          >
            Give a Loan
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: '1',
              title: 'List Your NFT',
              desc: 'Borrowers list their NFT as collateral and set desired loan terms — amount, duration, and interest rate.',
            },
            {
              step: '2',
              title: 'Fund the Loan',
              desc: 'Lenders browse available loans, review the collateral NFT, and fund the ones that match their criteria.',
            },
            {
              step: '3',
              title: 'Repay or Liquidate',
              desc: 'Borrowers repay principal + interest to get their NFT back. If not repaid, the lender claims the NFT.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 text-center"
            >
              <div className="w-10 h-10 bg-[var(--color-primary)] rounded-full flex items-center justify-center text-white font-bold mx-auto mb-4">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-[var(--color-text-secondary)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Loans', value: '--' },
          { label: 'Total Volume', value: '--' },
          { label: 'Active Loans', value: '--' },
          { label: 'NFTs Locked', value: '--' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 text-center"
          >
            <p className="text-sm text-[var(--color-text-secondary)]">{stat.label}</p>
            <p className="text-2xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
