const Food = require("../models/food.model.js");

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
