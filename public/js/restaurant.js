const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const restaurantId = urlParams.get('id');


auth0.createAuth0Client({
    domain: "dev-ilbuu4john1p274i.us.auth0.com",
    clientId: "Q5vXLbd5NoMtXFAiPjjXHuC0POe4Cqdf",
    authorizationParams: {
        redirect_uri: window.location.href,
        audience: 'http://localhost:3000', 
        scope: 'openid profile email',
    }
  }).then(async (auth0Client) => {
    // Assumes a button with id "login" in the DOM
    const loginButton = document.getElementById("login");
  
    loginButton.addEventListener("click", (e) => {
      e.preventDefault();
      auth0Client.loginWithRedirect();
    });
  
    if (location.search.includes("state=") && 
        (location.search.includes("code=") || 
        location.search.includes("error="))) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, "/");
    }
  
    // Assumes a button with id "logout" in the DOM
    const logoutButton = document.getElementById("logout");
  
    logoutButton.addEventListener("click", (e) => {
      e.preventDefault();
      auth0Client.logout();
    });
  
    const isAuthenticated = await auth0Client.isAuthenticated();    
    console.log(isAuthenticated);
    console.log(await auth0Client.getTokenSilently());

    if (isAuthenticated) {
        document.getElementById("login").classList.add("hidden");
        document.getElementById("logout").classList.remove("hidden");
    } else {
        document.getElementById("login").classList.remove("hidden");
        document.getElementById("logout").classList.add("hidden");
    }
    // const userProfile = await auth0Client.getUser();
  
    // // Assumes an element with id "profile" in the DOM
    // const profileElement = document.getElementById("profile");
  
    // if (isAuthenticated) {
    //   profileElement.style.display = "block";
    //   profileElement.innerHTML = `
    //           <p>${userProfile.name}</p>
    //           <img src="${userProfile.picture}" />
    //         `;
    // } else {
    //   profileElement.style.display = "none";
    // }


    //with async/await
    // document.getElementById('call-api').addEventListener('click', async () => {

    //     // const isAuthenticated = await auth0Client.isAuthenticated();
    //     // if (!isAuthenticated) {
    //     //     return alert('User is not authenticated');
    //     // }
    //     console.log('clicked');
    //     const accessToken = await auth0Client.getTokenSilently();
    //     const result = await fetch('http://localhost:3000/api/user', {
    //     method: 'GET',
    //     headers: {
    //         Authorization: `Bearer ${accessToken}`,
    //         'Content-Type': 'application/json',
    //     }
    //     });
    //     const data = await result.json();
    // });
});

// Map of food id to food object
// Scope so that we can access it in the food link event listener
var foodMap = new Map();

async function getFoods(restaurantId) {
    let meals = await fetch("http://localhost:3000/api/meals/restaurant/" + restaurantId);
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
        mealButton.setAttribute("onclick", "openTab('" + meal.name.replace(" ", "") + "')");
        if (isActive(meal)) {
            mealButton.classList.add("active");
        }

        mealSelector.appendChild(mealButton);

        let stationList = document.getElementById("station-list");
        if (meal.stations) {
            if (meal.stations) {
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

                        let foodDiv = document.createElement("div");
                        foodDiv.classList.add("food-div");

                        let foodButton = document.createElement("button");
                        foodButton.classList.add("food-button");
                        foodButton.innerText = "❤️";
                        foodButton.setAttribute("data-food-id", food.id);
                        foodButton.setAttribute("onclick", "favoriteFood('" + food.id + "')");
                        foodDiv.appendChild(foodButton);
            

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

displayFoods(restaurantId);

async function favoriteFood(foodId) {
    let food = foodMap.get(parseInt(foodId));

    let response = await fetch("http://localhost:3000/api/user/favorite/" + foodId, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlE3SnU5NnNLZVRCZGhVOGkwQllzOCJ9.eyJpc3MiOiJodHRwczovL2Rldi1pbGJ1dTRqb2huMXAyNzRpLnVzLmF1dGgwLmNvbS8iLCJzdWIiOiJnb29nbGUtb2F1dGgyfDEwMjkwMDgxOTE2MTkwMDE1Nzc5NiIsImF1ZCI6WyJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJodHRwczovL2Rldi1pbGJ1dTRqb2huMXAyNzRpLnVzLmF1dGgwLmNvbS91c2VyaW5mbyJdLCJpYXQiOjE3MDAxMzA2NjEsImV4cCI6MTcwMDIxNzA2MSwiYXpwIjoiUTV2WExiZDVOb010WEZBaVBqalhIdUMwUE9lNENxZGYiLCJzY29wZSI6Im9wZW5pZCBwcm9maWxlIGVtYWlsIn0.m0vWhgZfaimKwHGE0btsie9J4_iANyMZZWfTMflm8GBbpCaui_G5boJgC_7B1Md1NWvxDca8IvPdE-O3WuD4rzafHbHBxoe0mbalowh9k_2RsqkhWhhSrCfddHowTnPfgmtIwTYKo25Bm-SniL-w3R6MrlSDDlYSVcGnO9bjhw1lfh6AJS4kN9Qbv0T8uQDZZ4JxNu_zXG_-ZrKVrW0VLUSvxLA84HpsPKGu7tdwqHBSLggieti0g3bmsYZXNzCNynK7vCv88ebQS4yineQ-3Xjmt3jDP6V1l1uaq03yfEoO-gpXxOeVjW-c-jLKudcRBT_JN-fpK_bywWvQC3UTMg`,
        }
    });

    if (response.status == 200) {
        alert("Successfully added " + food.short_name + " to your favorites!");
    }
    else {
        alert("Failed to add " + food.short_name + " to your favorites!");
    }
}

