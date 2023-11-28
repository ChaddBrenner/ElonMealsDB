const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const restaurantId = urlParams.get('id');

// The Auth0 client, initialized in configureClient()
let auth0Client = null;
var userMeals = [];

/**
 * Starts the authentication flow
 */
const login = async (targetUrl) => {
  try {
    console.log("Logging in", targetUrl);

    const options = {
      authorizationParams: {
        redirect_uri: window.location.origin
      }
    };

    if (targetUrl) {
      options.appState = { targetUrl };
    }

    await auth0Client.loginWithRedirect(options);
  } catch (err) {
    console.log("Log in failed", err);
  }
};

/**
 * Executes the logout flow
 */
const logout = async () => {
  try {
    console.log("Logging out");
    await auth0Client.logout({
      logoutParams: {
        returnTo: window.location.origin
      }
    });
  } catch (err) {
    console.log("Log out failed", err);
  }
};

/**
 * Initializes the Auth0 client
 */
const configureClient = async () => {
  auth0Client = await auth0.createAuth0Client({
    domain: "dev-ilbuu4john1p274i.us.auth0.com",
    clientId: "Q5vXLbd5NoMtXFAiPjjXHuC0POe4Cqdf",
    authorizationParams: {
        redirect_uri: window.location.href,
        audience: 'http://localhost:3000', 
        scope: 'openid profile email',
    }
  });
};

// Will run when page finishes loading
window.onload = async () => {
    let foods = await getFoods(restaurantId);
    await displayFoods(foods);
    await configureClient();

    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
        console.log("> User is authenticated");
        await getFavoriteFoods(restaurantId);
        userMeals = await getUserMeals(restaurantId);
        updateNutrition();
    }
    else {
    console.log("> User not authenticated");
    }
};


// Map of food id to food object
// Scope so that we can access it in the food link event listener
var foodMap = new Map();
let meals = [];

async function getFoods(restaurantId) {
    meals = await fetch("http://localhost:3000/api/meals/restaurant/" + restaurantId);
    if (meals.status == 404) {
        return [];
    }

    meals = await meals.json();

    for (let meal of meals) {
        let stations = await fetch("http://localhost:3000/api/stations/meal/" + meal.id);
        if (stations.status == 404) {
            continue;
        }

        stations = await stations.json();

        for (let station of stations) {
            let foods = await fetch("http://localhost:3000/api/foods/station/" + station.id);
            if (foods.status == 404) {
                continue;
            }

            foods = await foods.json();
            station.foods = foods;
            for (let food of foods) {
                let food_id = food.id;
                foodMap.set(food_id, food);
            }
        }
        meal.stations = stations;
    } 
    return meals;
}

function isActive(meal) {
    let currTime = new Date();

    let timeOpen = new Date()
    timeOpen.setHours(meal.time_open.substring(0,2));
    timeOpen.setMinutes(meal.time_open.substring(3,5));
    timeOpen.setSeconds(0);

    let timeClosed = new Date()
    timeClosed.setMinutes(meal.time_closed.substring(3,5));
    timeClosed.setHours(meal.time_closed.substring(0,2));
    timeClosed.setSeconds(0);

    if (timeOpen > timeClosed) {
        timeClosed.setDate(timeClosed.getDate() + 1);
    }

    if (currTime >= timeOpen && currTime <= timeClosed) {
        return true;
    }

    return false;
}

function openTab(mealId) {
    let stationList = document.getElementsByClassName('station');

    for (station of stationList) {
        if (station.getAttribute("meal-id") == mealId) {
            station.classList.remove("hidden");
        }
        else {
            station.classList.add("hidden");
        }
    }

    // Update the active button
    let tabButtons = document.getElementsByClassName("tab-button");
    for (button of tabButtons) {
        if (button.getAttribute("meal-id") == mealId) {
            button.classList.add("active");
        }
        else {
            button.classList.remove("active");
        }
    }
}

