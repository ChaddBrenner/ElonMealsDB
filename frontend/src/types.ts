export type AllergenMap = {
  egg: boolean | null;
  shellfish: boolean | null;
  soy: boolean | null;
  peanut: boolean | null;
  wheat: boolean | null;
  treeNut: boolean | null;
  milk: boolean | null;
  sesame: boolean | null;
  fish: boolean | null;
};

export type Food = {
  id: number;
  externalId: string;
  shortName: string;
  fullName: string;
  description: string;
  ingredients: string;
  servingSizeAmount: number | null;
  servingSizeUnit: string;
  calories: number | null;
  caloriesFromFat: number | null;
  totalFat: number | null;
  saturatedFat: number | null;
  transFat: number | null;
  cholesterol: number | null;
  sodium: number | null;
  totalCarbohydrates: number | null;
  dietaryFiber: number | null;
  sugars: number | null;
  protein: number | null;
  vegetarian: boolean | null;
  vegan: boolean | null;
  glutenFree: boolean | null;
  allergens: AllergenMap;
  restaurantId?: number;
  restaurantName?: string;
  mealId?: number;
  mealName?: string;
  mealTimeOpen?: string;
  mealTimeClosed?: string;
  stationId?: number;
  stationName?: string;
  quantity?: number;
};

export type RestaurantSummary = {
  id: number;
  name: string;
  url: string;
  venue_name: string;
  service_date: string;
  meals_count: number;
  stations_count: number;
  foods_count: number;
  first_open: string | null;
  last_closed: string | null;
};

export type ServiceDateSummary = {
  serviceDate: string;
  restaurants: number;
  meals: number;
  stations: number;
  foods: number;
  lastImportedAt: string | null;
};

export type Station = {
  id: number;
  mealId: number;
  name: string;
  foods: Food[];
};

export type Meal = {
  id: number;
  restaurant_id: number;
  name: string;
  time_open: string;
  time_closed: string;
  stations: Station[];
};

export type MenuResponse = {
  restaurant: {
    id: number;
    name: string;
    url: string;
    venue_name: string;
    service_date: string;
  };
  meals: Meal[];
};

export type CoverageMetrics = {
  serviceDate: string;
  restaurants: number;
  meals: number;
  stations: number;
  foods: number;
  vegan_items: number;
  vegetarian_items: number;
  gluten_free_items: number;
  avg_calories: number;
  scraperRun: ScraperRun | null;
  topProtein: Food[];
};

export type ScraperRun = {
  id: number;
  source_url: string;
  target_date: string;
  started_at: string;
  finished_at: string | null;
  status: 'success' | 'failed' | 'partial' | string;
  restaurants_count: number;
  meals_count: number;
  foods_count: number;
  error_message?: string | null;
};

export type StationMetric = {
  serviceDate: string;
  restaurantId: number;
  restaurantName: string;
  mealId: number;
  mealName: string;
  mealTimeOpen: string;
  mealTimeClosed: string;
  stationId: number;
  stationName: string;
  foodCount: number;
  avgCalories: number;
  avgProtein: number;
  veganItems: number;
  vegetarianItems: number;
  glutenFreeItems: number;
};

export type DietGroup = 'Vegan' | 'Vegetarian' | 'Omnivore';

export type InsightFood = Food & {
  appearanceCount: number;
  dietGroup: DietGroup;
  proteinPer100Calories: number;
  sodiumPer100Calories: number;
  sodiumScore?: number;
  macroTotalCalories: number;
  proteinShare: number;
  carbShare: number;
  fatShare: number;
};

export type MealWindowInsight = {
  serviceDate: string;
  restaurantId: number;
  restaurantName: string;
  url: string;
  venueName: string;
  mealId: number;
  mealName: string;
  mealPeriod: string;
  timeOpen: string;
  timeClosed: string;
  stationCount: number;
};

export type ConstraintCoverageInsight = {
  key: string;
  label: string;
  count: number;
  total: number;
  share: number;
};

export type StationInsight = {
  serviceDate: string;
  restaurantId: number;
  restaurantName: string;
  mealId: number;
  mealName: string;
  mealTimeOpen: string;
  mealTimeClosed: string;
  stationId: number;
  stationName: string;
  foodCount: number;
  avgCalories: number;
  avgProtein: number;
  vegetarianShare: number;
  veganShare: number;
  glutenFreeShare: number;
  noTop9Share: number;
  milkFreeShare: number;
  wheatFreeShare: number;
  soyFreeShare: number;
  eggFreeShare: number;
  proteinShare: number;
  carbShare: number;
  fatShare: number;
};

export type SpecialStationInsight = {
  serviceDate: string;
  restaurantId: number;
  restaurantName: string;
  mealId: number;
  mealName: string;
  mealPeriod: string;
  mealTimeOpen: string;
  mealTimeClosed: string;
  stationId: number;
  stationName: string;
  foodCount: number;
  comparisonDates: number;
  matchingDates: number;
  currentShare: number;
  baselineShare: number;
  differentToday: boolean;
};

export type NutritionInsights = {
  serviceDate: string;
  mealWindows: MealWindowInsight[];
  proteinScatter: InsightFood[];
  proteinEfficiency: InsightFood[];
  macroFoods: InsightFood[];
  sodiumOutliers: InsightFood[];
  constraintCoverage: ConstraintCoverageInsight[];
  stationConstraints: StationInsight[];
  stationMacroFingerprints: StationInsight[];
  specialStations: SpecialStationInsight[];
};

export type SqlProofExample = {
  title: string;
  route: string;
  summary: string;
  sql: string;
};
