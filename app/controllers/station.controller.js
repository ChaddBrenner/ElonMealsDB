const Station = require("../models/station.model.js");

// Find a single Station with a id
exports.findById = (req, res) => {
  Station.findById(req.params.id, (err, data) => {
        if (err) {
          if (err.kind === "not_found") {
            res.status(404).send({
              message: `Not found Station with id ${req.params.id}.`
            });
          } else {
            res.status(500).send({
              message: "Error retrieving Station with id " + req.params.id
            });
          }
        } else res.send(data);
      });
};

exports.findByMealId = (req, res) => {
  Station.findByMealId(req.params.id, (err, data) => {
        if (err) {
          if (err.kind === "not_found") {
            res.status(404).send({
              message: `Not found Station with meal id ${req.params.id}.`
            });
          } else {
            res.status(500).send({
              message: "Error retrieving Station with meal id " + req.params.id
            });
          }
        } else res.send(data);
      });
}
