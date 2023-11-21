const User = require("../models/user.model.js");


// Retrieve a single User
exports.getUser = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.getUser(req.auth.sub, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error retrieving User"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Update the user's calorie goal
exports.updateCalorieGoal = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.updateCalorieGoal(req.auth.sub, req.body.calories_goal, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error updating User"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Get the number of calories consumed on a date
exports.getCalories = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.getCalories(req.auth.sub, req.params.date, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error retrieving Calories"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}


// Add a food to the user's favorites
exports.addFavorite = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            // TODO: FIX .body to .params where appropriate
            User.addFavorite(req.auth.sub, req.params.food_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error adding Favorite"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Remove a food from the user's favorites
exports.removeFavorite = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.removeFavorite(req.auth.sub, req.params.food_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error removing Favorite"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Get the user's favorites
exports.getFavorites = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.getFavorites(req.auth.sub, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error retrieving Favorites"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Get the user's meals on a date
exports.getMeals = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.getMeals(req.auth.sub, req.params.date, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error retrieving Meals"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Retrieve a meal by id
exports.getMeal = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.getMeal(req.auth.sub, req.params.meal_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error retrieving Meal"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Add a meal to the user's meals
exports.addMeal = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.addMeal(req.auth.sub, req.body.meal_name, req.body.time_period, req.body.meal_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error adding Meal"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Remove a meal from the user's meals
exports.removeMeal = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.removeMeal(req.auth.sub, req.body.meal_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error removing Meal"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Add a food to a meal
exports.addFood = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.addFood(req.auth.sub, req.body.food_id, req.body.meal_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error adding Food"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Remove a food from a meal
exports.removeFood = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.removeFood(req.auth.sub, req.body.food_id, req.body.meal_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error removing Food"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Remove a food from a meal
exports.getFavoritesByRestaurant = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.getFavoritesByRestaurant(req.auth.sub, req.params.restaurant_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error removing Food"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}

// Remove a food from a meal
exports.getMealsByRestaurant = (req, res) => {
    User.checkLogin(req.auth.sub, (err) => {
        if (err) {
            console.log("error: ", err);
            res.status(500).send({
                message: "Error retrieving User"
            });
        } else {
            User.getMealsByRestaurant(req.auth.sub, req.params.restaurant_id, (err, data) => {
                if (err) {
                    console.log("error: ", err);
                    res.status(500).send({
                        message: "Error removing Food"
                    });
                } else {
                    res.send(data);
                }
            });
        }
    });
}
