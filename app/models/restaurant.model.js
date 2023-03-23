const sql = require("./db.js");

// constructor
const Restaurant = function(restaurant) {
  this.name = restaurant.name;
  this.url = restaurant.url;
  this.date = restaurant.date;
};

Restaurant.findById = (id, result) => {
  console.log(id)
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