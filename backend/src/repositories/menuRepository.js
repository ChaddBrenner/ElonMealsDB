import { query } from '../db.js';
import { notFound } from '../errors.js';

const foodColumns = `f.id, f.external_id, f.short_name, f.full_name, f.description, f.ingredients,
  f.serving_size_amount, f.serving_size_unit, f.calories, f.calories_from_fat, f.total_fat,
  f.saturated_fat, f.trans_fat, f.cholesterol, f.sodium, f.total_carbohydrates,
  f.dietary_fiber, f.sugars, f.protein, f.vegetarian, f.vegan, f.gluten_free,
  f.allergy_egg, f.allergy_shellfish, f.allergy_soy, f.allergy_peanut, f.allergy_wheat,
  f.allergy_tree_nut, f.allergy_milk, f.allergy_sesame, f.allergy_fish`;

export const supportedAllergens = new Map([
  ['egg', 'allergy_egg'],
  ['shellfish', 'allergy_shellfish'],
  ['soy', 'allergy_soy'],
  ['peanut', 'allergy_peanut'],
  ['wheat', 'allergy_wheat'],
  ['tree_nut', 'allergy_tree_nut'],
  ['milk', 'allergy_milk'],
  ['sesame', 'allergy_sesame'],
  ['fish', 'allergy_fish']
]);

