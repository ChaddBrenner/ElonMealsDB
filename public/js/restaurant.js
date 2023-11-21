const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const restaurantId = urlParams.get('id');


// The Auth0 client, initialized in configureClient()
let auth0Client = null;
var userMeals = [];
var favoritedFoods = [];
var restaurantName = "";


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

/**
 * Checks to see if the user is authenticated. If so, `fn` is executed. Otherwise, the user
 * is prompted to log in
 * @param {*} fn The function to execute if the user is logged in
 */
const requireAuth = async (fn, targetUrl) => {
  const isAuthenticated = await auth0Client.isAuthenticated();

  if (isAuthenticated) {
    return fn();
  }

  return login(targetUrl);
};

function showContentFromUrl(pathname) {
    const routes = [
        { path: "/", fn: () => showContent("content-home") },
        { path: "/profile", fn: () => showContent("content-profile") },
        { path: "/external-api", fn: () => showContent("content-external-api") },
    ];

    for (let route of routes) {
        if (route.path === pathname) {
            return route.fn();
        }
    }

    return false;
}

function showContent(id) {
    const contentElements = document.getElementsByClassName("content");

    for (let el of contentElements) {
        el.classList.add("hidden");
    }

    document.getElementById(id).classList.remove("hidden");
}

// Will run when page finishes loading
window.onload = async () => {
    await displayFoods(restaurantId);
    await configureClient();

//   If unable to parse the history hash, default to the root URL
//   if (!showContentFromUrl(window.location.pathname)) {
//     showContentFromUrl("/");
//     window.history.replaceState({ url: "/" }, {}, "/");
//   }

//   const bodyElement = document.getElementsByTagName("body")[0];

//   // Listen out for clicks on any hyperlink that navigates to a #/ URL
//   bodyElement.addEventListener("click", (e) => {
//     if (isRouteLink(e.target)) {
//       const url = e.target.getAttribute("href");

//       if (showContentFromUrl(url)) {
//         e.preventDefault();
//         window.history.pushState({ url }, {}, url);
//       }
//     }
//   });

  const isAuthenticated = await auth0Client.isAuthenticated();

  if (isAuthenticated) {
    console.log("> User is authenticated");
    // window.history.replaceState({}, document.title, window.location.pathname);
    // updateUI();
    let favoritedFoods = await fetch("http://localhost:3000/api/user/favorites/" + restaurantId, {
        headers: {
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    favoritedFoods = await favoritedFoods.json();
    
    for (let food of favoritedFoods) {
        let foodButtons = document.querySelectorAll("button[data-food-id='" + food.id + "'].food-favorite-button");
        for (let foodButton of foodButtons) {
            foodButton.innerText = "💖";
            foodButton.removeAttribute("onclick");
            foodButton.setAttribute("onclick", "unfavoriteFood('" + food.id + "')");
        }
    }

    userMeals = await fetch("http://localhost:3000/api/user/meals/restaurant/" + restaurantId, {
        headers: {
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    userMeals = await userMeals.json();
    for (let userMeal of userMeals) {
        let mealButton = document.querySelector("button[meal-id='" + userMeal.id + "']");
        mealButton.classList.add("adding-meal");

        let foodItems = await fetch("http://localhost:3000/api/user/meal/" + userMeal.id, {
            headers: {
                Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
            }
        });

        foodItems = await foodItems.json();
        for (let foodItem of foodItems) {
            let foodButtons = document.querySelectorAll("button[data-food-id='" + foodItem.id + "'][meal-id='" + userMeal.id + "'].food-button");
            for (let foodButton of foodButtons) {
                foodButton.innerText = "➖";
                foodButton.removeAttribute("onclick");
                foodButton.setAttribute("onclick", "removeFood('" + foodItem.id + "', '" + userMeal.id + "')");
            }
        }
    }
  }
  else {
    console.log("> User not authenticated");
  }

//   const query = window.location.search;
//   const shouldParseResult = query.includes("code=") && query.includes("state=");

//   if (shouldParseResult) {
    // console.log("> Parsing redirect");
    // try {
//       const result = await auth0Client.handleRedirectCallback();

//       if (result.appState && result.appState.targetUrl) {
//         showContentFromUrl(result.appState.targetUrl);
//       }

//       console.log("Logged in!");
//     } catch (err) {
//       console.log("Error parsing redirect:", err);
//     }

//     window.history.replaceState({}, document.title, "/");
//   }

//   updateUI();
};

// auth0.createAuth0Client({
//     domain: "dev-ilbuu4john1p274i.us.auth0.com",
//     clientId: "Q5vXLbd5NoMtXFAiPjjXHuC0POe4Cqdf",
//     authorizationParams: {
//         redirect_uri: window.location.href,
//         audience: 'http://localhost:3000', 
//         scope: 'openid profile email',
//     }
//   }).then(async (auth0Client) => {
//     // Assumes a button with id "login" in the DOM
//     const loginButton = document.getElementById("login");
  
//     loginButton.addEventListener("click", (e) => {
//       e.preventDefault();
//       auth0Client.loginWithRedirect();
//     });
  
//     if (location.search.includes("state=") && 
//         (location.search.includes("code=") || 
//         location.search.includes("error="))) {
//       await auth0Client.handleRedirectCallback();
//       window.history.replaceState({}, document.title, "/");
//     }
  
//     // Assumes a button with id "logout" in the DOM
//     const logoutButton = document.getElementById("logout");
  
//     logoutButton.addEventListener("click", (e) => {
//       e.preventDefault();
//       auth0Client.logout();
//     });
  
//     const isAuthenticated = await auth0Client.isAuthenticated();    
//     console.log(isAuthenticated);
//     console.log(await auth0Client.getTokenSilently());

//     if (isAuthenticated) {
//         document.getElementById("login").classList.add("hidden");
//         document.getElementById("logout").classList.remove("hidden");
//     } else {
//         document.getElementById("login").classList.remove("hidden");
//         document.getElementById("logout").classList.add("hidden");
//     }
// });

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

function openTab(mealName) {
    let stationList = document.getElementsByClassName('station');

    for (station of stationList) {
        if (station.classList.contains(mealName)) {
            station.classList.remove("hidden");
        }
        else {
            station.classList.add("hidden");
        }
    }

    // Update the active button
    let tabButtons = document.getElementsByClassName("tab-button");
    for (button of tabButtons) {
        if (button.innerText.replace(" ", "") == mealName) {
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
}

function closeFoodDescription() {
    document.getElementById("food-description-panel").classList.add("hidden");
}

async function displayFoods(restaurantId) {
    let foods = await getFoods(restaurantId);

    let mealSelector = document.getElementById("meal-selector");
    for (let meal of foods) {
        let mealButton = document.createElement("button");
        mealButton.classList.add("tab-button");
        mealButton.innerText = meal.name;
        mealButton.setAttribute('meal-id', meal.id);
        mealButton.setAttribute("onclick", "openTab('" + meal.name.replace(" ", "") + "')");
        if (isActive(meal)) {
            mealButton.classList.add("active");
        }

        mealSelector.appendChild(mealButton);

        let stationList = document.getElementById("station-list");
        if (meal.stations) {
            for (station of meal.stations) {
                let stationDiv = document.createElement("div");
                stationDiv.classList.add("station");
                stationDiv.classList.add(meal.name.replace(" ", ""));
                if (!isActive(meal)) {
                    stationDiv.classList.add("hidden");
                }
                stationDiv.setAttribute("station-id", station.id);
                stationDiv.setAttribute("meal-id", station.meal_id);
    
                let stationName = document.createElement("h2");
                stationName.innerText = station.name;
                
                stationDiv.appendChild(stationName);
    
                let foodList = document.createElement("ul");
                foodList.classList.add("food-list");
                
                for (food of station.foods) {
                    let foodItem = document.createElement("li");
                    foodItem.classList.add("food-item");

                    let foodDiv = document.createElement("div");
                    foodDiv.classList.add("food-div");
                    foodDiv.setAttribute("data-food-id", food.id);
                    foodDiv.setAttribute("station-id", station.id);
                    foodDiv.setAttribute("meal-id", station.meal_id);

                    let foodButton = document.createElement("button");
                    foodButton.classList.add("food-button");
                    foodButton.innerText = "➕";
                    foodButton.setAttribute("data-food-id", food.id);
                    foodButton.setAttribute("onclick", "addFood('" + food.id + "'" + ", '" + meal.id + "'" + ")");
                    foodButton.setAttribute("station-id", station.id);
                    foodButton.setAttribute("meal-id", station.meal_id);
                    foodDiv.appendChild(foodButton);

                    let foodFavoriteButton = document.createElement("button");
                    foodFavoriteButton.classList.add("food-favorite-button");
                    foodFavoriteButton.innerText = "❤️";
                    foodFavoriteButton.setAttribute("data-food-id", food.id);
                    foodFavoriteButton.setAttribute("onclick", "favoriteFood('" + food.id + "')");
                    foodFavoriteButton.setAttribute("station-id", station.id);
                    foodFavoriteButton.setAttribute("meal-id", station.meal_id);
                    foodDiv.appendChild(foodFavoriteButton);
        

                    foodItem.appendChild(foodDiv);

                    let foodLink = document.createElement("a");
                    foodLink.setAttribute("href", "#");
                    foodLink.innerText = food.short_name;
                    foodLink.setAttribute("data-food-id", food.id);
                    foodLink.classList.add("food-link");
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
    
                    foodList.appendChild(foodItem);
                }
    
                stationDiv.appendChild(foodList);
                stationList.appendChild(stationDiv);
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

async function favoriteFood(foodId) {
    let food = foodMap.get(parseInt(foodId));
    let response = await fetch("http://localhost:3000/api/user/favorite/" + foodId, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    if (response.status == 200) {
        let foodButtons = document.querySelectorAll("button[data-food-id='" + food.id + "'].food-favorite-button");
        for (let foodButton of foodButtons) {
            foodButton.innerText = "💖";
            foodButton.removeAttribute("onclick");
            foodButton.setAttribute("onclick", "unfavoriteFood('" + food.id + "')");
        }
    }
    else {
        alert("Failed to add " + food.short_name + " to your favorites!");
    }
}

async function unfavoriteFood(foodId) {
    let food = foodMap.get(parseInt(foodId));
    let response = await fetch("http://localhost:3000/api/user/favorite/" + foodId, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    if (response.status == 200) {
        // Select all buttons with the data-food-id attribute and the class food-favorite-button
        let foodButtons = document.querySelectorAll("button[data-food-id='" + food.id + "'].food-favorite-button");
        for (let foodButton of foodButtons) {
            foodButton.innerText = "❤️";
            foodButton.removeAttribute("onclick");
            foodButton.setAttribute("onclick", "favoriteFood('" + food.id + "')");
        }
    }
    else {
        alert("Failed to remove " + food.short_name + " from your favorites!");
    }
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


async function createUserMeal(mealId) {
    let restaurant = await fetch("http://localhost:3000/api/restaurants/" + restaurantId);
    restaurant = await restaurant.json();
    restaurantName = restaurant.name;
    restaurantDate = restaurant.date.substring(0,10);

    let userMeal = null;
    for (let meal of meals) {
        if (parseInt(meal.id) === parseInt(mealId)) {
            userMeal = meal;
        }
    }
    
    let time_open = new Date(restaurantDate + " " + userMeal.time_open);
    let time_closed = new Date(restaurantDate + " " + userMeal.time_closed);

    if (time_open > time_closed) {
        time_closed.setDate(time_closed.getDate() + 1);
    }

    let currTime = new Date();

    // See if the current time is between the time open and time closed
    if (currTime < time_open || currTime > time_closed) {
        currTime = time_open;
    }
    
    let userMealName = restaurantDate + " " + restaurantName + " " + userMeal.name;
    currTime = formatDate(currTime)

    let response = await fetch("http://localhost:3000/api/user/meal", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        },
        body: JSON.stringify({
            meal_name: userMealName,
            time_period: currTime,
            meal_id: mealId
        })
    });

    
    
    if (response.status == 200) {
        let mealButton = document.querySelector("button[meal-id='" + mealId + "']");
        mealButton.classList.add("adding-meal");
        console.log("Meal added!");
        response = await response.json();
        
        userMeals.push({id: mealId});
    }
    else {
        alert("Failed to create meal!");
    }
}

async function addFood(foodId, mealId) {
    let food = foodMap.get(parseInt(foodId));
    // Check to see if mealId is in userMeals
    let selectedUserMeal = null;
    for (let userMeal of userMeals) {
        console.log(userMeal.id, mealId)
        if (parseInt(userMeal.id) === parseInt(mealId)) {
            selectedUserMeal = userMeal;
        }
    }
    
    if (selectedUserMeal == null) {
        console.log("Meal not found!");
        await createUserMeal(mealId);
    }
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

    if (response.status == 200) {
        console.log("Food added!");
        // Select the button with the data-food-id attribute and the class food-button
        let foodButtons = document.querySelectorAll(`button.food-button[data-food-id="${foodId}"][meal-id="${mealId}"]`);
        console.log(foodButtons, mealId);
        for (let foodButton of foodButtons) {
            foodButton.innerText = "➖";
            foodButton.removeAttribute("onclick");
            foodButton.setAttribute("onclick", "removeFood('" + food.id + "', '" + mealId + "')");
        }
    }
    else {
        alert("Failed to add food!");
    }
}

async function removeFood(foodId, mealId) {
    let food = foodMap.get(parseInt(foodId));
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

    if (response.status == 200) {
        console.log("Food removed!");
        // Select the button with the data-food-id attribute and the class food-button
        let foodButtons = document.querySelectorAll(`button.food-button[data-food-id="${foodId}"][meal-id="${mealId}"]`);
        console.log(foodButtons, mealId);
        for (let foodButton of foodButtons) {
            foodButton.innerText = "➕";
            foodButton.removeAttribute("onclick");
            foodButton.setAttribute("onclick", "addFood('" + food.id + "', '" + mealId + "')");
        }
    }
    else {
        alert("Failed to remove food!");
    }
}