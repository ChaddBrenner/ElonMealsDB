import type { Food, InsightFood, MealWindowInsight } from '../types';

export const safeSearch = /^[a-zA-Z0-9\s.'&()/,+-]{0,80}$/;
export const allergenOptions = [
  ['soy', 'Soy'],
  ['milk', 'Milk'],
  ['wheat', 'Wheat'],
  ['egg', 'Egg'],
  ['sesame', 'Sesame'],
  ['fish', 'Fish'],
  ['peanut', 'Peanut'],
  ['tree_nut', 'Tree Nut']
] as const;

export const allergenFieldMap: Record<string, keyof Food['allergens']> = {
  soy: 'soy',
  milk: 'milk',
  wheat: 'wheat',
  egg: 'egg',
  sesame: 'sesame',
  fish: 'fish',
  peanut: 'peanut',
  tree_nut: 'treeNut'
};

export const THEME_STORAGE_ID = 'elonmealsdb.theme.v1';
export const VISIBLE_COLUMNS_STORAGE_ID = 'elonmealsdb.visibleColumns.v1';
export type ThemeMode = 'light' | 'dark';
export type MacroTone = 'calories' | 'protein' | 'carbs' | 'fat';
export type SortKey = 'calories' | 'protein' | 'carbs' | 'fat';
export type SortDirection = 'asc' | 'desc';
export type SortConfig = { key: SortKey; direction: SortDirection } | null;
export type MenuViewMode = 'table' | 'overview';
export type TableColumn = 'station' | 'dietary' | SortKey;
export type VisibleColumns = Record<TableColumn, boolean>;
export type RevealTarget = {
  foodId: number;
  restaurantId: number;
  mealId?: number | null;
  stationId?: number | null;
};
export type TimelineWindow = Pick<MealWindowInsight, 'restaurantId' | 'restaurantName' | 'mealId' | 'mealName' | 'mealPeriod' | 'timeOpen' | 'timeClosed'>;
export type MacroTrianglePoint = { x: number; y: number };

export const macroTriangleVertices = {
  protein: { x: 50, y: 14 },
  carbs: { x: 12, y: 80 },
  fat: { x: 88, y: 80 }
} as const;

export const sortableColumns: Array<{ key: SortKey; label: string }> = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' }
];

export const visibleColumnOptions: Array<{ key: TableColumn; label: string }> = [
  { key: 'station', label: 'Station' },
  { key: 'dietary', label: 'Dietary' },
  ...sortableColumns
];

export const defaultVisibleColumns: VisibleColumns = {
  station: true,
  dietary: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true
};

export function dietClass(dietGroup: InsightFood['dietGroup']) {
  if (dietGroup === 'Vegan') return 'vegan';
  if (dietGroup === 'Vegetarian') return 'vegetarian';
  return 'omnivore';
}
