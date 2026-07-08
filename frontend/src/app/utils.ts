import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Food, InsightFood, Meal, MealWindowInsight, RestaurantSummary, StationMetric } from '../types';
import type { LocalProfile, PlannedMeal } from '../localProfile';
import {
  allergenFieldMap,
  allergenOptions,
  COLUMN_VISIBILITY_KEY,
  defaultVisibleColumns,
  macroTriangleVertices,
  type MacroTrianglePoint,
  type RevealTarget,
  type SortConfig,
  type SortKey,
  type TableColumn,
  type ThemeMode,
  type TimelineWindow,
  type VisibleColumns,
  visibleColumnOptions,
  THEME_KEY
} from './constants';

export function filterFoodsForSafety(foods: Food[], vegan: boolean, vegetarian: boolean, glutenFree: boolean, allergenFree: string[]) {
  return foods.filter((food) => (
    (!vegan || Boolean(food.vegan))
    && (!vegetarian || Boolean(food.vegetarian))
    && (!glutenFree || Boolean(food.glutenFree))
    && allergenFree.every((allergen) => !hasFoodAllergen(food, allergen))
  ));
}

export function hasFoodAllergen(food: Food, allergen: string) {
  const field = allergenFieldMap[allergen];
  return field ? Boolean(food.allergens?.[field]) : false;
}

export function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, count: number, currentIndex: number, onSelectIndex: (index: number) => void) {
  if (count < 1) return;

  let nextIndex: number | null = null;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % count;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + count) % count;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = count - 1;
  if (nextIndex === null) return;

  event.preventDefault();
  onSelectIndex(nextIndex);
  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  window.requestAnimationFrame(() => tabs?.[nextIndex]?.focus());
}

export function buildFoodPlanContext(
  food: Food,
  date: string,
  stationMetrics: StationMetric[],
  fallbackRestaurant: RestaurantSummary | null,
  fallbackMeal: Meal | null
) {
  const mealWindow = findFoodMealWindow(food, stationMetrics);
  const restaurant = food.restaurantId && food.restaurantName
    ? {
        id: food.restaurantId,
        name: food.restaurantName,
        url: '',
        venue_name: food.restaurantName,
        service_date: date,
        meals_count: 0,
        stations_count: 0,
        foods_count: 0,
        first_open: mealWindow?.open || null,
        last_closed: mealWindow?.closed || null
      }
    : fallbackRestaurant;

  if (!restaurant) return null;

  const meal = food.mealId && food.mealName
    ? {
        id: food.mealId,
        restaurant_id: restaurant.id,
        name: food.mealName,
        time_open: mealWindow?.open || '',
        time_closed: mealWindow?.closed || '',
        stations: []
      }
    : fallbackMeal;

  if (!meal) return null;
  return { restaurant, meal };
}

export function upsertPlannedFood(profile: LocalProfile, date: string, restaurant: RestaurantSummary, meal: Meal, food: Food): LocalProfile {
  const now = new Date().toISOString();
  const mealId = `${date}:${restaurant.id}:${meal.id}`;
  const existingMeal = profile.meals.find((item) => item.id === mealId);

  if (!existingMeal) {
    return {
      ...profile,
      meals: [{
        id: mealId,
        date,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        mealId: meal.id,
        mealName: meal.name,
        timeOpen: meal.time_open,
        timeClosed: meal.time_closed,
        foods: [{ foodId: food.id, quantity: 1, food, addedAt: now }],
        createdAt: now,
        updatedAt: now
      }, ...profile.meals],
      updatedAt: now
    };
  }

  return {
    ...profile,
    meals: profile.meals.map((item) => item.id === mealId
      ? {
          ...item,
          foods: item.foods.some((plannedFood) => plannedFood.foodId === food.id)
            ? item.foods.map((plannedFood) => plannedFood.foodId === food.id
              ? { ...plannedFood, quantity: Math.min(10, plannedFood.quantity + 1), food }
              : plannedFood)
            : [...item.foods, { foodId: food.id, quantity: 1, food, addedAt: now }],
          updatedAt: now
        }
      : item),
    updatedAt: now
  };
}

