import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Search, Star, X } from 'lucide-react';
import type { Food } from '../types';
import type { LocalProfile } from '../localProfile';
import { foodIdentityKey, foodRenderKey, formatFoodContext, formatSearchAvailability, formatSearchLocation, resolveFoodSnapshot, round } from '../app/utils';
import { AddFeedbackIcon, EmptyState, Fact, LoadingState, MetricBlock, PanelHeader } from './common';
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
            <MetricBlock label="Calories" tone="calories" value={round(food.calories)} />
            <MetricBlock label="Protein" tone="protein" value={`${round(food.protein)} g`} />
            <MetricBlock label="Carbs" tone="carbs" value={`${round(food.totalCarbohydrates)} g`} />
            <MetricBlock label="Fat" tone="fat" value={`${round(food.totalFat)} g`} />
          </div>
          <div className="detail-block">
            <strong>Serving Size</strong>
            <p>{food.servingSizeAmount || '-'} {food.servingSizeUnit}</p>
          </div>
          <div className="detail-block">
            <strong>Ingredients</strong>
            <p>{food.ingredients || 'Ingredient details are not available for this item.'}</p>
          </div>
          <div className="facts-list">
            <Fact label="Saturated Fat" value={`${round(food.saturatedFat)} g`} />
            <Fact label="Cholesterol" value={`${round(food.cholesterol)} mg`} />
            <Fact label="Sodium" value={`${round(food.sodium)} mg`} />
            <Fact label="Dietary Fiber" value={`${round(food.dietaryFiber)} g`} />
            <Fact label="Sugars" value={`${round(food.sugars)} g`} />
          </div>
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
                  <span className="search-macros">{round(food.calories)} cal · {round(food.protein)} g protein</span>
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
        <span>{formatFoodContext(props.food)} · {round(props.food.calories)} cal · {round(props.food.protein)} g protein</span>
      </div>
      <button className={`primary-row-button icon-only add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={() => props.onAdd(props.food)} aria-label={`Add ${props.food.shortName} to plan`} title="Add to plan">
        <AddFeedbackIcon active={isAdded} size={14} />
      </button>
    </div>
  );
}
