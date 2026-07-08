import type { Food } from './types';

export type PlannedFood = {
  foodId: number;
  quantity: number;
  food: Food;
  addedAt: string;
};

export type PlannedMeal = {
  id: string;
  date: string;
  restaurantId: number;
  restaurantName: string;
  mealId: number;
  mealName: string;
  timeOpen: string;
  timeClosed: string;
  foods: PlannedFood[];
  createdAt: string;
  updatedAt: string;
};

export type FavoriteFood = {
  foodId: number;
  food: Food;
  addedAt: string;
};

export type SafetyPreferences = {
  safeModeEnabled: boolean;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  allergenFree: string[];
};

export type LocalProfile = {
  schemaVersion: 1;
  name: string;
  dailyCaloriesGoal: number;
  dailyProteinsGoal: number;
  dailyCarbsGoal: number;
  dailyFatsGoal: number;
  safetyPreferences: SafetyPreferences;
  favoriteFoods: FavoriteFood[];
  meals: PlannedMeal[];
  updatedAt: string;
};

const STORAGE_KEY = 'elonmealsdb.localProfile.v1';
const allowedAllergens = new Set(['soy', 'milk', 'wheat', 'egg', 'sesame', 'fish', 'peanut', 'tree_nut']);

export function createDefaultProfile(): LocalProfile {
  return {
    schemaVersion: 1,
    name: 'My dining plan',
    dailyCaloriesGoal: 2200,
    dailyProteinsGoal: 135,
    dailyCarbsGoal: 260,
    dailyFatsGoal: 75,
    safetyPreferences: createDefaultSafetyPreferences(),
    favoriteFoods: [],
    meals: [],
    updatedAt: new Date().toISOString()
  };
}

export function loadLocalProfile(): LocalProfile {
  if (typeof window === 'undefined') return createDefaultProfile();

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return createDefaultProfile();

  try {
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    const fallback = createDefaultProfile();
    if (parsed.schemaVersion !== 1) return fallback;

    return {
      schemaVersion: 1,
      name: normalizeName(parsed.name),
      dailyCaloriesGoal: clampNumber(parsed.dailyCaloriesGoal, 500, 6000, fallback.dailyCaloriesGoal),
      dailyProteinsGoal: clampNumber(parsed.dailyProteinsGoal, 10, 400, fallback.dailyProteinsGoal),
      dailyCarbsGoal: clampNumber(parsed.dailyCarbsGoal, 10, 800, fallback.dailyCarbsGoal),
      dailyFatsGoal: clampNumber(parsed.dailyFatsGoal, 10, 400, fallback.dailyFatsGoal),
      safetyPreferences: normalizeSafetyPreferences(parsed.safetyPreferences, fallback.safetyPreferences),
      favoriteFoods: Array.isArray(parsed.favoriteFoods) ? parsed.favoriteFoods.slice(0, 300) : [],
      meals: Array.isArray(parsed.meals) ? parsed.meals.slice(0, 500) : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : fallback.updatedAt
    };
  } catch {
    return createDefaultProfile();
  }
}

export function saveLocalProfile(profile: LocalProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...profile,
    updatedAt: new Date().toISOString()
  }));
}

export function normalizeName(value: unknown) {
  const raw = typeof value === 'string' ? value : 'My dining plan';
  const trimmed = raw.trim().replace(/\s+/g, ' ').slice(0, 42);
  return trimmed || 'My dining plan';
}

function createDefaultSafetyPreferences(): SafetyPreferences {
  return {
    safeModeEnabled: false,
    vegan: false,
    vegetarian: false,
    glutenFree: false,
    allergenFree: []
  };
}

function normalizeSafetyPreferences(value: unknown, fallback: SafetyPreferences): SafetyPreferences {
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<SafetyPreferences>;
  return {
    safeModeEnabled: Boolean(source.safeModeEnabled),
    vegan: Boolean(source.vegan),
    vegetarian: Boolean(source.vegetarian),
    glutenFree: Boolean(source.glutenFree),
    allergenFree: Array.isArray(source.allergenFree)
      ? Array.from(new Set(source.allergenFree
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter((item) => allowedAllergens.has(item))))
        .slice(0, 8)
      : []
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