export async function getLatestServiceDate() {
  const rows = await query('SELECT MAX(service_date) AS service_date FROM restaurants');
  const value = rows[0]?.service_date;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export async function resolveServiceDate(date) {
  return date || await getLatestServiceDate();
}

export async function listServiceDates() {
  return query(`
    SELECT
      DATE_FORMAT(r.service_date, '%Y-%m-%d') AS serviceDate,
      COUNT(DISTINCT r.id) AS restaurants,
      COUNT(DISTINCT m.id) AS meals,
      COUNT(DISTINCT s.id) AS stations,
      COUNT(DISTINCT sf.food_id) AS foods,
      MAX(sr.started_at) AS lastImportedAt
    FROM restaurants r
    LEFT JOIN meals m ON m.restaurant_id = r.id
    LEFT JOIN stations s ON s.meal_id = m.id
    LEFT JOIN station_foods sf ON sf.station_id = s.id
    LEFT JOIN scraper_runs sr ON sr.target_date = r.service_date AND sr.status = 'success'
    GROUP BY r.service_date
    ORDER BY r.service_date DESC
    LIMIT 30
  `);
}

export async function listImportRuns(limit = 6) {
  const safeLimit = Math.min(12, Math.max(1, Number.parseInt(String(limit), 10) || 6));
  // MySQL rejects a bound placeholder for LIMIT here; the route validates 1-12 and this layer clamps again.
  return query(`
    SELECT
      id,
      source_url,
      DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date,
      started_at,
      finished_at,
      status,
      restaurants_count,
      meals_count,
      foods_count,
      error_message
    FROM scraper_runs
    ORDER BY started_at DESC, id DESC
    LIMIT ${safeLimit}
  `);
}

export async function listRestaurants(date) {
  const serviceDate = await resolveServiceDate(date);
  const rows = await query(`
    SELECT
      r.id,
      r.name,
      r.url,
      r.venue_name,
      DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
      COUNT(DISTINCT m.id) AS meals_count,
      COUNT(DISTINCT s.id) AS stations_count,
      COUNT(DISTINCT sf.food_id) AS foods_count,
      MIN(m.time_open) AS first_open,
      MAX(m.time_closed) AS last_closed
    FROM restaurants r
    LEFT JOIN meals m ON m.restaurant_id = r.id
    LEFT JOIN stations s ON s.meal_id = m.id
    LEFT JOIN station_foods sf ON sf.station_id = s.id
    WHERE r.service_date = :serviceDate
    GROUP BY r.id
    ORDER BY r.name ASC
  `, { serviceDate });
  return rows;
}

export async function getRestaurantMenu(restaurantId) {
  const restaurants = await query(`
    SELECT id, name, url, venue_name, DATE_FORMAT(service_date, '%Y-%m-%d') AS service_date
    FROM restaurants
    WHERE id = :restaurantId
  `, { restaurantId });

  if (!restaurants.length) {
    throw notFound('Restaurant not found');
  }

  const meals = await query(`
    SELECT id, restaurant_id, name, time_open, time_closed
    FROM meals
    WHERE restaurant_id = :restaurantId
    ORDER BY time_open ASC, id ASC
  `, { restaurantId });

  const rows = await query(`
    SELECT
      m.id AS meal_id,
      s.id AS station_id,
      s.name AS station_name,
      ${foodColumns}
    FROM meals m
    JOIN stations s ON s.meal_id = m.id
    JOIN station_foods sf ON sf.station_id = s.id
    JOIN foods f ON f.id = sf.food_id
    WHERE m.restaurant_id = :restaurantId
    ORDER BY m.time_open ASC, s.name ASC, f.short_name ASC
  `, { restaurantId });

  const stationMap = new Map();
  for (const row of rows) {
    if (!stationMap.has(row.station_id)) {
      stationMap.set(row.station_id, {
        id: row.station_id,
        mealId: row.meal_id,
        name: row.station_name,
        foods: []
      });
    }

    stationMap.get(row.station_id).foods.push(mapFood(row));
  }

  return {
    restaurant: restaurants[0],
    meals: meals.map((meal) => ({
      ...meal,
      stations: Array.from(stationMap.values()).filter((station) => station.mealId === meal.id)
    }))
  };
}

export async function listFoods(filters) {
  const serviceDate = await resolveServiceDate(filters.date);
  const where = ['r.service_date = :serviceDate'];
  const params = { serviceDate };

  if (filters.vegan !== undefined) where.push('f.vegan = :vegan');
  if (filters.vegetarian !== undefined) where.push('f.vegetarian = :vegetarian');
  if (filters.glutenFree !== undefined) where.push('f.gluten_free = :glutenFree');
  if (filters.maxCalories !== undefined) where.push('f.calories <= :maxCalories');
  if (filters.minProtein !== undefined) where.push('f.protein >= :minProtein');

  Object.assign(params, {
    vegan: filters.vegan,
    vegetarian: filters.vegetarian,
    glutenFree: filters.glutenFree,
    maxCalories: filters.maxCalories,
    minProtein: filters.minProtein
  });

  if (filters.q) {
    where.push(`(
      f.short_name LIKE :search ESCAPE '\\\\'
      OR f.full_name LIKE :search ESCAPE '\\\\'
      OR f.description LIKE :search ESCAPE '\\\\'
      OR f.ingredients LIKE :search ESCAPE '\\\\'
    )`);
    params.search = `%${escapeLike(filters.q)}%`;
  }

  const allergenColumns = parseAllergenFree(filters.allergenFree);
  for (const column of allergenColumns) {
    where.push(`f.${column} = FALSE`);
  }

  const rows = await query(`
    SELECT DISTINCT
      ${foodColumns},
      r.id AS restaurant_id,
      r.name AS restaurant_name,
      s.name AS station_name,
      m.name AS meal_name
    FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    JOIN stations s ON s.meal_id = m.id
    JOIN station_foods sf ON sf.station_id = s.id
    JOIN foods f ON f.id = sf.food_id
    WHERE ${where.join(' AND ')}
    ORDER BY f.short_name ASC
    LIMIT 200
  `, params);

  return rows.map((row) => ({
    ...mapFood(row),
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    mealName: row.meal_name,
    stationName: row.station_name
  }));
}

export async function getCoverageMetrics(date) {
  const serviceDate = await resolveServiceDate(date);
  const rows = await query(`
    SELECT
      COUNT(DISTINCT r.id) AS restaurants,
      COUNT(DISTINCT m.id) AS meals,
      COUNT(DISTINCT s.id) AS stations,
      COUNT(DISTINCT f.id) AS foods,
      COUNT(DISTINCT CASE WHEN f.vegan THEN f.id END) AS vegan_items,
      COUNT(DISTINCT CASE WHEN f.vegetarian THEN f.id END) AS vegetarian_items,
      COUNT(DISTINCT CASE WHEN f.gluten_free THEN f.id END) AS gluten_free_items
    FROM restaurants r
    LEFT JOIN meals m ON m.restaurant_id = r.id
    LEFT JOIN stations s ON s.meal_id = m.id
    LEFT JOIN station_foods sf ON sf.station_id = s.id
    LEFT JOIN foods f ON f.id = sf.food_id
    WHERE r.service_date = :serviceDate
  `, { serviceDate });

  const [averageCalories] = await query(`
    SELECT ROUND(AVG(food_calories.calories), 1) AS avg_calories
    FROM (
      SELECT DISTINCT f.id, f.calories
      FROM restaurants r
      JOIN meals m ON m.restaurant_id = r.id
      JOIN stations s ON s.meal_id = m.id
      JOIN station_foods sf ON sf.station_id = s.id
      JOIN foods f ON f.id = sf.food_id
      WHERE r.service_date = :serviceDate
    ) AS food_calories
  `, { serviceDate });

  const [scraperRun] = await query(`
    SELECT id, source_url, DATE_FORMAT(target_date, '%Y-%m-%d') AS target_date,
      started_at, finished_at, status, restaurants_count, meals_count, foods_count
    FROM scraper_runs
    WHERE target_date = :serviceDate
    ORDER BY started_at DESC
    LIMIT 1
  `, { serviceDate });

  const topProtein = await query(`
    SELECT ${foodColumns}
    FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    JOIN stations s ON s.meal_id = m.id
    JOIN station_foods sf ON sf.station_id = s.id
    JOIN foods f ON f.id = sf.food_id
    WHERE r.service_date = :serviceDate
    GROUP BY f.id
    ORDER BY f.protein DESC, f.calories ASC
    LIMIT 5
  `, { serviceDate });

  return {
    serviceDate,
    ...rows[0],
    avg_calories: averageCalories?.avg_calories ?? null,
    scraperRun: scraperRun || null,
    topProtein: topProtein.map(mapFood)
  };
}

export async function getStationMetrics(date) {
  const serviceDate = await resolveServiceDate(date);
  const rows = await query(`
    SELECT
      DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
      r.id AS restaurant_id,
      r.name AS restaurant_name,
      m.id AS meal_id,
      m.name AS meal_name,
      m.time_open AS meal_time_open,
      m.time_closed AS meal_time_closed,
      s.id AS station_id,
      s.name AS station_name,
      COUNT(DISTINCT f.id) AS food_count,
      ROUND(AVG(f.calories), 1) AS avg_calories,
      ROUND(AVG(f.protein), 1) AS avg_protein,
      COUNT(DISTINCT CASE WHEN f.vegan THEN f.id END) AS vegan_items,
      COUNT(DISTINCT CASE WHEN f.vegetarian THEN f.id END) AS vegetarian_items,
      COUNT(DISTINCT CASE WHEN f.gluten_free THEN f.id END) AS gluten_free_items
    FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    JOIN stations s ON s.meal_id = m.id
    JOIN station_foods sf ON sf.station_id = s.id
    JOIN foods f ON f.id = sf.food_id
    WHERE r.service_date = :serviceDate
    GROUP BY r.service_date, r.id, m.id, s.id
    HAVING food_count > 0
    ORDER BY avg_protein DESC, food_count DESC, restaurant_name ASC, meal_name ASC, station_name ASC
    LIMIT 12
  `, { serviceDate });

  return {
    serviceDate,
    stations: rows.map((row) => ({
      serviceDate: row.service_date,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      mealId: row.meal_id,
      mealName: row.meal_name,
      mealTimeOpen: row.meal_time_open,
      mealTimeClosed: row.meal_time_closed,
      stationId: row.station_id,
      stationName: row.station_name,
      foodCount: Number(row.food_count || 0),
      avgCalories: Number(row.avg_calories || 0),
      avgProtein: Number(row.avg_protein || 0),
      veganItems: Number(row.vegan_items || 0),
      vegetarianItems: Number(row.vegetarian_items || 0),
      glutenFreeItems: Number(row.gluten_free_items || 0)
    }))
  };
}

function parseAllergenFree(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => supportedAllergens.get(item))
    .filter(Boolean);
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function mapFood(row) {
  return {
    id: row.id,
    externalId: row.external_id,
    shortName: row.short_name,
    fullName: row.full_name,
    description: row.description,
    ingredients: row.ingredients,
    servingSizeAmount: row.serving_size_amount,
    servingSizeUnit: row.serving_size_unit,
    calories: row.calories,
    caloriesFromFat: row.calories_from_fat,
    totalFat: row.total_fat,
    saturatedFat: row.saturated_fat,
    transFat: row.trans_fat,
    cholesterol: row.cholesterol,
    sodium: row.sodium,
    totalCarbohydrates: row.total_carbohydrates,
    dietaryFiber: row.dietary_fiber,
    sugars: row.sugars,
    protein: row.protein,
    vegetarian: Boolean(row.vegetarian),
    vegan: Boolean(row.vegan),
    glutenFree: Boolean(row.gluten_free),
    allergens: {
      egg: Boolean(row.allergy_egg),
      shellfish: Boolean(row.allergy_shellfish),
      soy: Boolean(row.allergy_soy),
      peanut: Boolean(row.allergy_peanut),
      wheat: Boolean(row.allergy_wheat),
      treeNut: Boolean(row.allergy_tree_nut),
      milk: Boolean(row.allergy_milk),
      sesame: Boolean(row.allergy_sesame),
      fish: Boolean(row.allergy_fish)
    }
  };
}
