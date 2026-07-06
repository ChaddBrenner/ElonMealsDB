INSERT INTO restaurants (id, name, url, venue_name, service_date) VALUES
  (1, 'Lakeside Dining Hall', 'https://www.elondining.com/locations/lakeside-dining-hall/?date=2026-07-01', 'Lakeside Dining Hall', '2026-07-01'),
  (2, 'McEwen Food Hall', 'https://www.elondining.com/locations/mcewen-food-hall/?date=2026-07-01', 'Historic Neighborhood', '2026-07-01'),
  (3, 'Clohan Hall', 'https://www.elondining.com/locations/clohan-hall/?date=2026-07-01', 'Global Neighborhood', '2026-07-01');

INSERT INTO meals (id, restaurant_id, name, time_open, time_closed) VALUES
  (1, 1, 'Summer Break Breakfast', '2026-07-01 08:00:00', '2026-07-01 08:30:00'),
  (2, 1, 'Summer Break Lunch', '2026-07-01 11:00:00', '2026-07-01 14:00:00'),
  (3, 2, 'Lunch', '2026-07-01 11:00:00', '2026-07-01 15:00:00'),
  (4, 3, 'Dinner', '2026-07-01 17:00:00', '2026-07-01 20:00:00');

INSERT INTO stations (id, meal_id, name) VALUES
  (1, 1, 'fruit and yogurt bar'),
  (2, 1, 'griddle'),
  (3, 2, 'greens and grains'),
  (4, 2, 'comfort kitchen'),
  (5, 3, 'market bowls'),
  (6, 3, 'phoenix grill'),
  (7, 4, 'plant forward'),
  (8, 4, 'homestyle');

INSERT INTO foods (
  id, external_id, short_name, full_name, description, ingredients, serving_size_amount, serving_size_unit,
  calories, calories_from_fat, total_fat, saturated_fat, trans_fat, cholesterol, sodium,
  total_carbohydrates, dietary_fiber, sugars, protein, vegetarian, vegan, gluten_free,
  allergy_egg, allergy_shellfish, allergy_soy, allergy_peanut, allergy_wheat, allergy_tree_nut,
  allergy_milk, allergy_sesame, allergy_fish
) VALUES
  (1, 'cmVjaXBlOjE0MTI5NA', 'Nonfat Plain Greek Yogurt', 'Nonfat Plain Greek Yogurt', 'Creamy nonfat plain Greek yogurt', 'Cultured nonfat milk with live and active cultures', 0.50, 'cup', 110, 0, 0, 0, 0, 10, 45, 4, 0, 4, 10, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE),
  (2, 'cmVjaXBlOjUzNDQ5OA', 'Overnight Oats', 'Overnight Oats', 'Old fashioned oats with oat milk, cinnamon, vanilla, and maple syrup', 'Oat milk, rolled oats, maple syrup, cinnamon, vanilla extract', 0.50, 'cup', 280, 45, 5, 1, 0, 0, 160, 51, 2, 15, 6, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (3, 'cmVjaXBlOjE5NjIwNw', 'Fresh Cracked Scrambled Egg', 'Fresh Cracked Scrambled Egg', 'Fresh-cracked eggs', 'Cage free shell egg, canola oil', 1.00, 'egg', 80, 45, 5, 1.5, 0, 210, 65, 0, 0, 0, 6, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (4, 'cmVjaXBlOjExNTk3OA', 'Crispy Tater Tots', 'Crispy Tater Tots', 'Piping hot crispy tater tots', 'Potatoes, vegetable oil, salt, natural flavor', 0.50, 'cup', 190, 126, 14, 1, 0, 0, 340, 15, 1, 0.6, 1, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (5, 'cmVjaXBlOjMwNTY2Mg', 'Red Hawk Brassica Lettuce', 'Red Hawk Brassica Lettuce', 'Mixed salad greens', 'Mixed salad greens, arcadian harvest', 1.00, 'cup', 15, 0, 0, 0, 0, 0, 10, 3, 2, 1, 1, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (6, 'cmVjaXBlOjI4NDYzMw', 'Marinated Tofu', 'Marinated Tofu', 'Rosemary lemon marinated tofu', 'Super firm tofu, garlic, lemon, rosemary, canola oil', 3.00, 'oz', 140, 72, 8, 1, 0, 0, 210, 4, 1, 1, 13, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (7, 'cmVjaXBlOjExNTkwNA', 'Diced Grilled Chicken', 'Diced Grilled Chicken', 'Seasoned grilled chicken breast', 'Chicken breast, kosher salt, black pepper', 3.00, 'oz', 160, 36, 4, 1, 0, 85, 280, 0, 0, 0, 29, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (8, 'cmVjaXBlOjIyNDUxMg', 'Blackened Catfish', 'Blackened Catfish', 'Cajun-seasoned catfish fillet', 'Catfish, butter, cajun seasoning, paprika, garlic salt', 4.00, 'oz', 210, 90, 10, 4, 0, 75, 410, 2, 0, 0, 26, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE),
  (9, 'cmVjaXBlOjMwNDg3OA', 'Chipotle Black Beans and Tofu', 'Chipotle Black Beans and Tofu', 'Smoky black beans and tofu with jalapeno and lime', 'Tofu, black beans, tomato, nutritional yeast, tamari, jalapeno, lime', 0.75, 'cup', 230, 63, 7, 1, 0, 0, 390, 27, 8, 4, 15, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (10, 'cmVjaXBlOjE2MjIwNA', 'Grilled Chicken Breast', 'Grilled Chicken Breast', 'Simple grilled chicken breast', 'Chicken breast, salt, black pepper, canola oil', 4.00, 'oz', 180, 36, 4, 1, 0, 95, 260, 0, 0, 0, 34, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  (11, 'cmVjaXBlOjI2ODUxNw', 'Black Bean Burger', 'Black Bean Burger', 'Spiced vegetarian black bean burger', 'Black beans, brown rice, soy protein, onions, corn, bulgur wheat', 1.00, 'patty', 210, 45, 5, 1, 0, 0, 520, 32, 6, 3, 11, TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
  (12, 'cmVjaXBlOjE5NjUzNw', 'Orzo and Rice Pilaf', 'Orzo & Rice Pilaf', 'Lemon parsley rice pilaf with orzo', 'Orzo pasta, rice, onion, vegetable broth, parsley, garlic', 0.75, 'cup', 240, 27, 3, 0, 0, 0, 360, 44, 2, 2, 7, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE);

INSERT INTO station_foods (station_id, food_id) VALUES
  (1, 1), (1, 2), (2, 3), (2, 4),
  (3, 5), (3, 6), (3, 7), (4, 8), (4, 12),
  (5, 5), (5, 9), (6, 10), (6, 11),
  (7, 6), (7, 9), (8, 8), (8, 12);

INSERT INTO scraper_runs (
  source_url, target_date, started_at, finished_at, status, restaurants_count, meals_count, foods_count, error_message
) VALUES (
  'https://www.elondining.com/menu-hours/?date=2026-07-01',
  '2026-07-01',
  '2026-07-01 09:00:00',
  '2026-07-01 09:00:18',
  'success',
  3,
  4,
  12,
  NULL
);
