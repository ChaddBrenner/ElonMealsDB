module.exports = app => {
    const restaurants = require("../controllers/restaurant.controller.js");
  
    var router = require("express").Router();
    // Find a single Restaurant with a id
    router.get('/:id', restaurants.findById)

    // Retrieve all Restaurants from the database on a certain date.
    router.get('/date/:date', restaurants.findByDate)

    app.use('/api/restaurants', router);
};