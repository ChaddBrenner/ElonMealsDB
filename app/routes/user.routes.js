module.exports = app => {
    const users = require("../controllers/user.controller.js");
  
    var router = require("express").Router();

    // Handle user login to add them to the DB if they are not already there
    router.get('/login', users.login);

    /////////////////////////
    // User Information    //
    /////////////////////////

    // Get the name and calorie goal from the user
    router.get('/api/user', users.getUser)

    // Update the user's calorie goal
    router.put('/api/user/calorie_goal/', users.updateCalorieGoal)
    
    // Get the number of calories that the user has consumed on a certain date
    router.get('/api/user/calories/:date', users.getCalories)

    /////////////////////////
    // User Favorites      //
    /////////////////////////

    // Add a food to the user's favorites
    router.post('/api/user/favorite/:food_id', users.addFavorite)

    // Remove a food from the user's favorites
    router.delete('/api/user/favorite/:food_id', users.removeFavorite)

    // Get the user's favorites
    router.get('/api/user/favorites', users.getFavorites)

    /////////////////////////
    // User Meals          //
    /////////////////////////

    // Get a user's meal given a meal id (getting foods in the meal)
    router.get('/api/user/meal/:meal_id', users.getMeal)

    // Get a user's meals given a date
    router.get('/api/user/meals/:date', users.getMeals)

    // Add a meal to the user's meals
    router.post('/api/user/meal', users.addMeal)

    // Remove a meal from the user's meals
    router.delete('/api/user/meal/:meal_id', users.removeMeal)

    // Append a food to a user's meal given a meal id and a food id
    // router.post('/api/user/meal/:meal_id/food/:food_id', users.appendFood)

    // Remove a food from a user's meal given a meal id and a food id
    // router.delete('/api/user/meal/:meal_id/food/:food_id', users.removeFood)

    // Get the number of calories in a user's meal given a meal id
    // router.get('/api/user/meal/:meal_id/calories', requiresAuth(), users.getMealCalories)

    app.use('/', router);
};