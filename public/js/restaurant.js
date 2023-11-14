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

async function getFoods(restaurantId) {
    let meals = await fetch("http://localhost:3000/api/meals/restaurant/" + restaurantId);
    if (meals.status == 404) {
        return [];
    }

    meals = await meals.json();

    for (meal of meals) {
        let stations = await fetch("http://localhost:3000/api/stations/meal/" + meal.id);
        if (stations.status == 404) {
            continue;
        }

        stations = await stations.json();

        for (station of stations) {
            let foods = await fetch("http://localhost:3000/api/foods/station/" + station.id);
            if (foods.status == 404) {
                continue;
            }

            foods = await foods.json();
            station.foods = foods;
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

function openFood(food) {
    console.log(food);
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
                        let foodLink = document.createElement("a");
                        foodLink.setAttribute("href", "#");
                        foodLink.innerText = food.short_name;
                        foodLink.addEventListener("click", (e) => {
                            console.log("clicked");
                            console.log(e.target);
                            openFood(food);
                        });
                        foodLink.setAttribute("data-food-id", food.id);
                        foodLink.classList.add("food-link");
                        foodItem.appendChild(foodLink);

                        foodItem.classList.add("food-item");
                        // foodItem.innerText = food.short_name;
        
                        
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
        }
    }

    // Select the first meal
    let firstMeal = document.getElementsByClassName("tab-button")[0];
    firstMeal.click();
    
}

const foodItems = document.getElementsByClassName("food-item");
for (foodItem of foodItems) {
    foodItem.addEventListener("click", (e) => {
        console.log("clicked");
        console.log(e.target);
    });
}
// foodItems.addEventListener("click", (e) => {
//     console.log("clicked");
//     console.log(e.target);
// });

displayFoods(restaurantId);