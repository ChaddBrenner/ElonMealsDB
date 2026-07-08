import { CalendarDays } from 'lucide-react';
import { formatShortDate } from '../app/utils';
import { LoadingState } from './common';

export function NoMenuState({ date, latestDate, loading, onUseLatest }: {
  date: string;
  latestDate: string;
  loading: boolean;
  onUseLatest: (date: string) => void;
}) {
  if (loading) return <LoadingState />;

  return (
    <div className="no-menu-state">
      <div className="no-menu-icon"><CalendarDays size={22} /></div>
      <div>
        <h3>No restaurants imported for {date ? formatShortDate(date) : 'this date'}.</h3>
        <p>Choose an imported service date to browse menus, nutrition details, favorites, and meal planning.</p>
      </div>
      {latestDate && latestDate !== date && (
        <button className="secondary-button" type="button" onClick={() => onUseLatest(latestDate)}>
          Use latest imported date
        </button>
      )}
    </div>
  );
}
