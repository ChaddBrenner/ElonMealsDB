import { expect, test, type Page, type Route } from '@playwright/test';

const serviceDate = '2026-07-06';
const emptyDate = '2026-07-08';
const restaurantId = 101;
const mealId = 201;

const allergens = {
  egg: false,
  shellfish: false,
  soy: false,
  peanut: false,
  wheat: false,
  treeNut: false,
  milk: false,
  sesame: false,
  fish: false
};

const tofuBowl = food({
  id: 1,
  externalId: 'recipe-tofu-bowl',
  shortName: 'Ginger Tofu Bowl',
  fullName: 'Ginger Tofu Bowl with Rice',
  ingredients: 'Tofu, jasmine rice, ginger, scallions',
  calories: 310,
  totalCarbohydrates: 42,
  protein: 18,
  vegan: true,
  vegetarian: true,
  glutenFree: true,
  stationName: 'Global Greens'
});

const chickenPlate = food({
  id: 2,
  externalId: 'recipe-chicken-plate',
  shortName: 'Campus Chicken Plate',
  fullName: 'Campus Chicken Plate',
  ingredients: 'Chicken, roasted potatoes, herbs',
  calories: 520,
  totalCarbohydrates: 48,
  protein: 34,
  stationName: 'Homestyle'
});

const yogurtParfait = food({
  id: 3,
  externalId: 'recipe-yogurt-parfait',
  shortName: 'Greek Yogurt Parfait',
  fullName: 'Greek Yogurt Parfait',
  ingredients: 'Greek yogurt, granola, blueberries',
  calories: 240,
  totalCarbohydrates: 35,
  protein: 14,
  vegetarian: true,
  stationName: 'Global Greens'
});

test('dashboard supports search, details, favorites, and local meal planning', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await mockApi(page);
  await page.goto('/');

  await expect(page).toHaveTitle('ElonMealsDB');
  await expect(page.getByRole('heading', { name: "Plan meals around today's dining options." })).toBeVisible();
  await expect(page.getByLabel('Restaurant')).toHaveValue(String(restaurantId));
  await expect(page.getByText('Data Freshness')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'System Proof' })).toBeVisible();
  await expect(page.getByText('GET /api/restaurants/:id/menu')).toBeVisible();
  await expect(page.getByText('3 foods')).toBeVisible();

  await page.getByLabel('Search foods').fill('Tofu');
  await expect(page.getByRole('button', { name: 'Ginger Tofu Bowl' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Campus Chicken Plate' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ginger Tofu Bowl' }).click();
  const drawer = page.locator('.drawer.open');
  await expect(drawer.getByRole('heading', { name: 'Ginger Tofu Bowl' })).toBeVisible();
  await expect(drawer.getByText('Tofu, jasmine rice, ginger, scallions')).toBeVisible();

  await drawer.getByRole('button', { name: 'Favorite' }).click();
  await expect(drawer.getByRole('button', { name: 'Favorited' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Add to plan' }).click();

  const planPanel = page.locator('.plan-panel');
  await expect(planPanel.getByText('Ginger Tofu Bowl')).toBeVisible();
  await expect(planPanel.getByText('310 cal')).toBeVisible();
  await expect(page.locator('.metric').filter({ hasText: 'Planned' })).toContainText('310');

  const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('elonmealsdb.localProfile.v1') || '{}'));
  expect(savedProfile.favoriteFoods).toHaveLength(1);
  expect(savedProfile.meals).toHaveLength(1);
  expect(savedProfile.meals[0].foods[0].food.shortName).toBe('Ginger Tofu Bowl');
  expect(consoleErrors).toEqual([]);
});

