export default function PlayerLoading() {
  return (
    <div aria-label="Loading player profile" aria-busy="true" className="mx-auto max-w-6xl space-y-6 animate-pulse motion-reduce:animate-none">
      <div className="glass-dark h-72 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <div key={i} className="app-card h-40" />)}</div>
      <div className="glass-dark h-80 rounded-3xl" />
    </div>
  );
}
