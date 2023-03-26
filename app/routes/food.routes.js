module.exports = app => {
    const foods = require("../controllers/food.controller.js");
  
    var router = require("express").Router();
    
    // Find a single Food with a id
    router.get('/:id', foods.findById)

    // Retrieve all Foods from the database with a certain station id.
    router.get('/station/:id', foods.findByStationId)

    // Retrieve the number of favorites for a food
    router.get('/favorite/:id', foods.findNumberOfFavorites)

    app.use('/api/foods', router);
};
