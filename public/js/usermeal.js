async function getRestaurantRequest(restaurantId) {
    let response = await fetch("http://localhost:3000/api/restaurants/" + restaurantId);
    response = await response.json();
    return response;
}

function formatDate(date) {
    // Padding function to add leading zeros if necessary
    const pad = (num) => num.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1); // Adding 1 because months are 0-indexed
    const day = pad(date.getDate());

    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getDate(userMeal, restaurantDate) {
    let dateOpen = new Date(restaurantDate + " " + userMeal.time_open);
    let dateClosed = new Date(restaurantDate + " " + userMeal.time_closed);

    // If the restaurant closes after midnight, add a day to the time_closed
    if (dateOpen > dateClosed) {
        dateClosed.setDate(dateClosed.getDate() + 1);
    }

    // Get the current time
    let currDate = new Date();

    let correctDate = null;

    // See if the current time is between the time open and time closed
    // If not, set the current time to the time open
    if (currDate < dateOpen || currDate > dateClosed) {
        correctDate = dateOpen;
    }
    else {
        correctDate = currDate;
    }
    
    return formatDate(correctDate);
    
}

async function addUserMealRequest(userMealName, date, mealId) {
    let response = await fetch("http://localhost:3000/api/user/meal", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        },
        body: JSON.stringify({
            meal_name: userMealName,
            time_period: date,
            meal_id: mealId
        })
    });

    return response;
}

function addUserMealUI(mealId) {
    let mealButton = document.querySelector("button[meal-id='" + mealId + "']");
    mealButton.classList.add("adding-meal");
    console.log("Meal added!");

    let mealSelector = mealButton.getElementsByClassName("modify-meal-div");
    mealSelector[0].classList.remove("hidden");
}

async function addUserMeal(mealId) {
    // Get the restaurant id from the url parameters
    let urlParams = new URLSearchParams(window.location.search);
    let restaurantId = urlParams.get('id');
    let restaurant = await getRestaurantRequest(restaurantId);

    let restaurantName = restaurant.name;
    let restaurantDate = restaurant.date.substring(0,10);

    // Find the meal with the given mealId
    let userMeal = null;
    for (let meal of meals) {
        if (parseInt(meal.id) === parseInt(mealId)) {
            userMeal = meal;
        }
    }
    
    let userMealName = restaurantDate + " " + restaurantName + " " + userMeal.name;

    let date = getDate(userMeal, restaurantDate);
    
    let response = await addUserMealRequest(userMealName, date, mealId);
    
    if (response.status == 200) {
        console.log("Meal added!");
        addUserMealUI(mealId);
        userMeals.push({id: mealId, foodItems: []});
    }
    else {
        alert("Failed to create meal!");
    }
}

async function removeUserMealRequest(mealId) {
    let response = await fetch("http://localhost:3000/api/user/meal/", {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        },
        body: JSON.stringify({
            meal_id: mealId
        })
    });

    return response;
}

function removeUserMealUI(mealId) {
    let mealButton = document.querySelector("button[meal-id='" + mealId + "']");
    mealButton.classList.remove("adding-meal");

    let mealSelector = mealButton.getElementsByClassName("modify-meal-div");
    mealSelector[0].classList.add("hidden");
}

async function removeUserMeal(mealId) {
    // Check userMeals to see if there are any food items
    // If there are, remove them
    userMeals.forEach((userMeal) => {   
        if (parseInt(userMeal.id) === parseInt(mealId)) {
            userMeal.foodItems.forEach((foodItem) => {
                removeFood(foodItem.id, mealId);
            });
        }
    });


    let response = await removeUserMealRequest(mealId);

    if (response.status == 200) {
        console.log("Meal removed!");
        removeUserMealUI(mealId);
        // Remove from userMeals
        for (let i = 0; i < userMeals.length; i++) {
            if (parseInt(userMeals[i].id) === parseInt(mealId)) {
                userMeals.splice(i, 1);
                break;
            }
        }
    }
    else {
        alert("Failed to remove meal!");
    }
}

async function getUserMealsRequest(restaurantId) {
    let userMeals = await fetch("http://localhost:3000/api/user/meals/restaurant/" + restaurantId, {
        headers: {
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    return userMeals;
}

function getUserMealsUI(userMeals) {
    for (let userMeal of userMeals) {
        let mealButton = document.querySelector("button[meal-id='" + userMeal.id + "']");
        mealButton.classList.add("adding-meal");
        let mealSelector = mealButton.getElementsByClassName("modify-meal-div");
        mealSelector[0].classList.remove("hidden");
    }

    
}

async function getUserMealFoodRequest(userMeal) {
    let foodItems = await fetch("http://localhost:3000/api/user/meal/" + userMeal.id, {
        headers: {
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    return foodItems;
}

function getUserMealFoodUI(foodItems, userMeal) {
    for (let foodItem of foodItems) {
        let foodButtons = document.querySelectorAll("button[data-food-id='" + foodItem.id + "'][meal-id='" + userMeal.id + "'].food-button");
        for (let foodButton of foodButtons) {
            foodButton.innerText = "➖";
            foodButton.removeAttribute("onclick");
            foodButton.setAttribute("onclick", "removeFood('" + foodItem.id + "', '" + userMeal.id + "')");
        }
    }
}

async function getUserMeals(restaurantId) {
    let userMeals = await getUserMealsRequest(restaurantId);
    userMeals = await userMeals.json();
    getUserMealsUI(userMeals);


    for (let userMeal of userMeals) {
        let foodItems = await getUserMealFoodRequest(userMeal);
        foodItems = await foodItems.json();
        getUserMealFoodUI(foodItems, userMeal);
        // Check to see if the user meals has no food items
        // If it does not, remove the user meal
        if (foodItems.length == 0) {
            removeUserMeal(userMeal.id);
        }
        userMeal.foodItems = foodItems;
    }
    
    return userMeals;   
}





