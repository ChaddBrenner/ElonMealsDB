import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Leaf,
  Loader2,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Soup,
  Star,
  Sun,
  Trash2,
  Utensils,
  X
} from 'lucide-react';
import {
  getCoverageMetrics,
  getFoods,
  getMenu,
  getRestaurants,
  getServiceDates,
  getStationMetrics,
  type FoodFilters
} from './api';
import {
  createDefaultProfile,
  loadLocalProfile,
  saveLocalProfile,
  type LocalProfile,
  type PlannedMeal
} from './localProfile';
import type { CoverageMetrics, Food, Meal, MenuResponse, RestaurantSummary, ServiceDateSummary, StationMetric } from './types';

const safeSearch = /^[a-zA-Z0-9\s.'&()/,+-]{0,80}$/;
const allergenOptions = [
  ['soy', 'Soy'],
  ['milk', 'Milk'],
  ['wheat', 'Wheat'],
  ['egg', 'Egg'],
  ['sesame', 'Sesame'],
  ['fish', 'Fish'],
  ['peanut', 'Peanut'],
  ['tree_nut', 'Tree nut']
] as const;

const THEME_STORAGE_ID = 'elonmealsdb.theme.v1';
type ThemeMode = 'light' | 'dark';
type MacroTone = 'calories' | 'protein' | 'carbs' | 'fat';

export function App() {
  const [profile, setProfile] = useState<LocalProfile>(() => loadLocalProfile());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [date, setDate] = useState('');
  const [availableDates, setAvailableDates] = useState<ServiceDateSummary[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [metrics, setMetrics] = useState<CoverageMetrics | null>(null);
  const [stationMetrics, setStationMetrics] = useState<StationMetric[]>([]);
  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [filteredFoods, setFilteredFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [activeMealId, setActiveMealId] = useState<number | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [vegan, setVegan] = useState(false);
  const [vegetarian, setVegetarian] = useState(false);
  const [glutenFree, setGlutenFree] = useState(false);
  const [minProtein, setMinProtein] = useState('');
  const [maxCalories, setMaxCalories] = useState('');
  const [allergenFree, setAllergenFree] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 280);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || restaurants[0] || null;
  const activeMeal = menu?.meals.find((meal) => meal.id === activeMealId) || menu?.meals[0] || null;
  const mealTabLabels = useMemo(() => buildMealTabLabels(menu?.meals || []), [menu?.meals]);
  const todayMeals = useMemo(() => profile.meals.filter((meal) => meal.date === date), [profile.meals, date]);
  const totals = useMemo(() => calculateTotals(todayMeals), [todayMeals]);
  const plannedItemCount = useMemo(() => todayMeals.reduce((count, meal) => count + meal.foods.reduce((sum, food) => sum + food.quantity, 0), 0), [todayMeals]);
  const favoriteIds = useMemo(() => new Set(profile.favoriteFoods.map((favorite) => favorite.foodId)), [profile.favoriteFoods]);
  const activeFilters = Boolean(debouncedQuery || vegan || vegetarian || glutenFree || minProtein || maxCalories || allergenFree.length);

  const menuFoods = useMemo(() => {
    if (!activeMeal || !selectedRestaurant) return [];
    return activeMeal.stations.flatMap((station) => station.foods.map((food) => ({
      ...food,
      stationId: station.id,
      stationName: station.name,
      mealName: activeMeal.name,
      restaurantId: selectedRestaurant.id,
      restaurantName: selectedRestaurant.name
    })));
  }, [activeMeal, selectedRestaurant]);

  const sourceFoods = activeFilters ? filteredFoods : menuFoods;
  const tableFoods = useMemo(() => selectedStationId
    ? sourceFoods.filter((food) => food.stationId === selectedStationId)
    : sourceFoods, [sourceFoods, selectedStationId]);
  const latestImportedDate = availableDates[0]?.serviceDate || '';

  useEffect(() => {
    saveLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_ID, theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getServiceDates()
      .then((response) => {
        if (!active) return;
        const today = easternDateInput();
        setAvailableDates(response.dates);
        setDate(response.dates.some((item) => item.serviceDate === today)
          ? today
          : response.dates[0]?.serviceDate || today);
      })
      .catch((caught: Error) => {
        if (!active) return;
        setError(caught.message);
        setDate(easternDateInput());
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!date) return;
    setRestaurants([]);
    setSelectedRestaurantId(null);
    setMenu(null);
    setActiveMealId(null);
    setSelectedStationId(null);
    setSelectedFood(null);
    setMetrics(null);
    setStationMetrics([]);
    setAllFoods([]);
    setFilteredFoods([]);
  }, [date]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setLoading(true);
    setError(null);

    if (query && !safeSearch.test(query)) {
      setError('Search accepts letters, numbers, spaces, and basic punctuation only.');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    Promise.all([
      getRestaurants(date),
      getCoverageMetrics(date),
      getStationMetrics(date),
      getFoods({ date })
    ])
      .then(([restaurantsResponse, metricsResponse, stationMetricsResponse, allFoodsResponse]) => {
        if (!active) return;
        setRestaurants(restaurantsResponse.restaurants);
        setMetrics(metricsResponse);
        setStationMetrics(stationMetricsResponse.stations);
        setAllFoods(allFoodsResponse.foods);
        setSelectedRestaurantId((current) => (
          restaurantsResponse.restaurants.some((restaurant) => restaurant.id === current)
            ? current
            : restaurantsResponse.restaurants[0]?.id || null
        ));
        if (!restaurantsResponse.restaurants.length) {
          setMenu(null);
          setActiveMealId(null);
          setSelectedFood(null);
        }
      })
      .catch((caught: Error) => active && setError(caught.message))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [date]);

  useEffect(() => {
    if (!date) return;

    if (!activeFilters) {
      setFilteredFoods([]);
      setFilterLoading(false);
      return;
    }

    let active = true;
    setFilterLoading(true);
    setError(null);

    if (debouncedQuery && !safeSearch.test(debouncedQuery)) {
      setError('Search accepts letters, numbers, spaces, and basic punctuation only.');
      setFilterLoading(false);
      return () => {
        active = false;
      };
    }

    getFoods(buildFilters(date, debouncedQuery, vegan, vegetarian, glutenFree, minProtein, maxCalories, allergenFree))
      .then((response) => active && setFilteredFoods(response.foods))
      .catch((caught: Error) => active && setError(caught.message))
      .finally(() => active && setFilterLoading(false));

    return () => {
      active = false;
    };
  }, [date, activeFilters, debouncedQuery, vegan, vegetarian, glutenFree, minProtein, maxCalories, allergenFree]);

  useEffect(() => {
    if (!selectedRestaurantId) {
      setMenu(null);
      setActiveMealId(null);
      return;
    }
    let active = true;
    setMenu(null);
    setActiveMealId(null);
    getMenu(selectedRestaurantId)
      .then((response) => {
        if (!active) return;
        if (date && response.restaurant.service_date !== date) return;
        setMenu(response);
        setActiveMealId(response.meals[0]?.id || null);
        setSelectedStationId(null);
      })
      .catch((caught: Error) => active && setError(caught.message));

    return () => {
      active = false;
    };
  }, [selectedRestaurantId, date]);

  useEffect(() => {
    setSelectedStationId(null);
  }, [activeMealId]);

  function updateProfile(patch: Partial<LocalProfile>) {
    setProfile((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    }));
  }

  function toggleFavorite(food: Food) {
    setProfile((current) => {
      const exists = current.favoriteFoods.some((favorite) => favorite.foodId === food.id);
      return {
        ...current,
        favoriteFoods: exists
          ? current.favoriteFoods.filter((favorite) => favorite.foodId !== food.id)
          : [{ foodId: food.id, food, addedAt: new Date().toISOString() }, ...current.favoriteFoods].slice(0, 300),
        updatedAt: new Date().toISOString()
      };
    });
  }

  function addFoodToPlan(food: Food) {
    if (!activeMeal || !selectedRestaurant) {
      setError('Choose a restaurant and meal before adding food.');
      return;
    }
    setBusy(true);
    setProfile((current) => upsertPlannedFood(current, date, selectedRestaurant, activeMeal, food));
    window.setTimeout(() => setBusy(false), 120);
  }

  function updatePlannedQuantity(mealId: string, foodId: number, nextQuantity: number) {
    setProfile((current) => ({
      ...current,
      meals: current.meals.map((meal) => meal.id === mealId
        ? {
            ...meal,
            foods: meal.foods.map((item) => item.foodId === foodId
              ? { ...item, quantity: Math.min(10, Math.max(0.25, Math.round(nextQuantity * 4) / 4)) }
              : item),
            updatedAt: new Date().toISOString()
          }
        : meal),
      updatedAt: new Date().toISOString()
    }));
  }

  function removePlannedFood(mealId: string, foodId: number) {
    setProfile((current) => ({
      ...current,
      meals: current.meals
        .map((meal) => meal.id === mealId
          ? { ...meal, foods: meal.foods.filter((item) => item.foodId !== foodId), updatedAt: new Date().toISOString() }
          : meal)
        .filter((meal) => meal.foods.length > 0),
      updatedAt: new Date().toISOString()
    }));
  }

  function removePlannedMeal(mealId: string) {
    setProfile((current) => ({
      ...current,
      meals: current.meals.filter((meal) => meal.id !== mealId),
      updatedAt: new Date().toISOString()
    }));
  }

  function clearToday() {
    setProfile((current) => ({
      ...current,
      meals: current.meals.filter((meal) => meal.date !== date),
      updatedAt: new Date().toISOString()
    }));
  }

  function resetLocalProfile() {
    setProfile(createDefaultProfile());
  }

  return (
    <div className="product-shell" data-theme={theme}>
      <main>
        <header className="topbar">
          <div className="brand compact-brand">
            <div className="brand-mark">E</div>
            <div>
              <strong>ElonMealsDB</strong>
              <span>Dining planner</span>
            </div>
          </div>
          <label className="field date-field">
            <input type="date" value={date} aria-label="Date" onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="search-field">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search foods, ingredients, stations..."
              aria-label="Search foods"
            />
          </label>
          <button
            className="icon-button theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>

        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button className="icon-button" type="button" onClick={() => setError(null)} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}

        <RestaurantTabs
          restaurants={restaurants}
          selectedRestaurantId={selectedRestaurantId}
          loading={loading}
          onSelect={setSelectedRestaurantId}
        />

        <PlanSummaryBar
          profile={profile}
          totals={totals}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <section className="planner-grid">
          <section className="panel menu-panel" id="menu">
            <PanelHeader
              title={selectedRestaurant?.name || (loading ? 'Loading menu' : 'No menu imported')}
              subtitle={selectedRestaurant ? '' : getMenuSubtitle(date, loading)}
              icon={<Soup size={18} />}
            />
            {selectedRestaurant ? (
              <>
                <div className="meal-tabs" role="tablist" aria-label="Meals">
                  {menu?.meals.map((meal) => {
                    const tabLabel = mealTabLabels.get(meal.id) || defaultMealTabLabel(meal);
                    const isSelected = meal.id === activeMealId;
                    return (
                      <button
                        key={meal.id}
                        className={isSelected ? 'selected' : ''}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-controls="menu"
                        onClick={() => setActiveMealId(meal.id)}
                      >
                        <span>{tabLabel.primary}</span>
                        <small>{tabLabel.secondary}</small>
                      </button>
                    );
                  })}
                </div>
                <StationFilter
                  stations={activeMeal?.stations || []}
                  selectedStationId={selectedStationId}
                  onSelect={setSelectedStationId}
                />
                <div className="food-workspace">
                  <FilterBar
                    vegan={vegan}
                    vegetarian={vegetarian}
                    glutenFree={glutenFree}
                    minProtein={minProtein}
                    maxCalories={maxCalories}
                    allergenFree={allergenFree}
                    onVegan={setVegan}
                    onVegetarian={setVegetarian}
                    onGlutenFree={setGlutenFree}
                    onMinProtein={setMinProtein}
                    onMaxCalories={setMaxCalories}
                    onAllergenFree={setAllergenFree}
                  />
                  {loading || filterLoading || !menu ? <LoadingState /> : (
                    <FoodTable
                      foods={tableFoods}
                      favoriteIds={favoriteIds}
                      busy={busy}
                      onSelect={setSelectedFood}
                      onFavorite={toggleFavorite}
                      onAdd={addFoodToPlan}
                    />
                  )}
                </div>
              </>
            ) : (
              <NoMenuState
                date={date}
                latestDate={latestImportedDate}
                loading={loading}
                onUseLatest={setDate}
              />
            )}
          </section>

          <MealPlanPanel
            meals={todayMeals}
            itemCount={plannedItemCount}
            onQuantity={updatePlannedQuantity}
            onRemoveFood={removePlannedFood}
            onRemoveMeal={removePlannedMeal}
            onClearDay={clearToday}
          />
        </section>

        <section className="lower-grid">
          <NutritionInsightsPanel
            metrics={metrics}
            foods={allFoods}
            stations={stationMetrics}
            restaurants={restaurants}
            onSelect={setSelectedFood}
          />

          <section className="panel" id="favorites">
            <PanelHeader title="Favorites" subtitle="Fast access to foods you come back to" icon={<Star size={18} />} />
            <div className="compact-list">
              {profile.favoriteFoods.length ? profile.favoriteFoods.slice(0, 8).map((favorite) => (
                <FoodListItem
                  key={favorite.foodId}
                  food={resolveFoodSnapshot(favorite.food, allFoods)}
                  actionLabel="Add"
                  onSelect={setSelectedFood}
                  onAction={addFoodToPlan}
                />
              )) : <EmptyState text="Favorite foods will appear here." />}
            </div>
          </section>
        </section>
      </main>

      <GoalSettingsDialog
        profile={profile}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChange={updateProfile}
        onReset={resetLocalProfile}
      />

      <NutritionDrawer
        food={selectedFood}
        isFavorite={selectedFood ? favoriteIds.has(selectedFood.id) : false}
        busy={busy}
        onClose={() => setSelectedFood(null)}
        onFavorite={toggleFavorite}
        onAdd={addFoodToPlan}
      />
    </div>
  );
}

function RestaurantTabs(props: {
  restaurants: RestaurantSummary[];
  selectedRestaurantId: number | null;
  loading: boolean;
  onSelect: (restaurantId: number) => void;
}) {
  if (props.loading && !props.restaurants.length) {
    return (
      <div className="restaurant-tabs loading" aria-label="Restaurants">
        <span>Loading restaurants...</span>
      </div>
    );
  }

  if (!props.restaurants.length) {
    return (
      <div className="restaurant-tabs empty-tabs" aria-label="Restaurants">
        <span>No restaurants imported for this date</span>
      </div>
    );
  }

  return (
    <nav className="restaurant-tabs" role="tablist" aria-label="Restaurants">
      {props.restaurants.map((restaurant) => {
        const isSelected = restaurant.id === props.selectedRestaurantId;
        return (
          <button
            key={restaurant.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="menu"
            className={isSelected ? 'selected' : undefined}
            onClick={() => props.onSelect(restaurant.id)}
          >
            <span>{restaurant.name}</span>
            <small>{restaurant.foods_count} foods · {restaurant.meals_count} meals</small>
          </button>
        );
      })}
    </nav>
  );
}

function NutritionInsightsPanel({ metrics, foods, stations, restaurants, onSelect }: {
  metrics: CoverageMetrics | null;
  foods: Food[];
  stations: StationMetric[];
  restaurants: RestaurantSummary[];
  onSelect: (food: Food) => void;
}) {
  const proteinEfficiency = foods
    .filter((food) => food.calories > 0 && food.protein > 0)
    .map((food) => ({ food, score: (food.protein / food.calories) * 100 }))
    .sort((a, b) => b.score - a.score || b.food.protein - a.food.protein)
    .slice(0, 5);

  return (
    <section className="panel nutrition-panel">
      <PanelHeader
        title="Nutrition Insights"
        subtitle="Compare dining options, restrictions, and macro value"
        icon={<BarChart3 size={18} />}
      />
      <div className="insight-canvas">
        <MacroBalance foods={foods} metrics={metrics} />
        <DiningFitMatrix restaurants={restaurants} stations={stations} metrics={metrics} />
        <ProteinScatter foods={foods} onSelect={onSelect} />
        <StationSafety foods={foods} />
      </div>
      <div className="protein-ranking" aria-label="Protein efficiency leaderboard">
        <div className="insight-section-title">
          <strong>Protein Efficiency</strong>
          <span>{proteinEfficiency.length ? 'Grams per 100 calories' : 'No ranking data'}</span>
        </div>
        {proteinEfficiency.length ? proteinEfficiency.map(({ food, score }, index) => (
          <button className="protein-row" type="button" key={food.id} onClick={() => onSelect(food)}>
            <span>{index + 1}</span>
            <div>
              <strong>{food.shortName}</strong>
              <small>{formatFoodContext(food)}</small>
            </div>
            <Badge tone="green">{round(score)} g</Badge>
          </button>
        )) : <EmptyState text="Nutrition rankings will appear when menu data is available." />}
      </div>
    </section>
  );
}

function MacroBalance({ foods, metrics }: { foods: Food[]; metrics: CoverageMetrics | null }) {
  const count = Math.max(1, foods.length);
  const averages = foods.reduce((sum, food) => {
    sum.calories += food.calories;
    sum.protein += food.protein;
    sum.carbs += food.totalCarbohydrates;
    sum.fat += food.totalFat;
    return sum;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const proteinCalories = (averages.protein / count) * 4;
  const carbCalories = (averages.carbs / count) * 4;
  const fatCalories = (averages.fat / count) * 9;
  const macroTotal = Math.max(1, proteinCalories + carbCalories + fatCalories);
  const proteinShare = Math.round((proteinCalories / macroTotal) * 100);
  const carbsShare = Math.round((carbCalories / macroTotal) * 100);
  const fatShare = Math.max(0, 100 - proteinShare - carbsShare);
  const avgCalories = metrics?.avg_calories ?? averages.calories / count;

  return (
    <div className="insight-card macro-balance" aria-label="Macro mix">
      <div className="insight-section-title">
        <strong>Macro Mix</strong>
        <span>Average item profile</span>
      </div>
      <div className="macro-visual">
        <div
          className="macro-donut"
          style={{ '--protein': `${proteinShare}%`, '--carbs': `${proteinShare + carbsShare}%` } as CSSProperties}
        >
          <strong>{round(avgCalories)}</strong>
          <span>cal</span>
        </div>
        <div className="macro-key">
          <MiniBar label="Protein" value={proteinShare} tone="protein" />
          <MiniBar label="Carbs" value={carbsShare} tone="carbs" />
          <MiniBar label="Fat" value={fatShare} tone="fat" />
        </div>
      </div>
    </div>
  );
}

function DiningFitMatrix({ restaurants, stations, metrics }: {
  restaurants: RestaurantSummary[];
  stations: StationMetric[];
  metrics: CoverageMetrics | null;
}) {
  const rows = restaurants.slice(0, 6).map((restaurant) => {
    const stationRows = stations.filter((station) => station.restaurantId === restaurant.id);
    const total = stationRows.reduce((sum, station) => sum + station.foodCount, 0) || restaurant.foods_count || 0;
    const vegan = stationRows.reduce((sum, station) => sum + station.veganItems, 0);
    const vegetarian = stationRows.reduce((sum, station) => sum + station.vegetarianItems, 0);
    const glutenFree = stationRows.reduce((sum, station) => sum + station.glutenFreeItems, 0);
    return {
      restaurant,
      total,
      vegan,
      vegetarian,
      glutenFree,
      fitScore: total ? Math.round(((vegetarian + vegan + glutenFree) / (total * 3)) * 100) : 0
    };
  });

  if (!rows.length && !metrics?.restaurants) {
    return <InsightEmpty title="Dining Fit" text="Restaurant comparison appears when menu data is available." />;
  }

  return (
    <div className="insight-card dining-fit" aria-label="Dining fit matrix">
      <div className="insight-section-title">
        <strong>Dining Fit</strong>
        <span>Diet-friendly options by restaurant</span>
      </div>
      <div className="fit-list">
        {rows.map((row) => (
          <div className="fit-row" key={row.restaurant.id}>
            <div>
              <strong>{row.restaurant.name}</strong>
              <small>{row.total} menu items</small>
            </div>
            <div className="fit-bars" aria-label={`${row.restaurant.name} fit score ${row.fitScore}%`}>
              <span className="fit-bar vegan" style={{ width: `${percentOf(row.vegan, row.total)}%` }} />
              <span className="fit-bar vegetarian" style={{ width: `${percentOf(row.vegetarian, row.total)}%` }} />
              <span className="fit-bar gf" style={{ width: `${percentOf(row.glutenFree, row.total)}%` }} />
            </div>
            <Badge tone={row.fitScore >= 50 ? 'green' : 'neutral'}>{row.fitScore}%</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProteinScatter({ foods, onSelect }: { foods: Food[]; onSelect: (food: Food) => void }) {
  const points = foods
    .filter((food) => food.calories > 0 && food.protein > 0)
    .map((food) => ({ food, score: food.protein / food.calories }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
  const maxCalories = Math.max(1, ...points.map((point) => point.food.calories));
  const maxProtein = Math.max(1, ...points.map((point) => point.food.protein));

  if (!points.length) {
    return <InsightEmpty title="Calories vs Protein" text="Protein value appears when nutrition data is available." />;
  }

  return (
    <div className="insight-card protein-map" aria-label="Calories versus protein">
      <div className="insight-section-title">
        <strong>Calories vs Protein</strong>
        <span>Upper left favors lean protein</span>
      </div>
      <div className="scatter-frame">
        <span className="scatter-axis x">Calories</span>
        <span className="scatter-axis y">Protein</span>
        {points.map(({ food }) => (
          <button
            key={`${food.id}-${food.restaurantName || ''}-${food.stationName || ''}`}
            className="scatter-point"
            type="button"
            title={`${food.shortName}: ${round(food.calories)} cal, ${round(food.protein)} g protein`}
            style={{
              left: `${Math.min(94, Math.max(4, (food.calories / maxCalories) * 92))}%`,
              top: `${Math.min(90, Math.max(8, 94 - (food.protein / maxProtein) * 82))}%`
            }}
            onClick={() => onSelect(food)}
            aria-label={`${food.shortName}, ${round(food.calories)} calories, ${round(food.protein)} grams protein`}
          />
        ))}
      </div>
    </div>
  );
}

function StationSafety({ foods }: { foods: Food[] }) {
  const stationMap = foods.reduce((map, food) => {
    const stationName = food.stationName || food.mealName || 'Menu';
    const key = `${food.restaurantName || 'Restaurant'}:${stationName}`;
    const current = map.get(key) || {
      key,
      stationName,
      restaurantName: food.restaurantName || 'Restaurant',
      total: 0,
      unflagged: 0
    };
    current.total += 1;
    if (!hasAllergenFlag(food)) current.unflagged += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { key: string; stationName: string; restaurantName: string; total: number; unflagged: number }>());

  const rows = Array.from(stationMap.values())
    .filter((row) => row.total > 0)
    .sort((a, b) => percentOf(b.unflagged, b.total) - percentOf(a.unflagged, a.total) || b.total - a.total)
    .slice(0, 5);

  if (!rows.length) {
    return <InsightEmpty title="Allergen Flags" text="Allergen-aware station details appear with food data." />;
  }

  return (
    <div className="insight-card station-safety" aria-label="Allergen flag station comparison">
      <div className="insight-section-title">
        <strong>Allergen Flags</strong>
        <span>Stations with fewer flagged items</span>
      </div>
      <div className="safety-list">
        {rows.map((row) => {
          const unflaggedShare = percentOf(row.unflagged, row.total);
          return (
            <div className="safety-row" key={row.key}>
              <div>
                <strong>{row.stationName}</strong>
                <small>{row.restaurantName}</small>
              </div>
              <div className="safety-meter" aria-label={`${row.stationName} ${unflaggedShare}% without flagged allergens`}>
                <span style={{ width: `${unflaggedShare}%` }} />
              </div>
              <Badge tone={unflaggedShare >= 70 ? 'green' : 'gold'}>{unflaggedShare}%</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniBar({ label, value, tone }: { label: string; value: number; tone: 'protein' | 'carbs' | 'fat' }) {
  return (
    <div className="mini-bar">
      <span>{label}</span>
      <div className={`mini-track ${tone}`} aria-label={`${label} ${value}%`}>
        <span style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}

function InsightEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="insight-card">
      <div className="insight-section-title">
        <strong>{title}</strong>
        <span>No data yet</span>
      </div>
      <EmptyState text={text} />
    </div>
  );
}

function NoMenuState({ date, latestDate, loading, onUseLatest }: {
  date: string;
  latestDate: string;
  loading: boolean;
  onUseLatest: (date: string) => void;
}) {
  if (loading) return <LoadingState />;

  return (
    <div className="no-menu-state">
      <div className="no-menu-icon"><CalendarDays size={22} /></div>
      <div>
        <h3>No restaurants imported for {date ? formatShortDate(date) : 'this date'}.</h3>
        <p>Choose an imported service date to browse menus, nutrition details, favorites, and meal planning.</p>
      </div>
      {latestDate && latestDate !== date && (
        <button className="secondary-button" type="button" onClick={() => onUseLatest(latestDate)}>
          Use latest imported date
        </button>
      )}
    </div>
  );
}

function buildFilters(date: string, q: string, vegan: boolean, vegetarian: boolean, glutenFree: boolean, minProtein: string, maxCalories: string, allergenFree: string[]): FoodFilters {
  const filters: FoodFilters = { date };
  if (q && safeSearch.test(q)) filters.q = q;
  if (vegan) filters.vegan = true;
  if (vegetarian) filters.vegetarian = true;
  if (glutenFree) filters.glutenFree = true;
  if (minProtein) filters.minProtein = Number(minProtein);
  if (maxCalories) filters.maxCalories = Number(maxCalories);
  if (allergenFree.length) filters.allergenFree = allergenFree;
  return filters;
}

function upsertPlannedFood(profile: LocalProfile, date: string, restaurant: RestaurantSummary, meal: Meal, food: Food): LocalProfile {
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

function PanelHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon: ReactNode }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="panel-icon">{icon}</div>
    </div>
  );
}

function PlanSummaryBar(props: {
  profile: LocalProfile;
  totals: MacroTotals;
  onOpenSettings: () => void;
}) {
  return (
    <section className="plan-summary-bar" aria-label="Nutrition totals">
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

function MealPlanPanel(props: {
  meals: PlannedMeal[];
  itemCount: number;
  onQuantity: (mealId: string, foodId: number, quantity: number) => void;
  onRemoveFood: (mealId: string, foodId: number) => void;
  onRemoveMeal: (mealId: string) => void;
  onClearDay: () => void;
}) {
  return (
    <aside className="panel plan-panel" aria-label="Selected foods">
      <div className="panel-header selected-foods-header">
        <div>
          <h2>Selected Foods</h2>
          <Badge tone={props.itemCount ? 'green' : 'neutral'}>
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
            {meal.foods.map((item) => (
              <div className="planned-food" key={item.foodId}>
                <div>
                  <strong>{item.food.shortName}</strong>
                  <span>{round(item.food.calories * item.quantity)} cal</span>
                </div>
                <QuantityStepper
                  quantity={item.quantity}
                  onDecrease={() => item.quantity <= 0.25 ? props.onRemoveFood(meal.id, item.foodId) : props.onQuantity(meal.id, item.foodId, item.quantity - 0.25)}
                  onIncrease={() => props.onQuantity(meal.id, item.foodId, item.quantity + 0.25)}
                />
              </div>
            ))}
          </div>
        )) : <EmptyState text="Add foods from the menu to build a meal plan." />}
      </div>
      {props.meals.length > 0 && (
        <button className="secondary-button clear-day" type="button" onClick={props.onClearDay}>
          <Trash2 size={16} /> Clear today
        </button>
      )}
    </aside>
  );
}

function GoalSettingsDialog(props: {
  profile: LocalProfile;
  open: boolean;
  onClose: () => void;
  onChange: (patch: Partial<LocalProfile>) => void;
  onReset: () => void;
}) {
  if (!props.open) return null;

  return (
    <div className="modal-layer" role="presentation" onMouseDown={props.onClose}>
      <section
        className="goal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-dialog-title"
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

function FilterBar(props: {
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  minProtein: string;
  maxCalories: string;
  allergenFree: string[];
  onVegan: (value: boolean) => void;
  onVegetarian: (value: boolean) => void;
  onGlutenFree: (value: boolean) => void;
  onMinProtein: (value: string) => void;
  onMaxCalories: (value: string) => void;
  onAllergenFree: (value: string[]) => void;
}) {
  return (
    <div className="filters" aria-label="Food filters">
      <Toggle active={props.vegan} onClick={() => props.onVegan(!props.vegan)} icon={<Leaf size={15} />} label="Vegan" />
      <Toggle active={props.vegetarian} onClick={() => props.onVegetarian(!props.vegetarian)} icon={<Leaf size={15} />} label="Vegetarian" />
      <Toggle active={props.glutenFree} onClick={() => props.onGlutenFree(!props.glutenFree)} icon={<Check size={15} />} label="Gluten free" />
      <label>
        Protein
        <input type="number" min="0" max="200" value={props.minProtein} onChange={(event) => props.onMinProtein(event.target.value)} placeholder="min g" />
      </label>
      <label>
        Calories
        <input type="number" min="0" max="2000" value={props.maxCalories} onChange={(event) => props.onMaxCalories(event.target.value)} placeholder="max" />
      </label>
      <label>
        Avoid
        <select
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value && !props.allergenFree.includes(value)) props.onAllergenFree([...props.allergenFree, value]);
          }}
        >
          <option value="">Allergen...</option>
          {allergenOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      {props.allergenFree.map((allergen) => (
        <button className="chip" type="button" key={allergen} onClick={() => props.onAllergenFree(props.allergenFree.filter((item) => item !== allergen))}>
          {formatAllergen(allergen)} <X size={13} />
        </button>
      ))}
    </div>
  );
}

function StationFilter(props: {
  stations: Meal['stations'];
  selectedStationId: number | null;
  onSelect: (stationId: number | null) => void;
}) {
  const totalFoods = props.stations.reduce((sum, station) => sum + station.foods.length, 0);

  if (!props.stations.length) {
    return <div className="station-strip"><EmptyState text="No stations for this meal." /></div>;
  }

  return (
    <div className="station-strip" aria-label="Station filters">
      <button
        className={props.selectedStationId === null ? 'selected' : undefined}
        type="button"
        onClick={() => props.onSelect(null)}
      >
        <span>All stations</span>
        <Badge tone="neutral">{totalFoods}</Badge>
      </button>
      {props.stations.map((station) => (
        <button
          className={props.selectedStationId === station.id ? 'selected' : undefined}
          type="button"
          key={station.id}
          onClick={() => props.onSelect(props.selectedStationId === station.id ? null : station.id)}
        >
          <span>{formatStationName(station.name)}</span>
          <Badge tone="neutral">{station.foods.length}</Badge>
        </button>
      ))}
    </div>
  );
}

function Toggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button className={`toggle ${active ? 'active' : ''}`} type="button" onClick={onClick}>{icon}{label}</button>;
}

function FoodTable(props: {
  foods: Food[];
  favoriteIds: Set<number>;
  busy: boolean;
  onSelect: (food: Food) => void;
  onFavorite: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  if (!props.foods.length) return <EmptyState text="No foods match the current view." />;

  return (
    <div className="data-table-wrap food-table">
      <table className="data-table">
        <thead>
          <tr>
            <th>Food</th>
            <th>Station</th>
            <th>Dietary</th>
            <th>Calories</th>
            <th>Protein</th>
            <th>Carbs</th>
            <th>Fat</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {props.foods.map((food) => (
            <tr key={`${food.id}-${food.restaurantId || 'all'}-${food.stationName || food.mealName || 'food'}`}>
              <td data-label="Food">
                <div className="food-name-cell">
                  <button className="icon-button favorite-inline" type="button" disabled={props.busy} onClick={() => props.onFavorite(food)} aria-label={`${props.favoriteIds.has(food.id) ? 'Remove' : 'Add'} ${food.shortName} favorite`}>
                    <Star size={15} fill={props.favoriteIds.has(food.id) ? 'currentColor' : 'none'} />
                  </button>
                  <button className="link-button strong" type="button" onClick={() => props.onSelect(food)}>{food.shortName}</button>
                </div>
              </td>
              <td data-label="Station">{formatStationName(food.stationName || food.mealName || '-')}</td>
              <td data-label="Dietary"><Dietary food={food} /></td>
              <td className="macro-cell calories" data-label="Calories">{round(food.calories)}</td>
              <td className="macro-cell protein" data-label="Protein">{round(food.protein)} g</td>
              <td className="macro-cell carbs" data-label="Carbs">{round(food.totalCarbohydrates)} g</td>
              <td className="macro-cell fat" data-label="Fat">{round(food.totalFat)} g</td>
              <td className="row-actions" data-label="Actions">
                <button className="primary-row-button" type="button" disabled={props.busy} onClick={() => props.onAdd(food)}>
                  <Plus size={15} /> Add
                </button>
                <button className="icon-button" type="button" onClick={() => props.onSelect(food)} aria-label="Open nutrition details">
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NutritionDrawer(props: {
  food: Food | null;
  isFavorite: boolean;
  busy: boolean;
  onClose: () => void;
  onFavorite: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  const food = props.food;
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
            <button className="primary-button" type="button" disabled={props.busy} onClick={() => props.onAdd(food)}>
              <Plus size={16} /> Add to plan
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function FoodListItem({ food, actionLabel, onSelect, onAction }: {
  food: Food;
  actionLabel: string;
  onSelect: (food: Food) => void;
  onAction: (food: Food) => void;
}) {
  return (
    <div className="food-list-item">
      <div>
        <button className="link-button strong" type="button" onClick={() => onSelect(food)}>{food.shortName}</button>
        <span>{round(food.calories)} cal - {round(food.protein)} g protein</span>
      </div>
      <button className="secondary-button compact" type="button" onClick={() => onAction(food)}>
        <Plus size={14} /> {actionLabel}
      </button>
    </div>
  );
}

function Dietary({ food }: { food: Food }) {
  const hasAllergen = Object.values(food.allergens).some(Boolean);
  return (
    <div className="dietary">
      {food.vegan && <Badge tone="green">Vegan</Badge>}
      {!food.vegan && food.vegetarian && <Badge tone="green">Veg</Badge>}
      {food.glutenFree && <Badge tone="gold">GF</Badge>}
      {hasAllergen && <Badge tone="red">Allergen</Badge>}
      {!food.vegan && !food.vegetarian && !food.glutenFree && !hasAllergen && <span>-</span>}
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: 'green' | 'gold' | 'red' | 'neutral' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Goal({ label, tone, value, max, unit = '' }: { label: string; tone: MacroTone; value: number; max: number; unit?: string }) {
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

function GoalInput({ label, value, min, max, onChange }: {
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

function QuantityStepper({ quantity, onDecrease, onIncrease }: {
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

function MetricBlock({ label, tone, value }: { label: string; tone: MacroTone; value: string | number }) {
  return <div className={`metric-block ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function getMenuSubtitle(date: string, loading: boolean) {
  if (loading) return 'Fetching restaurants and foods';
  return date ? `No restaurants found for ${formatShortDate(date)}` : 'Choose a service date';
}

function LoadingState() {
  return <div className="empty"><Loader2 size={18} className="spin" /> Loading menu data...</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function calculateTotals(meals: PlannedMeal[]): MacroTotals {
  const totals = meals.reduce((sum, meal) => {
    for (const item of meal.foods) {
      sum.calories += item.food.calories * item.quantity;
      sum.protein += item.food.protein * item.quantity;
      sum.carbs += item.food.totalCarbohydrates * item.quantity;
      sum.fat += item.food.totalFat * item.quantity;
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

function resolveFoodSnapshot(food: Food, allFoods: Food[]) {
  return allFoods.find((item) => item.id === food.id) || food;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
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

function buildMealTabLabels(meals: Meal[]) {
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

function defaultMealTabLabel(meal: Meal): MealTabLabel {
  return {
    primary: meal.name || 'Meal window',
    secondary: formatMealWindow(meal)
  };
}

function formatMealWindow(meal: Pick<Meal, 'time_open' | 'time_closed'>) {
  return formatTimeRange(meal.time_open, meal.time_closed);
}

function formatPlannedMealWindow(meal: PlannedMeal) {
  return formatTimeRange(meal.timeOpen, meal.timeClosed);
}

function formatTime(value: string) {
  const parts = parseServiceDateTime(value);
  if (parts) return formatHourMinute(parts.hour, parts.minute);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatTimeRange(start: string, end: string) {
  const startText = formatTime(start);
  const endText = formatTime(end);
  const startParts = startText.match(/^(.+) (AM|PM)$/);
  const endParts = endText.match(/^(.+) (AM|PM)$/);
  if (startParts && endParts && startParts[2] === endParts[2]) {
    return `${startParts[1]} - ${endParts[1]} ${endParts[2]}`;
  }
  return `${startText} - ${endText}`;
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
}

function parseServiceDateTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!match) return null;
  const [, , , , hour, minute] = match;
  return {
    hour: Number(hour),
    minute: Number(minute)
  };
}

function formatHourMinute(hour24: number, minute: number) {
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatAllergen(value: string) {
  return value.replace('_', ' ');
}

function formatFoodContext(food: Food) {
  const primary = food.restaurantName || food.fullName;
  return food.stationName ? `${primary} - ${formatStationName(food.stationName)}` : primary;
}

function formatStationName(value: string) {
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

function formatSelectedCount(value: number) {
  return Number.isInteger(value) ? String(value) : String(round(value));
}

function round(value: number) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function percentOf(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function hasAllergenFlag(food: Food) {
  return Object.values(food.allergens).some(Boolean);
}

function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(THEME_STORAGE_ID);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function easternDateInput() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
