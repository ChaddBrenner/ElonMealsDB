import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Columns3Cog,
  Leaf,
  Loader2,
  Minus,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Download,
  LayoutGrid,
  List,
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
  getNutritionInsights,
  getRestaurants,
  getServiceDates,
  getStationMetrics
} from './api';
import {
  createDefaultProfile,
  loadLocalProfile,
  saveLocalProfile,
  type LocalProfile,
  type PlannedMeal,
  type SafetyPreferences
} from './localProfile';
import type {
  ConstraintCoverageInsight,
  CoverageMetrics,
  Food,
  InsightFood,
  Meal,
  MealWindowInsight,
  MenuResponse,
  NutritionInsights,
  RestaurantSummary,
  ServiceDateSummary,
  SpecialStationInsight,
  StationInsight,
  StationMetric
} from './types';

const safeSearch = /^[a-zA-Z0-9\s.'&()/,+-]{0,80}$/;
const allergenOptions = [
  ['soy', 'Soy'],
  ['milk', 'Milk'],
  ['wheat', 'Wheat'],
  ['egg', 'Egg'],
  ['sesame', 'Sesame'],
  ['fish', 'Fish'],
  ['peanut', 'Peanut'],
  ['tree_nut', 'Tree Nut']
] as const;

const allergenFieldMap: Record<string, keyof Food['allergens']> = {
  soy: 'soy',
  milk: 'milk',
  wheat: 'wheat',
  egg: 'egg',
  sesame: 'sesame',
  fish: 'fish',
  peanut: 'peanut',
  tree_nut: 'treeNut'
};

const THEME_STORAGE_ID = 'elonmealsdb.theme.v1';
const VISIBLE_COLUMNS_STORAGE_ID = 'elonmealsdb.visibleColumns.v1';
type ThemeMode = 'light' | 'dark';
type MacroTone = 'calories' | 'protein' | 'carbs' | 'fat';
type SortKey = 'calories' | 'protein' | 'carbs' | 'fat';
type SortDirection = 'asc' | 'desc';
type SortConfig = { key: SortKey; direction: SortDirection } | null;
type MenuViewMode = 'table' | 'overview';
type TableColumn = 'station' | 'dietary' | SortKey;
type VisibleColumns = Record<TableColumn, boolean>;
type RevealTarget = {
  foodId: number;
  restaurantId: number;
  mealId?: number | null;
  stationId?: number | null;
};
type TimelineWindow = Pick<MealWindowInsight, 'restaurantId' | 'restaurantName' | 'mealId' | 'mealName' | 'mealPeriod' | 'timeOpen' | 'timeClosed'>;
type MacroTrianglePoint = { x: number; y: number };

const macroTriangleVertices = {
  protein: { x: 50, y: 14 },
  carbs: { x: 12, y: 80 },
  fat: { x: 88, y: 80 }
} as const;

const sortableColumns: Array<{ key: SortKey; label: string }> = [
  { key: 'calories', label: 'Calories' },
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' }
];

const visibleColumnOptions: Array<{ key: TableColumn; label: string }> = [
  { key: 'station', label: 'Station' },
  { key: 'dietary', label: 'Dietary' },
  ...sortableColumns
];

const defaultVisibleColumns: VisibleColumns = {
  station: true,
  dietary: true,
  calories: true,
  protein: true,
  carbs: true,
  fat: true
};

export function App() {
  const [profile, setProfile] = useState<LocalProfile>(() => loadLocalProfile());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [date, setDate] = useState('');
  const [availableDates, setAvailableDates] = useState<ServiceDateSummary[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [metrics, setMetrics] = useState<CoverageMetrics | null>(null);
  const [nutritionInsights, setNutritionInsights] = useState<NutritionInsights | null>(null);
  const [stationMetrics, setStationMetrics] = useState<StationMetric[]>([]);
  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [activeMealId, setActiveMealId] = useState<number | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [vegan, setVegan] = useState(() => profile.safetyPreferences.safeModeEnabled ? profile.safetyPreferences.vegan : false);
  const [vegetarian, setVegetarian] = useState(() => profile.safetyPreferences.safeModeEnabled ? profile.safetyPreferences.vegetarian : false);
  const [glutenFree, setGlutenFree] = useState(() => profile.safetyPreferences.safeModeEnabled ? profile.safetyPreferences.glutenFree : false);
  const [allergenFree, setAllergenFree] = useState<string[]>(() => profile.safetyPreferences.safeModeEnabled ? profile.safetyPreferences.allergenFree : []);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>(() => loadVisibleColumns());
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [menuViewMode, setMenuViewMode] = useState<MenuViewMode>('table');
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [quickSearchFoods, setQuickSearchFoods] = useState<Food[]>([]);
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [quickSearchError, setQuickSearchError] = useState<string | null>(null);
  const [quickSearchIndex, setQuickSearchIndex] = useState(0);
  const [pendingReveal, setPendingReveal] = useState<RevealTarget | null>(null);
  const [highlightedFoodKey, setHighlightedFoodKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addFeedbackKey, setAddFeedbackKey] = useState('');
  const [planPulseKey, setPlanPulseKey] = useState('');
  const [selectedCountPulseKey, setSelectedCountPulseKey] = useState(0);
  const [summaryCompact, setSummaryCompact] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addFeedbackTimerRef = useRef<number | null>(null);
  const planPulseTimerRef = useRef<number | null>(null);
  const debouncedQuickSearchQuery = useDebouncedValue(quickSearchQuery.trim(), 180);
  const quickSearchShortcut = useMemo(() => getQuickSearchShortcut(), []);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || restaurants[0] || null;
  const activeMeal = menu?.meals.find((meal) => meal.id === activeMealId) || menu?.meals[0] || null;
  const menuMeals = menu?.meals || [];
  const mealTabLabels = useMemo(() => buildMealTabLabels(menu?.meals || []), [menu?.meals]);
  const todayMeals = useMemo(() => profile.meals.filter((meal) => meal.date === date), [profile.meals, date]);
  const totals = useMemo(() => calculateTotals(todayMeals), [todayMeals]);
  const plannedItemCount = useMemo(() => todayMeals.reduce((count, meal) => count + meal.foods.reduce((sum, food) => sum + food.quantity, 0), 0), [todayMeals]);
  const favoriteIds = useMemo(() => new Set(profile.favoriteFoods.map((favorite) => favorite.foodId)), [profile.favoriteFoods]);
  const stationSafeCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!activeMeal) return counts;
    for (const station of activeMeal.stations) {
      counts.set(station.id, filterFoodsForSafety(station.foods, vegan, vegetarian, glutenFree, allergenFree).length);
    }
    return counts;
  }, [activeMeal, allergenFree, glutenFree, vegan, vegetarian]);
  const safetyFilterActive = vegan || vegetarian || glutenFree || allergenFree.length > 0;
  const specialStationIds = useMemo(() => new Set((nutritionInsights?.specialStations || [])
    .filter((station) => station.restaurantId === selectedRestaurantId && station.mealId === activeMealId)
    .map((station) => station.stationId)), [activeMealId, nutritionInsights?.specialStations, selectedRestaurantId]);

  const menuFoods = useMemo(() => {
    if (!activeMeal || !selectedRestaurant) return [];
    return activeMeal.stations.flatMap((station) => station.foods.map((food) => ({
      ...food,
      stationId: station.id,
      stationName: station.name,
      mealName: activeMeal.name,
      mealId: activeMeal.id,
      mealTimeOpen: activeMeal.time_open,
      mealTimeClosed: activeMeal.time_closed,
      restaurantId: selectedRestaurant.id,
      restaurantName: selectedRestaurant.name
    })));
  }, [activeMeal, selectedRestaurant]);

  const sourceFoods = useMemo(() => filterFoodsForSafety(menuFoods, vegan, vegetarian, glutenFree, allergenFree), [allergenFree, glutenFree, menuFoods, vegan, vegetarian]);
  const tableFoods = useMemo(() => selectedStationId
    ? sourceFoods.filter((food) => food.stationId === selectedStationId)
    : sourceFoods, [sourceFoods, selectedStationId]);
  const sortedTableFoods = useMemo(() => sortFoods(tableFoods, sortConfig), [tableFoods, sortConfig]);
  const latestImportedDate = availableDates[0]?.serviceDate || '';

  useEffect(() => {
    saveLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_ID, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(VISIBLE_COLUMNS_STORAGE_ID, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickSearchOpen(true);
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    function handleScroll() {
      const nextCompact = window.scrollY > 88;
      setSummaryCompact((current) => current === nextCompact ? current : nextCompact);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    function useCompactMenu(event?: MediaQueryListEvent) {
      if ((event?.matches ?? query.matches)) setMenuViewMode('overview');
    }

    useCompactMenu();
    query.addEventListener('change', useCompactMenu);
    return () => query.removeEventListener('change', useCompactMenu);
  }, []);

  useEffect(() => {
    return () => {
      if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);
      if (planPulseTimerRef.current) window.clearTimeout(planPulseTimerRef.current);
    };
  }, []);

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
    setNutritionInsights(null);
    setStationMetrics([]);
    setAllFoods([]);
  }, [date]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([
      getRestaurants(date),
      getCoverageMetrics(date),
      getStationMetrics(date),
      getNutritionInsights(date),
      getFoods({ date })
    ])
      .then(([restaurantsResponse, metricsResponse, stationMetricsResponse, nutritionInsightsResponse, allFoodsResponse]) => {
        if (!active) return;
        setRestaurants(restaurantsResponse.restaurants);
        setMetrics(metricsResponse);
        setStationMetrics(stationMetricsResponse.stations);
        setNutritionInsights(nutritionInsightsResponse);
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
    if (!quickSearchOpen || !date) {
      setQuickSearchLoading(false);
      return;
    }

    if (!debouncedQuickSearchQuery) {
      setQuickSearchFoods([]);
      setQuickSearchError(null);
      setQuickSearchLoading(false);
      return;
    }

    if (!safeSearch.test(debouncedQuickSearchQuery)) {
      setQuickSearchFoods([]);
      setQuickSearchError('Search accepts letters, numbers, spaces, and basic punctuation only.');
      setQuickSearchLoading(false);
      return;
    }

    let active = true;
    setQuickSearchLoading(true);
    setQuickSearchError(null);

    getFoods({ date, q: debouncedQuickSearchQuery })
      .then((response) => active && setQuickSearchFoods(response.foods))
      .catch((caught: Error) => active && setQuickSearchError(caught.message))
      .finally(() => active && setQuickSearchLoading(false));

    return () => {
      active = false;
    };
  }, [date, quickSearchOpen, debouncedQuickSearchQuery]);

  useEffect(() => {
    setQuickSearchIndex(0);
  }, [debouncedQuickSearchQuery, quickSearchFoods.length]);

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

  useEffect(() => {
    if (!pendingReveal || !menu || selectedRestaurantId !== pendingReveal.restaurantId) return;

    if (pendingReveal.mealId && menu.meals.some((meal) => meal.id === pendingReveal.mealId) && activeMealId !== pendingReveal.mealId) {
      setActiveMealId(pendingReveal.mealId);
      return;
    }

    if (pendingReveal.stationId !== undefined) {
      setSelectedStationId(pendingReveal.stationId || null);
    }

    const target = pendingReveal;
    const nextHighlight = revealTargetKey(target);
    setHighlightedFoodKey(nextHighlight);
    setPendingReveal(null);

    window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-food-key="${nextHighlight}"]`);
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);

    const timer = window.setTimeout(() => setHighlightedFoodKey(''), 2200);
    return () => window.clearTimeout(timer);
  }, [activeMealId, menu, pendingReveal, selectedRestaurantId]);

  function updateProfile(patch: Partial<LocalProfile>) {
    setProfile((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    }));
  }

  function updateSafetyPreferences(patch: Partial<Omit<SafetyPreferences, 'safeModeEnabled'>>) {
    if (patch.vegan !== undefined) setVegan(patch.vegan);
    if (patch.vegetarian !== undefined) setVegetarian(patch.vegetarian);
    if (patch.glutenFree !== undefined) setGlutenFree(patch.glutenFree);
    if (patch.allergenFree !== undefined) setAllergenFree(patch.allergenFree);

    setProfile((current) => ({
      ...current,
      safetyPreferences: {
        ...current.safetyPreferences,
        ...patch,
        safeModeEnabled: true
      },
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
    const context = buildFoodPlanContext(food, date, stationMetrics, selectedRestaurant, activeMeal);
    if (!context) {
      setError('Choose a restaurant and meal before adding food.');
      return;
    }
    const feedbackKey = foodIdentityKey(food);
    setAddFeedbackKey(feedbackKey);
    setPlanPulseKey(feedbackKey);
    setSelectedCountPulseKey((current) => current + 1);
    if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);
    if (planPulseTimerRef.current) window.clearTimeout(planPulseTimerRef.current);
    addFeedbackTimerRef.current = window.setTimeout(() => setAddFeedbackKey(''), 680);
    planPulseTimerRef.current = window.setTimeout(() => setPlanPulseKey(''), 880);
    setBusy(true);
    setProfile((current) => upsertPlannedFood(current, date, context.restaurant, context.meal, food));
    window.setTimeout(() => setBusy(false), 120);
  }

  function revealFood(food: Food) {
    setQuickSearchOpen(false);
    if (!food.restaurantId) {
      setSelectedFood(food);
      return;
    }

    const target = {
      foodId: food.id,
      restaurantId: food.restaurantId,
      mealId: food.mealId || null,
      stationId: food.stationId || null
    };
    setPendingReveal(target);
    setSelectedRestaurantId(food.restaurantId);
    if (selectedRestaurantId === food.restaurantId) {
      if (food.mealId) setActiveMealId(food.mealId);
      if (food.stationId !== undefined) setSelectedStationId(food.stationId || null);
    }
  }

  function toggleVisibleColumn(column: TableColumn, visible: boolean) {
    setVisibleColumns((current) => ({ ...current, [column]: visible }));
    setSortConfig((current) => current?.key === column && !visible ? null : current);
  }

  function cycleSort(column: SortKey) {
    setSortConfig((current) => {
      if (!current || current.key !== column) return { key: column, direction: 'asc' };
      if (current.direction === 'asc') return { key: column, direction: 'desc' };
      return null;
    });
  }

  function openQuickSearch() {
    setQuickSearchOpen(true);
  }

  function closeQuickSearch() {
    setQuickSearchOpen(false);
    setQuickSearchError(null);
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

  function exportTodayPlanCsv() {
    if (!todayMeals.length) return;
    downloadTextFile(`elonmealsdb-${date || 'meal-plan'}.csv`, buildMealPlanCsv(todayMeals, totals));
  }

  function resetLocalProfile() {
    const nextProfile = createDefaultProfile();
    setProfile(nextProfile);
    setVegan(false);
    setVegetarian(false);
    setGlutenFree(false);
    setAllergenFree([]);
  }

  return (
    <div className="product-shell" data-theme={theme}>
      <main>
        <header className="topbar">
          <div className="brand compact-brand">
            <BrandLogo />
            <div>
              <strong>ElonMealsDB</strong>
            </div>
          </div>
          <label className="field date-field">
            <input type="date" value={date} aria-label="Date" onChange={(event) => setDate(event.target.value)} />
          </label>
          <button
            className="search-field quick-search-trigger"
            type="button"
            onClick={openQuickSearch}
            aria-label="Search all foods"
          >
            <Search size={18} />
            <span>Search foods, ingredients, stations...</span>
            <kbd>{quickSearchShortcut}</kbd>
          </button>
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

        <PlanSummaryBar
          compact={summaryCompact}
          profile={profile}
          totals={totals}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <RestaurantTimelineTabs
          restaurants={restaurants}
          mealWindows={nutritionInsights?.mealWindows || []}
          selectedRestaurantId={selectedRestaurantId}
          loading={loading}
          onSelect={setSelectedRestaurantId}
        />

        <section className={`planner-grid ${menuViewMode === 'overview' ? 'overview-mode' : ''}`}>
          <section className="panel menu-panel" id="menu">
            {selectedRestaurant ? (
              <>
                <div className="meal-tabs" role="tablist" aria-label="Meals">
                  {menuMeals.map((meal, index) => {
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
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => setActiveMealId(meal.id)}
                        onKeyDown={(event) => handleTabKeyDown(event, menuMeals.length, index, (nextIndex) => setActiveMealId(menuMeals[nextIndex]?.id || null))}
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
                  specialStationIds={specialStationIds}
                  showSafeCounts={safetyFilterActive}
                  safeCounts={stationSafeCounts}
                  visibleFoodCount={sourceFoods.length}
                  onSelect={setSelectedStationId}
                />
                <div className="food-workspace">
                  <FilterBar
                    viewMode={menuViewMode}
                    vegan={vegan}
                    vegetarian={vegetarian}
                    glutenFree={glutenFree}
                    allergenFree={allergenFree}
                    visibleColumns={visibleColumns}
                    onViewMode={setMenuViewMode}
                    onVegan={(value) => updateSafetyPreferences({ vegan: value })}
                    onVegetarian={(value) => updateSafetyPreferences({ vegetarian: value })}
                    onGlutenFree={(value) => updateSafetyPreferences({ glutenFree: value })}
                    onAllergenFree={(value) => updateSafetyPreferences({ allergenFree: value })}
                    onVisibleColumn={toggleVisibleColumn}
                  />
                  {loading || !menu ? <LoadingState /> : (
                    menuViewMode === 'overview' ? (
                      <FoodOverview
                        stations={activeMeal?.stations || []}
                        selectedStationId={selectedStationId}
                        vegan={vegan}
                        vegetarian={vegetarian}
                        glutenFree={glutenFree}
                        allergenFree={allergenFree}
                        specialStationIds={specialStationIds}
                        busy={busy}
                        feedbackKey={addFeedbackKey}
                        onSelect={setSelectedFood}
                        onAdd={addFoodToPlan}
                      />
                    ) : (
                      <FoodTable
                        foods={sortedTableFoods}
                        favoriteIds={favoriteIds}
                        visibleColumns={visibleColumns}
                        specialStationIds={specialStationIds}
                        sortConfig={sortConfig}
                        highlightedFoodKey={highlightedFoodKey}
                        busy={busy}
                        feedbackKey={addFeedbackKey}
                        onSelect={setSelectedFood}
                        onFavorite={toggleFavorite}
                        onAdd={addFoodToPlan}
                        onSort={cycleSort}
                      />
                    )
                  )}
                </div>
              </>
            ) : (
              <>
                <PanelHeader
                  title={loading ? 'Loading menu' : 'No menu imported'}
                  subtitle={getMenuSubtitle(date, loading)}
                  icon={<Soup size={18} />}
                />
                <NoMenuState
                  date={date}
                  latestDate={latestImportedDate}
                  loading={loading}
                  onUseLatest={setDate}
                />
              </>
            )}
          </section>

          <MealPlanPanel
            meals={todayMeals}
            itemCount={plannedItemCount}
            pulseFoodKey={planPulseKey}
            countPulseKey={selectedCountPulseKey}
            onQuantity={updatePlannedQuantity}
            onRemoveFood={removePlannedFood}
            onRemoveMeal={removePlannedMeal}
            onClearDay={clearToday}
            onExport={exportTodayPlanCsv}
          />
        </section>

        <NutritionInsightsPanel
          metrics={metrics}
          insights={nutritionInsights}
          activeMealId={activeMealId}
          onSelect={setSelectedFood}
        />

        <section className="lower-grid">
          <FavoritesPanel
            favorites={profile.favoriteFoods}
            allFoods={allFoods}
            favoriteIds={favoriteIds}
            busy={busy}
            feedbackKey={addFeedbackKey}
            onSelect={setSelectedFood}
            onFavorite={toggleFavorite}
            onAdd={addFoodToPlan}
          />
        </section>
      </main>

      <GlobalSearchDialog
        open={quickSearchOpen}
        query={quickSearchQuery}
        results={quickSearchFoods}
        loading={quickSearchLoading}
        error={quickSearchError}
        activeIndex={quickSearchIndex}
        busy={busy}
        feedbackKey={addFeedbackKey}
        shortcut={quickSearchShortcut}
        onQuery={setQuickSearchQuery}
        onClose={closeQuickSearch}
        onActiveIndex={setQuickSearchIndex}
        onReveal={revealFood}
        onAdd={addFoodToPlan}
      />

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
        feedbackKey={addFeedbackKey}
        onClose={() => setSelectedFood(null)}
        onFavorite={toggleFavorite}
        onAdd={addFoodToPlan}
      />
    </div>
  );
}

function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 40 40" role="img" aria-label="ElonMealsDB logo">
      <rect className="brand-logo-bg" x="2" y="2" width="36" height="36" rx="8" />
      <path className="brand-logo-database" d="M12 12.8c0-2.2 3.6-4 8-4s8 1.8 8 4v13.8c0 2.2-3.6 4-8 4s-8-1.8-8-4V12.8Z" />
      <path className="brand-logo-database-line" d="M12 12.8c0 2.2 3.6 4 8 4s8-1.8 8-4M12 19.5c0 2.2 3.6 4 8 4s8-1.8 8-4" />
      <path className="brand-logo-utensil" d="M14.5 8.8v6.6M16.4 8.8v6.6M18.3 8.8v6.6M16.4 15.4v13.2M25.8 8.7c2.1 2.2 2 6.8-1 8.9v10.9" />
    </svg>
  );
}

function RestaurantTimelineTabs(props: {
  restaurants: RestaurantSummary[];
  mealWindows: MealWindowInsight[];
  selectedRestaurantId: number | null;
  loading: boolean;
  onSelect: (restaurantId: number) => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  if (props.loading && !props.restaurants.length) {
    return (
      <div className="restaurant-timeline loading" aria-label="Restaurants">
        <span>Loading restaurants...</span>
      </div>
    );
  }

  if (!props.restaurants.length) {
    return (
      <div className="restaurant-timeline empty-tabs" aria-label="Restaurants">
        <span>No restaurants imported for this date</span>
      </div>
    );
  }

  const windows = buildTimelineWindows(props.restaurants, props.mealWindows);
  const minutes = windows.flatMap((window) => [timelineMinute(window.timeOpen), timelineMinute(window.timeClosed)])
    .filter((value): value is number => value !== null);
  const startMinute = Math.max(0, Math.min(...minutes, 7 * 60) - 30);
  const endMinute = Math.min(24 * 60, Math.max(...minutes, 20 * 60) + 30);
  const span = Math.max(60, endMinute - startMinute);
  const serviceDate = props.mealWindows[0]?.serviceDate || props.restaurants[0]?.service_date || '';
  const nowMinute = serviceDate === easternDateInput(now) ? easternMinute(now) : null;
  const nowOffset = nowMinute !== null && nowMinute >= startMinute && nowMinute <= endMinute
    ? ((nowMinute - startMinute) / span) * 100
    : null;

  return (
    <nav className="restaurant-timeline" role="tablist" aria-label="Restaurants">
      <div className="timeline-scale" aria-hidden="true">
        <span>{formatTimelineMinute(startMinute)}</span>
        <span>{formatTimelineMinute(Math.round((startMinute + endMinute) / 2))}</span>
        <span>{formatTimelineMinute(endMinute)}</span>
      </div>
      {props.restaurants.map((restaurant, index) => {
        const restaurantWindows = windows.filter((window) => window.restaurantId === restaurant.id);
        const isSelected = restaurant.id === props.selectedRestaurantId;
        const timelineStatus = getRestaurantTimelineStatus(restaurantWindows, nowMinute);
        return (
          <button
            key={restaurant.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="menu"
            tabIndex={isSelected ? 0 : -1}
            className={`timeline-restaurant ${isSelected ? 'selected' : ''}`}
            onClick={() => props.onSelect(restaurant.id)}
            onKeyDown={(event) => handleTabKeyDown(event, props.restaurants.length, index, (nextIndex) => props.onSelect(props.restaurants[nextIndex].id))}
          >
            <span className="timeline-restaurant-identity">
              <span className={`timeline-status-dot ${timelineStatus.tone}`} title={timelineStatus.label} aria-hidden="true" />
              <span className="timeline-restaurant-name">{restaurant.name}</span>
            </span>
            <span className="timeline-track" aria-label={`${restaurant.name} ${timelineStatus.label}, ${timelineStatus.detail}`}>
              {restaurantWindows.map((window) => {
                const leftMinute = timelineMinute(window.timeOpen);
                const rightMinute = timelineMinute(window.timeClosed);
                if (leftMinute === null || rightMinute === null) return null;
                const left = ((leftMinute - startMinute) / span) * 100;
                const rawWidth = ((rightMinute - leftMinute) / span) * 100;
                const width = Math.max(3, rawWidth);
                const segmentLabel = getTimelineSegmentLabel(window.mealPeriod, rawWidth);
                return (
                  <span
                    className={`timeline-window ${window.mealPeriod.toLowerCase()} ${segmentLabel ? '' : 'compact'}`}
                    key={`${window.restaurantId}:${window.mealId}`}
                    style={{ left: `${Math.max(0, Math.min(100, left))}%`, width: `${Math.min(100, width)}%` }}
                    title={`${window.mealPeriod}: ${formatTimeRange(window.timeOpen, window.timeClosed)}`}
                  >
                    <span>{segmentLabel}</span>
                  </span>
                );
              })}
              {nowOffset !== null && (
                <span
                  className="timeline-now-line"
                  style={{ left: `${nowOffset}%` }}
                  title={`Now: ${formatTimelineMinute(nowMinute ?? 0)}`}
                  aria-hidden="true"
                />
              )}
            </span>
            <small className="timeline-status-text">{timelineStatus.detail}</small>
          </button>
        );
      })}
    </nav>
  );
}

function LegacyRestaurantTabs(props: {
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
      {props.restaurants.map((restaurant, index) => {
        const isSelected = restaurant.id === props.selectedRestaurantId;
        return (
          <button
            key={restaurant.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="menu"
            tabIndex={isSelected ? 0 : -1}
            className={isSelected ? 'selected' : undefined}
            onClick={() => props.onSelect(restaurant.id)}
            onKeyDown={(event) => handleTabKeyDown(event, props.restaurants.length, index, (nextIndex) => props.onSelect(props.restaurants[nextIndex].id))}
          >
            <span>{restaurant.name}</span>
            <small>{restaurant.foods_count} foods · {restaurant.meals_count} meals</small>
          </button>
        );
      })}
    </nav>
  );
}

function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, count: number, currentIndex: number, onSelectIndex: (index: number) => void) {
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

function NutritionInsightsPanel({ metrics, insights, activeMealId, onSelect }: {
  metrics: CoverageMetrics | null;
  insights: NutritionInsights | null;
  activeMealId: number | null;
  onSelect: (food: Food) => void;
}) {
  const stationConstraints = insights?.stationConstraints.filter((station) => !activeMealId || station.mealId === activeMealId) || [];
  const stationFingerprints = insights?.stationMacroFingerprints.filter((station) => !activeMealId || station.mealId === activeMealId) || [];

  return (
    <section className="panel nutrition-panel">
      <PanelHeader
        title="Nutrition Insights"
        subtitle=""
        icon={<BarChart3 size={18} />}
      />
      <div className="insight-canvas">
        <ProteinScatter foods={insights?.proteinScatter || []} onSelect={onSelect} />
        <MacroTriangle foods={insights?.macroFoods || []} onSelect={onSelect} />
        <StationConstraintHeatmap stations={stationConstraints} />
        <StationMacroFingerprints stations={stationFingerprints} />
      </div>
      <div className="insight-tables">
        <ProteinEfficiencyTable foods={insights?.proteinEfficiency || []} onSelect={onSelect} />
        <SodiumOutliersTable foods={insights?.sodiumOutliers || []} onSelect={onSelect} />
        <ConstraintCoverageTable rows={insights?.constraintCoverage || []} />
      </div>
    </section>
  );
}

function ProteinScatter({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  const points = foods.filter((food) => nutritionValue(food.calories) > 0 && nutritionValue(food.protein) > 0).slice(0, 36);
  const maxCalories = Math.max(1, ...points.map((food) => nutritionValue(food.calories)));
  const maxProtein = Math.max(1, ...points.map((food) => nutritionValue(food.protein)));

  if (!points.length) {
    return <InsightEmpty title="Protein Value Scatter" text="Protein value appears when nutrition data is available." />;
  }

  return (
    <div className="insight-card protein-map" aria-label="Protein value scatter">
      <div className="insight-section-title">
        <strong>Protein Value Scatter</strong>
        <span>Lean choices rise toward the upper left</span>
      </div>
      <div className="chart-legend diet-legend" aria-hidden="true">
        <span className="diet-dot vegan" /> Vegan
        <span className="diet-dot vegetarian" /> Vegetarian
        <span className="diet-dot omnivore" /> Omnivore
      </div>
      <div className="scatter-frame">
        <span className="scatter-axis x">Calories</span>
        <span className="scatter-axis y">Protein</span>
        {points.map((food, index) => {
          const calories = nutritionValue(food.calories);
          const protein = nutritionValue(food.protein);
          return (
            <button
              key={foodRenderKey(food, index)}
              className={`scatter-point ${dietClass(food.dietGroup)}`}
              type="button"
              title={`${food.shortName}: ${round(calories)} cal, ${round(protein)} g protein`}
              style={{
                left: `${Math.min(94, Math.max(5, (calories / maxCalories) * 91))}%`,
                top: `${Math.min(90, Math.max(8, 94 - (protein / maxProtein) * 82))}%`
              }}
              onClick={() => onSelect(food)}
              aria-label={`${food.shortName}, ${round(calories)} calories, ${round(protein)} grams protein`}
            >
              <span>{food.shortName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MacroTriangle({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  const points = foods.filter((food) => food.macroTotalCalories > 0).slice(0, 42);

  if (!points.length) {
    return <InsightEmpty title="Macro Triangle" text="Macro balance appears when nutrition data is available." />;
  }

  return (
    <div className="insight-card macro-triangle-card" aria-label="Macro triangle">
      <div className="insight-section-title">
        <strong>Macro Triangle</strong>
        <span>Where each item leans by calories</span>
      </div>
      <div className="macro-triangle-frame">
        <div className="macro-triangle-plot">
          <svg
            className="macro-triangle-bg"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <polygon
              className="triangle-shell"
              points={`${macroTriangleVertices.protein.x},${macroTriangleVertices.protein.y} ${macroTriangleVertices.carbs.x},${macroTriangleVertices.carbs.y} ${macroTriangleVertices.fat.x},${macroTriangleVertices.fat.y}`}
            />
          </svg>
          <span className="triangle-label protein" aria-hidden="true">Protein</span>
          <span className="triangle-label carbs" aria-hidden="true">Carbs</span>
          <span className="triangle-label fat" aria-hidden="true">Fat</span>
          <div className="macro-triangle-points">
            {points.map((food, index) => {
              const position = macroTrianglePosition(food);
              const { proteinShare, carbShare, fatShare } = macroTriangleShares(food);
              return (
                <button
                  key={foodRenderKey(food, index)}
                  className={`scatter-point triangle-point ${position.x > 68 ? 'label-left' : ''} ${dietClass(food.dietGroup)}`}
                  type="button"
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  title={`${food.shortName}: ${percentText(proteinShare)} protein, ${percentText(carbShare)} carbs, ${percentText(fatShare)} fat`}
                  onClick={() => onSelect(food)}
                  aria-label={`${food.shortName}: ${percentText(proteinShare)} protein, ${percentText(carbShare)} carbs, ${percentText(fatShare)} fat`}
                >
                  <span>{food.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StationConstraintHeatmap({ stations }: { stations: StationInsight[] }) {
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const columns: Array<{ key: keyof StationInsight; label: string }> = [
    { key: 'vegetarianShare', label: 'Veg' },
    { key: 'veganShare', label: 'Vegan' },
    { key: 'glutenFreeShare', label: 'GF' },
    { key: 'noTop9Share', label: 'No Top-9' },
    { key: 'milkFreeShare', label: 'Milk Free' },
    { key: 'wheatFreeShare', label: 'Wheat Free' },
    { key: 'soyFreeShare', label: 'Soy Free' },
    { key: 'eggFreeShare', label: 'Egg Free' }
  ];

  if (!stations.length) {
    return <InsightEmpty title="Station Constraint Heatmap" text="Constraint coverage appears for the selected meal." />;
  }

  return (
    <div className="insight-card heatmap-card" aria-label="Station constraint heatmap">
      <div className="insight-section-title">
        <strong>Station Constraint Heatmap</strong>
        <span>Selected meal only</span>
      </div>
      <div className="constraint-heatmap" style={{ '--constraint-columns': columns.length } as CSSProperties}>
        <div className="heatmap-station-heading">Station</div>
        {columns.map((column) => <div className="heatmap-column-heading" key={column.label}>{column.label}</div>)}
        {stations.map((station) => (
          <Fragment key={station.stationId}>
            <div className="heatmap-station-name">
              <strong>{formatStationName(station.stationName)}</strong>
              <small>{station.foodCount} foods</small>
            </div>
            {columns.map((column) => {
              const value = Number(station[column.key] || 0);
              const cellKey = `${station.stationId}:${column.key}`;
              return (
                <span
                  className={`heatmap-cell ${activeCellKey === cellKey ? 'active' : ''}`}
                  key={cellKey}
                  style={{ background: heatmapColor(value) }}
                  tabIndex={0}
                  title={`${formatStationName(station.stationName)} ${column.label}: ${percentText(value)}`}
                  aria-label={`${formatStationName(station.stationName)} ${column.label} ${percentText(value)}`}
                  onBlur={() => setActiveCellKey(null)}
                  onClick={() => setActiveCellKey(cellKey)}
                  onFocus={() => setActiveCellKey(cellKey)}
                  onMouseEnter={() => setActiveCellKey(cellKey)}
                  onMouseLeave={() => setActiveCellKey(null)}
                >
                  <span>{percentText(value)}</span>
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span>Fewer choices</span>
        <span />
        <span>More choices</span>
      </div>
    </div>
  );
}

function StationMacroFingerprints({ stations }: { stations: StationInsight[] }) {
  if (!stations.length) {
    return <InsightEmpty title="Station Macro Fingerprints" text="Station macro fingerprints appear for the selected meal." />;
  }

  return (
    <div className="insight-card station-fingerprints" aria-label="Station macro fingerprints">
      <div className="insight-section-title">
        <strong>Station Macro Fingerprints</strong>
        <span>Selected meal only</span>
      </div>
      <div className="fingerprint-list">
        {stations.map((station) => (
          <div className="fingerprint-row" key={station.stationId}>
            <div>
              <strong>{formatStationName(station.stationName)}</strong>
              <small>{round(station.avgProtein)} g avg protein</small>
            </div>
            <div className="fingerprint-bar" aria-label={`${formatStationName(station.stationName)} macro mix`}>
              <span className="protein" style={{ width: `${percentOf(station.proteinShare, 1)}%` }} />
              <span className="carbs" style={{ width: `${percentOf(station.carbShare, 1)}%` }} />
              <span className="fat" style={{ width: `${percentOf(station.fatShare, 1)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="macro-stack-legend" aria-hidden="true">
        <span className="protein" /> Protein
        <span className="carbs" /> Carbs
        <span className="fat" /> Fat
      </div>
    </div>
  );
}

