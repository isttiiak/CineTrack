import { motion } from 'framer-motion';
import type { WatchStatus } from '@/types';

const CONFIG: Record<WatchStatus, { label: string; style: React.CSSProperties }> = {
  plan: {
    label: 'Plan to Watch',
    style: { background: 'var(--status-plan-bg)', color: 'var(--status-plan-text)', border: '1px solid var(--status-plan-border)' },
  },
  watching: {
    label: 'Watching',
    style: { background: 'var(--status-watching-bg)', color: 'var(--status-watching-text)', border: '1px solid var(--status-watching-border)' },
  },
  watched: {
    label: 'Watched',
    style: { background: 'var(--status-watched-bg)', color: 'var(--status-watched-text)', border: '1px solid var(--status-watched-border)' },
  },
};

const CYCLE: Record<WatchStatus, WatchStatus> = { plan: 'watching', watching: 'watched', watched: 'plan' };

interface Props {
  status: WatchStatus;
  onChange: (next: WatchStatus) => void;
}

export function StatusBadge({ status, onChange }: Props) {
  const { label, style } = CONFIG[status];
  return (
    <motion.button
      whileHover={{ scale: 1.06, filter: 'brightness(1.15)' }}
      whileTap={{ scale: 0.94 }}
      onClick={() => onChange(CYCLE[status])}
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap cursor-pointer select-none"
      style={style}
      title="Click to change status"
    >
      {label}
    </motion.button>
  );
}