test('date changes with no imported menu clear stale restaurant state', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Lakeside Dining Hall' })).toBeVisible();

  await page.getByLabel('Date').fill(emptyDate);

  await expect(page.getByRole('heading', { name: 'No menu imported' })).toBeVisible();
  await expect(page.getByText('No restaurants imported for Jul 8.')).toBeVisible();
  await expect(page.getByLabel('Restaurant')).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Lakeside Dining Hall' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Use latest imported date' }).click();

  await expect(page.getByLabel('Restaurant')).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Lakeside Dining Hall' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ginger Tofu Bowl' })).toBeVisible();
});

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const requestedDate = url.searchParams.get('date') || serviceDate;
    const hasMenuForDate = requestedDate !== emptyDate;

    if (url.pathname === '/api/service-dates') {
      await json(route, {
        dates: [{
          serviceDate,
          restaurants: 1,
          meals: 1,
          stations: 2,
          foods: 3,
          lastImportedAt: '2026-07-06T13:15:00.000Z'
        }]
      });
      return;
    }

    if (url.pathname === '/api/restaurants') {
      if (!hasMenuForDate) {
        await json(route, { restaurants: [] });
        return;
      }

      await json(route, {
        restaurants: [{
          id: restaurantId,
          name: 'Lakeside Dining Hall',
          url: 'https://www.elondining.com/locations/lakeside-dining-hall/',
          venue_name: 'Lakeside Dining Hall',
          service_date: serviceDate,
          meals_count: 1,
          stations_count: 2,
          foods_count: 3,
          first_open: `${serviceDate}T11:00:00.000Z`,
          last_closed: `${serviceDate}T14:00:00.000Z`
        }]
      });
      return;
    }

    if (url.pathname === `/api/restaurants/${restaurantId}/menu`) {
      await json(route, {
        restaurant: {
          id: restaurantId,
          name: 'Lakeside Dining Hall',
          url: 'https://www.elondining.com/locations/lakeside-dining-hall/',
          venue_name: 'Lakeside Dining Hall',
          service_date: serviceDate
        },
        meals: [{
          id: mealId,
          restaurant_id: restaurantId,
          name: 'Lunch',
          time_open: `${serviceDate}T11:00:00.000Z`,
          time_closed: `${serviceDate}T14:00:00.000Z`,
          stations: [
            { id: 301, mealId, name: 'Global Greens', foods: [tofuBowl, yogurtParfait] },
            { id: 302, mealId, name: 'Homestyle', foods: [chickenPlate] }
          ]
        }]
      });
      return;
    }

    if (url.pathname === '/api/metrics/coverage') {
      if (!hasMenuForDate) {
        await json(route, {
          serviceDate: requestedDate,
          restaurants: 0,
          meals: 0,
          stations: 0,
          foods: 0,
          vegan_items: 0,
          vegetarian_items: 0,
          gluten_free_items: 0,
          avg_calories: null,
          scraperRun: null,
          topProtein: []
        });
        return;
      }

      await json(route, {
        serviceDate,
        restaurants: 1,
        meals: 1,
        stations: 2,
        foods: 3,
        vegan_items: 1,
        vegetarian_items: 2,
        gluten_free_items: 1,
        avg_calories: 356.7,
        scraperRun: {
          id: 1,
          source_url: 'https://www.elondining.com/menu-hours/',
          target_date: serviceDate,
          started_at: '2026-07-06T13:15:00.000Z',
          finished_at: '2026-07-06T13:15:04.000Z',
          status: 'success',
          restaurants_count: 1,
          meals_count: 1,
          foods_count: 3
        },
        topProtein: [chickenPlate, tofuBowl, yogurtParfait]
      });
      return;
    }

    if (url.pathname === '/api/foods') {
      if (!hasMenuForDate) {
        await json(route, { foods: [] });
        return;
      }

      const query = (url.searchParams.get('q') || '').toLowerCase();
      const foods = [tofuBowl, chickenPlate, yogurtParfait]
        .filter((item) => !query || `${item.shortName} ${item.fullName} ${item.ingredients}`.toLowerCase().includes(query))
        .filter((item) => url.searchParams.get('vegan') !== 'true' || item.vegan)
        .filter((item) => url.searchParams.get('vegetarian') !== 'true' || item.vegetarian)
        .filter((item) => url.searchParams.get('glutenFree') !== 'true' || item.glutenFree);
      await json(route, { foods });
      return;
    }

    if (url.pathname === '/api/sql-proof') {
      await json(route, {
        examples: [
          {
            title: 'Menu hierarchy',
            route: 'GET /api/restaurants/:id/menu',
            summary: 'Builds Restaurant -> Meal -> Station -> Food from normalized tables.',
            sql: 'SELECT m.id AS meal_id, s.id AS station_id, f.id AS food_id\\nFROM meals m\\nJOIN stations s ON s.meal_id = m.id'
          },
          {
            title: 'Filtered food search',
            route: 'GET /api/foods',
            summary: 'Filters foods by date, dietary flags, allergens, calories, and protein.',
            sql: 'SELECT DISTINCT f.id, f.short_name\\nFROM restaurants r\\nJOIN meals m ON m.restaurant_id = r.id'
          }
        ]
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } })
    });
  });
}

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

type FoodFixture = {
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
  allergens: typeof allergens;
  restaurantId: number;
  restaurantName: string;
  mealName: string;
  stationName: string;
};

function food(overrides: Partial<FoodFixture>): FoodFixture {
  return {
    id: 0,
    externalId: '',
    shortName: '',
    fullName: '',
    description: '',
    ingredients: '',
    servingSizeAmount: 1,
    servingSizeUnit: 'serving',
    calories: 0,
    caloriesFromFat: 0,
    totalFat: 8,
    saturatedFat: 1,
    transFat: 0,
    cholesterol: 0,
    sodium: 300,
    totalCarbohydrates: 0,
    dietaryFiber: 4,
    sugars: 5,
    protein: 0,
    vegetarian: false,
    vegan: false,
    glutenFree: false,
    allergens,
    restaurantId,
    restaurantName: 'Lakeside Dining Hall',
    mealName: 'Lunch',
    stationName: '',
    ...overrides
  };
}
