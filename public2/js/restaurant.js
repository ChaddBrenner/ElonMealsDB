const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const restaurantId = urlParams.get('id');


let auth0 = null;

const configureClient = async () => {
  auth0 = await createAuth0Client({
    domain: "dev-ilbuu4john1p274i.us.auth0.com",
    client_id: "Q5vXLbd5NoMtXFAiPjjXHuC0POe4Cqdf",
  });
};

window.onload = async () => {
    await configureClient();
    const isAuthenticated = await auth0.isAuthenticated();
    console.log(isAuthenticated);
    // updateUI();
    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
      // Process the login state
      await auth0.handleRedirectCallback();
      updateUI();
      // Use replaceState to redirect the user away and remove the querystring parameters
      window.history.replaceState({}, document.title, "/");
    }
};

console.log(window.location.origin);
const login = async () => {
    await auth0.loginWithRedirect({
      redirect_uri: window.location.origin
    });
  };
  
  const logout = () => {
    auth0.logout({
      returnTo: window.location.origin
    });
};



async function getFoods(restaurantId) {
    let meals = await fetch("http://localhost:3000/api/meals/restaurant/" + restaurantId);
    meals = await meals.json();

    for (meal of meals) {
        let stations = await fetch("http://localhost:3000/api/stations/meal/" + meal.id);
        stations = await stations.json();

        for (station of stations) {
            let foods = await fetch("http://localhost:3000/api/foods/station/" + station.id);
            foods = await foods.json();
            station.foods = foods;
        }
        meal.stations = stations;
    }
    console.log(meals);
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

async function displayFoods(restaurantId) {
    let foods = await getFoods(restaurantId);

    let mealSelector = document.getElementById("meal-selector");
    for (let meal of foods) {
        let mealButton = document.createElement("button");
        mealButton.classList.add("tab-button");
        mealButton.innerText = meal.name;
        mealButton.setAttribute("onclick", "openTab('" + meal.name.replace(" ", "") + "')");
        console.log(meal);
        if (isActive(meal)) {
            mealButton.classList.add("active");
        }

        mealSelector.appendChild(mealButton);

        let stationList = document.getElementById("station-list");

        for (station of meal.stations) {
            let stationDiv = document.createElement("div");
            stationDiv.classList.add("station");
            stationDiv.classList.add(meal.name.replace(" ", ""));
            if (!isActive(meal)) {
                stationDiv.classList.add("hidden");
            }
            stationDiv.setAttribute("id", station.name);

            let stationName = document.createElement("h2");
            stationName.innerText = station.name;

            stationDiv.appendChild(stationName);

            let foodList = document.createElement("ul");
            foodList.classList.add("food-list");
            
            for (food of station.foods) {
                let foodItem = document.createElement("li");
                foodItem.classList.add("food-item");
                foodItem.innerText = food.short_name;

                
                if (food.gluten_free) {
                    let glutenFree = document.createElement("img");
                    glutenFree.setAttribute("src", "images/glutenFree2.png");
                    glutenFree.classList.add("gluten-free");
                    foodItem.appendChild(glutenFree);
                }

                if (food.vegetarian) {
                    let vegetarian = document.createElement("img");
                    vegetarian.setAttribute("src", "images/vegetarian2.png");
                    vegetarian.classList.add("vegetarian");
                    foodItem.appendChild(vegetarian);
                }

                if (food.vegan) {
                    let vegan = document.createElement("img");
                    vegan.setAttribute("src", "images/vegan2.png");
                    vegan.classList.add("vegan");
                    foodItem.appendChild(vegan);
                }

                foodList.appendChild(foodItem);
            }

            stationDiv.appendChild(foodList);


            stationList.appendChild(stationDiv);

        }
    }

    // Select the first meal
    let firstMeal = document.getElementsByClassName("tab-button")[0];
    firstMeal.click();
    
}

displayFoods(restaurantId);