export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function calculateTotals(meals: PlannedMeal[]): MacroTotals {
  const totals = meals.reduce((sum, meal) => {
    for (const item of meal.foods) {
      sum.calories += nutritionValue(item.food.calories) * item.quantity;
      sum.protein += nutritionValue(item.food.protein) * item.quantity;
      sum.carbs += nutritionValue(item.food.totalCarbohydrates) * item.quantity;
      sum.fat += nutritionValue(item.food.totalFat) * item.quantity;
    }
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return {
    calories: round(totals.calories),
    protein: round(totals.protein),
    carbs: round(totals.carbs),
    fat: round(totals.fat)
  };
}

export function buildMealPlanCsv(meals: PlannedMeal[], planTotals: MacroTotals) {
  const columns = [
    'row_type',
    'date',
    'restaurant',
    'meal',
    'time_open',
    'time_closed',
    'station',
    'food_id',
    'external_id',
    'food',
    'full_name',
    'quantity',
    'serving_size',
    'calories_each',
    'protein_g_each',
    'carbs_g_each',
    'fat_g_each',
    'sodium_mg_each',
    'calories_selected',
    'protein_g_selected',
    'carbs_g_selected',
    'fat_g_selected',
    'sodium_mg_selected',
    'vegetarian',
    'vegan',
    'gluten_free',
    'allergens',
    'ingredients',
    'meal_calories',
    'meal_protein_g',
    'meal_carbs_g',
    'meal_fat_g',
    'plan_calories',
    'plan_protein_g',
    'plan_carbs_g',
    'plan_fat_g',
    'plan_items'
  ];
  const planItems = meals.reduce((sum, meal) => sum + meal.foods.reduce((count, item) => count + item.quantity, 0), 0);
  const rows = meals.flatMap((meal) => {
    const mealTotals = calculateTotals([meal]);
    return meal.foods.map((item) => {
      const food = item.food;
      return [
        'food',
        meal.date,
        meal.restaurantName,
        meal.mealName,
        meal.timeOpen,
        meal.timeClosed,
        food.stationName || '',
        food.id,
        food.externalId,
        food.shortName,
        food.fullName,
        item.quantity,
        formatServingSize(food),
        round(food.calories),
        round(food.protein),
        round(food.totalCarbohydrates),
        round(food.totalFat),
        round(food.sodium),
        round(nutritionValue(food.calories) * item.quantity),
        round(nutritionValue(food.protein) * item.quantity),
        round(nutritionValue(food.totalCarbohydrates) * item.quantity),
        round(nutritionValue(food.totalFat) * item.quantity),
        round(nutritionValue(food.sodium) * item.quantity),
        Boolean(food.vegetarian),
        Boolean(food.vegan),
        Boolean(food.glutenFree),
        formatFoodAllergens(food),
        food.ingredients || '',
        mealTotals.calories,
        mealTotals.protein,
        mealTotals.carbs,
        mealTotals.fat,
        planTotals.calories,
        planTotals.protein,
        planTotals.carbs,
        planTotals.fat,
        round(planItems)
      ];
    });
  });
  return [columns, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatServingSize(food: Food) {
  const amount = food.servingSizeAmount ? round(food.servingSizeAmount) : '';
  return [amount, food.servingSizeUnit].filter(Boolean).join(' ');
}

export function formatFoodAllergens(food: Food) {
  return allergenOptions
    .filter(([value]) => hasFoodAllergen(food, value))
    .map(([, label]) => label)
    .join('; ');
}

export function resolveFoodSnapshot(food: Food, allFoods: Food[]) {
  return allFoods.find((item) => item.id === food.id && (!food.restaurantId || item.restaurantId === food.restaurantId)) || food;
}

export function sortFoods(foods: Food[], sortConfig: SortConfig) {
  if (!sortConfig) return foods;
  return foods
    .map((food, index) => ({ food, index }))
    .sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valueDelta = getSortValue(a.food, sortConfig.key) - getSortValue(b.food, sortConfig.key);
      if (valueDelta !== 0) return valueDelta * direction;
      return a.index - b.index;
    })
    .map((item) => item.food);
}

export function getSortValue(food: Food, key: SortKey) {
  if (key === 'calories') return Number(food.calories || 0);
  if (key === 'protein') return Number(food.protein || 0);
  if (key === 'carbs') return Number(food.totalCarbohydrates || 0);
  return Number(food.totalFat || 0);
}

export function findFoodMealWindow(food: Food, stationMetrics: StationMetric[]) {
  if (food.mealTimeOpen && food.mealTimeClosed) {
    return { open: food.mealTimeOpen, closed: food.mealTimeClosed };
  }

  const match = stationMetrics.find((station) => (
    station.restaurantId === food.restaurantId
    && (food.mealId ? station.mealId === food.mealId : station.mealName === food.mealName)
    && (!food.stationId || station.stationId === food.stationId)
  ));

  return match ? { open: match.mealTimeOpen, closed: match.mealTimeClosed } : null;
}

export function buildTimelineWindows(restaurants: RestaurantSummary[], mealWindows: MealWindowInsight[]): TimelineWindow[] {
  if (mealWindows.length) return mealWindows;
  return restaurants
    .filter((restaurant) => restaurant.first_open && restaurant.last_closed)
    .map((restaurant) => ({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      mealId: restaurant.id * -1,
      mealName: 'Open',
      mealPeriod: 'Open',
      timeOpen: restaurant.first_open || '',
      timeClosed: restaurant.last_closed || ''
    }));
}

export function timelineMinute(value: string) {
  const parts = parseServiceDateTime(value);
  if (parts) return (parts.hour * 60) + parts.minute;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return (parsed.getHours() * 60) + parsed.getMinutes();
}

export function formatTimelineMinute(value: number) {
  const safeValue = Math.max(0, Math.min(24 * 60, value));
  const hour = Math.floor(safeValue / 60);
  const minute = safeValue % 60;
  return formatHourMinute(hour, minute);
}

export function formatTimelineRange(startMinute: number, endMinute: number) {
  const start = formatTimelineMinute(startMinute);
  const end = formatTimelineMinute(endMinute);
  const startParts = start.match(/^(.+) (AM|PM)$/);
  const endParts = end.match(/^(.+) (AM|PM)$/);
  if (startParts && endParts && startParts[2] === endParts[2]) {
    return `${startParts[1]} - ${endParts[1]} ${endParts[2]}`;
  }
  return `${start} - ${end}`;
}

export function getTimelineSegmentLabel(mealPeriod: string, widthPercent: number) {
  if (widthPercent < 8) return '';
  return mealPeriod;
}

export function getRestaurantTimelineStatus(windows: TimelineWindow[], nowMinute: number | null) {
  const ranges = windows
    .map((window) => {
      const open = timelineMinute(window.timeOpen);
      const closed = timelineMinute(window.timeClosed);
      return open === null || closed === null ? null : { open, closed };
    })
    .filter((range): range is { open: number; closed: number } => Boolean(range))
    .sort((a, b) => a.open - b.open);

  if (!ranges.length) {
    return { tone: 'neutral', label: 'Hours unavailable', detail: 'Hours unavailable' };
  }

  if (nowMinute === null) {
    return {
      tone: 'neutral',
      label: 'Scheduled',
      detail: formatTimelineRange(ranges[0].open, ranges[ranges.length - 1].closed)
    };
  }

  const openRange = ranges.find((range) => nowMinute >= range.open && nowMinute <= range.closed);
  if (openRange) {
    return {
      tone: 'open',
      label: 'Open now',
      detail: `Closes ${formatTimelineMinute(openRange.closed)}`
    };
  }

  const nextRange = ranges.find((range) => range.open > nowMinute);
  if (nextRange) {
    return {
      tone: 'closed',
      label: 'Closed now',
      detail: `Opens ${formatTimelineRange(nextRange.open, nextRange.closed)}`
    };
  }

  return {
    tone: 'closed',
    label: 'Closed now',
    detail: 'Closed today'
  };
}

export function easternMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (Number(values.hour || 0) * 60) + Number(values.minute || 0);
}

export function macroTrianglePosition(food: InsightFood) {
  const { proteinShare, carbShare, fatShare } = macroTriangleShares(food);
  const total = Math.max(0.001, proteinShare + carbShare + fatShare);
  return macroTrianglePointFromShares(proteinShare / total, carbShare / total, fatShare / total);
}

export function macroTrianglePointFromShares(protein: number, carbs: number, fat: number): MacroTrianglePoint {
  return {
    x: (protein * macroTriangleVertices.protein.x) + (carbs * macroTriangleVertices.carbs.x) + (fat * macroTriangleVertices.fat.x),
    y: (protein * macroTriangleVertices.protein.y) + (carbs * macroTriangleVertices.carbs.y) + (fat * macroTriangleVertices.fat.y)
  };
}

export function macroTriangleShares(food: InsightFood) {
  const sourceProtein = Math.max(0, food.proteinShare);
  const sourceCarb = Math.max(0, food.carbShare);
  const sourceFat = Math.max(0, food.fatShare);
  const sourceTotal = sourceProtein + sourceCarb + sourceFat;

  if (sourceTotal > 0.0001) {
    return {
      proteinShare: sourceProtein / sourceTotal,
      carbShare: sourceCarb / sourceTotal,
      fatShare: sourceFat / sourceTotal
    };
  }

  const proteinCalories = nutritionValue(food.protein) * 4;
  const carbCalories = nutritionValue(food.totalCarbohydrates) * 4;
  const fatCalories = nutritionValue(food.totalFat) * 9;
  const macroCalories = proteinCalories + carbCalories + fatCalories;

  if (macroCalories > 0.0001) {
    return {
      proteinShare: proteinCalories / macroCalories,
      carbShare: carbCalories / macroCalories,
      fatShare: fatCalories / macroCalories
    };
  }

  return {
    proteinShare: 0.34,
    carbShare: 0.33,
    fatShare: 0.33
  };
}

export function heatmapColor(value: number) {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  const hue = 5 + (clamped * 125);
  const saturation = 74 - (clamped * 10);
  const lightness = 88 - (clamped * 34);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function percentText(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100)}%`;
}

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

type MealTabLabel = {
  primary: string;
  secondary: string;
};

export function buildMealTabLabels(meals: Meal[]) {
  const nameCounts = meals.reduce((counts, meal) => {
    const name = meal.name.trim().toLowerCase();
    counts.set(name, (counts.get(name) || 0) + 1);
    return counts;
  }, new Map<string, number>());

  return new Map(meals.map((meal) => {
    const hasDuplicateName = (nameCounts.get(meal.name.trim().toLowerCase()) || 0) > 1;
    return [meal.id, hasDuplicateName ? {
      primary: formatMealWindow(meal),
      secondary: meal.name || 'Meal window'
    } : defaultMealTabLabel(meal)] as const;
  }));
}

export function defaultMealTabLabel(meal: Meal): MealTabLabel {
  return {
    primary: meal.name || 'Meal window',
    secondary: formatMealWindow(meal)
  };
}

export function formatMealWindow(meal: Pick<Meal, 'time_open' | 'time_closed'>) {
  return formatTimeRange(meal.time_open, meal.time_closed);
}

export function formatPlannedMealWindow(meal: PlannedMeal) {
  return formatTimeRange(meal.timeOpen, meal.timeClosed);
}

export function getMenuSubtitle(date: string, loading: boolean) {
  if (loading) return 'Fetching restaurants and foods';
  return date ? `No restaurants found for ${formatShortDate(date)}` : 'Choose a service date';
}

export function formatTime(value: string) {
  if (!value) return '-';
  const parts = parseServiceDateTime(value);
  if (parts) return formatHourMinute(parts.hour, parts.minute);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
}

export function formatTimeRange(start: string, end: string) {
  const startText = formatTime(start);
  const endText = formatTime(end);
  const startParts = startText.match(/^(.+) (AM|PM)$/);
  const endParts = endText.match(/^(.+) (AM|PM)$/);
  if (startParts && endParts && startParts[2] === endParts[2]) {
    return `${startParts[1]} - ${endParts[1]} ${endParts[2]}`;
  }
  return `${startText} - ${endText}`;
}

export function formatShortDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
}

export function parseServiceDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!match) return null;
  const [, , , , hour, minute] = match;
  return {
    hour: Number(hour),
    minute: Number(minute)
  };
}

export function formatHourMinute(hour24: number, minute: number) {
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatAllergen(value: string) {
  return value
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatFoodContext(food: Food) {
  const primary = food.restaurantName || food.fullName;
  return food.stationName ? `${primary} - ${formatStationName(food.stationName)}` : primary;
}

export function formatSearchLocation(food: Food) {
  const restaurant = food.restaurantName || 'Restaurant';
  const station = food.stationName ? formatStationName(food.stationName) : 'Menu';
  return `${restaurant} · ${station}`;
}

export function formatSearchAvailability(food: Food) {
  const meal = food.mealName || 'Meal window';
  if (!food.mealTimeOpen || !food.mealTimeClosed) return meal;
  return `${meal} · ${formatTimeRange(food.mealTimeOpen, food.mealTimeClosed)}`;
}

export function formatStationName(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === '-') return normalized || '-';

  const minorWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'or', 'the', 'to', 'with']);

  return normalized
    .split(/\s+/)
    .map((word, wordIndex) => word
      .split(/([-/&])/)
      .map((part) => {
        if (!part || /^[-/&]$/.test(part)) return part;
        const lower = part.toLowerCase();
        if (wordIndex > 0 && minorWords.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(''))
    .join(' ');
}

export function formatSelectedCount(value: number) {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(Number(value || 0) * 100) / 100);
}

export function foodRenderKey(food: Food, index: number) {
  return [
    food.id,
    food.externalId,
    food.restaurantId || '',
    food.restaurantName || '',
    food.mealId || '',
    food.mealName || '',
    food.stationId || '',
    food.stationName || '',
    index
  ].join('-');
}

export function foodIdentityKey(food: Food) {
  return [
    food.id,
    food.restaurantId || '',
    food.mealId || '',
    food.stationId || ''
  ].join(':');
}

export function revealTargetKey(target: RevealTarget) {
  return [
    target.foodId,
    target.restaurantId || '',
    target.mealId || '',
    target.stationId || ''
  ].join(':');
}

export function nutritionValue(value: number | null | undefined) {
  return Number(value || 0);
}

export function round(value: number | null | undefined) {
  return Math.round(Number(value || 0) * 10) / 10;
}

export function percentOf(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

export function hasAllergenFlag(food: Food) {
  return Object.values(food.allergens).some(Boolean);
}

export function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function loadVisibleColumns(): VisibleColumns {
  if (typeof window === 'undefined') return defaultVisibleColumns;
  const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
  if (!raw) return defaultVisibleColumns;

  try {
    const parsed = JSON.parse(raw) as Partial<Record<TableColumn, unknown>>;
    return visibleColumnOptions.reduce<VisibleColumns>((columns, column) => ({
      ...columns,
      [column.key]: typeof parsed[column.key] === 'boolean' ? parsed[column.key] : defaultVisibleColumns[column.key]
    }), { ...defaultVisibleColumns });
  } catch {
    return defaultVisibleColumns;
  }
}

export function getQuickSearchShortcut() {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';
}

export function easternDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
