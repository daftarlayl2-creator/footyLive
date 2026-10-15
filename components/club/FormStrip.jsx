const STYLES = {
  W: 'bg-lime-500 text-navy-950 shadow-[0_4px_12px_-4px_rgba(198,255,0,0.7)]',
  D: 'bg-zinc-300 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100',
  L: 'bg-red-500 text-white shadow-[0_4px_12px_-4px_rgba(239,68,68,0.7)]',
};

const LABELS = { W: 'Win', D: 'Draw', L: 'Loss' };

/** Last results as W/D/L discs, oldest → newest (newest is ringed). */
export default function FormStrip({ form = [], size = 'md', className = '' }) {
  if (!form.length) return null;
  const dimension = size === 'lg' ? 'h-10 w-10 text-sm' : size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  return (
    <ol className={`flex items-center gap-1.5 ${className}`} aria-label={`Recent form: ${form.map((r) => LABELS[r]).join(', ')}`}>
      {form.map((result, index) => (
        <li
          key={index}
          title={LABELS[result]}
          className={`flex items-center justify-center rounded-full font-black ${dimension} ${STYLES[result] || ''} ${
            index === form.length - 1 ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-transparent' : ''
          }`}
        >
          {result}
        </li>
      ))}
    </ol>
  );
}