function openFood(foodId) {
    document.getElementById("food-description-panel").classList.remove("hidden");
    let food = foodMap.get(parseInt(foodId));

    document.getElementById("food-short-name").innerText = food.short_name;
    if (food.full_name) {
        document.getElementById("food-full-name").innerText = food.full_name;
    }
    else {
        document.getElementById("food-full-name").innerText = "";
    }
    document.getElementById("food-per-serving").innerText = food.amount_per_serving + " " + food.type_per_serving + " per serving";

    let allergyList = document.getElementById("food-allergens");

    while (allergyList.firstChild) {
        allergyList.removeChild(allergyList.firstChild);
    }

    let allergies = [food.allergy_egg, food.allergy_shellfish, food.allergy_soy, food.allergy_peanut, food.allergy_wheat, food.allergy_tree_nut, food.allergy_milk, food.allergy_sesame, food.allergy_fish];
    let allergyNames = ["Egg", "Shellfish", "Soy", "Peanut", "Wheat", "Tree Nut", "Milk", "Sesame", "Fish"];

    for (let i = 0; i < allergies.length; i++) {
        let allergy = allergies[i];
        if (allergy == 1) {
            let allergyItem = document.createElement("li");
            allergyItem.classList.add("allergy-item");
            allergyItem.innerText = allergyNames[i];
            allergyList.appendChild(allergyItem);

        }
    }

    if (food.gluten_free) {
        document.getElementById("food-gluten-free").classList.remove("hidden");
    }
    else {
        document.getElementById("food-gluten-free").classList.add("hidden");
    }

    if (food.vegetarian) {
        document.getElementById("food-vegetarian").classList.remove("hidden");
    }
    else {
        document.getElementById("food-vegetarian").classList.add("hidden");
    }

    if (food.vegan) {
        document.getElementById("food-vegan").classList.remove("hidden");
    }
    else {
        document.getElementById("food-vegan").classList.add("hidden");
    }

    document.getElementById("table-calories").innerText = food.calories;
    document.getElementById("table-calories-from-fat").innerText = food.calories_from_fat;
    document.getElementById("table-total-fat").innerText = food.total_fat;
    document.getElementById("table-saturated-fat").innerText = food.saturated_fat;
    document.getElementById('table-trans-fat').innerText = food.trans_fat;
    document.getElementById("table-cholesterol").innerText = food.cholesterol;
    document.getElementById("table-sodium").innerText = food.sodium;
    document.getElementById("table-carbohydrates").innerText = food.total_carbohydrates;
    document.getElementById("table-dietary-fiber").innerText = food.dietary_fiber;
    document.getElementById("table-sugars").innerText = food.sugars;
    document.getElementById("table-protein").innerText = food.protein;
}

function closeFoodDescription() {
    document.getElementById("food-description-panel").classList.add("hidden");
}

function convertTime(time) {
    time = time.split(':'); // convert to array

    // fetch
    var hours = Number(time[0]);
    var minutes = Number(time[1]);
    var seconds = Number(time[2]);

    // calculate
    var timeValue;

    if (hours > 0 && hours <= 12) {
    timeValue= "" + hours;
    } else if (hours > 12) {
    timeValue= "" + (hours - 12);
    } else if (hours == 0) {
    timeValue= "12";
    }
    
    timeValue += (minutes < 10) ? ":0" + minutes : ":" + minutes;  // get minutes
    // timeValue += (seconds < 10) ? ":0" + seconds : ":" + seconds;  // get seconds
    timeValue += (hours >= 12) ? " P.M." : " A.M.";  // get AM/PM

    return timeValue;
}


function createMealSelectorButton(meal) {
    let mealButton = document.createElement("button");
    mealButton.classList.add("tab-button");
    mealButton.innerText = meal.name;
    mealButton.setAttribute('meal-id', meal.id);
    mealButton.setAttribute("onclick", "openTab('" + meal.id + "')");
    if (isActive(meal)) {
        mealButton.classList.add("active");
    }

    let mealSelectorDiv = document.createElement("div");
    mealSelectorDiv.classList.add("meal-selector-item");

    let mealTime = document.createElement("span");
    mealTime.classList.add("meal-time");
    mealTime.innerText = convertTime(meal.time_open) + " - " + convertTime(meal.time_closed);

    let modifyMealDiv = document.createElement("div");
    modifyMealDiv.classList.add("modify-meal-div");
    modifyMealDiv.classList.add("hidden");

    let deleteMeal = document.createElement("button");
    deleteMeal.classList.add("delete-meal");
    deleteMeal.innerText = "❌";
    deleteMeal.setAttribute("onclick", "removeUserMeal('" + meal.id + "')");

    let editMeal = document.createElement("button");
    editMeal.classList.add("edit-meal");
    editMeal.innerText = "✏️";
    editMeal.setAttribute("onclick", "editMeal('" + meal.id + "')");

    modifyMealDiv.appendChild(deleteMeal);
    modifyMealDiv.appendChild(editMeal);
    
    mealButton.appendChild(mealTime);
    mealButton.appendChild(modifyMealDiv);
    
    return mealButton;
}

function createStationDiv(station, meal) {
    let stationDiv = document.createElement("div");
    stationDiv.classList.add("station");
    stationDiv.classList.add(meal.name.replace(" ", ""));
    stationDiv.setAttribute("station-id", station.id);
    stationDiv.setAttribute("meal-id", station.meal_id);
    if (!isActive(meal)) {
        stationDiv.classList.add("hidden");
    }

    let stationName = document.createElement("h2");
    stationName.innerText = station.name;
    
    stationDiv.appendChild(stationName);

    return stationDiv;
}

