import type { CoverageMetrics, Food, MenuResponse, NutritionInsights, RestaurantSummary, ServiceDateSummary, StationMetric } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

type ApiError = {
  error?: {
    code?: string;
    message?: string;
  };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    }
  });

  if (!response.ok) {
    let payload: ApiError = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    throw new Error(payload.error?.message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getRestaurants(date: string) {
  return request<{ restaurants: RestaurantSummary[] }>(`/restaurants?date=${encodeURIComponent(date)}`);
}

export function getServiceDates() {
  return request<{ dates: ServiceDateSummary[] }>('/service-dates');
}

export function getCoverageMetrics(date: string) {
  return request<CoverageMetrics>(`/metrics/coverage?date=${encodeURIComponent(date)}`);
}

export function getStationMetrics(date: string) {
  return request<{ serviceDate: string; stations: StationMetric[] }>(`/metrics/stations?date=${encodeURIComponent(date)}`);
}

export function getNutritionInsights(date: string) {
  return request<NutritionInsights>(`/metrics/nutrition-insights?date=${encodeURIComponent(date)}`);
}

export function getMenu(restaurantId: number) {
  return request<MenuResponse>(`/restaurants/${restaurantId}/menu`);
}

export type FoodFilters = {
  date: string;
  q?: string;
  vegan?: boolean;
  vegetarian?: boolean;
  glutenFree?: boolean;
  maxCalories?: number;
  minProtein?: number;
  allergenFree?: string[];
};

export function getFoods(filters: FoodFilters) {
  const params = new URLSearchParams({ date: filters.date });
  if (filters.q) params.set('q', filters.q);
  if (filters.vegan !== undefined) params.set('vegan', String(filters.vegan));
  if (filters.vegetarian !== undefined) params.set('vegetarian', String(filters.vegetarian));
  if (filters.glutenFree !== undefined) params.set('glutenFree', String(filters.glutenFree));
  if (filters.maxCalories !== undefined) params.set('maxCalories', String(filters.maxCalories));
  if (filters.minProtein !== undefined) params.set('minProtein', String(filters.minProtein));
  if (filters.allergenFree?.length) params.set('allergenFree', filters.allergenFree.join(','));
  return request<{ foods: Food[] }>(`/foods?${params.toString()}`);
}
