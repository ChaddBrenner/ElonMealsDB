const sql = require("./db.js");
const clense = require('../misc/clense.js')

// constructor
const User = function(user) {
  this.calories_goal = user.calories_goal;
  this.id = user.id;
};

User.checkLogin = (id, error) => {
  // Sanitize the user to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    console.log("id not number");
    error({ kind: "not_found" }, null);
    return;
  }

  id = clense.escape(id);

  // Get whether the user is in the database
  sql.query(`SELECT COUNT(id) FROM user WHERE id = ${id}`, (err, data) => {
    // If there is an error, log it
    if (err) {
        console.log("error: ", err);
        error(err);
        return;
    } else {
      // If they are not in the database, add them
      if (data[0]['COUNT(id)'] == 0) {
          sql.query(`INSERT INTO user (id) VALUES (${id})`, (err, data) => {
            // If there is an error, log it
            if (err) {
                console.log("error: ", err);
                error(err);
                return;
            } else {
                console.log("User added to database");
                error(null);
            }
        });
      }
      else {
        console.log("User already in database");
        error(null);
      }
    }
  });
}

User.getUser = (id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  id = clense.escape(id);

  sql.query(`SELECT daily_calories_goal FROM user WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    console.log("found user: ", res);
    result(null, res);
  });
};

User.updateCalorieGoal = (id, calories_goal, result) => {
  // Sanitize the id and calories goal to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
      result({ kind: "not_found" }, null);
      return;
  }

  id = clense.escape(id);

  if (!clense.isNumber(calories_goal)) {
    result({ kind: "not_found" }, null);
    return;
  }
  calories_goal = clense.escape(calories_goal);

  sql.query(`UPDATE user SET daily_calories_goal = ${calories_goal} WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    console.log("updated user: ", res);
    result(null, res);
  });
};

User.getCalories = (id, date, result) => {
  // Sanitize the id and date to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  id = clense.escape(id);

  if (!clense.isDate(date)) {
    result({ kind: "not_found" }, null);
    return;
  }

  date = clense.escape(date);
  
  sql.query(`SELECT id FROM user WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`SELECT SUM(f.calories) FROM user_meal um
                  INNER JOIN user_meal_has_food umhf
                    ON umhf.user_meal_id = um.id AND umhf.user_meal_user_id = um.user_id
                  INNER JOIN food f
                    ON f.id = umhf.food_id
                  WHERE um.user_id = ${user_id} AND DATE(time_period) = DATE(${date});`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("found calories: ", res);
        result(null, res);
      });
    }
  });
};

User.addFavorite = (id, food_id, result) => {
  // Sanitize the id and food id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  id = clense.escape(id);

  if (!clense.isNumber(food_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  food_id = clense.escape(food_id);

    sql.query(`INSERT INTO user_favorite_food (user_id, food_id) VALUES (${id}, ${food_id}) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), food_id = VALUES(food_id)`, (err, res) => {
      if (err) {
        console.log("error: ", err);
        result(err, null);
        return;
      }
      console.log("added favorite: ", res);
      result(null, res);
    });
};

User.removeFavorite = (id, food_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isNumber(food_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  food_id = clense.escape(food_id);

  sql.query(`SELECT id FROM user WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`DELETE FROM user_favorite_food WHERE user_id = ${user_id} AND food_id = ${food_id}`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("removed favorite: ", res);
        result(null, res);
      });
    }
  });
};

User.getFavorites = (id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];
  
  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  sql.query(`SELECT id FROM user WHERE id = ${id}`, (err, res) => {
    let currDate = new Date();
    currDate = currDate.toISOString().substring(0,10);
    console.log(currDate);
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      sql.query(`SELECT f.id AS food_id, f.short_name AS food_name, s.name AS station_name, m.name AS meal_name, r.name AS restaurant_name, r.date AS restaurant_date FROM user_favorite_food uff
      INNER JOIN food f
        ON f.id = uff.food_id
        INNER JOIN station_food sf
            ON sf.food_id = f.id
        INNER JOIN station s
            ON s.id = sf.station_id
        INNER JOIN meal m
            ON m.id = s.meal_id
        INNER JOIN restaurant r
            ON r.id = m.restaurant_id
      WHERE uff.user_id = ${id} AND r.date = '${currDate}';`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("found favorites: ", res);
        result(null, res);
      });
    }
  });
};

