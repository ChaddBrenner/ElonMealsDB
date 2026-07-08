import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Download, Minus, Plus, RotateCcw, Settings2, Trash2, Utensils, X } from 'lucide-react';
import type { LocalProfile, PlannedMeal } from '../localProfile';
import { foodIdentityKey, formatPlannedMealWindow, formatSelectedCount, nutritionValue, round, type MacroTotals } from '../app/utils';
import type { MacroTone } from '../app/constants';
import { Badge, EmptyState } from './common';

export function PlanSummaryBar(props: {
  compact: boolean;
  profile: LocalProfile;
  totals: MacroTotals;
  onOpenSettings: () => void;
}) {
  return (
    <section className={`plan-summary-bar ${props.compact ? 'is-compact' : ''}`} aria-label="Nutrition totals">
      <div className="plan-summary-goals">
        <Goal label="Calories" tone="calories" value={props.totals.calories} max={props.profile.dailyCaloriesGoal} />
        <Goal label="Protein" tone="protein" value={props.totals.protein} max={props.profile.dailyProteinsGoal} unit="g" />
        <Goal label="Carbs" tone="carbs" value={props.totals.carbs} max={props.profile.dailyCarbsGoal} unit="g" />
        <Goal label="Fat" tone="fat" value={props.totals.fat} max={props.profile.dailyFatsGoal} unit="g" />
      </div>
      <div className="plan-summary-actions">
        <button className="icon-button plan-settings-button" type="button" onClick={props.onOpenSettings} aria-label="Edit nutrition goals">
          <Settings2 size={16} />
        </button>
      </div>
    </section>
  );
}

export function MealPlanPanel(props: {
  meals: PlannedMeal[];
  itemCount: number;
  pulseFoodKey: string;
  countPulseKey: number;
  onQuantity: (mealId: string, foodId: number, quantity: number) => void;
  onRemoveFood: (mealId: string, foodId: number) => void;
  onRemoveMeal: (mealId: string) => void;
  onClearDay: () => void;
  onExport: () => void;
}) {
  return (
    <aside className="panel plan-panel" aria-label="Selected foods">
      <div className="panel-header selected-foods-header">
        <div>
          <h2>Selected Foods</h2>
          <Badge key={props.countPulseKey} tone={props.itemCount ? 'green' : 'neutral'} className={props.countPulseKey ? 'count-bump' : ''}>
            {formatSelectedCount(props.itemCount)} selected
          </Badge>
        </div>
        <div className="panel-icon"><Utensils size={18} /></div>
      </div>
      <div className="planned-meals">
        {props.meals.length ? props.meals.map((meal) => (
          <div className="planned-meal" key={meal.id}>
            <div className="planned-meal-header">
              <div>
                <strong>{meal.mealName}</strong>
                <span>{meal.restaurantName} - {formatPlannedMealWindow(meal)}</span>
              </div>
              <button className="icon-button" type="button" onClick={() => props.onRemoveMeal(meal.id)} aria-label={`Remove ${meal.mealName}`}>
                <Trash2 size={15} />
              </button>
            </div>
            {meal.foods.map((item) => {
              const isPulsing = props.pulseFoodKey === foodIdentityKey(item.food);
              return (
                <div className={`planned-food ${isPulsing ? 'is-added-pulse' : ''}`} key={item.foodId}>
                  <div>
                    <strong>{item.food.shortName}</strong>
                    <span>{round(nutritionValue(item.food.calories) * item.quantity)} cal</span>
                  </div>
                  <QuantityStepper
                    quantity={item.quantity}
                    onDecrease={() => item.quantity <= 0.25 ? props.onRemoveFood(meal.id, item.foodId) : props.onQuantity(meal.id, item.foodId, item.quantity - 0.25)}
                    onIncrease={() => props.onQuantity(meal.id, item.foodId, item.quantity + 0.25)}
                  />
                </div>
              );
            })}
          </div>
        )) : <EmptyState text="Add foods from the menu to build a meal plan." />}
      </div>
      {props.meals.length > 0 && (
        <div className="plan-actions">
          <button className="secondary-button" type="button" onClick={props.onExport}>
            <Download size={16} /> Export CSV
          </button>
          <button className="secondary-button" type="button" onClick={props.onClearDay}>
            <Trash2 size={16} /> Clear today
          </button>
        </div>
      )}
    </aside>
  );
}

export function GoalSettingsDialog(props: {
  profile: LocalProfile;
  open: boolean;
  onClose: () => void;
  onChange: (patch: Partial<LocalProfile>) => void;
  onReset: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!props.open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const firstInput = dialogRef.current?.querySelector<HTMLInputElement>('input');
    const firstFocusable = getFocusableElements(dialogRef.current)[0];
    window.requestAnimationFrame(() => (firstInput || firstFocusable || dialogRef.current)?.focus());

    return () => {
      previousFocusRef.current?.focus();
    };
  }, [props.open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
      return;
    }

    if (event.key === 'Tab') {
      trapFocus(event, dialogRef.current);
    }
  }

  if (!props.open) return null;

  return (
    <div className="modal-layer" role="presentation" onMouseDown={props.onClose} onKeyDown={handleKeyDown}>
      <section
        ref={dialogRef}
        className="goal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="goal-dialog-title">Nutrition Goals</h2>
            <p>Adjust the targets used by your planner.</p>
          </div>
          <button className="icon-button" type="button" onClick={props.onClose} aria-label="Close goals">
            <X size={18} />
          </button>
        </div>
        <div className="settings-grid">
          <GoalInput label="Calories" value={props.profile.dailyCaloriesGoal} min={500} max={6000} onChange={(value) => props.onChange({ dailyCaloriesGoal: value })} />
          <GoalInput label="Protein" value={props.profile.dailyProteinsGoal} min={10} max={400} onChange={(value) => props.onChange({ dailyProteinsGoal: value })} />
          <GoalInput label="Carbs" value={props.profile.dailyCarbsGoal} min={10} max={800} onChange={(value) => props.onChange({ dailyCarbsGoal: value })} />
          <GoalInput label="Fat" value={props.profile.dailyFatsGoal} min={10} max={400} onChange={(value) => props.onChange({ dailyFatsGoal: value })} />
        </div>
        <div className="settings-actions">
          <button className="secondary-button" type="button" onClick={props.onReset}>
            <RotateCcw size={16} /> Reset goals and planner
          </button>
        </div>
      </section>
    </div>
  );
}

export function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
}

export function trapFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  const focusable = getFocusableElements(container);
  if (!focusable.length) {
    event.preventDefault();
    container?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function Goal({ label, tone, value, max, unit = '' }: { label: string; tone: MacroTone; value: number; max: number; unit?: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={`goal ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{round(value)}{unit} / {max}{unit}</strong>
      </div>
      <div className="progress" aria-label={`${label} progress`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function GoalInput({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value))))}
      />
    </label>
  );
}

export function QuantityStepper({ quantity, onDecrease, onIncrease }: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="quantity-stepper">
      <button type="button" onClick={onDecrease} aria-label="Decrease quantity"><Minus size={13} /></button>
      <span>{formatSelectedCount(quantity)}</span>
      <button type="button" onClick={onIncrease} aria-label="Increase quantity"><Plus size={13} /></button>
    </div>
  );
}
