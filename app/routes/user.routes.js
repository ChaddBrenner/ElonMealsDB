module.exports = (app, checkJwt) => {
    const users = require("../controllers/user.controller.js");
  
    var router = require("express").Router();
    
    /////////////////////////
    // User Information    //
    /////////////////////////

    // Get the name and calorie goal from the user
    router.get('/api/user', checkJwt, users.getUser)

    // Update the user's calorie goal
    router.put('/api/user/calorie_goal/', checkJwt, users.updateCalorieGoal)
    
    // Get the number of calories that the user has consumed on a certain date
    router.get('/api/user/calories/:date', checkJwt, users.getCalories)

    /////////////////////////
    // User Favorites      //
    /////////////////////////

    // Add a food to the user's favorites
    router.post('/api/user/favorite/:food_id', checkJwt, users.addFavorite)

    // Remove a food from the user's favorites
    router.delete('/api/user/favorite/:food_id', checkJwt, users.removeFavorite)

    // Get the user's favorites
    router.get('/api/user/favorites', checkJwt, users.getFavorites)

    // Get the user's favorites given a restaurant id
    router.get('/api/user/favorites/:restaurant_id', checkJwt, users.getFavoritesByRestaurant)

    /////////////////////////
    // User Meals          //
    /////////////////////////

    // Append a food to a user's meal given a meal id and a food id
    router.post('/api/user/meal/food', checkJwt, users.addFood)

    // Update the quantity of a food in a user's meal given a meal id and a food id
    router.put('/api/user/meal/food', checkJwt, users.updateFood)

    // Remove a food from a user's meal given a meal id and a food id
    router.delete('/api/user/meal/food', checkJwt, users.removeFood)

    // Get a user's meal given a user meal id (getting foods in the meal)
    router.get('/api/user/meal/:meal_id', checkJwt, users.getMeal)

    // Get a user's meals given a date
    router.get('/api/user/meals/:date', checkJwt, users.getMeals)

    // Get a user's meals given a restaurant id
    router.get('/api/user/meals/restaurant/:restaurant_id', checkJwt, users.getMealsByRestaurant)

    // Add a meal to the user's meals
    router.post('/api/user/meal', checkJwt, users.addMeal)

    // Remove a meal from the user's meals
    router.delete('/api/user/meal/', checkJwt, users.removeMeal)



    app.use('/', router);
};