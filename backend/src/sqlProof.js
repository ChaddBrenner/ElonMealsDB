export const sqlProof = [
  {
    title: 'Menu hierarchy',
    route: 'GET /api/restaurants/:id/menu',
    summary: 'Builds Restaurant -> Meal -> Station -> Food from normalized tables.',
    sql: `SELECT m.id AS meal_id, s.id AS station_id, f.id AS food_id
FROM meals m
JOIN stations s ON s.meal_id = m.id
JOIN station_foods sf ON sf.station_id = s.id
JOIN foods f ON f.id = sf.food_id
WHERE m.restaurant_id = ?`
  },
  {
    title: 'Full-text food search',
    route: 'GET /api/foods',
    summary: 'Filters foods by date, dietary flags, allergens, calories, and protein; ranks text queries with a food FULLTEXT index plus exact/context boosts.',
    sql: `SELECT DISTINCT f.id, f.short_name, f.calories, f.protein,
       MATCH(f.short_name, f.full_name, f.description, f.ingredients)
         AGAINST (? IN NATURAL LANGUAGE MODE) AS food_search_score
FROM restaurants r
JOIN meals m ON m.restaurant_id = r.id
JOIN stations s ON s.meal_id = m.id
JOIN station_foods sf ON sf.station_id = s.id
JOIN foods f ON f.id = sf.food_id
WHERE r.service_date = ?
  AND f.vegan = ?
  AND f.protein >= ?
  AND (
    MATCH(f.short_name, f.full_name, f.description, f.ingredients)
      AGAINST (? IN NATURAL LANGUAGE MODE) > 0
    OR r.name LIKE ?
    OR m.name LIKE ?
    OR s.name LIKE ?
  )
ORDER BY food_search_score DESC, f.short_name ASC`
  },
  {
    title: 'Coverage metrics',
    route: 'GET /api/metrics/coverage',
    summary: 'Counts distinct foods, stations, and dietary coverage for a service date.',
    sql: `SELECT COUNT(DISTINCT r.id) AS restaurants,
       COUNT(DISTINCT m.id) AS meals,
       COUNT(DISTINCT s.id) AS stations,
       COUNT(DISTINCT f.id) AS foods
FROM restaurants r
LEFT JOIN meals m ON m.restaurant_id = r.id
LEFT JOIN stations s ON s.meal_id = m.id
LEFT JOIN station_foods sf ON sf.station_id = s.id
LEFT JOIN foods f ON f.id = sf.food_id
WHERE r.service_date = ?`
  },
  {
    title: 'Station nutrition comparison',
    route: 'GET /api/metrics/stations',
    summary: 'Ranks stations by average nutrition using grouped normalized menu rows.',
    sql: `SELECT r.name AS restaurant, m.name AS meal, s.name AS station,
       COUNT(DISTINCT f.id) AS food_count,
       ROUND(AVG(f.calories), 1) AS avg_calories,
       ROUND(AVG(f.protein), 1) AS avg_protein
FROM restaurants r
JOIN meals m ON m.restaurant_id = r.id
JOIN stations s ON s.meal_id = m.id
JOIN station_foods sf ON sf.station_id = s.id
JOIN foods f ON f.id = sf.food_id
WHERE r.service_date = ?
GROUP BY r.service_date, r.id, m.id, s.id
ORDER BY avg_protein DESC, food_count DESC`
  }
];
