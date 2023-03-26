const sql = require("./db.js");

// constructor
const User = function(user) {
  this.name = user.name;
  this.email = user.email;
  this.calories_goal = user.calories_goal;
  this.database_id = user.database_id;
};

User.checkLogin = (user, error) => {
  // Get whether the user is in the database
  sql.query(`SELECT COUNT(id) FROM user WHERE auth0_id = '${user.sub}'`, (err, data) => {
    // If there is an error, log it
    if (err) {
        console.log("error: ", err);
        error(err);
        return;
    } else {
      // If they are not in the database, add them
      if (data[0]['COUNT(id)'] == 0) {
          sql.query(`INSERT INTO user (name, email, auth0_id) VALUES ('${user.name}', '${user.email}', '${user.sub}')`, (err, data) => {
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
  id = sql.escape(id);

  sql.query(`SELECT name, daily_calories_goal FROM user WHERE auth0_id = '${id}'`, (err, res) => {
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
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  calories_goal = sql.escape(calories_goal);
        
  sql.query(`UPDATE user SET daily_calories_goal = ${calories_goal} WHERE auth0_id = '${id}'`, (err, res) => {
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
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  date = sql.escape(date);

  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
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
                  WHERE um.user_id = ${user_id} AND DATE(time_period) = DATE('${date}');`, (err, res) => {
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
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  food_id = sql.escape(food_id);

  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`INSERT INTO user_favorite_food (user_id, food_id) VALUES (${user_id}, ${food_id})`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("added favorite: ", res);
        result(null, res);
      });
    }
  });
};

User.removeFavorite = (id, food_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  food_id = sql.escape(food_id);

  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
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
  id = sql.escape(id);

  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`SELECT f.id, f.short_name FROM user_favorite_food uff
                  INNER JOIN food f
                    ON f.id = uff.food_id
                  WHERE uff.user_id = ${user_id}`, (err, res) => {
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
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  date = sql.escape(date);
    
  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
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
                  WHERE um.user_id = ${user_id} AND DATE(time_period) = DATE('${date}')
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
  id = sql.escape(id);
  meal_id = sql.escape(meal_id);
  
  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`SELECT f.id, f.short_name, f.calories FROM user_meal um
                  INNER JOIN user_meal_has_food umhf
                    ON umhf.user_meal_id = um.id AND umhf.user_meal_user_id = um.user_id
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

User.addMeal = (id, name, time_period, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  name = sql.escape(name);
  time_period = sql.escape(time_period);

  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`INSERT INTO user_meal (user_id, name, time_period) VALUES (${user_id}, '${name}', '${time_period}')`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("added meal: ", res);
        result(null, res);
      });
    }
  });
};

User.removeMeal = (id, meal_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  meal_id = sql.escape(meal_id);

  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
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

User.addFood = (id, meal_id, food_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  meal_id = sql.escape(meal_id);
  food_id = sql.escape(food_id);

  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`INSERT INTO user_meal_has_food (user_meal_id, user_meal_user_id, food_id) VALUES (${meal_id}, ${user_id}, ${food_id})`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("added food to meal: ", res);
        result(null, res);
      });
    }
  });
};

User.removeFood = (id, meal_id, food_id, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
  meal_id = sql.escape(meal_id);
  food_id = sql.escape(food_id);
  
  sql.query(`SELECT id FROM user WHERE auth0_id = '${id}'`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    } else {
      const user_id = res[0].id;
      sql.query(`DELETE FROM user_meal_has_food WHERE user_meal_id = ${meal_id} AND user_meal_user_id = ${user_id} AND food_id = ${food_id}`, (err, res) => {
        if (err) {
          console.log("error: ", err);
          result(err, null);
          return;
        }
        console.log("removed food from meal: ", res);
        result(null, res);
      });
    }
  });
};

module.exports = User;