import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Database,
  Filter,
  GitBranch,
  History,
  Leaf,
  Loader2,
  MapPin,
  Minus,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Soup,
  Star,
  Trash2,
  Utensils,
  X
} from 'lucide-react';
import {
  getCoverageMetrics,
  getFoods,
  getImportRuns,
  getMenu,
  getRestaurants,
  getServiceDates,
  getSqlProof,
  type FoodFilters
} from './api';
import {
  createDefaultProfile,
  loadLocalProfile,
  normalizeName,
  saveLocalProfile,
  type LocalProfile,
  type PlannedMeal
} from './localProfile';
import type { CoverageMetrics, Food, Meal, MenuResponse, RestaurantSummary, ScraperRun, ServiceDateSummary } from './types';
import type { SqlProofExample } from './types';

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

export function App() {
  const [profile, setProfile] = useState<LocalProfile>(() => loadLocalProfile());
  const [date, setDate] = useState('');
  const [availableDates, setAvailableDates] = useState<ServiceDateSummary[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [metrics, setMetrics] = useState<CoverageMetrics | null>(null);
  const [importRuns, setImportRuns] = useState<ScraperRun[]>([]);
  const [sqlProofExamples, setSqlProofExamples] = useState<SqlProofExample[]>([]);
  const [allFoods, setAllFoods] = useState<Food[]>([]);
  const [filteredFoods, setFilteredFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [activeMealId, setActiveMealId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [vegan, setVegan] = useState(false);
  const [vegetarian, setVegetarian] = useState(false);
  const [glutenFree, setGlutenFree] = useState(false);
  const [minProtein, setMinProtein] = useState('');
  const [maxCalories, setMaxCalories] = useState('');
  const [allergenFree, setAllergenFree] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || restaurants[0] || null;
  const activeMeal = menu?.meals.find((meal) => meal.id === activeMealId) || menu?.meals[0] || null;
  const todayMeals = useMemo(() => profile.meals.filter((meal) => meal.date === date), [profile.meals, date]);
  const totals = useMemo(() => calculateTotals(todayMeals), [todayMeals]);
  const favoriteIds = useMemo(() => new Set(profile.favoriteFoods.map((favorite) => favorite.foodId)), [profile.favoriteFoods]);
  const activeFilters = Boolean(query || vegan || vegetarian || glutenFree || minProtein || maxCalories || allergenFree.length);

  const menuFoods = useMemo(() => {
    if (!activeMeal || !selectedRestaurant) return [];
    return activeMeal.stations.flatMap((station) => station.foods.map((food) => ({
      ...food,
      stationName: station.name,
      mealName: activeMeal.name,
      restaurantId: selectedRestaurant.id,
      restaurantName: selectedRestaurant.name
    })));
  }, [activeMeal, selectedRestaurant]);

  const tableFoods = activeFilters ? filteredFoods : menuFoods;
  const historyMeals = useMemo(() => [...profile.meals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8), [profile.meals]);
  const activeDateSummary = availableDates.find((item) => item.serviceDate === date);
  const latestImportedDate = availableDates[0]?.serviceDate || '';
  const dateHelper = getDateHelper(date, activeDateSummary);
  const latestImport = availableDates
    .map((item) => item.lastImportedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] || null;
  const importLabel = latestImport ? formatImportTime(latestImport) : 'Sample';
  const coverageLabel = activeDateSummary
    ? `${activeDateSummary.meals} meals, ${activeDateSummary.stations} stations`
    : dateHelper;

  useEffect(() => {
    saveLocalProfile(profile);
  }, [profile]);

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
    let active = true;
    Promise.allSettled([
      getSqlProof(),
      getImportRuns()
    ])
      .then(([sqlProofResult, importRunsResult]) => {
        if (!active) return;
        setSqlProofExamples(sqlProofResult.status === 'fulfilled' ? sqlProofResult.value.examples : []);
        setImportRuns(importRunsResult.status === 'fulfilled' ? importRunsResult.value.runs : []);
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
    setSelectedFood(null);
    setMetrics(null);
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
      getFoods({ date }),
      getFoods(buildFilters(date, query, vegan, vegetarian, glutenFree, minProtein, maxCalories, allergenFree))
    ])
      .then(([restaurantsResponse, metricsResponse, allFoodsResponse, filteredFoodsResponse]) => {
        if (!active) return;
        setRestaurants(restaurantsResponse.restaurants);
        setMetrics(metricsResponse);
        setAllFoods(allFoodsResponse.foods);
        setFilteredFoods(filteredFoodsResponse.foods);
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
  }, [date, query, vegan, vegetarian, glutenFree, minProtein, maxCalories, allergenFree]);

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
      })
      .catch((caught: Error) => active && setError(caught.message));

    return () => {
      active = false;
    };
  }, [selectedRestaurantId, date]);

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
    <div className="product-shell">
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>ElonMealsDB</strong>
            <span>Dining planner</span>
          </div>
        </div>
        <nav>
          <a className="active" href="#planner"><Utensils size={18} /> Planner</a>
          <a href="#menu"><Soup size={18} /> Menu</a>
          <a href="#favorites"><Star size={18} /> Favorites</a>
          <a href="#history"><History size={18} /> History</a>
          <a href="#system"><Database size={18} /> System</a>
          <a href="#settings"><Settings2 size={18} /> Settings</a>
        </nav>
        <div className="profile-card">
          <CircleUserRound size={28} />
          <div>
            <span>Planner profile</span>
            <strong>{profile.name || 'My dining plan'}</strong>
            <small>This browser</small>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <label className="field date-field">
            <span><CalendarDays size={16} /> Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <small>{date ? dateHelper : 'Loading menu dates'}</small>
          </label>
          <label className="field location-field">
            <span><MapPin size={16} /> Restaurant</span>
            <select
              value={selectedRestaurantId || ''}
              onChange={(event) => setSelectedRestaurantId(Number(event.target.value))}
              aria-label="Restaurant"
              disabled={!restaurants.length}
            >
              {restaurants.length ? restaurants.map((restaurant) => (
                <option value={restaurant.id} key={restaurant.id}>{restaurant.name}</option>
              )) : <option value="">No restaurants imported</option>}
            </select>
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
        </header>

        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button className="icon-button" type="button" onClick={() => setError(null)} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        )}

        <section className="workspace-summary" id="planner">
          <div className="summary-copy">
            <h1>Plan meals around today&apos;s dining options.</h1>
            <p>Browse menus, save favorites, build meals, and track nutrition goals in one focused planning workspace.</p>
          </div>
          <div className="summary-metrics">
            <Metric label="Restaurants" value={metrics?.restaurants} helper={`${metrics?.foods ?? 0} dishes indexed`} />
            <Metric label="Planned" value={round(totals.calories)} helper={`${todayMeals.length} meals today`} />
            <Metric label="Favorites" value={profile.favoriteFoods.length} helper="Quick picks" />
            <Metric label="Updated" value={importLabel} helper={`${availableDates.length} menu dates`} />
          </div>
        </section>

        <section className="planner-grid">
          <section className="panel menu-panel" id="menu">
            <PanelHeader
              title={selectedRestaurant?.name || (loading ? 'Loading menu' : 'No menu imported')}
              subtitle={selectedRestaurant && activeMeal ? `${activeMeal.name} ${formatTime(activeMeal.time_open)} - ${formatTime(activeMeal.time_closed)}` : getMenuSubtitle(date, loading)}
              icon={<Soup size={18} />}
            />
            {selectedRestaurant ? (
              <>
                <div className="meal-tabs" role="tablist" aria-label="Meals">
                  {menu?.meals.map((meal) => (
                    <button
                      key={meal.id}
                      className={meal.id === activeMealId ? 'selected' : ''}
                      type="button"
                      onClick={() => setActiveMealId(meal.id)}
                    >
                      <span>{meal.name}</span>
                      <small>{formatTime(meal.time_open)} - {formatTime(meal.time_closed)}</small>
                    </button>
                  ))}
                </div>
                <div className="menu-layout">
                  <div className="station-rail">
                    <h2>Stations</h2>
                    {activeMeal?.stations.map((station) => (
                      <div className="station-row" key={station.id}>
                        <span>{station.name}</span>
                        <Badge tone="neutral">{station.foods.length}</Badge>
                      </div>
                    ))}
                    {!loading && !activeMeal?.stations.length && <EmptyState text="No stations for this meal." />}
                  </div>
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
                    {loading || !menu ? <LoadingState /> : (
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
            profile={profile}
            meals={todayMeals}
            totals={totals}
            date={date}
            onQuantity={updatePlannedQuantity}
            onRemoveFood={removePlannedFood}
            onRemoveMeal={removePlannedMeal}
            onClearDay={clearToday}
          />
        </section>

        <section className="lower-grid">
          <SystemProofPanel
            examples={sqlProofExamples}
            metrics={metrics}
            date={date}
          />

          <section className="panel status-panel">
            <PanelHeader title="Data Freshness" subtitle={coverageLabel} icon={<CalendarDays size={18} />} />
            <div className="status-list">
              <StatusRow label="Service date" value={date || '-'} />
              <StatusRow label="Last import" value={latestImport ? formatFullImportTime(latestImport) : 'Bundled sample'} />
              <StatusRow label="Menu coverage" value={`${metrics?.foods ?? 0} foods`} />
              <StatusRow label="Available dates" value={String(availableDates.length)} />
            </div>
            <ImportRunList runs={importRuns} />
          </section>

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

          <section className="panel" id="history">
            <PanelHeader title="Meal History" subtitle="Recent plans saved in this browser" icon={<History size={18} />} />
            <div className="history-list">
              {historyMeals.length ? historyMeals.map((meal) => (
                <div className="history-row" key={meal.id}>
                  <div>
                    <strong>{meal.mealName}</strong>
                    <span>{meal.restaurantName} on {formatShortDate(meal.date)}</span>
                  </div>
                  <Badge tone="green">{round(calculateTotals([meal]).calories)} cal</Badge>
                </div>
              )) : <EmptyState text="Meals you build will be saved here." />}
            </div>
          </section>

          <section className="panel settings-panel" id="settings">
            <PanelHeader title="Profile And Goals" subtitle="Personal defaults for your plan" icon={<Settings2 size={18} />} />
            <div className="settings-grid">
              <label className="field">
                <span>Name</span>
                <input
                  value={profile.name}
                  maxLength={42}
                  onChange={(event) => updateProfile({ name: event.target.value.slice(0, 42) })}
                  onBlur={(event) => updateProfile({ name: normalizeName(event.target.value) })}
                />
              </label>
              <GoalInput label="Calories" value={profile.dailyCaloriesGoal} min={500} max={6000} onChange={(value) => updateProfile({ dailyCaloriesGoal: value })} />
              <GoalInput label="Protein" value={profile.dailyProteinsGoal} min={10} max={400} onChange={(value) => updateProfile({ dailyProteinsGoal: value })} />
              <GoalInput label="Carbs" value={profile.dailyCarbsGoal} min={10} max={800} onChange={(value) => updateProfile({ dailyCarbsGoal: value })} />
              <GoalInput label="Fat" value={profile.dailyFatsGoal} min={10} max={400} onChange={(value) => updateProfile({ dailyFatsGoal: value })} />
              <label className="field satisfaction-field">
                <span>Satisfaction</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={profile.satisfactionLevel}
                  onChange={(event) => updateProfile({ satisfactionLevel: Number(event.target.value) })}
                />
                <small>{profile.satisfactionLevel} / 10</small>
              </label>
            </div>
            <div className="settings-actions">
              <button className="secondary-button" type="button" onClick={resetLocalProfile}>
                <RotateCcw size={16} /> Reset planner
              </button>
            </div>
          </section>
        </section>
      </main>

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

function SystemProofPanel({ examples, metrics, date }: {
  examples: SqlProofExample[];
  metrics: CoverageMetrics | null;
  date: string;
}) {
  const shownExamples = examples.slice(0, 3);
  const importStatus = metrics?.scraperRun?.status || 'sample';
  const importedFoods = metrics?.scraperRun?.foods_count ?? metrics?.foods ?? 0;

  return (
    <section className="panel system-panel" id="system">
      <PanelHeader
        title="System Proof"
        subtitle="Relational joins, API contracts, and import evidence"
        icon={<Database size={18} />}
      />
      <div className="system-overview">
        <div className="lineage-card">
          <span className="system-label"><GitBranch size={15} /> Normalized Path</span>
          <div className="lineage">
            <span>Restaurants</span>
            <ChevronRight size={15} />
            <span>Meals</span>
            <ChevronRight size={15} />
            <span>Stations</span>
            <ChevronRight size={15} />
            <span>Foods</span>
          </div>
        </div>
        <div className="system-stats">
          <SystemStat label="Service date" value={date || '-'} />
          <SystemStat label="Import status" value={importStatus} />
          <SystemStat label="Indexed foods" value={String(importedFoods)} />
          <SystemStat label="API examples" value={String(shownExamples.length)} />
        </div>
      </div>
      <div className="sql-proof-list">
        {shownExamples.length ? shownExamples.map((example) => (
          <article className="sql-proof-item" key={example.title}>
            <div className="sql-proof-heading">
              <div>
                <strong>{example.title}</strong>
                <span>{example.summary}</span>
              </div>
              <code>{example.route}</code>
            </div>
            <pre><code>{example.sql}</code></pre>
          </article>
        )) : <EmptyState text="SQL examples are available when the backend is reachable." />}
        <div className="system-note">
          <ShieldCheck size={16} />
          <span>Public requests use the read-only API database account; scheduled imports use a separate writer account.</span>
        </div>
      </div>
    </section>
  );
}

function SystemStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="system-stat">
      <span>{label}</span>
      <strong>{value}</strong>
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

function Metric({ label, value, helper }: { label: string; value?: ReactNode; helper: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value ?? '-'}</strong>
      <small>{helper}</small>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ImportRunList({ runs }: { runs: ScraperRun[] }) {
  const shownRuns = runs.slice(0, 4);

  return (
    <div className="import-run-list" aria-label="Recent import runs">
      <div className="import-run-title">
        <strong>Import Activity</strong>
        <span>{shownRuns.length ? `${shownRuns.length} recent runs` : 'No recorded runs'}</span>
      </div>
      {shownRuns.length ? shownRuns.map((run) => (
        <div className="import-run-row" key={run.id}>
          <div>
            <strong>{formatShortDate(run.target_date)}</strong>
            <span>{formatFullImportTime(run.started_at)} - {run.foods_count} foods</span>
          </div>
          <Badge tone={run.status === 'success' ? 'green' : run.status === 'partial' ? 'gold' : 'red'}>
            {run.status}
          </Badge>
        </div>
      )) : <EmptyState text="Scraper imports will appear here after the first run." />}
    </div>
  );
}

function PanelHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon: ReactNode }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="panel-icon">{icon}</div>
    </div>
  );
}

function MealPlanPanel(props: {
  profile: LocalProfile;
  meals: PlannedMeal[];
  totals: MacroTotals;
  date: string;
  onQuantity: (mealId: string, foodId: number, quantity: number) => void;
  onRemoveFood: (mealId: string, foodId: number) => void;
  onRemoveMeal: (mealId: string) => void;
  onClearDay: () => void;
}) {
  return (
    <aside className="panel plan-panel">
      <PanelHeader title="Today's Plan" subtitle={formatShortDate(props.date)} icon={<PanelRightOpen size={18} />} />
      <div className="macro-grid">
        <Goal label="Calories" value={props.totals.calories} max={props.profile.dailyCaloriesGoal} />
        <Goal label="Protein" value={props.totals.protein} max={props.profile.dailyProteinsGoal} unit="g" />
        <Goal label="Carbs" value={props.totals.carbs} max={props.profile.dailyCarbsGoal} unit="g" />
        <Goal label="Fat" value={props.totals.fat} max={props.profile.dailyFatsGoal} unit="g" />
      </div>
      <div className="planned-meals">
        {props.meals.length ? props.meals.map((meal) => (
          <div className="planned-meal" key={meal.id}>
            <div className="planned-meal-header">
              <div>
                <strong>{meal.mealName}</strong>
                <span>{meal.restaurantName} - {formatTime(meal.timeOpen)}</span>
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
                  onRemove={() => props.onRemoveFood(meal.id, item.foodId)}
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
      <div className="filter-title"><Filter size={16} /> Filters</div>
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
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {props.foods.map((food) => (
            <tr key={`${food.id}-${food.restaurantId || 'all'}-${food.stationName || food.mealName || 'food'}`}>
              <td data-label="Food">
                <button className="link-button strong" type="button" onClick={() => props.onSelect(food)}>{food.shortName}</button>
                <small>{formatFoodContext(food)}</small>
              </td>
              <td data-label="Station">{food.stationName || food.mealName || '-'}</td>
              <td data-label="Dietary"><Dietary food={food} /></td>
              <td data-label="Calories">{round(food.calories)}</td>
              <td data-label="Protein">{round(food.protein)} g</td>
              <td data-label="Carbs">{round(food.totalCarbohydrates)} g</td>
              <td className="row-actions" data-label="Actions">
                <button className="icon-button" type="button" disabled={props.busy} onClick={() => props.onFavorite(food)} aria-label={`${props.favoriteIds.has(food.id) ? 'Remove' : 'Add'} favorite`}>
                  <Star size={16} fill={props.favoriteIds.has(food.id) ? 'currentColor' : 'none'} />
                </button>
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
            <MetricBlock label="Calories" value={round(food.calories)} />
            <MetricBlock label="Protein" value={`${round(food.protein)} g`} />
            <MetricBlock label="Carbs" value={`${round(food.totalCarbohydrates)} g`} />
            <MetricBlock label="Fat" value={`${round(food.totalFat)} g`} />
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

function Goal({ label, value, max, unit = '' }: { label: string; value: number; max: number; unit?: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="goal">
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

function QuantityStepper({ quantity, onDecrease, onIncrease, onRemove }: {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="quantity-stepper">
      <button type="button" onClick={onDecrease} aria-label="Decrease quantity"><Minus size={13} /></button>
      <span>{quantity}</span>
      <button type="button" onClick={onIncrease} aria-label="Increase quantity"><Plus size={13} /></button>
      <button type="button" onClick={onRemove} aria-label="Remove food"><X size={13} /></button>
    </div>
  );
}

function MetricBlock({ label, value }: { label: string; value: string | number }) {
  return <div className="metric-block"><strong>{value}</strong><span>{label}</span></div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function getDateHelper(date: string, activeDateSummary: ServiceDateSummary | undefined) {
  if (!date) return 'Loading menu dates';
  if (!activeDateSummary) return 'No imported menu for this date';
  if (date === easternDateInput()) return 'Current service date';
  return `${activeDateSummary.restaurants} restaurants imported`;
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

function formatTime(value: string) {
  const parts = parseServiceDateTime(value);
  if (parts) return formatHourMinute(parts.hour, parts.minute);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatShortDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
}

function formatImportTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York'
  }).format(new Date(value));
}

function formatFullImportTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York'
  }).format(new Date(value));
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
  return food.stationName ? `${primary} - ${food.stationName}` : primary;
}

function round(value: number) {
  return Math.round(Number(value || 0) * 10) / 10;
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
