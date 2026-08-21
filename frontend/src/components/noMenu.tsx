import { CalendarDays, ExternalLink, FileText, Link2 } from 'lucide-react';
import type { Meal, MenuResponse } from '../types';
import { formatShortDate, formatTimeRange } from '../app/utils';
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

export function ResourceMenuState({ menu, activeMeal }: { menu: MenuResponse; activeMeal: Meal | null }) {
  const status = activeMeal?.menu_status || menu.restaurant.menu_status;
  const isExternal = status === 'external' || menu.restaurant.source_kind === 'external_link';
  const isPdf = status === 'pdf' || menu.restaurant.source_kind === 'pdf';
  const message = isExternal
    ? 'Elon publishes these service windows, but this menu is hosted by an external provider. ElonMealsDB does not scrape the third-party site.'
    : isPdf
      ? 'Elon publishes these service windows, but the menu is provided as a document rather than structured menu data.'
      : status === 'not_published'
        ? 'Elon publishes this service window, but it does not publish a matching structured menu tab for it.'
        : status === 'empty_menu'
          ? 'Elon publishes this service window and menu tab, but the tab currently contains no menu items.'
          : 'Elon publishes these service windows, but it does not provide a structured menu for this resource on this date.';
  const LinkIcon = isPdf ? FileText : isExternal ? ExternalLink : Link2;
  const linkLabel = isPdf ? 'Open official menu document' : isExternal ? 'Open exact external resource' : 'View on Elon Dining';

  return (
    <div className="resource-menu-state">
      <div className="no-menu-icon"><LinkIcon size={22} /></div>
      <div>
        <h3>{menu.restaurant.name}</h3>
        <p>{message}</p>
      </div>
      <dl className="resource-hours" aria-label={`${menu.restaurant.name} service windows`}>
        {menu.meals.map((meal) => (
          <div key={meal.id} className={meal.id === activeMeal?.id ? 'active' : undefined}>
            <dt>{meal.name}</dt>
            <dd>{formatTimeRange(meal.time_open, meal.time_closed)}</dd>
          </div>
        ))}
      </dl>
      <a className="primary-button resource-link" href={menu.restaurant.url} target="_blank" rel="noreferrer noopener">
        {linkLabel} <ExternalLink size={15} />
      </a>
    </div>
  );
}