function ProteinEfficiencyTable({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  return (
    <div className="insight-table-card" aria-label="Top Protein Efficiency">
      <div className="insight-section-title">
        <strong>Top Protein Efficiency</strong>
        <span>Exact grams per 100 calories</span>
      </div>
      {foods.length ? (
        <div className="insight-table-list">
          {foods.slice(0, 6).map((food, index) => (
            <button className="insight-table-row" type="button" key={foodRenderKey(food, index)} onClick={() => onSelect(food)}>
              <span className="protein-rank">{index + 1}</span>
              <div>
                <strong>{food.shortName}</strong>
                <small>{formatFoodContext(food)}</small>
              </div>
              <Badge tone="green">{round(food.proteinPer100Calories)} g</Badge>
            </button>
          ))}
        </div>
      ) : <EmptyState text="Protein rankings will appear when menu data is available." />}
    </div>
  );
}

function SodiumOutliersTable({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  return (
    <div className="insight-table-card" aria-label="Sodium Outliers">
      <div className="insight-section-title">
        <strong>Sodium Outliers</strong>
        <span>High sodium density items</span>
      </div>
      {foods.length ? (
        <div className="insight-table-list">
          {foods.slice(0, 6).map((food, index) => (
            <button className="insight-table-row sodium-row" type="button" key={foodRenderKey(food, index)} onClick={() => onSelect(food)}>
              <span className="protein-rank">{index + 1}</span>
              <div>
                <strong>{food.shortName}</strong>
                <small>{round(food.sodium)} mg sodium · {round(food.calories)} cal</small>
              </div>
              <Badge tone="gold">{round(food.sodiumPer100Calories)} mg</Badge>
            </button>
          ))}
        </div>
      ) : <EmptyState text="Sodium outliers will appear when sodium data is available." />}
    </div>
  );
}

function ConstraintCoverageTable({ rows }: { rows: ConstraintCoverageInsight[] }) {
  return (
    <div className="insight-table-card" aria-label="Constraint Coverage">
      <div className="insight-section-title">
        <strong>Constraint Coverage</strong>
        <span>Campus-wide menu coverage</span>
      </div>
      {rows.length ? (
        <div className="coverage-list">
          {rows.slice(0, 6).map((row) => (
            <div className="coverage-row" key={row.key}>
              <div>
                <strong>{row.label}</strong>
                <small>{row.count} of {row.total} foods</small>
              </div>
              <div className="coverage-meter" aria-label={`${row.label} ${percentText(row.share)}`}>
                <span style={{ width: `${percentOf(row.share, 1)}%` }} />
              </div>
              <Badge tone={row.share >= 0.45 ? 'green' : row.share >= 0.25 ? 'gold' : 'neutral'}>{percentText(row.share)}</Badge>
            </div>
          ))}
        </div>
      ) : <EmptyState text="Constraint coverage will appear when menu data is available." />}
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

function filterFoodsForSafety(foods: Food[], vegan: boolean, vegetarian: boolean, glutenFree: boolean, allergenFree: string[]) {
  return foods.filter((food) => (
    (!vegan || Boolean(food.vegan))
    && (!vegetarian || Boolean(food.vegetarian))
    && (!glutenFree || Boolean(food.glutenFree))
    && allergenFree.every((allergen) => !hasFoodAllergen(food, allergen))
  ));
}

function hasFoodAllergen(food: Food, allergen: string) {
  const field = allergenFieldMap[allergen];
  return field ? Boolean(food.allergens?.[field]) : false;
}

function buildFoodPlanContext(
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

function MealPlanPanel(props: {
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

function GoalSettingsDialog(props: {
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

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function trapFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null) {
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

function FilterBar(props: {
  viewMode: MenuViewMode;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  allergenFree: string[];
  visibleColumns: VisibleColumns;
  onViewMode: (mode: MenuViewMode) => void;
  onVegan: (value: boolean) => void;
  onVegetarian: (value: boolean) => void;
  onGlutenFree: (value: boolean) => void;
  onAllergenFree: (value: string[]) => void;
  onVisibleColumn: (column: TableColumn, visible: boolean) => void;
}) {
  return (
    <div className="filters" aria-label="Food filters">
      <Toggle active={props.vegan} onClick={() => props.onVegan(!props.vegan)} icon={<Leaf size={15} />} label="Vegan" />
      <Toggle active={props.vegetarian} onClick={() => props.onVegetarian(!props.vegetarian)} icon={<Leaf size={15} />} label="Vegetarian" />
      <Toggle active={props.glutenFree} onClick={() => props.onGlutenFree(!props.glutenFree)} icon={<Check size={15} />} label="Gluten free" />
      <label className="avoid-select">
        <select
          aria-label="Avoid allergens"
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value && !props.allergenFree.includes(value)) props.onAllergenFree([...props.allergenFree, value]);
          }}
        >
          <option value="">Avoid</option>
          {allergenOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      {props.allergenFree.map((allergen) => (
        <button className="chip allergen-chip" type="button" key={allergen} onClick={() => props.onAllergenFree(props.allergenFree.filter((item) => item !== allergen))}>
          {formatAllergen(allergen)} <X size={13} />
        </button>
      ))}
      <div className="filter-actions">
        <ViewModeToggle mode={props.viewMode} onMode={props.onViewMode} />
        {props.viewMode === 'table' && <ColumnPicker visibleColumns={props.visibleColumns} onVisibleColumn={props.onVisibleColumn} />}
      </div>
    </div>
  );
}

function ViewModeToggle({ mode, onMode }: { mode: MenuViewMode; onMode: (mode: MenuViewMode) => void }) {
  return (
    <div className="view-mode-toggle" role="group" aria-label="Menu view">
      <button
        className={mode === 'table' ? 'active' : undefined}
        type="button"
        onClick={() => onMode('table')}
        aria-pressed={mode === 'table'}
      >
        <List size={15} />
        <span>Table</span>
      </button>
      <button
        className={mode === 'overview' ? 'active' : undefined}
        type="button"
        onClick={() => onMode('overview')}
        aria-pressed={mode === 'overview'}
      >
        <LayoutGrid size={15} />
        <span>Overview</span>
      </button>
    </div>
  );
}

function ColumnPicker(props: {
  visibleColumns: VisibleColumns;
  onVisibleColumn: (column: TableColumn, visible: boolean) => void;
}) {
  return (
    <details className="column-picker">
      <summary aria-label="Choose table columns">
        <Columns3Cog size={15} />
        <span>Columns</span>
      </summary>
      <div className="column-menu" role="group" aria-label="Visible columns">
        {visibleColumnOptions.map((column) => (
          <label key={column.key}>
            <input
              type="checkbox"
              checked={props.visibleColumns[column.key]}
              onChange={(event) => props.onVisibleColumn(column.key, event.target.checked)}
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function StationFilter(props: {
  stations: Meal['stations'];
  selectedStationId: number | null;
  specialStationIds: Set<number>;
  showSafeCounts: boolean;
  safeCounts: Map<number, number>;
  visibleFoodCount: number;
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
        <Badge tone={props.showSafeCounts ? 'green' : 'neutral'}>
          {props.showSafeCounts ? `${props.visibleFoodCount}/${totalFoods} safe` : totalFoods}
        </Badge>
      </button>
      {props.stations.map((station) => (
        <button
          className={props.selectedStationId === station.id ? 'selected' : undefined}
          type="button"
          key={station.id}
          onClick={() => props.onSelect(props.selectedStationId === station.id ? null : station.id)}
        >
          <span>{formatStationName(station.name)}</span>
          {props.specialStationIds.has(station.id) && (
            <span className="station-special-badge" aria-label="Different today" title="This station is different today">Different today</span>
          )}
          <Badge tone={props.showSafeCounts ? 'green' : 'neutral'}>
            {props.showSafeCounts ? `${props.safeCounts.get(station.id) ?? 0}/${station.foods.length} safe` : station.foods.length}
          </Badge>
        </button>
      ))}
    </div>
  );
}

function Toggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button className={`toggle ${active ? 'active' : ''}`} type="button" onClick={onClick}>{icon}{label}</button>;
}

function AddFeedbackIcon({ active, size }: { active: boolean; size: number }) {
  return (
    <span className={`add-feedback-icon ${active ? 'is-added' : ''}`} aria-hidden="true">
      <Plus className="add-feedback-plus" size={size} />
      <Check className="add-feedback-check" size={size} />
    </span>
  );
}

function FoodOverview(props: {
  stations: Meal['stations'];
  selectedStationId: number | null;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  allergenFree: string[];
  specialStationIds: Set<number>;
  busy: boolean;
  feedbackKey: string;
  onSelect: (food: Food) => void;
  onAdd: (food: Food) => void;
}) {
  const stationGroups = props.stations
    .filter((station) => props.selectedStationId === null || station.id === props.selectedStationId)
    .map((station) => ({
      station,
      foods: filterFoodsForSafety(station.foods, props.vegan, props.vegetarian, props.glutenFree, props.allergenFree)
    }))
    .filter((group) => group.foods.length > 0);

  if (!stationGroups.length) return <EmptyState text="No foods match the current view." />;

  return (
    <div className="food-overview" aria-label="Food overview by station">
      {stationGroups.map(({ station, foods }) => (
        <section className="overview-station" key={station.id}>
          <div className="overview-station-heading">
            <strong>{formatStationName(station.name)}</strong>
            {props.specialStationIds.has(station.id) && (
              <span className="station-special-badge compact" title="This station is different today">Different today</span>
            )}
          </div>
          <div className="overview-food-list">
            {foods.map((food, index) => {
              const overviewFood = {
                ...food,
                stationId: station.id,
                stationName: station.name
              };
              const isAdded = props.feedbackKey === foodIdentityKey(overviewFood);
              return (
                <div className="overview-food-item" key={foodRenderKey(overviewFood, index)}>
                  <button
                    className="overview-food"
                    type="button"
                    onClick={() => props.onSelect(overviewFood)}
                    title={food.shortName}
                  >
                    {food.shortName}
                  </button>
                  <button
                    className={`overview-add-food add-action-button ${isAdded ? 'is-added' : ''}`}
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onAdd(overviewFood)}
                    aria-label={`Add ${food.shortName} to plan`}
                    title="Add to plan"
                  >
                    <AddFeedbackIcon active={isAdded} size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function FoodTable(props: {
  foods: Food[];
  favoriteIds: Set<number>;
  visibleColumns: VisibleColumns;
  specialStationIds: Set<number>;
  sortConfig: SortConfig;
  highlightedFoodKey: string;
  busy: boolean;
  feedbackKey: string;
  onSelect: (food: Food) => void;
  onFavorite: (food: Food) => void;
  onAdd: (food: Food) => void;
  onSort: (column: SortKey) => void;
}) {
  if (!props.foods.length) return <EmptyState text="No foods match the current view." />;

  return (
    <div className="data-table-wrap food-table">
      <div className="mobile-food-rows" aria-label="Compact food table">
        {props.foods.map((food, index) => {
          const identityKey = foodIdentityKey(food);
          const isAdded = props.feedbackKey === identityKey;
          return (
            <div
              className={`mobile-food-row ${props.highlightedFoodKey === identityKey ? 'highlighted-row' : ''}`}
              data-food-key={identityKey}
              key={`mobile:${foodRenderKey(food, index)}`}
            >
              <button className="icon-button favorite-inline" type="button" disabled={props.busy} onClick={() => props.onFavorite(food)} aria-label={`${props.favoriteIds.has(food.id) ? 'Remove' : 'Add'} ${food.shortName} favorite`}>
                <Star size={14} fill={props.favoriteIds.has(food.id) ? 'currentColor' : 'none'} />
              </button>
              <button className="link-button strong mobile-food-title" type="button" onClick={() => props.onSelect(food)}>{food.shortName}</button>
              <button className={`primary-row-button icon-only add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={() => props.onAdd(food)} aria-label={`Add ${food.shortName} to plan`} title="Add to plan">
                <AddFeedbackIcon active={isAdded} size={14} />
              </button>
              <div className="mobile-food-meta">
                <span className="mobile-station-name">
                  {formatStationName(food.stationName || food.mealName || '-')}
                  {food.stationId && props.specialStationIds.has(food.stationId) && (
                    <span className="station-special-badge compact" title="This station is different today">Different today</span>
                  )}
                </span>
                <Dietary food={food} />
              </div>
              <div className="mobile-food-macros" aria-label={`${food.shortName} nutrition summary`}>
                <span className="mobile-macro calories"><small>Cal</small>{round(food.calories)}</span>
                <span className="mobile-macro protein"><small>Pro</small>{round(food.protein)} g</span>
                <span className="mobile-macro carbs"><small>Carb</small>{round(food.totalCarbohydrates)} g</span>
                <span className="mobile-macro fat"><small>Fat</small>{round(food.totalFat)} g</span>
              </div>
            </div>
          );
        })}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Food</th>
            {props.visibleColumns.station && <th>Station</th>}
            {props.visibleColumns.dietary && <th>Dietary</th>}
            {sortableColumns.map((column) => props.visibleColumns[column.key] && (
              <SortableHeader
                key={column.key}
                column={column.key}
                label={column.label}
                sortConfig={props.sortConfig}
                onSort={props.onSort}
              />
            ))}
            <th className="row-actions-header" aria-label="Actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.foods.map((food, index) => {
            const identityKey = foodIdentityKey(food);
            const isAdded = props.feedbackKey === identityKey;
            return (
              <tr
                key={foodRenderKey(food, index)}
                className={props.highlightedFoodKey === identityKey ? 'highlighted-row' : undefined}
                data-food-key={identityKey}
              >
                <td data-label="Food">
                  <div className="food-name-cell">
                    <button className="icon-button favorite-inline" type="button" disabled={props.busy} onClick={() => props.onFavorite(food)} aria-label={`${props.favoriteIds.has(food.id) ? 'Remove' : 'Add'} ${food.shortName} favorite`}>
                      <Star size={15} fill={props.favoriteIds.has(food.id) ? 'currentColor' : 'none'} />
                    </button>
                    <button className="link-button strong" type="button" onClick={() => props.onSelect(food)}>{food.shortName}</button>
                  </div>
                </td>
                {props.visibleColumns.station && (
                  <td data-label="Station">
                    <span className="station-cell">
                      {formatStationName(food.stationName || food.mealName || '-')}
                      {food.stationId && props.specialStationIds.has(food.stationId) && (
                        <span className="station-special-badge compact" title="This station is different today">Different today</span>
                      )}
                    </span>
                  </td>
                )}
                {props.visibleColumns.dietary && <td data-label="Dietary"><Dietary food={food} /></td>}
                {props.visibleColumns.calories && <td className="macro-cell calories" data-label="Calories">{round(food.calories)}</td>}
                {props.visibleColumns.protein && <td className="macro-cell protein" data-label="Protein">{round(food.protein)} g</td>}
                {props.visibleColumns.carbs && <td className="macro-cell carbs" data-label="Carbs">{round(food.totalCarbohydrates)} g</td>}
                {props.visibleColumns.fat && <td className="macro-cell fat" data-label="Fat">{round(food.totalFat)} g</td>}
                <td className="row-actions" data-label="Actions">
                  <div className="row-actions-inner">
                    <button className={`primary-row-button icon-only add-action-button ${isAdded ? 'is-added' : ''}`} type="button" disabled={props.busy} onClick={() => props.onAdd(food)} aria-label={`Add ${food.shortName} to plan`} title="Add to plan">
                      <AddFeedbackIcon active={isAdded} size={15} />
                    </button>
                    <button className="icon-button" type="button" onClick={() => props.onSelect(food)} aria-label="Open nutrition details">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeader(props: {
  column: SortKey;
  label: string;
  sortConfig: SortConfig;
  onSort: (column: SortKey) => void;
}) {
  const direction = props.sortConfig?.key === props.column ? props.sortConfig.direction : null;
  const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';

  return (
    <th aria-sort={ariaSort}>
      <button
        className={`sort-header ${direction ? 'active' : ''}`}
        type="button"
        onClick={() => props.onSort(props.column)}
        aria-label={`Sort by ${props.label}${direction ? `, currently ${direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        <span>{props.label}</span>
        {direction === 'asc' ? <ArrowUp size={13} /> : direction === 'desc' ? <ArrowDown size={13} /> : <ArrowUpDown size={13} />}
      </button>
    </th>
  );
}

function NutritionDrawer(props: {
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

function GlobalSearchDialog(props: {
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

function FavoritesPanel(props: {
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

function FavoriteListItem(props: {
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

function Badge({ children, tone, className = '' }: { children: ReactNode; tone: 'green' | 'gold' | 'red' | 'neutral'; className?: string }) {
  return <span className={`badge ${tone} ${className}`.trim()}>{children}</span>;
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

function buildMealPlanCsv(meals: PlannedMeal[], planTotals: MacroTotals) {
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

function downloadTextFile(filename: string, text: string) {
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

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatServingSize(food: Food) {
  const amount = food.servingSizeAmount ? round(food.servingSizeAmount) : '';
  return [amount, food.servingSizeUnit].filter(Boolean).join(' ');
}

function formatFoodAllergens(food: Food) {
  return allergenOptions
    .filter(([value]) => hasFoodAllergen(food, value))
    .map(([, label]) => label)
    .join('; ');
}

function resolveFoodSnapshot(food: Food, allFoods: Food[]) {
  return allFoods.find((item) => item.id === food.id && (!food.restaurantId || item.restaurantId === food.restaurantId)) || food;
}

function sortFoods(foods: Food[], sortConfig: SortConfig) {
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

function getSortValue(food: Food, key: SortKey) {
  if (key === 'calories') return Number(food.calories || 0);
  if (key === 'protein') return Number(food.protein || 0);
  if (key === 'carbs') return Number(food.totalCarbohydrates || 0);
  return Number(food.totalFat || 0);
}

function findFoodMealWindow(food: Food, stationMetrics: StationMetric[]) {
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

function buildTimelineWindows(restaurants: RestaurantSummary[], mealWindows: MealWindowInsight[]): TimelineWindow[] {
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

function timelineMinute(value: string) {
  const parts = parseServiceDateTime(value);
  if (parts) return (parts.hour * 60) + parts.minute;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return (parsed.getHours() * 60) + parsed.getMinutes();
}

function formatTimelineMinute(value: number) {
  const safeValue = Math.max(0, Math.min(24 * 60, value));
  const hour = Math.floor(safeValue / 60);
  const minute = safeValue % 60;
  return formatHourMinute(hour, minute);
}

function formatTimelineRange(startMinute: number, endMinute: number) {
  const start = formatTimelineMinute(startMinute);
  const end = formatTimelineMinute(endMinute);
  const startParts = start.match(/^(.+) (AM|PM)$/);
  const endParts = end.match(/^(.+) (AM|PM)$/);
  if (startParts && endParts && startParts[2] === endParts[2]) {
    return `${startParts[1]} - ${endParts[1]} ${endParts[2]}`;
  }
  return `${start} - ${end}`;
}

function getTimelineSegmentLabel(mealPeriod: string, widthPercent: number) {
  if (widthPercent < 8) return '';
  return mealPeriod;
}

function getRestaurantTimelineStatus(windows: TimelineWindow[], nowMinute: number | null) {
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

function easternMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return (Number(values.hour || 0) * 60) + Number(values.minute || 0);
}

function dietClass(dietGroup: InsightFood['dietGroup']) {
  if (dietGroup === 'Vegan') return 'vegan';
  if (dietGroup === 'Vegetarian') return 'vegetarian';
  return 'omnivore';
}

function macroTrianglePosition(food: InsightFood) {
  const { proteinShare, carbShare, fatShare } = macroTriangleShares(food);
  const total = Math.max(0.001, proteinShare + carbShare + fatShare);
  return macroTrianglePointFromShares(proteinShare / total, carbShare / total, fatShare / total);
}

function macroTrianglePointFromShares(protein: number, carbs: number, fat: number): MacroTrianglePoint {
  return {
    x: (protein * macroTriangleVertices.protein.x) + (carbs * macroTriangleVertices.carbs.x) + (fat * macroTriangleVertices.fat.x),
    y: (protein * macroTriangleVertices.protein.y) + (carbs * macroTriangleVertices.carbs.y) + (fat * macroTriangleVertices.fat.y)
  };
}

function macroTriangleShares(food: InsightFood) {
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

function heatmapColor(value: number) {
  const clamped = Math.max(0, Math.min(1, Number(value || 0)));
  const hue = 5 + (clamped * 125);
  const saturation = 74 - (clamped * 10);
  const lightness = 88 - (clamped * 34);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function percentText(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value || 0))) * 100)}%`;
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
  if (!value) return '-';
  const parts = parseServiceDateTime(value);
  if (parts) return formatHourMinute(parts.hour, parts.minute);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
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
  return value
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatFoodContext(food: Food) {
  const primary = food.restaurantName || food.fullName;
  return food.stationName ? `${primary} - ${formatStationName(food.stationName)}` : primary;
}

function formatSearchLocation(food: Food) {
  const restaurant = food.restaurantName || 'Restaurant';
  const station = food.stationName ? formatStationName(food.stationName) : 'Menu';
  return `${restaurant} · ${station}`;
}

function formatSearchAvailability(food: Food) {
  const meal = food.mealName || 'Meal window';
  if (!food.mealTimeOpen || !food.mealTimeClosed) return meal;
  return `${meal} · ${formatTimeRange(food.mealTimeOpen, food.mealTimeClosed)}`;
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
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(Number(value || 0) * 100) / 100);
}

function foodRenderKey(food: Food, index: number) {
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

function foodIdentityKey(food: Food) {
  return [
    food.id,
    food.restaurantId || '',
    food.mealId || '',
    food.stationId || ''
  ].join(':');
}

function revealTargetKey(target: RevealTarget) {
  return [
    target.foodId,
    target.restaurantId || '',
    target.mealId || '',
    target.stationId || ''
  ].join(':');
}

function nutritionValue(value: number | null | undefined) {
  return Number(value || 0);
}

function round(value: number | null | undefined) {
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

function loadVisibleColumns(): VisibleColumns {
  if (typeof window === 'undefined') return defaultVisibleColumns;
  const raw = window.localStorage.getItem(VISIBLE_COLUMNS_STORAGE_ID);
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

function getQuickSearchShortcut() {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';
}

function easternDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
