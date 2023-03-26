const User = require("../models/user.model.js");


// Get the user's information
exports.getUser = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.getUser(req.oidc.user.sub, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.updateCalorieGoal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.updateCalorieGoal(req.oidc.user.sub, req.body.calories_goal, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getCalories = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.getCalories(req.oidc.user.sub, req.params.date, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.addFavorite = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.addFavorite(req.oidc.user.sub, req.body.food_id, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.removeFavorite = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.removeFavorite(req.oidc.user.sub, req.body.food_id, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getFavorites = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.getFavorites(req.oidc.user.sub, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getMeals = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.getMeals(req.oidc.user.sub, req.params.date, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.getMeal(req.oidc.user.sub, req.params.meal_id, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.addMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.addMeal(req.oidc.user.sub, req.body.meal, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.removeMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.removeMeal(req.oidc.user.sub, req.body.meal_id, (err, data) => {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.updateMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
                User.updateMeal(req.oidc.user.sub, req.body.meal, (err, data) => {
                    if (err) {
                        console.log("error: ", err);
                        res.status(500).send({
                            message: "Error updating Meal"
                        });
                    } else {
                        res.send(data);
                    }
                });
            }
        });
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}