User.getMeals = (id, date, result) => {
  id = id.split('|')[1];
  // Sanitize the id to prevent SQL injection
  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isDate(date)) {
    result({ kind: "not_found" }, null);
    return;
  }

  date = clense.escape(date);

  sql.query(`SELECT id FROM user WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`SELECT um.id, um.name, um.time_period, SUM(f.calories) AS calories FROM user_meal um
                  INNER JOIN user_meal_has_food umhf
                    ON umhf.user_meal_id = um.id AND umhf.user_meal_user_id = um.user_id
                  INNER JOIN food f
                    ON f.id = umhf.food_id
                  WHERE um.user_id = ${user_id} AND DATE(time_period) = DATE(${date})
                  GROUP BY um.id`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("found meals: ", res);
        result(null, res);
      });
    }
  });
};

User.getMeal = (id, meal_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isNumber(meal_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  meal_id = clense.escape(meal_id);
  
  sql.query(`SELECT id FROM user WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`SELECT f.id FROM user_meal um
                  INNER JOIN user_meal_has_food umhf
                    ON umhf.user_meal_id = um.id
                  INNER JOIN food f
                    ON f.id = umhf.food_id
                  WHERE um.user_id = ${user_id} AND um.id = ${meal_id}`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("found meal: ", res);
        result(null, res);
      });
    }
  });
};

User.addMeal = (id, name, time_period, meal_id, result) => {
  console.log(name, time_period);
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  name = clense.escape(name);

  if (!clense.isDateTime(time_period)) {
    result({ kind: "not_found" }, null);
    return;
  }

  time_period = clense.escape(time_period);

  if (!clense.isNumber(meal_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  meal_id = clense.escape(meal_id);

  sql.query(`INSERT INTO user_meal (user_id, name, time_period, id) VALUES (${id}, ${name}, ${time_period}, ${meal_id})`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }
    console.log("added meal: ");
    result(null, { success: true });
  });
};

User.removeMeal = (id, meal_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];
  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isNumber(meal_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  meal_id = clense.escape(meal_id);

  sql.query(`SELECT id FROM user WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`DELETE FROM user_meal WHERE user_id = ${user_id} AND id = ${meal_id}`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("removed meal: ", res);
        result(null, res);
      });
    }
  });
};

User.addFood = (id, food_id, meal_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];
  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isNumber(meal_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  meal_id = clense.escape(meal_id);

  if (!clense.isNumber(food_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  food_id = clense.escape(food_id);

  sql.query(`INSERT INTO user_meal_has_food (user_meal_id, user_meal_user_id, food_id) VALUES (${meal_id}, ${id}, ${food_id})`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }
    console.log("added food to meal: ", res);
    result(null, { success: true });
  });
};

User.removeFood = (id, food_id, meal_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isNumber(meal_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  meal_id = clense.escape(meal_id);

  if (!clense.isNumber(food_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  food_id = clense.escape(food_id);

  sql.query(`DELETE FROM user_meal_has_food WHERE food_id = ${food_id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }
    console.log("removed food from meal: ", res);
    result(null, { success: true });
  });
};

User.getFavoritesByRestaurant = (id, restaurant_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isNumber(restaurant_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  restaurant_id = clense.escape(restaurant_id);

  sql.query(`SELECT DISTINCT f.id FROM restaurant r
  INNER JOIN meal m ON r.id = m.restaurant_id
  INNER JOIN station s on s.meal_id = m.id
  INNER JOIN station_food sf on sf.station_id = s.id
  INNER JOIN food f ON f.id = sf.food_id
  INNER JOIN user_favorite_food uff ON uff.food_id = f.id
  WHERE uff.user_id = ${id} AND r.id = ${restaurant_id};`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    console.log("found favorites: ", res);
    result(null, res);
  });
};

User.getMealsByRestaurant = (id, restaurant_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = id.split('|')[1];

  if (!clense.isNumber(id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  if (!clense.isNumber(restaurant_id)) {
    result({ kind: "not_found" }, null);
    return;
  }

  restaurant_id = clense.escape(restaurant_id);

  sql.query(`SELECT um.id FROM restaurant r
  INNER JOIN meal m ON r.id = m.restaurant_id
  INNER JOIN user_meal um ON m.id = um.id
  INNER JOIN user u ON um.user_id = u.id
  WHERE u.id = ${id} AND r.id = ${restaurant_id};`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    console.log("found meals: ", res);
    result(null, res);
  });
};

module.exports = User;