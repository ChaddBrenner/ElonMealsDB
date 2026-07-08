import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Star } from 'lucide-react';
import type { Food, Meal } from '../types';
import type { SortConfig, SortKey, VisibleColumns } from '../app/constants';
import { sortableColumns } from '../app/constants';
import { filterFoodsForSafety, foodIdentityKey, foodRenderKey, formatStationName, hasAllergenFlag, round } from '../app/utils';
import { AddFeedbackIcon, Badge, EmptyState } from './common';

export function FoodOverview(props: {
  stations: Meal['stations'];
  selectedStationId: number | null;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  allergenFree: string[];
  specialStationIds: Set<number>;
  busy: boolean;
  feedbackKey: string;
  onSelect: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  const stationGroups = props.stations
    .filter((station) => props.selectedStationId === null || station.id === props.selectedStationId)
    .map((station) => ({
      station,
      foods: filterFoodsForSafety(station.foods, props.vegan, props.vegetarian, props.glutenFree, props.allergenFree)
    }))
    .filter((group) => group.foods.length > 0);

  if (!stationGroups.length) return <EmptyState text="No foods match the current view." />;

  return (
    <div className="food-overview" aria-label="Food overview by station">
      {stationGroups.map(({ station, foods }) => (
        <section className="overview-station" key={station.id}>
          <div className="overview-station-heading">
            <strong>{formatStationName(station.name)}</strong>
            {props.specialStationIds.has(station.id) && (
              <span className="station-special-badge compact" title="This station is different today">Different today</span>
            )}
          </div>
          <div className="overview-food-list">
            {foods.map((food, index) => {
              const overviewFood = {
                ...food,
                stationId: station.id,
                stationName: station.name
              };
              const isAdded = props.feedbackKey === foodIdentityKey(overviewFood);
              return (
                <div className="overview-food-item" key={foodRenderKey(overviewFood, index)}>
                  <button
                    className="overview-food"
                    type="button"
                    onClick={() => props.onSelect(overviewFood)}
                    title={food.shortName}
                  >
                    {food.shortName}
                  </button>
                  <button
                    className={`overview-add-food add-action-button ${isAdded ? 'is-added' : ''}`}
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onAdd(overviewFood)}
                    aria-label={`Add ${food.shortName} to plan`}
                    title="Add to plan"
                  >
                    <AddFeedbackIcon active={isAdded} size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function FoodTable(props: {
  foods: Food[];
  favoriteIds: Set<number>;
  visibleColumns: VisibleColumns;
  specialStationIds: Set<number>;
  sortConfig: SortConfig;
  highlightedFoodKey: string;
  busy: boolean;
  feedbackKey: string;
  onSelect: (food: Food) => void;
  onFavorite: (food: Food) => void;
  onAdd: (food: Food) => void;
  onSort: (column: SortKey) => void;
}) {
  if (!props.foods.length) return <EmptyState text="No foods match the current view." />;

  return (
    <div className="data-table-wrap food-table">
      <div className="mobile-food-rows" aria-label="Compact food table">
        {props.foods.map((food, index) => {
          const identityKey = foodIdentityKey(food);
          const isAdded = props.feedbackKey === identityKey;
          return (
            <div
              className={`mobile-food-row ${props.highlightedFoodKey === identityKey ? 'highlighted-row' : ''}`}
              data-food-key={identityKey}
              key={`mobile:${foodRenderKey(food, index)}`}
            >
              <button className="icon-button favorite-inline" type="button" disabled={props.busy} onClick={() => props.onFavorite(food)} aria-label={`${props.favoriteIds.has(food.id) ? 'Remove' : 'Add'} ${food.shortName} favorite`}>
                <Star size={14} fill={props.favoriteIds.has(food.id) ? 'currentColor' : 'none'} />
              </button>
              <button className="link-button strong mobile-food-title" type="button" onClick={() => props.onSelect(food)}>{food.shortName}</button>
              <button className={`primary-row-button icon-only add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={() => props.onAdd(food)} aria-label={`Add ${food.shortName} to plan`} title="Add to plan">
                <AddFeedbackIcon active={isAdded} size={14} />
              </button>
              <div className="mobile-food-meta">
                <span className="mobile-station-name">
                  {formatStationName(food.stationName || food.mealName || '-')}
                  {food.stationId && props.specialStationIds.has(food.stationId) && (
                    <span className="station-special-badge compact" title="This station is different today">Different today</span>
                  )}
                </span>
                <Dietary food={food} />
              </div>
              <div className="mobile-food-macros" aria-label={`${food.shortName} nutrition summary`}>
                <span className="mobile-macro calories"><small>Cal</small>{round(food.calories)}</span>
                <span className="mobile-macro protein"><small>Pro</small>{round(food.protein)} g</span>
                <span className="mobile-macro carbs"><small>Carb</small>{round(food.totalCarbohydrates)} g</span>
                <span className="mobile-macro fat"><small>Fat</small>{round(food.totalFat)} g</span>
              </div>
            </div>
          );
        })}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Food</th>
            {props.visibleColumns.station && <th>Station</th>}
            {props.visibleColumns.dietary && <th>Dietary</th>}
            {sortableColumns.map((column) => props.visibleColumns[column.key] && (
              <SortableHeader
                key={column.key}
                column={column.key}
                label={column.label}
                sortConfig={props.sortConfig}
                onSort={props.onSort}
              />
            ))}
            <th className="row-actions-header" aria-label="Actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.foods.map((food, index) => {
            const identityKey = foodIdentityKey(food);
            const isAdded = props.feedbackKey === identityKey;
            return (
              <tr
                key={foodRenderKey(food, index)}
                className={props.highlightedFoodKey === identityKey ? 'highlighted-row' : undefined}
                data-food-key={identityKey}
              >
                <td data-label="Food">
                  <div className="food-name-cell">
                    <button className="icon-button favorite-inline" type="button" disabled={props.busy} onClick={() => props.onFavorite(food)} aria-label={`${props.favoriteIds.has(food.id) ? 'Remove' : 'Add'} ${food.shortName} favorite`}>
                      <Star size={15} fill={props.favoriteIds.has(food.id) ? 'currentColor' : 'none'} />
                    </button>
                    <button className="link-button strong" type="button" onClick={() => props.onSelect(food)}>{food.shortName}</button>
                  </div>
                </td>
                {props.visibleColumns.station && (
                  <td data-label="Station">
                    <span className="station-cell">
                      {formatStationName(food.stationName || food.mealName || '-')}
                      {food.stationId && props.specialStationIds.has(food.stationId) && (
                        <span className="station-special-badge compact" title="This station is different today">Different today</span>
                      )}
                    </span>
                  </td>
                )}
                {props.visibleColumns.dietary && <td data-label="Dietary"><Dietary food={food} /></td>}
                {props.visibleColumns.calories && <td className="macro-cell calories" data-label="Calories">{round(food.calories)}</td>}
                {props.visibleColumns.protein && <td className="macro-cell protein" data-label="Protein">{round(food.protein)} g</td>}
                {props.visibleColumns.carbs && <td className="macro-cell carbs" data-label="Carbs">{round(food.totalCarbohydrates)} g</td>}
                {props.visibleColumns.fat && <td className="macro-cell fat" data-label="Fat">{round(food.totalFat)} g</td>}
                <td className="row-actions" data-label="Actions">
                  <div className="row-actions-inner">
                    <button className={`primary-row-button icon-only add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={() => props.onAdd(food)} aria-label={`Add ${food.shortName} to plan`} title="Add to plan">
                      <AddFeedbackIcon active={isAdded} size={15} />
                    </button>
                    <button className="icon-button" type="button" onClick={() => props.onSelect(food)} aria-label="Open nutrition details">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SortableHeader(props: {
  column: SortKey;
  label: string;
  sortConfig: SortConfig;
  onSort: (column: SortKey) => void;
}) {
  const direction = props.sortConfig?.key === props.column ? props.sortConfig.direction : null;
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';

  return (
    <th aria-sort={ariaSort}>
      <button
        className={`sort-header ${direction ? 'active' : ''}`}
        type="button"
        onClick={() => props.onSort(props.column)}
        aria-label={`Sort by ${props.label}${direction ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{props.label}</span>
        {direction === 'asc' ? <ArrowUp size={13} /> : direction === 'desc' ? <ArrowDown size={13} /> : <ArrowUpDown size={13} />}
      </button>
    </th>
  );
}

export function Dietary({ food }: { food: Food }) {
  const hasAllergen = hasAllergenFlag(food);
  return (
    <div className="dietary">
      {food.vegan && <Badge tone="green">Vegan</Badge>}
      {!food.vegan && food.vegetarian && <Badge tone="green">Veg</Badge>}
      {food.glutenFree && <Badge tone="gold">GF</Badge>}
      {hasAllergen && <Badge tone="red">Allergen</Badge>}
      {!food.vegan && !food.vegetarian && !food.glutenFree && !hasAllergen && <span>-</span>}
    </div>
  );
}
