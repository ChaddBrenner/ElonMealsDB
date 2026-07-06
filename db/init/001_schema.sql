CREATE TABLE restaurants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  url VARCHAR(500) NOT NULL,
  venue_name VARCHAR(120) NOT NULL,
  service_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_restaurant_day (name, service_date),
  INDEX idx_restaurants_date (service_date)
);

CREATE TABLE meals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  name VARCHAR(80) NOT NULL,
  time_open DATETIME NOT NULL,
  time_closed DATETIME NOT NULL,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  INDEX idx_meals_restaurant (restaurant_id)
);

CREATE TABLE stations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  meal_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  INDEX idx_stations_meal (meal_id)
);

CREATE TABLE foods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(120) NOT NULL,
  short_name VARCHAR(180) NOT NULL,
  full_name VARCHAR(220) NOT NULL,
  description VARCHAR(700) NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL,
  serving_size_amount DECIMAL(8,2) NOT NULL DEFAULT 0,
  serving_size_unit VARCHAR(40) NOT NULL DEFAULT '',
  calories DECIMAL(8,2) NOT NULL DEFAULT 0,
  calories_from_fat DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_fat DECIMAL(8,2) NOT NULL DEFAULT 0,
  saturated_fat DECIMAL(8,2) NOT NULL DEFAULT 0,
  trans_fat DECIMAL(8,2) NOT NULL DEFAULT 0,
  cholesterol DECIMAL(8,2) NOT NULL DEFAULT 0,
  sodium DECIMAL(8,2) NOT NULL DEFAULT 0,
  total_carbohydrates DECIMAL(8,2) NOT NULL DEFAULT 0,
  dietary_fiber DECIMAL(8,2) NOT NULL DEFAULT 0,
  sugars DECIMAL(8,2) NOT NULL DEFAULT 0,
  protein DECIMAL(8,2) NOT NULL DEFAULT 0,
  vegetarian BOOLEAN NOT NULL DEFAULT FALSE,
  vegan BOOLEAN NOT NULL DEFAULT FALSE,
  gluten_free BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_egg BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_shellfish BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_soy BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_peanut BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_wheat BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_tree_nut BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_milk BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_sesame BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_fish BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY uniq_food_external (external_id),
  INDEX idx_foods_calories (calories),
  INDEX idx_foods_protein (protein),
  FULLTEXT KEY ft_food_search (short_name, full_name, description, ingredients)
);

CREATE TABLE station_foods (
  station_id INT NOT NULL,
  food_id INT NOT NULL,
  PRIMARY KEY (station_id, food_id),
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
);

CREATE TABLE scraper_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_url VARCHAR(500) NOT NULL,
  target_date DATE NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  status ENUM('success', 'failed', 'partial') NOT NULL,
  restaurants_count INT NOT NULL DEFAULT 0,
  meals_count INT NOT NULL DEFAULT 0,
  foods_count INT NOT NULL DEFAULT 0,
  error_message VARCHAR(500) NULL,
  INDEX idx_scraper_runs_target_date (target_date, started_at)
);