function createFoodList() {
    let foodList = document.createElement("ul");
    foodList.classList.add("food-list");

    return foodList;
}

function createFoodDiv(food, station) {
    let foodDiv = document.createElement("div");
    foodDiv.classList.add("food-div");
    foodDiv.setAttribute("data-food-id", food.id);
    foodDiv.setAttribute("station-id", station.id);
    foodDiv.setAttribute("meal-id", station.meal_id);

    return foodDiv;
}

function createFoodButton(food, station, meal) {
    let foodButton = document.createElement("button");
    foodButton.classList.add("food-button");
    foodButton.innerText = "➕";
    foodButton.setAttribute("data-food-id", food.id);
    foodButton.setAttribute("onclick", "addFood('" + food.id + "'" + ", '" + meal.id + "'" + ")");
    foodButton.setAttribute("station-id", station.id);
    foodButton.setAttribute("meal-id", station.meal_id);

    return foodButton;
}

function createFoodFavoriteButton(food, station) {
    let foodFavoriteButton = document.createElement("button");
    foodFavoriteButton.classList.add("food-favorite-button");
    foodFavoriteButton.innerText = "❤️";
    foodFavoriteButton.setAttribute("data-food-id", food.id);
    foodFavoriteButton.setAttribute("onclick", "addFavoriteFood('" + food.id + "')");
    foodFavoriteButton.setAttribute("station-id", station.id);
    foodFavoriteButton.setAttribute("meal-id", station.meal_id);

    return foodFavoriteButton;
}

function createFoodLink(food) {
    let foodLink = document.createElement("a");
    foodLink.setAttribute("href", "#");
    foodLink.innerText = food.short_name;
    foodLink.setAttribute("data-food-id", food.id);
    foodLink.classList.add("food-link");

    return foodLink;
}

function createFoodItem(food, station, meal) {
    let foodItem = document.createElement("li");
    foodItem.classList.add("food-item");

    let foodDiv = createFoodDiv(food, station);

    let foodButton = createFoodButton(food, station, meal);
    foodDiv.appendChild(foodButton);

    let foodFavoriteButton = createFoodFavoriteButton(food, station);
    foodDiv.appendChild(foodFavoriteButton);

    let foodLink = createFoodLink(food);
    foodDiv.appendChild(foodLink);

    if (food.gluten_free) {
        let glutenFree = document.createElement("img");
        glutenFree.setAttribute("src", "images/glutenFree2.png");
        glutenFree.classList.add("gluten-free");
        foodDiv.appendChild(glutenFree);
    }

    if (food.vegetarian) {
        let vegetarian = document.createElement("img");
        vegetarian.setAttribute("src", "images/vegetarian2.png");
        vegetarian.classList.add("vegetarian");
        foodDiv.appendChild(vegetarian);
    }

    if (food.vegan) {
        let vegan = document.createElement("img");
        vegan.setAttribute("src", "images/vegan2.png");
        vegan.classList.add("vegan");
        foodDiv.appendChild(vegan);
    }

    foodItem.appendChild(foodDiv);

    return foodItem;
}

async function displayFoods(foods) {
    let mealSelector = document.getElementById("meal-selector");
    for (let meal of foods) {
        let mealButton = createMealSelectorButton(meal);
        mealSelector.appendChild(mealButton);

        let stationList = document.getElementById("station-list");

        if (meal.stations) {
            for (station of meal.stations) {
                let stationDiv = createStationDiv(station, meal);
                stationList.appendChild(stationDiv);

                let foodList = createFoodList();
                stationDiv.appendChild(foodList);
                
                for (food of station.foods) {
                    let foodItem = createFoodItem(food, station, meal);
                    foodList.appendChild(foodItem);
                }
            }
        }
    }

    // Select the first meal
    let firstMeal = document.getElementsByClassName("tab-button")[0];
    firstMeal.click();

    const foodItems = document.getElementsByClassName("food-link");
    for (foodItem of foodItems) {
        foodItem.addEventListener("click", (e) => {
            let foodId = e.target.getAttribute("data-food-id");
            openFood(foodId);
        });
    }
}

function editMeal() {
    let foodPopup = document.getElementById("food-popup");
    foodPopup.classList.remove("hidden");
    updateNutrition();
}

