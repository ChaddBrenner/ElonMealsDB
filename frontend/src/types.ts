export type AllergenMap = {
  egg: boolean;
  shellfish: boolean;
  soy: boolean;
  peanut: boolean;
  wheat: boolean;
  treeNut: boolean;
  milk: boolean;
  sesame: boolean;
  fish: boolean;
};

export type Food = {
  id: number;
  externalId: string;
  shortName: string;
  fullName: string;
  description: string;
  ingredients: string;
  servingSizeAmount: number;
  servingSizeUnit: string;
  calories: number;
  caloriesFromFat: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbohydrates: number;
  dietaryFiber: number;
  sugars: number;
  protein: number;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  allergens: AllergenMap;
  restaurantId?: number;
  restaurantName?: string;
  mealName?: string;
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
  scraperRun: {
    id: number;
    source_url: string;
    target_date: string;
    started_at: string;
    finished_at: string;
    status: string;
    restaurants_count: number;
    meals_count: number;
    foods_count: number;
  } | null;
  topProtein: Food[];
};

export type SqlProofExample = {
  title: string;
  route: string;
  summary: string;
  sql: string;
};
