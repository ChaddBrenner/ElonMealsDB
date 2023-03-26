const sql = require("./db.js");

// constructor
const Meal = function(meal) {
  this.name = meal.name;
  this.time_open = meal.time_open;
  this.time_closed = meal.time_closed;
};

Meal.findById = (id, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);
    
  sql.query(`SELECT * FROM meal WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found meal: ", res[0]);
      result(null, res[0]);
      return;
    }

    // not found Meal with the id
    result({ kind: "not_found" }, null);
  });
};

Meal.findByDate = (date, result) => {
  // Sanitize the id to prevent SQL injection
  date = sql.escape(date);

  sql.query(`SELECT * FROM meal WHERE restaurant_date = ${date}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found meals: ", res);
      result(null, res);
      return;
    }

    // not found Meal with the id
    result({ kind: "not_found" }, null);
  });
};

Meal.findByRestaurantId = (id, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);

  sql.query(`SELECT * FROM meal WHERE restaurant_id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found restaurant: ", res);
      result(null, res);
      return;
    }

    // not found Tutorial with the id
    result({ kind: "not_found" }, null);
  });
};

module.exports = Meal;