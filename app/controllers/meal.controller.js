const Meal = require("../models/meal.model.js");

// Retrieve all Tutorials from the database (with condition).
exports.findByDate = (req, res) => {
  Meal.findByDate(req.params.date, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found Meal with date ${req.params.date}.`
        });
      } else {
        res.status(500).send({
          message: "Error retrieving Meal with date " + req.params.date
        });
      }
    } else res.send(data);
  });
};


// Find a single Restaurant with a id
exports.findById = (req, res) => {
  Meal.findById(req.params.id, (err, data) => {
        if (err) {
          if (err.kind === "not_found") {
            res.status(404).send({
              message: `Not found Meal with id ${req.params.id}.`
            });
          } else {
            res.status(500).send({
              message: "Error retrieving Meal with id " + req.params.id
            });
          }
        } else res.send(data);
      });
};

exports.findByRestaurantId = (req, res) => {
  Meal.findByRestaurantId(req.params.id, (err, data) => {
        if (err) {
          if (err.kind === "not_found") {
            res.status(404).send({
              message: `Not found Meal with restaurant id ${req.params.id}.`
            });
          } else {
            res.status(500).send({
              message: "Error retrieving Meal with restaurant id " + req.params.id
            });
          }
        } else res.send(data);
      });
}
