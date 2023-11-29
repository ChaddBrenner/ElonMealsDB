const Restaurant = require("../models/restaurant.model.js");

// Retrieve all restaurants on a date
exports.findByDate = (req, res) => {
  Restaurant.findByDate(req.params.date, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found Restaurant with date ${req.params.date}.`
        });
      } else {
        res.status(500).send({
          message: "Error retrieving Restaurant with id " + req.params.date
        });
      }
    } else res.send(data);
  });
};


// Find a single Restaurant with a id
exports.findById = (req, res) => {
  Restaurant.findById(req.params.id, (err, data) => {
        if (err) {
          if (err.kind === "not_found") {
            res.status(404).send({
              message: `Not found Restaurant with id ${req.params.id}.`
            });
          } else {
            res.status(500).send({
              message: "Error retrieving Restaurant with id " + req.params.id
            });
          }
        } else res.send(data);
      });
};

// Find a single Restaurant with a id
exports.findByIdAll = (req, res) => {
  Restaurant.findByIdAll(req.params.id, (err, data) => {
        if (err) {
          if (err.kind === "not_found") {
            res.status(404).send({
              message: `Not found Restaurant with id ${req.params.id}.`
            });
          } else {
            res.status(500).send({
              message: "Error retrieving Restaurant with id " + req.params.id
            });
          }
        } else res.send(data);
      });
};
