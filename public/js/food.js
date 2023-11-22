async function addFoodRequest(foodId, mealId) { 
    let response = await fetch("http://localhost:3000/api/user/meal/food", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        },
        body: JSON.stringify({
            meal_id: mealId,
            food_id: foodId
        })
    });

    return response;
}

function addFoodUI(foodId, mealId) {
    let foodButtons = document.querySelectorAll(`button.food-button[data-food-id="${foodId}"][meal-id="${mealId}"]`);
    for (let foodButton of foodButtons) {
        foodButton.innerText = "➖";
        foodButton.removeAttribute("onclick");
        foodButton.setAttribute("onclick", "removeFood('" + foodId + "', '" + mealId + "')");
    }

    addFoodToPopup(foodId, mealId);
}

async function addFood(foodId, mealId) {
    // Check to see if mealId is in userMeals
    let selectedUserMeal = null;
    for (let userMeal of userMeals) {
        if (parseInt(userMeal.id) === parseInt(mealId)) {
            selectedUserMeal = userMeal;
            break;
        }
    }
    
    // A user meal with the given mealId does not exist, so create it
    if (selectedUserMeal == null) {
        await addUserMeal(mealId);
    }

    // Add the food to the meal
    let response = await addFoodRequest(foodId, mealId);

    if (response.status == 200) {
        console.log("Food added!");
        addFoodUI(foodId, mealId);
        // Add food to foodItems of userMeal in userMeals
        for (let userMeal of userMeals) {
            if (parseInt(userMeal.id) === parseInt(mealId)) {
                userMeal.foodItems.push({id: foodId, quantity: 1});
                break;
            }
        }
    }
    else {
        alert("Failed to add food!");
    }
}

async function removeFoodRequest(foodId, mealId) {
    let response = await fetch("http://localhost:3000/api/user/meal/food", {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        },
        body: JSON.stringify({
            meal_id: mealId,
            food_id: foodId
        })
    });

    return response;
}

function removeFoodUI(foodId, mealId) {
    let foodButtons = document.querySelectorAll(`button.food-button[data-food-id="${foodId}"][meal-id="${mealId}"]`);
    for (let foodButton of foodButtons) {
        foodButton.innerText = "➕";
        foodButton.removeAttribute("onclick");
        foodButton.setAttribute("onclick", "addFood('" + foodId + "', '" + mealId + "')");
    }
}

async function removeFood(foodId, mealId) {
    let response = await removeFoodRequest(foodId, mealId);

    if (response.status == 200) {
        console.log("Food removed!");
        removeFoodUI(foodId, mealId);
        // Remove food from foodItems of userMeal in userMeals
        for (let userMeal of userMeals) {
            if (parseInt(userMeal.id) === parseInt(mealId)) {
                for (let i = 0; i < userMeal.foodItems.length; i++) {
                    if (parseInt(userMeal.foodItems[i].id) === parseInt(foodId)) {
                        userMeal.foodItems.splice(i, 1);
                        break;
                    }
                }
                break;
            }
        }

        // Check to see if removing the food emptied the meal from userMeals, if it did, remove the meal
        let mealIsEmpty = true;
        for (let userMeal of userMeals) {
            if (parseInt(userMeal.id) === parseInt(mealId)) {
                if (userMeal.foodItems.length > 0) {
                    mealIsEmpty = false;
                }
                break;
            }
        }

        if (mealIsEmpty) {
            await removeUserMeal(mealId);
        }
    }
    else {
        alert("Failed to remove food!");
    }
}

async function updateFood(foodId, mealId, quantity) {
    console.log(quantity);
    let response = await fetch("http://localhost:3000/api/user/meal/food", {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        },
        body: JSON.stringify({
            meal_id: mealId,
            food_id: foodId,
            quantity: quantity
        })
    });

    if (response.status == 200) {
        console.log("Food updated!");
        // Update foodItems of userMeal in userMeals
        for (let userMeal of userMeals) {
            if (parseInt(userMeal.id) === parseInt(mealId)) {
                for (let i = 0; i < userMeal.foodItems.length; i++) {
                    if (parseInt(userMeal.foodItems[i].id) === parseInt(foodId)) {
                        userMeal.foodItems[i].quantity = quantity;
                        break;
                    }
                }
                break;
            }
        }
    }
}