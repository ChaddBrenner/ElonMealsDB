import { useEffect, useState } from 'react';
import type { MealWindowInsight, RestaurantSummary } from '../types';
import { buildTimelineWindows, easternDateInput, easternMinute, formatTimelineMinute, formatTimeRange, getRestaurantTimelineStatus, getTimelineSegmentLabel, handleTabKeyDown, timelineMinute } from '../app/utils';

export function RestaurantTimelineTabs(props: {
  restaurants: RestaurantSummary[];
  mealWindows: MealWindowInsight[];
  selectedRestaurantId: number | null;
  loading: boolean;
  onSelect: (restaurantId: number) => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  if (props.loading && !props.restaurants.length) {
    return (
      <div className="restaurant-timeline loading" aria-label="Restaurants">
        <span>Loading restaurants...</span>
      </div>
    );
  }

  if (!props.restaurants.length) {
    return (
      <div className="restaurant-timeline empty-tabs" aria-label="Restaurants">
        <span>No restaurants imported for this date</span>
      </div>
    );
  }

  const windows = buildTimelineWindows(props.restaurants, props.mealWindows);
  const minutes = windows.flatMap((window) => [timelineMinute(window.timeOpen), timelineMinute(window.timeClosed)])
    .filter((value): value is number => value !== null);
  const startMinute = Math.max(0, Math.min(...minutes, 7 * 60) - 30);
  const endMinute = Math.min(24 * 60, Math.max(...minutes, 20 * 60) + 30);
  const span = Math.max(60, endMinute - startMinute);
  const serviceDate = props.mealWindows[0]?.serviceDate || props.restaurants[0]?.service_date || '';
  const nowMinute = serviceDate === easternDateInput(now) ? easternMinute(now) : null;
  const nowOffset = nowMinute !== null && nowMinute >= startMinute && nowMinute <= endMinute
    ? ((nowMinute - startMinute) / span) * 100
    : null;

  return (
    <nav className="restaurant-timeline" role="tablist" aria-label="Restaurants">
      <div className="timeline-scale" aria-hidden="true">
        <span>{formatTimelineMinute(startMinute)}</span>
        <span>{formatTimelineMinute(Math.round((startMinute + endMinute) / 2))}</span>
        <span>{formatTimelineMinute(endMinute)}</span>
      </div>
      {props.restaurants.map((restaurant, index) => {
        const restaurantWindows = windows.filter((window) => window.restaurantId === restaurant.id);
        const isSelected = restaurant.id === props.selectedRestaurantId;
        const timelineStatus = getRestaurantTimelineStatus(restaurantWindows, nowMinute);
        return (
          <button
            key={restaurant.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="menu"
            tabIndex={isSelected ? 0 : -1}
            className={`timeline-restaurant ${isSelected ? 'selected' : ''}`}
            onClick={() => props.onSelect(restaurant.id)}
            onKeyDown={(event) => handleTabKeyDown(event, props.restaurants.length, index, (nextIndex) => props.onSelect(props.restaurants[nextIndex].id))}
          >
            <span className="timeline-restaurant-identity">
              <span className={`timeline-status-dot ${timelineStatus.tone}`} title={timelineStatus.label} aria-hidden="true" />
              <span className="timeline-restaurant-name">{restaurant.name}</span>
            </span>
            <span className="timeline-track" aria-label={`${restaurant.name} ${timelineStatus.label}, ${timelineStatus.detail}`}>
              {restaurantWindows.map((window) => {
                const leftMinute = timelineMinute(window.timeOpen);
                const rightMinute = timelineMinute(window.timeClosed);
                if (leftMinute === null || rightMinute === null) return null;
                const left = ((leftMinute - startMinute) / span) * 100;
                const rawWidth = ((rightMinute - leftMinute) / span) * 100;
                const width = Math.max(3, rawWidth);
                const segmentLabel = getTimelineSegmentLabel(window.mealPeriod, rawWidth);
                return (
                  <span
                    className={`timeline-window ${window.mealPeriod.toLowerCase()} ${segmentLabel ? '' : 'compact'}`}
                    key={`${window.restaurantId}:${window.mealId}`}
                    style={{ left: `${Math.max(0, Math.min(100, left))}%`, width: `${Math.min(100, width)}%` }}
                    title={`${window.mealPeriod}: ${formatTimeRange(window.timeOpen, window.timeClosed)}`}
                  >
                    <span>{segmentLabel}</span>
                  </span>
                );
              })}
              {nowOffset !== null && (
                <span
                  className="timeline-now-line"
                  style={{ left: `${nowOffset}%` }}
                  title={`Now: ${formatTimelineMinute(nowMinute ?? 0)}`}
                  aria-hidden="true"
                />
              )}
            </span>
            <small className="timeline-status-text">{timelineStatus.detail}</small>
          </button>
        );
      })}
    </nav>
  );
}
