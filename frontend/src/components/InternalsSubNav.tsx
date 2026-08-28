import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { path: 'pipeline', label: 'Pipeline Stages' },
  { path: 'network', label: 'Live Network Graph' },
  { path: 'forecast', label: 'Forecast Rollout Tree' },
] as const;

/** Sub-nav for the three Model Internals pages. Preserves `capturePath`
 * across tabs -- without this, switching tabs silently drops back to the
 * placeholder demo stream instead of staying on whatever real capture the
 * user is watching (see frontend/src/api/websocket.ts). */
export function InternalsSubNav({ active }: { active: 'pipeline' | 'network' | 'forecast' }) {
  const [searchParams] = useSearchParams();
  const capturePath = searchParams.get('capturePath');
  const suffix = capturePath ? `?capturePath=${encodeURIComponent(capturePath)}` : '';

  return (
    <div className="flex items-center gap-2 border-b border-border-default pb-2 text-xs font-heading">
      {TABS.map((tab) => (
        <a
          key={tab.path}
          href={`#/internals/${tab.path}${suffix}`}
          className={clsx(
            'px-3 py-1.5 rounded-md transition-colors',
            active === tab.path
              ? 'bg-accent-indigo-subtle text-accent-indigo font-semibold'
              : 'text-text-secondary hover:text-text-primary hover:bg-canvas'
          )}
        >
          {tab.label}
        </a>
      ))}
      <span className="px-2 py-0.5 rounded bg-canvas border border-border-default text-text-tertiary text-[10px] ml-2">
        Attention Heatmap (Coming Next)
      </span>
    </div>
  );
}
