const User = require("../models/user.model.js");

// Login the user
// Check to see if their auth0 id is in the database
// If it is not in the database, add it
// If it is in the database, do nothing
exports.login = async (req, res) => {
    await res.oidc.login({
        returnTo: '/profile',
        authorizationParams: {
        redirect_uri: 'http://localhost:3000/callback',
        },
    });

    // const userInfo = await req.oidc.fetchUserInfo();
    // console.log("userInfo: ", userInfo)
    // If they authenticate, check to see if they are in the database
    console.log("req.oidc.isAuthenticated(): ", req.oidc.isAuthenticated());
    if (req.oidc.isAuthenticated()) {
        User.checkLogin(req.oidc.user, (err) => {
            if (err) {
                console.log("error: ", err);
                res.status(500).send({
                    message: "Error retrieving User"
                });
            } else {
            }
        });
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
};

// Get the user's information
exports.getUser = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.updateCalorieGoal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getCalories = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.addFavorite = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.removeFavorite = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getFavorites = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getMeals = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.getMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.addMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.removeMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}

exports.updateMeal = (req, res) => {
    if (req.oidc.isAuthenticated()) {
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
    } else {
        res.status(401).send({
            message: "User not authenticated"
        });
    }
}