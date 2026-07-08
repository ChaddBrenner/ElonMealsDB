import { useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Search, Soup, Sun, X } from 'lucide-react';
import { getFoods, getMenu, getNutritionInsights, getRestaurants, getServiceDates, getStationMetrics } from './api';
import { createDefaultProfile, loadLocalProfile, saveLocalProfile, type LocalProfile, type SafetyPreferences } from './localProfile';
import type { Food, MenuResponse, NutritionInsights, RestaurantSummary, ServiceDateSummary, StationMetric } from './types';
import { VISIBLE_COLUMNS_STORAGE_ID, THEME_STORAGE_ID, safeSearch, type MenuViewMode, type RevealTarget, type SortConfig, type SortKey, type TableColumn, type ThemeMode, type VisibleColumns } from './app/constants';
import { buildFoodPlanContext, buildMealPlanCsv, buildMealTabLabels, calculateTotals, defaultMealTabLabel, downloadTextFile, easternDateInput, filterFoodsForSafety, foodIdentityKey, getMenuSubtitle, getQuickSearchShortcut, handleTabKeyDown, loadTheme, loadVisibleColumns, revealTargetKey, sortFoods, upsertPlannedFood, useDebouncedValue } from './app/utils';
import { BrandLogo, LoadingState, PanelHeader } from './components/common';
import { RestaurantTimelineTabs } from './components/timeline';
import { NutritionInsightsPanel } from './components/insights';
import { NoMenuState } from './components/noMenu';
import { PlanSummaryBar, MealPlanPanel, GoalSettingsDialog } from './components/planner';
import { FilterBar, StationFilter } from './components/menuControls';
import { FoodOverview, FoodTable } from './components/foodViews';
import { FavoritesPanel, GlobalSearchDialog, NutritionDrawer } from './components/panels';

export function App() {
  const [profile, setProfile] = useState<LocalProfile>(() => loadLocalProfile());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [date, setDate] = useState('');
  const [availableDates, setAvailableDates] = useState<ServiceDateSummary[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
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
      getStationMetrics(date),
      getNutritionInsights(date),
      getFoods({ date })
    ])
      .then(([restaurantsResponse, stationMetricsResponse, nutritionInsightsResponse, allFoodsResponse]) => {
        if (!active) return;
        setRestaurants(restaurantsResponse.restaurants);
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
