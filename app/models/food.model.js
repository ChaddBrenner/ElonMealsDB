const sql = require("./db.js");

// constructor
const Food = function(food) {
  this.short_name = short_name
  this.full_name = full_name
  this.amount_per_serving = amount_per_serving
  this.type_per_serving = type_per_serving
  this.calories = calories
  this.calories_from_fat = calories_from_fat
  this.total_fat = total_fat
  this.saturated_fat = saturated_fat
  this.trans_fat = trans_fat
  this.cholesterol = cholesterol
  this.sodium = sodium
  this.total_carbohydrates = total_carbohydrates
  this.dietary_fiber = dietary_fiber
  this.sugars = sugars
  this.protein = protein
  this.vegetarian = vegetarian
  this.vegan = vegan
  this.gluten_free = gluten_free
  this.allergy_egg = allergy_egg
  this.allergy_shellfish = allergy_shellfish
  this.allergy_soy = allergy_soy
  this.allergy_peanut = allergy_peanut
  this.allergy_wheat = allergy_wheat
  this.allergy_tree_nut = allergy_tree_nut
  this.allergy_milk = allergy_milk
  this.allergy_sesame = allergy_sesame
  this.allergy_fish = allergy_fish
  this.food_id = food_id
};

Food.findById = (id, result) => {
  sql.query(`SELECT * FROM food WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found food: ", res[0]);
      result(null, res[0]);
      return;
    }

    // not found Food with the id
    result({ kind: "not_found" }, null);
  });
};

Food.findByStationId = (id, result) => {
  sql.query(`SELECT f.id, f.short_name, f.full_name, f.amount_per_serving, f.type_per_serving, f.calories, f.calories_from_fat, f.total_fat, f.saturated_fat, f.trans_fat, f.cholesterol, f.sodium, f.total_carbohydrates, f.dietary_fiber, f.sugars, f.protein, f.vegetarian, f.vegetarian, f.gluten_free, f.allergy_egg, f.allergy_shellfish, f.allergy_soy, f.allergy_peanut, f.allergy_wheat, f.allergy_tree_nut, f.allergy_milk, f.allergy_sesame, f.allergy_fish FROM station_food sf INNER JOIN food f ON sf.food_id = f.id WHERE sf.station_id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found foods: ", res);
      result(null, res);
      return;
    }

    // not found Food with the id
    result({ kind: "not_found" }, null);
  });
};

Food.findNumberOfFavorites = (id, result) => {
  sql.query(`SELECT COUNT(*) FROM user_favorite_food WHERE food_id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found number of foods: ", res);
      result(null, res);
      return;
    }

    // not found Food with the id
    result({ kind: "not_found" }, null);
  });
};

module.exports = Food;