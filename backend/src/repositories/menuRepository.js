import { query } from '../db.js';
import { notFound } from '../errors.js';

const foodColumns = `f.id, f.external_id, f.source_recipe_id, f.content_hash,
  f.short_name, f.full_name, f.description, f.ingredients, f.disclaimer, f.hide_allergens,
  f.serving_size_amount, f.serving_size_unit, f.calories, f.calories_from_fat, f.total_fat,
  f.saturated_fat, f.trans_fat, f.cholesterol, f.sodium, f.total_carbohydrates,
  f.dietary_fiber, f.sugars, f.added_sugars, f.protein, f.potassium, f.calcium,
  f.iron, f.vitamin_d, f.vegetarian, f.vegan, f.gluten_free,
  f.allergy_egg, f.allergy_shellfish, f.allergy_soy, f.allergy_peanut, f.allergy_wheat,
  f.allergy_tree_nut, f.allergy_milk, f.allergy_sesame, f.allergy_fish`;
const foodFullTextExpression = 'MATCH(f.short_name, f.full_name, f.description, f.ingredients) AGAINST (:fullTextSearch IN NATURAL LANGUAGE MODE)';
const resultLimit = 200;
const insightFoodLimit = 48;

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
      COUNT(DISTINCT f.external_id) AS foods,
      COUNT(DISTINCT f.id) AS foodVariants,
      COUNT(DISTINCT CONCAT(sf.station_id, ':', sf.food_id)) AS menuItemPlacements,
      MAX(sr.started_at) AS lastImportedAt
    FROM restaurants r
    LEFT JOIN meals m ON m.restaurant_id = r.id
    LEFT JOIN stations s ON s.meal_id = m.id
    LEFT JOIN station_foods sf ON sf.station_id = s.id
    LEFT JOIN foods f ON f.id = sf.food_id
    LEFT JOIN scraper_runs sr ON sr.target_date = r.service_date AND sr.status = 'success'
    GROUP BY r.service_date
    ORDER BY r.service_date DESC
    LIMIT 100
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
      distinct_recipes_count,
      food_variants_count,
      menu_item_placements_count,
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
      r.source_kind,
      r.menu_status,
      DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
      COUNT(DISTINCT m.id) AS meals_count,
      COUNT(DISTINCT s.id) AS stations_count,
      COUNT(DISTINCT f.external_id) AS foods_count,
      COUNT(DISTINCT f.id) AS food_variants_count,
      COUNT(sf.food_id) AS menu_item_placements_count,
      MIN(m.time_open) AS first_open,
      MAX(m.time_closed) AS last_closed
    FROM restaurants r
    LEFT JOIN meals m ON m.restaurant_id = r.id
    LEFT JOIN stations s ON s.meal_id = m.id
    LEFT JOIN station_foods sf ON sf.station_id = s.id
    LEFT JOIN foods f ON f.id = sf.food_id
    WHERE r.service_date = :serviceDate
    GROUP BY r.id
    ORDER BY r.name ASC
  `, { serviceDate });
  return rows;
}

export async function getRestaurantMenu(restaurantId) {
  const restaurants = await query(`
    SELECT id, name, url, venue_name, source_kind, menu_status,
      DATE_FORMAT(service_date, '%Y-%m-%d') AS service_date
    FROM restaurants
    WHERE id = :restaurantId
  `, { restaurantId });

  if (!restaurants.length) {
    throw notFound('Restaurant not found');
  }

  const meals = await query(`
    SELECT id, restaurant_id, name, time_open, time_closed, menu_status, menu_label, menu_time_label
    FROM meals
    WHERE restaurant_id = :restaurantId
    ORDER BY time_open ASC, id ASC
  `, { restaurantId });

  const rows = await query(`
    SELECT
      m.id AS meal_id,
      s.id AS station_id,
      s.name AS station_name,
      s.source_id AS station_source_id,
      ${foodColumns}
    FROM meals m
    JOIN stations s ON s.meal_id = m.id
    JOIN station_foods sf ON sf.station_id = s.id
    JOIN foods f ON f.id = sf.food_id
    WHERE m.restaurant_id = :restaurantId
    ORDER BY m.time_open ASC, s.name ASC, f.short_name ASC
  `, { restaurantId });

  const metadata = await loadFoodMetadata(rows);
  const stationMap = new Map();
  for (const row of rows) {
    if (!stationMap.has(row.station_id)) {
      stationMap.set(row.station_id, {
        id: row.station_id,
        mealId: row.meal_id,
        name: row.station_name,
        sourceId: row.station_source_id,
        foods: []
      });
    }

    stationMap.get(row.station_id).foods.push(mapFood(row, metadata));
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
  const hasSearch = Boolean(filters.q);

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

  if (hasSearch) {
    params.fullTextSearch = filters.q;
    params.searchLike = `%${escapeLike(filters.q)}%`;
    params.searchPrefix = `${escapeLike(filters.q)}%`;
    params.exactSearch = filters.q;
  }

  if (hasSearch) {
    where.push(`(
      ${foodFullTextExpression} > 0
      OR f.short_name LIKE :searchLike ESCAPE '\\\\'
      OR f.full_name LIKE :searchLike ESCAPE '\\\\'
      OR f.description LIKE :searchLike ESCAPE '\\\\'
      OR f.ingredients LIKE :searchLike ESCAPE '\\\\'
      OR r.name LIKE :searchLike ESCAPE '\\\\'
      OR m.name LIKE :searchLike ESCAPE '\\\\'
      OR s.name LIKE :searchLike ESCAPE '\\\\'
    )`);
  }

  const allergenColumns = parseAllergenFree(filters.allergenFree);
  for (const column of allergenColumns) {
    where.push(`f.${column} = FALSE`);
  }

  const searchSelect = hasSearch
    ? `,
      ${foodFullTextExpression} AS food_search_score,
      CASE
        WHEN f.short_name = :exactSearch THEN 140
        WHEN f.full_name = :exactSearch THEN 130
        WHEN f.short_name LIKE :searchPrefix ESCAPE '\\\\' THEN 94
        WHEN f.full_name LIKE :searchPrefix ESCAPE '\\\\' THEN 84
        WHEN f.short_name LIKE :searchLike ESCAPE '\\\\' THEN 72
        WHEN f.full_name LIKE :searchLike ESCAPE '\\\\' THEN 64
        WHEN s.name LIKE :searchLike ESCAPE '\\\\' THEN 32
        WHEN m.name LIKE :searchLike ESCAPE '\\\\' THEN 24
        WHEN r.name LIKE :searchLike ESCAPE '\\\\' THEN 14
        WHEN f.description LIKE :searchLike ESCAPE '\\\\' THEN 10
        WHEN f.ingredients LIKE :searchLike ESCAPE '\\\\' THEN 6
        ELSE 0
      END AS food_search_boost`
    : '';

  const orderBy = hasSearch
    ? `food_search_boost DESC, food_search_score DESC, f.short_name ASC, m.time_open ASC, s.name ASC`
    : `f.short_name ASC`;

  const rows = await query(`
    SELECT DISTINCT
      ${foodColumns},
      r.id AS restaurant_id,
      r.name AS restaurant_name,
      m.id AS meal_id,
      s.id AS station_id,
      s.name AS station_name,
      m.name AS meal_name,
      m.time_open AS meal_time_open,
      m.time_closed AS meal_time_closed
      ${searchSelect}
    FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    JOIN stations s ON s.meal_id = m.id
    JOIN station_foods sf ON sf.station_id = s.id
    JOIN foods f ON f.id = sf.food_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${resultLimit}
  `, params);

  const metadata = await loadFoodMetadata(rows);
  return rows.map((row) => ({
    ...mapFood(row, metadata),
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    mealId: row.meal_id,
    mealName: row.meal_name,
    mealTimeOpen: row.meal_time_open,
    mealTimeClosed: row.meal_time_closed,
    stationId: row.station_id,
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
      COUNT(DISTINCT f.external_id) AS foods,
      COUNT(DISTINCT f.id) AS food_variants,
      COUNT(sf.food_id) AS menu_item_placements,
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
      started_at, finished_at, status, restaurants_count, meals_count, foods_count,
      distinct_recipes_count, food_variants_count, menu_item_placements_count
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

  const topProteinMetadata = await loadFoodMetadata(topProtein);
  return {
    serviceDate,
    ...rows[0],
    avg_calories: averageCalories?.avg_calories ?? null,
    scraperRun: scraperRun || null,
    topProtein: topProtein.map((row) => mapFood(row, topProteinMetadata))
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

export async function getNutritionInsights(date) {
  const serviceDate = await resolveServiceDate(date);

  const [foodRows, stationRows, mealWindowRows, stationHistoryRows] = await Promise.all([
    query(`
      SELECT
        ${foodColumns},
        MIN(r.id) AS restaurant_id,
        MIN(r.name) AS restaurant_name,
        MIN(m.id) AS meal_id,
        MIN(m.name) AS meal_name,
        MIN(m.time_open) AS meal_time_open,
        MIN(m.time_closed) AS meal_time_closed,
        MIN(s.id) AS station_id,
        MIN(s.name) AS station_name,
        COUNT(DISTINCT CONCAT(r.id, ':', m.id, ':', s.id)) AS appearance_count
      FROM restaurants r
      JOIN meals m ON m.restaurant_id = r.id
      JOIN stations s ON s.meal_id = m.id
      JOIN station_foods sf ON sf.station_id = s.id
      JOIN foods f ON f.id = sf.food_id
      WHERE r.service_date = :serviceDate
      GROUP BY f.id
      ORDER BY f.short_name ASC
    `, { serviceDate }),
    query(`
      SELECT
        service_date,
        restaurant_id,
        restaurant_name,
        meal_id,
        meal_name,
        meal_time_open,
        meal_time_closed,
        station_id,
        station_name,
        COUNT(*) AS food_count,
        ROUND(AVG(calories), 1) AS avg_calories,
        ROUND(AVG(protein), 1) AS avg_protein,
        SUM(protein * 4) AS protein_calories,
        SUM(total_carbohydrates * 4) AS carb_calories,
        SUM(total_fat * 9) AS fat_calories,
        SUM(CASE WHEN vegan THEN 1 ELSE 0 END) AS vegan_items,
        SUM(CASE WHEN vegetarian THEN 1 ELSE 0 END) AS vegetarian_items,
        SUM(CASE WHEN gluten_free THEN 1 ELSE 0 END) AS gluten_free_items,
        SUM(CASE WHEN allergy_milk = FALSE THEN 1 ELSE 0 END) AS milk_free_items,
        SUM(CASE WHEN allergy_wheat = FALSE THEN 1 ELSE 0 END) AS wheat_free_items,
        SUM(CASE WHEN allergy_soy = FALSE THEN 1 ELSE 0 END) AS soy_free_items,
        SUM(CASE WHEN allergy_egg = FALSE THEN 1 ELSE 0 END) AS egg_free_items,
        SUM(CASE WHEN
          allergy_egg = FALSE AND allergy_shellfish = FALSE AND allergy_soy = FALSE
          AND allergy_peanut = FALSE AND allergy_wheat = FALSE AND allergy_tree_nut = FALSE
          AND allergy_milk = FALSE AND allergy_sesame = FALSE AND allergy_fish = FALSE
        THEN 1 ELSE 0 END) AS no_top9_items
      FROM (
        SELECT DISTINCT
          DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
          r.id AS restaurant_id,
          r.name AS restaurant_name,
          m.id AS meal_id,
          m.name AS meal_name,
          m.time_open AS meal_time_open,
          m.time_closed AS meal_time_closed,
          s.id AS station_id,
          s.name AS station_name,
          f.id AS food_id,
          f.calories,
          f.protein,
          f.total_carbohydrates,
          f.total_fat,
          f.vegan,
          f.vegetarian,
          f.gluten_free,
          f.allergy_egg,
          f.allergy_shellfish,
          f.allergy_soy,
          f.allergy_peanut,
          f.allergy_wheat,
          f.allergy_tree_nut,
          f.allergy_milk,
          f.allergy_sesame,
          f.allergy_fish
        FROM restaurants r
        JOIN meals m ON m.restaurant_id = r.id
        JOIN stations s ON s.meal_id = m.id
        JOIN station_foods sf ON sf.station_id = s.id
        JOIN foods f ON f.id = sf.food_id
        WHERE r.service_date = :serviceDate
      ) AS station_foods
      GROUP BY service_date, restaurant_id, meal_id, station_id
      HAVING food_count > 0
      ORDER BY restaurant_name ASC, meal_time_open ASC, station_name ASC
    `, { serviceDate }),
    query(`
      SELECT
        DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
        r.id AS restaurant_id,
        r.name AS restaurant_name,
        r.url,
        r.venue_name,
        r.source_kind,
        r.menu_status AS restaurant_menu_status,
        m.id AS meal_id,
        m.name AS meal_name,
        m.menu_status AS meal_menu_status,
        m.menu_label,
        m.menu_time_label,
        m.time_open,
        m.time_closed,
        COUNT(DISTINCT s.id) AS station_count
      FROM restaurants r
      JOIN meals m ON m.restaurant_id = r.id
      LEFT JOIN stations s ON s.meal_id = m.id
      WHERE r.service_date = :serviceDate
      GROUP BY r.service_date, r.id, m.id
      ORDER BY r.name ASC, m.time_open ASC, m.id ASC
    `, { serviceDate }),
    query(`
      SELECT
        DATE_FORMAT(r.service_date, '%Y-%m-%d') AS service_date,
        r.name AS restaurant_name,
        m.name AS meal_name,
        m.time_open AS meal_time_open,
        m.time_closed AS meal_time_closed,
        s.name AS station_name,
        MIN(CASE WHEN r.service_date = :serviceDate THEN r.id END) AS restaurant_id,
        MIN(CASE WHEN r.service_date = :serviceDate THEN m.id END) AS meal_id,
        MIN(CASE WHEN r.service_date = :serviceDate THEN s.id END) AS station_id,
        COUNT(DISTINCT f.id) AS food_count,
        GROUP_CONCAT(DISTINCT f.external_id ORDER BY f.external_id SEPARATOR '||') AS food_signature
      FROM restaurants r
      JOIN meals m ON m.restaurant_id = r.id
      JOIN stations s ON s.meal_id = m.id
      JOIN station_foods sf ON sf.station_id = s.id
      JOIN foods f ON f.id = sf.food_id
      GROUP BY r.service_date, r.name, m.name, m.time_open, m.time_closed, s.name
      HAVING food_count > 0
      ORDER BY r.service_date ASC, r.name ASC, m.time_open ASC, s.name ASC
    `, { serviceDate })
  ]);

  const insightMetadata = await loadFoodMetadata(foodRows);
  const foods = foodRows.map((row) => mapInsightFood(row, insightMetadata));
  const proteinFoods = foods
    .filter((food) => food.calories > 0 && food.protein > 0)
    .sort((a, b) => b.proteinPer100Calories - a.proteinPer100Calories || b.protein - a.protein || a.calories - b.calories);
  const sodiumOutliers = foods
    .filter((food) => food.sodium > 0 && food.calories > 0)
    .map((food) => ({
      ...food,
      sodiumScore: Number(((food.sodiumPer100Calories * 0.7) + (Math.min(food.sodium, 1800) / 18 * 0.3)).toFixed(1))
    }))
    .sort((a, b) => b.sodiumScore - a.sodiumScore || b.sodium - a.sodium)
    .slice(0, 10);

  return {
    serviceDate,
    mealWindows: mealWindowRows.map(mapMealWindowInsight),
    proteinScatter: proteinFoods.slice(0, insightFoodLimit),
    proteinEfficiency: proteinFoods.slice(0, 8),
    macroFoods: foods
      .filter((food) => food.macroTotalCalories > 0)
      .sort((a, b) => b.macroTotalCalories - a.macroTotalCalories)
      .slice(0, insightFoodLimit),
    sodiumOutliers,
    constraintCoverage: buildConstraintCoverage(foods),
    stationConstraints: stationRows.map(mapStationInsight),
    stationMacroFingerprints: stationRows.map(mapStationInsight),
    specialStations: buildSpecialStations(stationHistoryRows, serviceDate)
  };
}

function mapInsightFood(row, metadata) {
  const food = {
    ...mapFood(row, metadata),
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    mealId: row.meal_id,
    mealName: row.meal_name,
    mealTimeOpen: row.meal_time_open,
    mealTimeClosed: row.meal_time_closed,
    stationId: row.station_id,
    stationName: row.station_name,
    appearanceCount: Number(row.appearance_count || 0)
  };
  const proteinCalories = Number(food.protein || 0) * 4;
  const carbCalories = Number(food.totalCarbohydrates || 0) * 4;
  const fatCalories = Number(food.totalFat || 0) * 9;
  const macroTotalCalories = proteinCalories + carbCalories + fatCalories;

  return {
    ...food,
    dietGroup: getDietGroup(food),
    proteinPer100Calories: Number(food.calories > 0 ? ((food.protein / food.calories) * 100).toFixed(1) : 0),
    sodiumPer100Calories: Number(food.calories > 0 ? ((food.sodium / food.calories) * 100).toFixed(1) : 0),
    macroTotalCalories: Number(macroTotalCalories.toFixed(1)),
    proteinShare: roundShare(proteinCalories, macroTotalCalories),
    carbShare: roundShare(carbCalories, macroTotalCalories),
    fatShare: roundShare(fatCalories, macroTotalCalories)
  };
}

function mapStationInsight(row) {
  const foodCount = Number(row.food_count || 0);
  const proteinCalories = Number(row.protein_calories || 0);
  const carbCalories = Number(row.carb_calories || 0);
  const fatCalories = Number(row.fat_calories || 0);
  const macroTotalCalories = proteinCalories + carbCalories + fatCalories;

  return {
    serviceDate: row.service_date,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    mealId: row.meal_id,
    mealName: row.meal_name,
    mealTimeOpen: row.meal_time_open,
    mealTimeClosed: row.meal_time_closed,
    stationId: row.station_id,
    stationName: row.station_name,
    foodCount,
    avgCalories: Number(row.avg_calories || 0),
    avgProtein: Number(row.avg_protein || 0),
    vegetarianShare: roundShare(Number(row.vegetarian_items || 0), foodCount),
    veganShare: roundShare(Number(row.vegan_items || 0), foodCount),
    glutenFreeShare: roundShare(Number(row.gluten_free_items || 0), foodCount),
    noTop9Share: roundShare(Number(row.no_top9_items || 0), foodCount),
    milkFreeShare: roundShare(Number(row.milk_free_items || 0), foodCount),
    wheatFreeShare: roundShare(Number(row.wheat_free_items || 0), foodCount),
    soyFreeShare: roundShare(Number(row.soy_free_items || 0), foodCount),
    eggFreeShare: roundShare(Number(row.egg_free_items || 0), foodCount),
    proteinShare: roundShare(proteinCalories, macroTotalCalories),
    carbShare: roundShare(carbCalories, macroTotalCalories),
    fatShare: roundShare(fatCalories, macroTotalCalories)
  };
}

function mapMealWindowInsight(row) {
  return {
    serviceDate: row.service_date,
    restaurantId: row.restaurant_id,
    restaurantName: row.restaurant_name,
    url: row.url,
    venueName: row.venue_name,
    sourceKind: row.source_kind,
    restaurantMenuStatus: row.restaurant_menu_status,
    mealId: row.meal_id,
    mealName: row.meal_name,
    mealPeriod: row.meal_name || 'Hours',
    mealMenuStatus: row.meal_menu_status,
    menuLabel: row.menu_label,
    menuTimeLabel: row.menu_time_label,
    timeOpen: row.time_open,
    timeClosed: row.time_closed,
    stationCount: Number(row.station_count || 0)
  };
}

function buildConstraintCoverage(foods) {
  const total = foods.length;
  const rows = [
    ['vegetarian', 'Vegetarian', (food) => food.vegetarian],
    ['vegan', 'Vegan', (food) => food.vegan],
    ['glutenFree', 'Gluten free', (food) => food.glutenFree],
    ['noTop9', 'No top-9 allergens', (food) => hasKnownNoTop9Allergens(food)],
    ['milkFree', 'Milk free', (food) => food.allergens.milk === false],
    ['wheatFree', 'Wheat free', (food) => food.allergens.wheat === false],
    ['soyFree', 'Soy free', (food) => food.allergens.soy === false],
    ['eggFree', 'Egg free', (food) => food.allergens.egg === false]
  ];

  return rows.map(([key, label, predicate]) => {
    const count = foods.filter(predicate).length;
    return {
      key,
      label,
      count,
      total,
      share: roundShare(count, total)
    };
  });
}

function buildSpecialStations(rows, serviceDate) {
  const byKey = new Map();
  for (const row of rows) {
    const period = row.meal_name || 'Hours';
    const key = [
      normalizeStationKey(row.restaurant_name),
      period.toLowerCase(),
      normalizeStationKey(row.station_name)
    ].join(':');
    const item = {
      serviceDate: row.service_date,
      restaurantId: row.restaurant_id,
      restaurantName: row.restaurant_name,
      mealId: row.meal_id,
      mealName: row.meal_name,
      mealPeriod: period,
      mealTimeOpen: row.meal_time_open,
      mealTimeClosed: row.meal_time_closed,
      stationId: row.station_id,
      stationName: row.station_name,
      foodCount: Number(row.food_count || 0),
      foodSignature: row.food_signature || ''
    };

    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(item);
  }

  const specialStations = [];
  for (const groupRows of byKey.values()) {
    const todayRows = groupRows.filter((row) => row.serviceDate === serviceDate && row.stationId);
    if (!todayRows.length) continue;

    for (const today of todayRows) {
      const comparisons = groupRows.filter((row) => row.serviceDate !== serviceDate);
      const signatureCounts = comparisons.reduce((counts, row) => {
        counts.set(row.foodSignature, (counts.get(row.foodSignature) || 0) + 1);
        return counts;
      }, new Map());
      const matchingDates = signatureCounts.get(today.foodSignature) || 0;
      const comparisonDates = comparisons.length;
      const mostCommonSignatureCount = Math.max(0, ...signatureCounts.values());
      const currentShare = comparisonDates ? matchingDates / comparisonDates : 0;
      const baselineShare = comparisonDates ? mostCommonSignatureCount / comparisonDates : 0;
      const differentToday = comparisonDates >= 2
        ? currentShare <= 0.25 && baselineShare >= 0.5
        : comparisonDates === 1 && matchingDates === 0;

      specialStations.push({
        ...today,
        comparisonDates,
        matchingDates,
        currentShare: Number(currentShare.toFixed(3)),
        baselineShare: Number(baselineShare.toFixed(3)),
        differentToday
      });
    }
  }

  return specialStations
    .filter((station) => station.differentToday)
    .sort((a, b) => b.baselineShare - a.baselineShare || a.stationName.localeCompare(b.stationName));
}

function getDietGroup(food) {
  if (food.vegan) return 'Vegan';
  if (food.vegetarian) return 'Vegetarian';
  return 'Omnivore';
}

function hasKnownNoTop9Allergens(food) {
  return Object.values(food.allergens).every((value) => value === false);
}

function roundShare(value, total) {
  return total > 0 ? Number((value / total).toFixed(3)) : 0;
}

function normalizeStationKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
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

async function loadFoodMetadata(rows) {
  const ids = [...new Set(rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
  const nutritionFacts = new Map();
  const dietaryAttributes = new Map();
  if (!ids.length) return { nutritionFacts, dietaryAttributes };

  // IDs originate in the database and are validated integers before interpolation.
  const idList = ids.join(',');
  const [factRows, attributeRows] = await Promise.all([
    query(`
      SELECT food_id, position, label, unit, value, percent_daily_value, is_secondary
      FROM food_nutrition_facts
      WHERE food_id IN (${idList})
      ORDER BY food_id ASC, position ASC
    `),
    query(`
      SELECT food_id, attribute_key, name
      FROM food_dietary_attributes
      WHERE food_id IN (${idList})
      ORDER BY food_id ASC, name ASC
    `)
  ]);

  for (const row of factRows) {
    if (!nutritionFacts.has(row.food_id)) nutritionFacts.set(row.food_id, []);
    nutritionFacts.get(row.food_id).push({
      label: row.label,
      unit: row.unit,
      value: row.value,
      percentDailyValue: row.percent_daily_value,
      isSecondary: Boolean(row.is_secondary)
    });
  }
  for (const row of attributeRows) {
    if (!dietaryAttributes.has(row.food_id)) dietaryAttributes.set(row.food_id, []);
    dietaryAttributes.get(row.food_id).push({ key: row.attribute_key, name: row.name });
  }
  return { nutritionFacts, dietaryAttributes };
}

export function mapFood(row, metadata = { nutritionFacts: new Map(), dietaryAttributes: new Map() }) {
  return {
    id: row.id,
    externalId: row.external_id,
    sourceRecipeId: row.source_recipe_id ?? null,
    contentHash: row.content_hash ?? null,
    shortName: row.short_name,
    fullName: row.full_name,
    description: row.description ?? null,
    ingredients: row.ingredients ?? null,
    disclaimer: row.disclaimer ?? null,
    hideAllergens: Boolean(row.hide_allergens),
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
    addedSugars: row.added_sugars,
    protein: row.protein,
    potassium: row.potassium,
    calcium: row.calcium,
    iron: row.iron,
    vitaminD: row.vitamin_d,
    nutritionFacts: metadata.nutritionFacts.get(row.id) || [],
    dietaryAttributes: metadata.dietaryAttributes.get(row.id) || [],
    vegetarian: nullableBoolean(row.vegetarian),
    vegan: nullableBoolean(row.vegan),
    glutenFree: nullableBoolean(row.gluten_free),
    allergens: {
      egg: nullableBoolean(row.allergy_egg),
      shellfish: nullableBoolean(row.allergy_shellfish),
      soy: nullableBoolean(row.allergy_soy),
      peanut: nullableBoolean(row.allergy_peanut),
      wheat: nullableBoolean(row.allergy_wheat),
      treeNut: nullableBoolean(row.allergy_tree_nut),
      milk: nullableBoolean(row.allergy_milk),
      sesame: nullableBoolean(row.allergy_sesame),
      fish: nullableBoolean(row.allergy_fish)
    }
  };
}

function nullableBoolean(value) {
  return value === null || value === undefined ? null : Boolean(value);
}
