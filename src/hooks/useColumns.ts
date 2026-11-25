import { useEffect, useState } from 'react';
import { columnsForWidth, GRID_BREAKPOINTS } from '@/lib/virtualRows';

/** How many columns the Discover grid has right now (follows the same breakpoints as its CSS classes). */
export function useColumns(): number {
  const [columns, setColumns] = useState(() => columnsForWidth(window.innerWidth));
  useEffect(() => {
    const lists = GRID_BREAKPOINTS.filter(([min]) => min > 0).map(([min]) => window.matchMedia(`(min-width: ${min}px)`));
    const update = () => setColumns(columnsForWidth(window.innerWidth));
    lists.forEach((l) => l.addEventListener('change', update));
    update();
    return () => lists.forEach((l) => l.removeEventListener('change', update));
  }, []);
  return columns;
}
