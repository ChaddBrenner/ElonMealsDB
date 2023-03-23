module.exports = app => {
    const meals = require("../controllers/meal.controller.js");
  
    var router = require("express").Router();
    // Find a single Meal with a id
    router.get('/:id', meals.findById)

    // Retrieve all Meals from the database on a certain date.
    router.get('/date/:date', meals.findByDate)

    // Retrieve all Meals from the database with a certain restaurant id.
    router.get('/restaurant/:id', meals.findByRestaurantId)

    app.use('/api/meals', router);
};