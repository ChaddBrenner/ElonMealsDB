import { expect, test, type Page, type Route } from '@playwright/test';

const serviceDate = '2026-07-06';
const emptyDate = '2026-07-08';
const restaurantId = 101;
const secondRestaurantId = 102;
const mealId = 201;
const dinnerMealId = 202;
const cafeMealId = 203;

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
  stationId: 301,
  stationName: 'global greens'
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
  stationId: 302,
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
  stationId: 301,
  stationName: 'global greens'
});

const avocadoToast = food({
  id: 4,
  externalId: 'recipe-avocado-toast',
  shortName: 'Avocado Toast',
  fullName: 'Avocado Toast',
  ingredients: 'Avocado, sourdough, lemon, chili flakes',
  calories: 330,
  totalCarbohydrates: 38,
  protein: 11,
  vegan: true,
  vegetarian: true,
  stationId: 304,
  stationName: 'Cafe Counter',
  restaurantId: secondRestaurantId,
  restaurantName: 'Acorn Coffee Shop',
  mealName: 'Breakfast'
});

test('dashboard supports search, details, favorites, and local meal planning', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await mockApi(page);
  await page.goto('/');

  await expect(page).toHaveTitle('ElonMealsDB');
  await expect(page.getByText('ElonMealsDB')).toBeVisible();
  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ })).toHaveClass(/selected/);
  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Acorn Coffee Shop/ })).toBeVisible();
  await expect(page.getByLabel('Selected foods')).toContainText('0 selected');
  await expect(page.getByText("Today's Plan")).toHaveCount(0);
  await expect(page.getByText('0 meals planned')).toHaveCount(0);
  await expect(page.getByText('Data Freshness')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'System Proof' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Meal History' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Profile And Goals' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nutrition Insights' })).toBeVisible();
  await expect(page.getByText('Foods indexed')).toHaveCount(0);
  await expect(page.getByLabel('Macro mix').getByText('Macro Mix')).toBeVisible();
  await expect(page.getByLabel('Dining fit matrix').getByText('Dining Fit')).toBeVisible();
  await expect(page.getByLabel('Calories versus protein').getByText('Calories vs Protein')).toBeVisible();
  await expect(page.getByLabel('Allergen flag station comparison').getByText('Allergen Flags')).toBeVisible();
  await expect(page.getByLabel('Protein efficiency leaderboard').getByText('Campus Chicken Plate')).toBeVisible();
  await expect(page.locator('.meal-tabs button').filter({ hasText: '11:00 AM - 2:00 PM' })).toContainText('Summer Break');
  await expect(page.locator('.meal-tabs button').filter({ hasText: '5:30 - 6:30 PM' })).toContainText('Summer Break');
  await expect(page.getByText('Summer Break |')).toHaveCount(0);

  await page.getByLabel('Restaurants').getByRole('tab', { name: /Acorn Coffee Shop/ }).click();
  await expect(page.getByRole('heading', { name: 'Acorn Coffee Shop' })).toBeVisible();
  await expect(page.locator('.food-table').getByRole('button', { name: 'Avocado Toast', exact: true })).toBeVisible();
  await page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ }).click();
  await expect(page.getByRole('heading', { name: 'Lakeside Dining Hall' })).toBeVisible();

  await page.getByLabel('Edit nutrition goals').click();
  await expect(page.getByRole('dialog', { name: 'Nutrition Goals' })).toBeVisible();
  await page.getByLabel('Close goals').click();
  await expect(page.getByRole('dialog', { name: 'Nutrition Goals' })).toHaveCount(0);

  const stationFilters = page.getByLabel('Station filters');
  await expect(stationFilters.getByRole('button', { name: /Global Greens/ })).toBeVisible();
  await expect(stationFilters).not.toContainText('global greens');
  await stationFilters.getByRole('button', { name: /Homestyle/ }).click();
  const foodTable = page.locator('.food-table');
  await expect(foodTable.getByRole('columnheader', { name: 'Fat' })).toBeVisible();
  await expect(foodTable.getByRole('button', { name: 'Campus Chicken Plate', exact: true })).toBeVisible();
  await expect(foodTable.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toHaveCount(0);
  await stationFilters.getByRole('button', { name: /All stations/ }).click();

  await page.getByLabel('Search foods').fill('Tofu');
  await expect(foodTable.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toBeVisible();
  await expect(foodTable.getByRole('button', { name: 'Campus Chicken Plate', exact: true })).toHaveCount(0);

  await foodTable.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true }).click();
  const drawer = page.locator('.drawer.open');
  await expect(drawer.getByRole('heading', { name: 'Ginger Tofu Bowl' })).toBeVisible();
  await expect(drawer.getByText('Tofu, jasmine rice, ginger, scallions')).toBeVisible();

  await drawer.getByRole('button', { name: 'Favorite' }).click();
  await expect(drawer.getByRole('button', { name: 'Favorited' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Add to plan' }).click();

  const planPanel = page.locator('.plan-panel');
  await expect(planPanel.getByText('Ginger Tofu Bowl')).toBeVisible();
  await expect(planPanel.getByText('310 cal')).toBeVisible();
  await expect(planPanel.getByText('Jul 6')).toHaveCount(0);
  await expect(planPanel).toContainText('1 selected');
  await expect(planPanel.getByLabel('Remove food')).toHaveCount(0);
  await expect(page.getByLabel('Nutrition totals')).toContainText('310 / 2200');

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

  await page.locator('input[type="date"]').fill(emptyDate);

  await expect(page.getByRole('heading', { name: 'No menu imported' })).toBeVisible();
  await expect(page.getByText('No restaurants imported for Jul 8.')).toBeVisible();
  await expect(page.getByLabel('Restaurants')).toContainText('No restaurants imported for this date');
  await expect(page.getByRole('heading', { name: 'Lakeside Dining Hall' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Use latest imported date' }).click();

  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lakeside Dining Hall' })).toBeVisible();
  await expect(page.locator('.food-table').getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toBeVisible();
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
          restaurants: 2,
          meals: 3,
          stations: 4,
          foods: 4,
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
          meals_count: 2,
          stations_count: 3,
          foods_count: 3,
          first_open: `${serviceDate}T11:00:00.000Z`,
          last_closed: `${serviceDate}T18:30:00.000Z`
        }, {
          id: secondRestaurantId,
          name: 'Acorn Coffee Shop',
          url: 'https://www.elondining.com/locations/acorn-coffee-shop/',
          venue_name: 'Acorn Coffee Shop',
          service_date: serviceDate,
          meals_count: 1,
          stations_count: 1,
          foods_count: 1,
          first_open: `${serviceDate}T07:30:00.000Z`,
          last_closed: `${serviceDate}T10:30:00.000Z`
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
          name: 'Summer Break',
          time_open: `${serviceDate}T11:00:00.000Z`,
          time_closed: `${serviceDate}T14:00:00.000Z`,
          stations: [
            { id: 301, mealId, name: 'global greens', foods: [tofuBowl, yogurtParfait] },
            { id: 302, mealId, name: 'Homestyle', foods: [chickenPlate] }
          ]
        }, {
          id: dinnerMealId,
          restaurant_id: restaurantId,
          name: 'Summer Break',
          time_open: `${serviceDate}T17:30:00.000Z`,
          time_closed: `${serviceDate}T18:30:00.000Z`,
          stations: [
            { id: 303, mealId: dinnerMealId, name: 'Evening Grill', foods: [] }
          ]
        }]
      });
      return;
    }

    if (url.pathname === `/api/restaurants/${secondRestaurantId}/menu`) {
      await json(route, {
        restaurant: {
          id: secondRestaurantId,
          name: 'Acorn Coffee Shop',
          url: 'https://www.elondining.com/locations/acorn-coffee-shop/',
          venue_name: 'Acorn Coffee Shop',
          service_date: serviceDate
        },
        meals: [{
          id: cafeMealId,
          restaurant_id: secondRestaurantId,
          name: 'Breakfast',
          time_open: `${serviceDate}T07:30:00.000Z`,
          time_closed: `${serviceDate}T10:30:00.000Z`,
          stations: [
            { id: 304, mealId: cafeMealId, name: 'Cafe Counter', foods: [avocadoToast] }
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
          restaurants: 2,
          meals: 3,
          stations: 4,
          foods: 4,
          vegan_items: 2,
          vegetarian_items: 3,
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

    if (url.pathname === '/api/metrics/stations') {
      if (!hasMenuForDate) {
        await json(route, { serviceDate: requestedDate, stations: [] });
        return;
      }

      await json(route, {
        serviceDate,
        stations: [{
          serviceDate,
          restaurantId,
          restaurantName: 'Lakeside Dining Hall',
          mealId,
          mealName: 'Summer Break',
          mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
          mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
          stationId: 302,
          stationName: 'Homestyle',
          foodCount: 1,
          avgCalories: 520,
          avgProtein: 34,
          veganItems: 0,
          vegetarianItems: 0,
          glutenFreeItems: 0
        }, {
          serviceDate,
          restaurantId,
          restaurantName: 'Lakeside Dining Hall',
          mealId,
          mealName: 'Summer Break',
          mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
          mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
          stationId: 301,
          stationName: 'Global Greens',
          foodCount: 2,
          avgCalories: 275,
          avgProtein: 16,
          veganItems: 1,
          vegetarianItems: 2,
          glutenFreeItems: 1
        }, {
          serviceDate,
          restaurantId: secondRestaurantId,
          restaurantName: 'Acorn Coffee Shop',
          mealId: cafeMealId,
          mealName: 'Breakfast',
          mealTimeOpen: `${serviceDate}T07:30:00.000Z`,
          mealTimeClosed: `${serviceDate}T10:30:00.000Z`,
          stationId: 304,
          stationName: 'Cafe Counter',
          foodCount: 1,
          avgCalories: 330,
          avgProtein: 11,
          veganItems: 1,
          vegetarianItems: 1,
          glutenFreeItems: 0
        }]
      });
      return;
    }

    if (url.pathname === '/api/foods') {
      if (!hasMenuForDate) {
        await json(route, { foods: [] });
        return;
      }

      const query = (url.searchParams.get('q') || '').toLowerCase();
      const foods = [tofuBowl, chickenPlate, yogurtParfait, avocadoToast]
        .filter((item) => !query || `${item.shortName} ${item.fullName} ${item.ingredients}`.toLowerCase().includes(query))
        .filter((item) => url.searchParams.get('vegan') !== 'true' || item.vegan)
        .filter((item) => url.searchParams.get('vegetarian') !== 'true' || item.vegetarian)
        .filter((item) => url.searchParams.get('glutenFree') !== 'true' || item.glutenFree);
      await json(route, { foods });
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
  stationId: number;
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
    stationId: 0,
    stationName: '',
    ...overrides
  };
}
