interface Props {
  label: string;
  value: string | number;
  color?: string;
}

export default function StatCard({ label, value, color = 'text-white' }: Props) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
      <p className="text-sm text-[var(--color-text-secondary)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
