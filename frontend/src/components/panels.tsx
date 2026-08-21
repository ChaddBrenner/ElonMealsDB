import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Search, Star, X } from 'lucide-react';
import type { Food } from '../types';
import type { LocalProfile } from '../localProfile';
import { foodIdentityKey, foodRenderKey, formatFoodContext, formatNutritionNumber, formatSearchAvailability, formatSearchLocation, resolveFoodSnapshot, round } from '../app/utils';
import { AddFeedbackIcon, EmptyState, LoadingState, MetricBlock, PanelHeader } from './common';
import { Dietary } from './foodViews';
import { trapFocus } from './planner';

export function NutritionDrawer(props: {
  food: Food | null;
  isFavorite: boolean;
  busy: boolean;
  feedbackKey: string;
  onClose: () => void;
  onFavorite: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  const food = props.food;
  const isAdded = food ? props.feedbackKey === foodIdentityKey(food) : false;
  function handleAddToPlan() {
    if (!food) return;
    props.onAdd(food);
    window.setTimeout(props.onClose, 220);
  }

  return (
    <aside className={`drawer ${food ? 'open' : ''}`} aria-label="Nutrition details" aria-hidden={!food}>
      {food && (
        <>
          <div className="drawer-header">
            <div>
              <h2>{food.shortName}</h2>
              <p>{food.fullName || food.restaurantName || 'Nutrition details'}</p>
            </div>
            <button className="icon-button" type="button" onClick={props.onClose} aria-label="Close nutrition drawer">
              <X size={18} />
            </button>
          </div>
          <Dietary food={food} />
          <div className="nutrition-grid">
            <MetricBlock label="Calories" tone="calories" value={nutritionDisplay(food.calories)} />
            <MetricBlock label="Protein" tone="protein" value={nutritionDisplay(food.protein, 'g')} />
            <MetricBlock label="Carbs" tone="carbs" value={nutritionDisplay(food.totalCarbohydrates, 'g')} />
            <MetricBlock label="Fat" tone="fat" value={nutritionDisplay(food.totalFat, 'g')} />
          </div>
          <div className="detail-block">
            <strong>Serving Size</strong>
            <p>{food.servingSizeAmount == null ? 'Not published by Elon Dining' : `${round(food.servingSizeAmount)} ${food.servingSizeUnit}`.trim()}</p>
          </div>
          <div className="detail-block">
            <strong>Description</strong>
            <p>{food.description || 'Not published by Elon Dining.'}</p>
          </div>
          <div className="detail-block">
            <strong>Ingredients</strong>
            <p>{food.ingredients || 'Not published by Elon Dining.'}</p>
          </div>
          <section className="nutrition-facts" aria-labelledby={`nutrition-facts-${food.id}`}>
            <h3 id={`nutrition-facts-${food.id}`}>Nutrition facts</h3>
            <div className="nutrition-facts-table-wrap">
              <table className="nutrition-facts-table">
                <caption className="visually-hidden">Nutrition facts for {food.shortName}</caption>
                <colgroup>
                  <col className="nutrition-fact-name-column" />
                  <col className="nutrition-fact-amount-column" />
                  <col className="nutrition-fact-daily-value-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Nutrient</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Daily value</th>
                  </tr>
                </thead>
                <tbody>
                  {((food.nutritionFacts || []).length ? food.nutritionFacts : fallbackNutritionFacts(food)).map((fact, index) => (
                    <tr className={fact.isSecondary ? 'secondary' : undefined} key={`${fact.label}:${index}`}>
                      <th scope="row">{fact.label}</th>
                      <td className="nutrition-fact-amount">
                        {fact.value === null
                          ? <span className="nutrition-fact-unpublished" aria-label={`${fact.label} amount not published`} title="Not published">—</span>
                          : nutritionDisplay(fact.value, fact.unit)}
                      </td>
                      <td className="nutrition-fact-daily-value">
                        {fact.percentDailyValue === null
                          ? <span className="nutrition-fact-unpublished" aria-label={`${fact.label} daily value not published`} title="Not published">—</span>
                          : `${round(fact.percentDailyValue)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {food.hideAllergens && <p className="source-data-note">Elon Dining has hidden allergen data for this item; unknown values are not treated as allergen-free.</p>}
          {food.disclaimer && <p className="source-disclaimer">{food.disclaimer}</p>}
          <div className="drawer-actions">
            <button className="secondary-button" type="button" disabled={props.busy} onClick={() => props.onFavorite(food)}>
              <Star size={16} fill={props.isFavorite ? 'currentColor' : 'none'} /> {props.isFavorite ? 'Favorited' : 'Favorite'}
            </button>
            <button className={`primary-button add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={handleAddToPlan}>
              <AddFeedbackIcon active={isAdded} size={16} /> Add to plan
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function nutritionDisplay(value: number | null | undefined, unit = '') {
  if (value === null || value === undefined) return 'Not published';
  return `${round(value)}${unit ? ` ${unit}` : ''}`;
}

function fallbackNutritionFacts(food: Food) {
  return [
    { label: 'Saturated Fat', value: food.saturatedFat, unit: 'g', percentDailyValue: null, isSecondary: true },
    { label: 'Trans Fat', value: food.transFat, unit: 'g', percentDailyValue: null, isSecondary: true },
    { label: 'Cholesterol', value: food.cholesterol, unit: 'mg', percentDailyValue: null, isSecondary: false },
    { label: 'Sodium', value: food.sodium, unit: 'mg', percentDailyValue: null, isSecondary: false },
    { label: 'Dietary Fiber', value: food.dietaryFiber, unit: 'g', percentDailyValue: null, isSecondary: true },
    { label: 'Total Sugars', value: food.sugars, unit: 'g', percentDailyValue: null, isSecondary: true },
    { label: 'Added Sugars', value: food.addedSugars, unit: 'g', percentDailyValue: null, isSecondary: true },
    { label: 'Potassium', value: food.potassium, unit: 'mg', percentDailyValue: null, isSecondary: false },
    { label: 'Calcium', value: food.calcium, unit: 'mg', percentDailyValue: null, isSecondary: false },
    { label: 'Iron', value: food.iron, unit: 'mg', percentDailyValue: null, isSecondary: false },
    { label: 'Vitamin D', value: food.vitaminD, unit: 'mcg', percentDailyValue: null, isSecondary: false },
  ];
}

export function GlobalSearchDialog(props: {
  open: boolean;
  query: string;
  results: Food[];
  loading: boolean;
  error: string | null;
  activeIndex: number;
  busy: boolean;
  feedbackKey: string;
  shortcut: string;
  onQuery: (value: string) => void;
  onClose: () => void;
  onActiveIndex: (index: number) => void;
  onReveal: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedQuery = props.query.trim();
  const resultCount = props.results.length;
  const activeResultIndex = resultCount ? Math.min(props.activeIndex, resultCount - 1) : -1;
  const activeFood = activeResultIndex >= 0 ? props.results[activeResultIndex] : null;

  useEffect(() => {
    if (!props.open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [props.open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
      return;
    }

    if (event.key === 'ArrowDown' && resultCount) {
      event.preventDefault();
      props.onActiveIndex((props.activeIndex + 1) % resultCount);
      return;
    }

    if (event.key === 'ArrowUp' && resultCount) {
      event.preventDefault();
      props.onActiveIndex((props.activeIndex - 1 + resultCount) % resultCount);
      return;
    }

    if (event.key === 'Enter' && activeFood) {
      event.preventDefault();
      props.onReveal(activeFood);
      return;
    }

    if (event.key === 'Tab') {
      trapFocus(event, dialogRef.current);
    }
  }

  if (!props.open) return null;

  return (
    <div className="modal-layer search-layer" role="presentation" onMouseDown={props.onClose} onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="search-dialog-header">
          <Search size={18} />
          <input
            ref={inputRef}
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
            placeholder="Search foods, ingredients, stations..."
            aria-label="Search everywhere"
            aria-controls="global-search-results"
            aria-activedescendant={activeFood ? `global-search-result-${activeResultIndex}` : undefined}
          />
          <kbd>{props.shortcut}</kbd>
          <button className="icon-button" type="button" onClick={props.onClose} aria-label="Close search">
            <X size={17} />
          </button>
        </div>
        <h2 id="global-search-title" className="visually-hidden">Global food search</h2>
        <div className="search-results" id="global-search-results" role="listbox" aria-label="Global search results">
          {!trimmedQuery && <EmptyState text="Search this service date." />}
          {trimmedQuery && props.loading && <LoadingState />}
          {trimmedQuery && props.error && <EmptyState text={props.error} />}
          {trimmedQuery && !props.loading && !props.error && !props.results.length && (
            <EmptyState text="No matching foods, ingredients, or stations." />
          )}
          {trimmedQuery && !props.loading && !props.error && props.results.map((food, index) => {
            const isAdded = props.feedbackKey === foodIdentityKey(food);
            return (
              <div
                id={`global-search-result-${index}`}
                className={`search-result ${index === activeResultIndex ? 'active' : ''}`}
                role="option"
                aria-selected={index === activeResultIndex}
                key={foodRenderKey(food, index)}
                onMouseEnter={() => props.onActiveIndex(index)}
              >
                <button className="search-result-main" type="button" onClick={() => props.onReveal(food)}>
                  <div className="search-result-identity">
                    <strong className="search-result-title">{food.shortName}</strong>
                    <span className="search-result-location">{formatSearchLocation(food)}</span>
                  </div>
                  <small className="search-result-availability">{formatSearchAvailability(food)}</small>
                  <Dietary food={food} />
                  <span className="search-macros">{formatNutritionNumber(food.calories, 'cal')} · {formatNutritionNumber(food.protein, 'g')} protein</span>
                </button>
                <button className={`primary-row-button icon-only add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={() => props.onAdd(food)} aria-label={`Add ${food.shortName} to plan`} title="Add to plan">
                  <AddFeedbackIcon active={isAdded} size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function FavoritesPanel(props: {
  favorites: LocalProfile['favoriteFoods'];
  allFoods: Food[];
  favoriteIds: Set<number>;
  busy: boolean;
  feedbackKey: string;
  onSelect: (food: Food) => void;
  onFavorite: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  return (
    <section className="panel favorites-panel" id="favorites">
      <PanelHeader title="Favorites" subtitle="Fast access to foods you come back to" icon={<Star size={18} />} />
      <div className="compact-list favorites-list">
        {props.favorites.length ? props.favorites.slice(0, 8).map((favorite) => {
          const food = resolveFoodSnapshot(favorite.food, props.allFoods);
          return (
            <FavoriteListItem
              key={favorite.foodId}
              food={food}
              isFavorite={props.favoriteIds.has(food.id)}
              busy={props.busy}
              feedbackKey={props.feedbackKey}
              onSelect={props.onSelect}
              onFavorite={props.onFavorite}
              onAdd={props.onAdd}
            />
          );
        }) : <EmptyState text="Favorite foods will appear here." />}
      </div>
    </section>
  );
}

export function FavoriteListItem(props: {
  food: Food;
  isFavorite: boolean;
  busy: boolean;
  feedbackKey: string;
  onSelect: (food: Food) => void;
  onFavorite: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  const isAdded = props.feedbackKey === foodIdentityKey(props.food);
  return (
    <div className="food-list-item favorite-list-item">
      <button className="icon-button favorite-inline" type="button" disabled={props.busy} onClick={() => props.onFavorite(props.food)} aria-label={`Remove ${props.food.shortName} favorite`}>
        <Star size={15} fill={props.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div>
        <button className="link-button strong" type="button" onClick={() => props.onSelect(props.food)}>{props.food.shortName}</button>
        <span>{formatFoodContext(props.food)} · {formatNutritionNumber(props.food.calories, 'cal')} · {formatNutritionNumber(props.food.protein, 'g')} protein</span>
      </div>
      <button className={`primary-row-button icon-only add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={() => props.onAdd(props.food)} aria-label={`Add ${props.food.shortName} to plan`} title="Add to plan">
        <AddFeedbackIcon active={isAdded} size={14} />
      </button>
    </div>
  );
}
