import { query } from '../db.js';
import { config } from '../config.js';
import { notFound } from '../errors.js';

const foodColumns = `f.id, f.external_id, f.short_name, f.full_name, f.description, f.ingredients,
  f.serving_size_amount, f.serving_size_unit, f.calories, f.calories_from_fat, f.total_fat,
  f.saturated_fat, f.trans_fat, f.cholesterol, f.sodium, f.total_carbohydrates,
  f.dietary_fiber, f.sugars, f.protein, f.vegetarian, f.vegan, f.gluten_free,
  f.allergy_egg, f.allergy_shellfish, f.allergy_soy, f.allergy_peanut, f.allergy_wheat,
  f.allergy_tree_nut, f.allergy_milk, f.allergy_sesame, f.allergy_fish`;
const foodFullTextExpression = 'MATCH(f.short_name, f.full_name, f.description, f.ingredients) AGAINST (:fullTextSearch IN NATURAL LANGUAGE MODE)';
const semanticCandidateLimit = 5000;
const resultLimit = 200;
const semanticScoreThreshold = 0.68;
const singleTermSemanticScoreThreshold = 0.72;
const insightFoodLimit = 48;

let embeddingTableCache = { checkedAt: 0, exists: false };
const queryEmbeddingCache = new Map();

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
  const hasSearch = Boolean(filters.q);
  const semanticSearch = hasSearch ? await getSemanticSearch(filters.q) : null;

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

  if (hasSearch && !semanticSearch) {
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

  const semanticSelect = semanticSearch
    ? `,
      fse.dimension AS search_embedding_dimension,
      fse.embedding AS search_embedding`
    : '';

  const semanticJoin = semanticSearch
    ? `
    LEFT JOIN food_search_embeddings fse
      ON fse.service_date = r.service_date
      AND fse.restaurant_id = r.id
      AND fse.meal_id = m.id
      AND fse.station_id = s.id
      AND fse.food_id = f.id
      AND fse.model = :semanticModel`
    : '';

  if (semanticSearch) {
    params.semanticModel = semanticSearch.model;
  }

  const orderBy = semanticSearch
    ? `f.short_name ASC, m.time_open ASC, s.name ASC`
    : hasSearch
    ? `food_search_boost DESC, food_search_score DESC, f.short_name ASC, m.time_open ASC, s.name ASC`
    : `f.short_name ASC`;
  const limit = semanticSearch ? semanticCandidateLimit : resultLimit;

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
      ${semanticSelect}
    FROM restaurants r
    JOIN meals m ON m.restaurant_id = r.id
    JOIN stations s ON s.meal_id = m.id
    JOIN station_foods sf ON sf.station_id = s.id
    JOIN foods f ON f.id = sf.food_id
    ${semanticJoin}
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `, params);

  const resultRows = semanticSearch ? rankSemanticRows(rows, semanticSearch.vector, filters.q) : rows;

  return resultRows.map((row) => ({
    ...mapFood(row),
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
        SUM(CASE WHEN NOT allergy_milk THEN 1 ELSE 0 END) AS milk_free_items,
        SUM(CASE WHEN NOT allergy_wheat THEN 1 ELSE 0 END) AS wheat_free_items,
        SUM(CASE WHEN NOT allergy_soy THEN 1 ELSE 0 END) AS soy_free_items,
        SUM(CASE WHEN NOT allergy_egg THEN 1 ELSE 0 END) AS egg_free_items,
        SUM(CASE WHEN NOT (
          allergy_egg OR allergy_shellfish OR allergy_soy OR allergy_peanut OR allergy_wheat
          OR allergy_tree_nut OR allergy_milk OR allergy_sesame OR allergy_fish
        ) THEN 1 ELSE 0 END) AS no_top9_items
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
          COALESCE(f.calories, 0) AS calories,
          COALESCE(f.protein, 0) AS protein,
          COALESCE(f.total_carbohydrates, 0) AS total_carbohydrates,
          COALESCE(f.total_fat, 0) AS total_fat,
          COALESCE(f.vegan, 0) AS vegan,
          COALESCE(f.vegetarian, 0) AS vegetarian,
          COALESCE(f.gluten_free, 0) AS gluten_free,
          COALESCE(f.allergy_egg, 0) AS allergy_egg,
          COALESCE(f.allergy_shellfish, 0) AS allergy_shellfish,
          COALESCE(f.allergy_soy, 0) AS allergy_soy,
          COALESCE(f.allergy_peanut, 0) AS allergy_peanut,
          COALESCE(f.allergy_wheat, 0) AS allergy_wheat,
          COALESCE(f.allergy_tree_nut, 0) AS allergy_tree_nut,
          COALESCE(f.allergy_milk, 0) AS allergy_milk,
          COALESCE(f.allergy_sesame, 0) AS allergy_sesame,
          COALESCE(f.allergy_fish, 0) AS allergy_fish
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
        m.id AS meal_id,
        m.name AS meal_name,
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

  const foods = foodRows.map((row) => mapInsightFood(row));
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

function mapInsightFood(row) {
  const food = {
    ...mapFood(row),
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
    mealId: row.meal_id,
    mealName: row.meal_name,
    mealPeriod: getMealPeriod(row.time_open, row.meal_name),
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
    ['noTop9', 'No top-9 allergens', (food) => !hasTop9Allergen(food)],
    ['milkFree', 'Milk free', (food) => !food.allergens.milk],
    ['wheatFree', 'Wheat free', (food) => !food.allergens.wheat],
    ['soyFree', 'Soy free', (food) => !food.allergens.soy],
    ['eggFree', 'Egg free', (food) => !food.allergens.egg]
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
    const period = getMealPeriod(row.meal_time_open, row.meal_name);
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

function hasTop9Allergen(food) {
  return Object.values(food.allergens).some(Boolean);
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

function getMealPeriod(timeOpen, fallback) {
  const hour = getHour(timeOpen);
  if (hour !== null) {
    if (hour < 10) return 'Breakfast';
    if (hour < 16) return 'Lunch';
    return 'Dinner';
  }
  return fallback || 'Meal';
}

function getHour(value) {
  const match = String(value || '').match(/[T\s](\d{2}):/);
  return match ? Number(match[1]) : null;
}

async function getSemanticSearch(searchText) {
  if (!config.SEMANTIC_SEARCH_ENABLED || !config.EMBEDDING_SERVICE_URL) {
    return null;
  }
  if (!await hasEmbeddingTable()) {
    return null;
  }

  const vector = await getQueryEmbedding(searchText);
  return vector ? { vector, model: config.FASTEMBED_MODEL } : null;
}

async function hasEmbeddingTable() {
  const now = Date.now();
  if (now - embeddingTableCache.checkedAt < 60000) {
    return embeddingTableCache.exists;
  }

  try {
    const rows = await query(`
      SELECT COUNT(*) AS table_count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'food_search_embeddings'
      LIMIT 1
    `);
    embeddingTableCache = {
      checkedAt: now,
      exists: Number(rows[0]?.table_count || 0) > 0
    };
  } catch {
    embeddingTableCache = { checkedAt: now, exists: false };
  }
  return embeddingTableCache.exists;
}

async function getQueryEmbedding(searchText) {
  const cacheKey = `${config.FASTEMBED_MODEL}\n${searchText.trim().toLowerCase()}`;
  if (queryEmbeddingCache.has(cacheKey)) {
    return queryEmbeddingCache.get(cacheKey);
  }

  const endpoint = `${config.EMBEDDING_SERVICE_URL.replace(/\/$/, '')}/embed`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.EMBEDDING_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: searchText,
        model: config.FASTEMBED_MODEL
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const vector = normalizeVector(payload.embedding);
    if (!vector) {
      return null;
    }
    queryEmbeddingCache.set(cacheKey, vector);
    if (queryEmbeddingCache.size > 100) {
      queryEmbeddingCache.delete(queryEmbeddingCache.keys().next().value);
    }
    return vector;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function rankSemanticRows(rows, queryVector, searchText) {
  const nutritionIntent = getNutritionIntent(searchText);
  const activeSemanticThreshold = getSemanticScoreThreshold(searchText);
  return rows
    .map((row) => {
      const textScore = getTextSearchScore(row);
      const semanticScore = getSemanticScore(queryVector, row.search_embedding);
      const nutritionScore = getNutritionScore(row, nutritionIntent);
      const nutritionMatch = passesNutritionIntent(row, nutritionIntent);
      const effectiveTextScore = nutritionIntent && !nutritionMatch ? 0 : textScore;
      return {
        ...row,
        _searchScore: (effectiveTextScore * 4) + (semanticScore * 50) + nutritionScore,
        _semanticScore: semanticScore,
        _textScore: effectiveTextScore,
        _nutritionMatch: nutritionMatch
      };
    })
    .filter((row) => row._textScore > 0 || row._nutritionMatch || (!nutritionIntent && row._semanticScore >= activeSemanticThreshold))
    .sort((a, b) => {
      const scoreDelta = b._searchScore - a._searchScore;
      if (scoreDelta !== 0) return scoreDelta;
      const nameDelta = a.short_name.localeCompare(b.short_name);
      if (nameDelta !== 0) return nameDelta;
      const timeDelta = String(a.meal_time_open).localeCompare(String(b.meal_time_open));
      if (timeDelta !== 0) return timeDelta;
      return a.station_name.localeCompare(b.station_name);
    })
    .slice(0, resultLimit);
}

function getSemanticScoreThreshold(searchText) {
  return searchText.trim().split(/\s+/).length === 1
    ? singleTermSemanticScoreThreshold
    : semanticScoreThreshold;
}

function getTextSearchScore(row) {
  const boost = Number(row.food_search_boost || 0);
  const fullText = Math.min(Number(row.food_search_score || 0) * 20, 15);
  return boost + fullText;
}

function getSemanticScore(queryVector, embeddingBlob) {
  const rowVector = decodeVector(embeddingBlob);
  if (!rowVector || rowVector.length !== queryVector.length) {
    return 0;
  }

  let score = 0;
  for (let index = 0; index < queryVector.length; index += 1) {
    score += queryVector[index] * rowVector[index];
  }
  return Math.max(0, Math.min(1, score));
}

function getNutritionIntent(searchText) {
  const text = searchText.toLowerCase();
  const metric = [
    ['protein', ['protein']],
    ['calories', ['calorie', 'calories', 'kcal']],
    ['carbs', ['carb', 'carbs', 'carbohydrate', 'carbohydrates']],
    ['fat', ['fat', 'fats']]
  ].find(([, terms]) => terms.some((term) => text.includes(term)))?.[0];

  if (!metric) return null;

  const low = /\b(low|lower|lowest|less|least|few|fewer|light|under)\b/.test(text);
  const high = /\b(high|higher|highest|more|most|rich|heavy|max|best)\b/.test(text);
  return {
    metric,
    direction: low ? 'low' : high ? 'high' : metric === 'protein' ? 'high' : null
  };
}

function getNutritionScore(row, intent) {
  if (!intent) return 0;
  const value = getNutritionValue(row, intent.metric);
  if (intent.direction === 'low') {
    const ceiling = intent.metric === 'calories' ? 700 : 50;
    return (1 - Math.min(value / ceiling, 1)) * 60;
  }
  if (intent.direction === 'high') {
    const target = intent.metric === 'protein' ? 35 : intent.metric === 'calories' ? 800 : 60;
    return Math.min(value / target, 1) * 70;
  }
  return 0;
}

function passesNutritionIntent(row, intent) {
  if (!intent || !intent.direction) return false;
  const value = getNutritionValue(row, intent.metric);
  if (intent.direction === 'high') {
    if (intent.metric === 'protein') return value >= 8;
    if (intent.metric === 'calories') return value >= 400;
    return value >= 12;
  }
  if (intent.metric === 'calories') return value > 0 && value <= 300;
  if (intent.metric === 'protein') return value <= 5;
  return value <= 8;
}

function getNutritionValue(row, metric) {
  if (metric === 'protein') return Number(row.protein || 0);
  if (metric === 'calories') return Number(row.calories || 0);
  if (metric === 'carbs') return Number(row.total_carbohydrates || 0);
  if (metric === 'fat') return Number(row.total_fat || 0);
  return 0;
}

function decodeVector(value) {
  if (!value || !Buffer.isBuffer(value) || value.length % 4 !== 0) {
    return null;
  }

  const vector = [];
  for (let offset = 0; offset < value.length; offset += 4) {
    vector.push(value.readFloatLE(offset));
  }
  return vector;
}

function normalizeVector(value) {
  if (!Array.isArray(value) || !value.length) {
    return null;
  }

  const vector = value.map((item) => Number(item));
  if (vector.some((item) => !Number.isFinite(item))) {
    return null;
  }

  const norm = Math.sqrt(vector.reduce((sum, item) => sum + (item * item), 0));
  if (norm <= 0) {
    return null;
  }
  return vector.map((item) => item / norm);
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