function addNutritionItem(foodIndiv) {
    // Add the nutrition of the food to the total nutrition
    let food = foodMap.get(parseInt(foodIndiv.id));
    food.quantity = foodIndiv.quantity;

    let foodItem = document.createElement("li");
    foodItem.classList.add("food-item");
    foodItem.setAttribute("data-food-id", food.id);

    let foodName = document.createElement("span");
    foodName.classList.add("food-name");
    foodName.innerText = food.short_name;

    let foodCalories = document.createElement("span");
    foodCalories.classList.add("food-calories");
    foodCalories.innerText = food.calories * food.quantity + " kcal";

    let removeFoodButton = document.createElement("button");
    removeFoodButton.classList.add("remove-food");
    removeFoodButton.innerText = "X";
    removeFoodButton.setAttribute("data-food-id", food.id);
    removeFoodButton.addEventListener("click", async (e) => {
        await removeFood(food.id, userMeals[0].id);

        updateNutrition(userMeals);
    });

    let subtractFoodButton = document.createElement("button");
    subtractFoodButton.classList.add("subtract-food");
    subtractFoodButton.innerText = "-";
    subtractFoodButton.addEventListener("click", async (e) => {
        if (food.quantity == 1) {
            return;
        }
        await updateFood(food.id, userMeals[0].id, parseInt(food.quantity) - 1);
        food.quantity = parseInt(food.quantity) - 1;
        foodQuantity.innerText = food.quantity;
        foodCalories.innerText = food.calories * food.quantity + " kcal";

        updateNutrition(userMeals);
    });

    // Add a button to add another food
    let addFoodButton = document.createElement("button");
    addFoodButton.classList.add("add-food");
    addFoodButton.innerText = "+";
    addFoodButton.addEventListener("click", async (e) => {
        await updateFood(food.id, userMeals[0].id, parseInt(food.quantity) + 1);
        food.quantity = parseInt(food.quantity) + 1;
        foodQuantity.innerText = food.quantity;
        foodCalories.innerText = food.calories * food.quantity + " kcal";

        updateNutrition(userMeals);
    });

    // add text showing the quantity
    let foodQuantity = document.createElement("span");
    foodQuantity.classList.add("food-quantity");
    foodQuantity.innerText = food.quantity;
    foodQuantity.setAttribute("data-food-id", food.id);

    foodItem.appendChild(removeFoodButton);
    foodItem.appendChild(subtractFoodButton);
    foodItem.appendChild(addFoodButton);
    foodItem.appendChild(foodQuantity);
    foodItem.appendChild(foodName);
    foodItem.appendChild(foodCalories);

    document.getElementById("popup-list").appendChild(foodItem);
}

function removeNutritionItem(foodIndiv) {
    let foodItem = document.querySelector("li[data-food-id='" + foodIndiv.id + "']");
    foodItem.remove();
}


function updateNutrition() {
    let nutrition = {
        calories: 0,
        calories_from_fat: 0,
        total_fat: 0,
        saturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        sodium: 0,
        total_carbohydrates: 0,
        dietary_fiber: 0,
        sugars: 0,
        protein: 0,
    };

    let foodQuantities = document.getElementsByClassName('food-quantity')

    for (let foodQuantity of foodQuantities) {
        let foodItem = foodMap.get(parseInt(foodQuantity.getAttribute("data-food-id")));
        foodItem.quantity = parseInt(foodQuantity.innerText);

        foodItem = foodMap.get(parseInt(foodItem.id));
        nutrition.calories += foodItem.calories * foodItem.quantity;
        nutrition.calories_from_fat += foodItem.calories_from_fat * foodItem.quantity;
        nutrition.total_fat += foodItem.total_fat * foodItem.quantity;
        nutrition.saturated_fat += foodItem.saturated_fat * foodItem.quantity;
        nutrition.trans_fat += foodItem.trans_fat * foodItem.quantity;
        nutrition.cholesterol += foodItem.cholesterol * foodItem.quantity;
        nutrition.sodium += foodItem.sodium * foodItem.quantity;
        nutrition.total_carbohydrates += foodItem.total_carbohydrates * foodItem.quantity;
        nutrition.dietary_fiber += foodItem.dietary_fiber * foodItem.quantity;
        nutrition.sugars += foodItem.sugars * foodItem.quantity;
        nutrition.protein += foodItem.protein * foodItem.quantity;
    };
        
    document.getElementById("totalCalories").innerText = nutrition.calories;
    document.getElementById("totalCaloriesFat").innerText = nutrition.calories_from_fat;
    document.getElementById("totalFat").innerText = nutrition.total_fat;
    document.getElementById("saturatedFat").innerText = nutrition.saturated_fat;
    document.getElementById("cholesterol").innerText = nutrition.cholesterol;
    document.getElementById("sodium").innerText = nutrition.sodium;
    document.getElementById("totalCarbohydrates").innerText = nutrition.total_carbohydrates;
    document.getElementById("dietaryFiber").innerText = nutrition.dietary_fiber;
    document.getElementById("sugars").innerText = nutrition.sugars;
    document.getElementById("protein").innerText = nutrition.protein;

    document.getElementById('calorie-counter').innerText = nutrition.calories;
}


document.getElementById("close-popup").addEventListener("click", (e) => {
    document.getElementById("food-popup").classList.add("hidden");
});