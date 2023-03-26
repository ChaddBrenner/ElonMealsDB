const sql = require("./db.js");

// constructor
const Restaurant = function(restaurant) {
  this.name = restaurant.name;
  this.url = restaurant.url;
  this.date = restaurant.date;
};

Restaurant.findById = (id, result) => {
  // Sanitize the id to prevent SQL injection
  id = sql.escape(id);

  // Make sure the id is a number
  if (isNaN(id)) {
    result({ kind: "not_found" }, null);
    return;
  }
      
  sql.query(`SELECT * FROM restaurant WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found restaurant: ", res[0]);
      result(null, res[0]);
      return;
    }

    // not found Tutorial with the id
    result({ kind: "not_found" }, null);
  });
};

Restaurant.findByDate = (date, result) => {
  // Sanitize the id to prevent SQL injection
  date = sql.escape(date);

  sql.query(`SELECT * FROM restaurant WHERE date = '${date}'`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found restaurants: ", res);
      result(null, res);
      return;
    }

    // not found Tutorial with the id
    result({ kind: "not_found" }, null);
  });
};

module.exports = Restaurant;