module.exports = app => {
    const stations = require("../controllers/station.controller.js");
  
    var router = require("express").Router();
    // Find a single Station with a id
    router.get('/:id', stations.findById)

    // Retrieve all Stations from the database with a certain Meal id.
    router.get('/meal/:id', stations.findByMealId)

    app.use('/api/stations', router);
};