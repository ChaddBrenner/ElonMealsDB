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

export type NutritionFact = {
  label: string;
  unit: string;
  value: number | null;
  percentDailyValue: number | null;
  isSecondary: boolean;
};

export type DietaryAttribute = {
  key: string;
  name: string;
};

export type Food = {
  id: number;
  externalId: string;
  sourceRecipeId: string | null;
  contentHash: string | null;
  shortName: string;
  fullName: string;
  description: string | null;
  ingredients: string | null;
  disclaimer: string | null;
  hideAllergens: boolean;
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
  addedSugars: number | null;
  protein: number | null;
  potassium: number | null;
  calcium: number | null;
  iron: number | null;
  vitaminD: number | null;
  nutritionFacts: NutritionFact[];
  dietaryAttributes: DietaryAttribute[];
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
  source_kind: 'elon_location' | 'elon_resource' | 'external_link' | 'pdf' | string;
  menu_status: 'available' | 'hours_only' | 'external' | 'pdf' | string;
  meals_count: number;
  stations_count: number;
  foods_count: number;
  food_variants_count: number;
  menu_item_placements_count: number;
  first_open: string | null;
  last_closed: string | null;
};

export type ServiceDateSummary = {
  serviceDate: string;
  restaurants: number;
  meals: number;
  stations: number;
  foods: number;
  foodVariants: number;
  menuItemPlacements: number;
  lastImportedAt: string | null;
};

export type Station = {
  id: number;
  mealId: number;
  name: string;
  sourceId: string | null;
  foods: Food[];
};

export type Meal = {
  id: number;
  restaurant_id: number;
  name: string;
  time_open: string;
  time_closed: string;
  menu_status: 'available' | 'empty_menu' | 'hours_only' | 'not_published' | 'external' | 'pdf' | string;
  menu_label: string | null;
  menu_time_label: string | null;
  stations: Station[];
};

export type MenuResponse = {
  restaurant: {
    id: number;
    name: string;
    url: string;
    venue_name: string;
    service_date: string;
    source_kind: RestaurantSummary['source_kind'];
    menu_status: RestaurantSummary['menu_status'];
  };
  meals: Meal[];
};

export type CoverageMetrics = {
  serviceDate: string;
  restaurants: number;
  meals: number;
  stations: number;
  foods: number;
  food_variants: number;
  menu_item_placements: number;
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
  distinct_recipes_count: number;
  food_variants_count: number;
  menu_item_placements_count: number;
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
  sourceKind: RestaurantSummary['source_kind'];
  restaurantMenuStatus: RestaurantSummary['menu_status'];
  mealId: number;
  mealName: string;
  mealPeriod: string;
  mealMenuStatus: Meal['menu_status'];
  menuLabel: string | null;
  menuTimeLabel: string | null;
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
