ALTER TABLE restaurants
  ADD COLUMN source_kind VARCHAR(32) NOT NULL DEFAULT 'elon_location' AFTER service_date,
  ADD COLUMN menu_status VARCHAR(32) NOT NULL DEFAULT 'available' AFTER source_kind;

ALTER TABLE meals
  ADD COLUMN menu_status VARCHAR(32) NOT NULL DEFAULT 'available' AFTER time_closed,
  ADD COLUMN menu_label VARCHAR(160) NULL AFTER menu_status,
  ADD COLUMN menu_time_label VARCHAR(120) NULL AFTER menu_label;

ALTER TABLE stations
  ADD COLUMN source_id VARCHAR(120) NULL AFTER name;

ALTER TABLE foods
  ADD COLUMN source_recipe_id VARCHAR(120) NULL AFTER external_id,
  ADD COLUMN content_hash CHAR(64) NULL AFTER source_recipe_id,
  ADD COLUMN disclaimer TEXT NULL AFTER ingredients,
  ADD COLUMN hide_allergens BOOLEAN NOT NULL DEFAULT FALSE AFTER disclaimer,
  ADD COLUMN added_sugars DECIMAL(8,2) NULL AFTER sugars,
  ADD COLUMN potassium DECIMAL(8,2) NULL AFTER protein,
  ADD COLUMN calcium DECIMAL(8,2) NULL AFTER potassium,
  ADD COLUMN iron DECIMAL(8,2) NULL AFTER calcium,
  ADD COLUMN vitamin_d DECIMAL(8,2) NULL AFTER iron,
  MODIFY description VARCHAR(700) NULL,
  MODIFY ingredients TEXT NULL;

UPDATE foods
SET content_hash = SHA2(CONCAT_WS('|',
  external_id, short_name, full_name, COALESCE(description, ''), COALESCE(ingredients, ''),
  COALESCE(serving_size_amount, ''), serving_size_unit, COALESCE(calories, ''),
  COALESCE(total_fat, ''), COALESCE(total_carbohydrates, ''), COALESCE(protein, ''),
  COALESCE(vegetarian, ''), COALESCE(vegan, ''), COALESCE(gluten_free, ''),
  COALESCE(allergy_egg, ''), COALESCE(allergy_shellfish, ''), COALESCE(allergy_soy, ''),
  COALESCE(allergy_peanut, ''), COALESCE(allergy_wheat, ''), COALESCE(allergy_tree_nut, ''),
  COALESCE(allergy_milk, ''), COALESCE(allergy_sesame, ''), COALESCE(allergy_fish, '')
), 256)
WHERE content_hash IS NULL;

ALTER TABLE foods
  MODIFY content_hash CHAR(64) NOT NULL,
  DROP INDEX uniq_food_external,
  ADD UNIQUE KEY uniq_food_variant (external_id, content_hash),
  ADD INDEX idx_foods_source_recipe (source_recipe_id);

CREATE TABLE food_nutrition_facts (
  food_id INT NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  label VARCHAR(80) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT '',
  value DECIMAL(12,4) NULL,
  percent_daily_value DECIMAL(8,2) NULL,
  is_secondary BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (food_id, position),
  CONSTRAINT fk_food_nutrition_facts_food FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE,
  INDEX idx_nutrition_facts_label (label)
);

CREATE TABLE food_dietary_attributes (
  food_id INT NOT NULL,
  attribute_key VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  PRIMARY KEY (food_id, attribute_key),
  CONSTRAINT fk_food_dietary_attributes_food FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE,
  INDEX idx_dietary_attributes_name (name)
);

ALTER TABLE scraper_runs
  ADD COLUMN distinct_recipes_count INT NOT NULL DEFAULT 0 AFTER foods_count,
  ADD COLUMN food_variants_count INT NOT NULL DEFAULT 0 AFTER distinct_recipes_count,
  ADD COLUMN menu_item_placements_count INT NOT NULL DEFAULT 0 AFTER food_variants_count;
