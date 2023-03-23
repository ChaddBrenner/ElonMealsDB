const sql = require("./db.js");

// constructor
const Station = function(station) {
  this.name = meal.name;
};

Station.findById = (id, result) => {
  sql.query(`SELECT * FROM station WHERE id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found station: ", res[0]);
      result(null, res[0]);
      return;
    }

    // not found Station with the id
    result({ kind: "not_found" }, null);
  });
};

Station.findByMealId = (id, result) => {
  sql.query(`SELECT * FROM station WHERE meal_id = ${id}`, (err, res) => {
    if (err) {
      console.log("error: ", err);
      result(err, null);
      return;
    }

    if (res.length) {
      console.log("found stations: ", res);
      result(null, res);
      return;
    }

    // not found Station with the id
    result({ kind: "not_found" }, null);
  });
};

module.exports = Station;