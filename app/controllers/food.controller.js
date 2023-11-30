const Food = require("../models/food.model.js");

// Retrieve food information with a id
exports.findById = (req, res) => {
  Food.findById(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found Food with id ${req.params.id}.`
        });
      } else {
        res.status(500).send({
          message: "Error retrieving Food with id " + req.params.id
        });
      }
    } else res.send(data);
  });
};

// Retrieve all foods from a station with a station id
exports.findByStationId = (req, res) => {
  Food.findByStationId(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found Food with station id ${req.params.id}.`
        });
      } else {
        res.status(500).send({
          message: "Error retrieving Food with station id " + req.params.id
        });
      }
    } else res.send(data);
  });
}

// Retrieve the number of favorites for a food with a food id
exports.findNumberOfFavorites = (req, res) => {
  Food.findNumberOfFavorites(req.params.id, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found Food with id ${req.params.id}.`
        });
      } else {
        res.status(500).send({
          message: "Error retrieving Food with id " + req.params.id
        });
      }
    } else res.send(data);
  });
}


exports.findNumberOfFoodsByDate = (req, res) => {
  Food.findNumberOfFoodsByDate(req.params.date, (err, data) => {
    if (err) {
      if (err.kind === "not_found") {
        res.status(404).send({
          message: `Not found Food with date ${req.params.date}.`
        });
      } else {
        res.status(500).send({
          message: "Error retrieving Food with date " + req.params.date
        });
      }
    } else res.send(data);
  });
}

  