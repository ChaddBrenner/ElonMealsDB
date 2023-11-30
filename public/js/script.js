// The Auth0 client, initialized in configureClient()
let auth0Client = null;
var userMeals = [];

/**
 * Starts the authentication flow
 */
const login = async () => {
  try {
    console.log("Logging in");
    await auth0Client.loginWithRedirect();
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

    let options = {
        returnTo: window.location.origin,
    }

    await auth0Client.logout(options);
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
        audience: API_URL, 
        scope: 'openid profile email',
    }
  });
};

// Will run when page finishes loading
window.onload = async () => {
    await appendRestaurants();
    await configureClient();

    if (location.search.includes("state=") && 
        (location.search.includes("code=") || 
        location.search.includes("error="))) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, "/");
    }

    const isAuthenticated = await auth0Client.isAuthenticated();

    if (isAuthenticated) {
        console.log("> User is authenticated");

        // Update the UI elements to reflect the user's authentication status
        document.getElementById("logout").classList.remove("hidden");

        document.getElementById('nutrition-row').classList.remove('hidden');
        document.getElementById('nutrition-header').classList.remove('hidden');
        document.getElementById('nutrition-status').classList.remove('hidden');
        

        document.getElementById("details-row").classList.remove("hidden");
        document.getElementById('favorites').classList.remove('hidden');
        document.getElementById('meals-today').classList.remove('hidden');

        document.getElementById('settings-button').classList.remove('hidden');

        // Get the user's favorites
        // Display them in the table
        const accessToken = await auth0Client.getTokenSilently();

        let response = await fetch(API_URL + '/api/user/favorites', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });

        let favorites = await response.json();

        let favoriteList = document.getElementById('favorites-list');
        
        let favorite_ids = [];
        for (let favorite of favorites) {
            if (favorite_ids.includes(favorite.food_id)) {
                continue;
            } else {
                favorite_ids.push(favorite.food_id);
            }
            let favoriteRow = document.createElement('tr')
            favoriteRow.classList.add('favorite-row');
            favoriteRow.setAttribute('data-id', favorite.food_id)
            let favoriteFoodName = document.createElement('td');
            favoriteFoodName.innerText = favorite.food_name;
            let favoriteFoodRestaurant = document.createElement('td');
            favoriteFoodRestaurant.innerText = favorite.restaurant_name;

            favoriteRow.appendChild(favoriteFoodName);
            favoriteRow.appendChild(favoriteFoodRestaurant);

            favoriteList.appendChild(favoriteRow);
        }


        // Get the user's meals today and display them in the table
        let currDate = new Date();
        // Make to EST
        currDate.setHours(currDate.getHours() - 4);
        currDate = currDate.toISOString().substring(0,10);
        
        response = await fetch(API_URL + '/api/user/calories/' + currDate, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });

        let mealToday = await response.json();

        let mealsTodayList = document.getElementById('meals-today-list');

        for (let meal of mealToday) {
            let mealRow = document.createElement('tr');
            mealRow.classList.add('meal-row');
            mealRow.setAttribute('data-id', meal.id);
            let mealName = document.createElement('td');
            // 2023-11-29 McEwen Food Hall Breakfast -> McEwen Food Hall Breakfast
            mealName.innerText = meal.name.split(' ').slice(1).join(' ');
            let mealCalories = document.createElement('td');
            mealCalories.innerText = meal.calories;

            mealRow.appendChild(mealName);
            mealRow.appendChild(mealCalories);

            mealsTodayList.appendChild(mealRow);
        }

        let totalCalories = 0;
        let totalFats = 0;
        let totalCarbs = 0;
        let totalProteins = 0;
        for (let meal of mealToday) {
            totalCalories += meal.calories;
            totalFats += meal.fats;
            totalCarbs += meal.carbohydrates;
            totalProteins += meal.protein;
        }

        totalCalories = Math.round(totalCalories);
        totalFats = Math.round(totalFats);
        totalCarbs = Math.round(totalCarbs);
        totalProteins = Math.round(totalProteins);

        // Get the user's goals and update the progress bars and settings form
        response = await fetch(API_URL + '/api/user', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            }
        });

        let user = await response.json();
        user = user[0];
        
        document.getElementById('calories-progress').setAttribute('max', user.daily_calories_goal);
        document.getElementById('calories-progress').setAttribute('value', totalCalories);
        document.getElementById('calories-goal').innerHTML = `${totalCalories} / ${user.daily_calories_goal} Calories`;

        document.getElementById('fats-progress').setAttribute('max', user.daily_fats_goal);
        document.getElementById('fats-progress').setAttribute('value', totalFats);
        document.getElementById('fats-goal').innerHTML = `${totalFats} / ${user.daily_fats_goal} Fats`;

        document.getElementById('carbohydrates-progress').setAttribute('max', user.daily_carbs_goal);
        document.getElementById('carbohydrates-progress').setAttribute('value', totalCarbs);
        document.getElementById('carbohydrates-goal').innerHTML = `${totalCarbs} / ${user.daily_carbs_goal} Carbs`;

        document.getElementById('proteins-progress').setAttribute('max', user.daily_proteins_goal);
        document.getElementById('proteins-progress').setAttribute('value', totalProteins);
        document.getElementById('proteins-goal').innerHTML = `${totalProteins} / ${user.daily_proteins_goal} Proteins`;

        if (totalCalories > user.daily_calories_goal) {
            document.getElementById('calories-status').classList.add('over');
        }
        else {
            document.getElementById('calories-status').classList.add('under');
        }

        if (totalFats > user.daily_fats_goal) {
            document.getElementById('fats-status').classList.add('over');
        }
        else {
            document.getElementById('fats-status').classList.add('under');
        }

        if (totalCarbs > user.daily_carbs_goal) {
            document.getElementById('carbohydrates-status').classList.add('over');
        }
        else {
            document.getElementById('carbohydrates-status').classList.add('under');
        }

        if (totalProteins > user.daily_proteins_goal) {
            document.getElementById('proteins-status').classList.add('over');
        }
        else {
            document.getElementById('proteins-status').classList.add('under');
        }

        // Update default values in the settings form
        document.getElementById('calorieGoal').value = user.daily_calories_goal;
        document.getElementById('fatGoal').value = user.daily_fats_goal;
        document.getElementById('carbGoal').value = user.daily_carbs_goal;
        document.getElementById('proteinGoal').value = user.daily_proteins_goal;

        document.getElementById('satisfaction').value = user.satisfaction;
        document.getElementById('userName').value = user.name;

        // Update the user's goals when the form is submitted
        document.getElementById('settings-form').addEventListener('submit', async (e) => {
            console.log("Submitting settings form");
            e.preventDefault();
            let calorieGoal = document.getElementById('calorieGoal').value;
            let fatGoal = document.getElementById('fatGoal').value;
            let carbGoal = document.getElementById('carbGoal').value;
            let proteinGoal = document.getElementById('proteinGoal').value;

            // Validate user's inputs
            if (calorieGoal < 0 || fatGoal < 0 || carbGoal < 0 || proteinGoal < 0) {
                document.getElementById('settings-warning').classList.remove('hidden');
                return;
            }

            if (calorieGoal == '' || fatGoal == '' || carbGoal == '' || proteinGoal == '') {
                document.getElementById('settings-warning').classList.remove('hidden');
                return;
            }

            // Make sure the user's goals are integers
            calorieGoal = Math.round(calorieGoal);
            fatGoal = Math.round(fatGoal);
            carbGoal = Math.round(carbGoal);
            proteinGoal = Math.round(proteinGoal);

            // Update the user's goals
            await updateGoal('calorie', calorieGoal);
            await updateGoal('fat', fatGoal);
            await updateGoal('carbohydrate', carbGoal);
            await updateGoal('protein', proteinGoal);

            // Update the user's satisfaction level
            let satisfaction = document.getElementById('satisfaction').value;
            await updateSatisfaction(satisfaction);

            // Update the user's name
            let name = document.getElementById('userName').value;
            await updateName(name);

            // Update the progress bars
            document.getElementById('calories-progress').setAttribute('max', calorieGoal);
            document.getElementById('fats-progress').setAttribute('max', fatGoal);
            document.getElementById('carbohydrates-progress').setAttribute('max', carbGoal);
            document.getElementById('proteins-progress').setAttribute('max', proteinGoal);

            document.getElementById('calories-goal').innerHTML = `${totalCalories} / ${calorieGoal} Calories`;
            document.getElementById('fats-goal').innerHTML = `${totalFats} / ${fatGoal} Fats`;
            document.getElementById('carbohydrates-goal').innerHTML = `${totalCarbs} / ${carbGoal} Carbs`;
            document.getElementById('proteins-goal').innerHTML = `${totalProteins} / ${proteinGoal} Proteins`;

            closeSettings();

            document.getElementById('settings-warning').classList.add('hidden');
        });

    }
    else {
        console.log("> User not authenticated");
        document.getElementById("login").classList.remove("hidden");
    }
};

// Open the settings panel when the settings button is clicked
function openSettings() {
    document.getElementById('settings-panel').classList.remove('hidden');
}

// Close the settings panel when the close button is clicked
function closeSettings() {
    document.getElementById('settings-panel').classList.add('hidden');
}

// Update the user's goals
async function updateGoal(type, value) {
    const accessToken = await auth0Client.getTokenSilently();
    await fetch(API_URL + `/api/user/${type}_goal/`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({value: value})
    });
}

// Update the user's satisfaction level
async function updateSatisfaction(value) {
    const accessToken = await auth0Client.getTokenSilently();
    await fetch(API_URL + `/api/user/satisfaction/`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({value: value})
    });
}

// Update the user's name
async function updateName(value) {
    const accessToken = await auth0Client.getTokenSilently();
    await fetch(API_URL + `/api/user/name/`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({value: value})
    });
}

// Get the restaurants and their information from the API for today
async function getRestaurants() {
    let outputObjs = [];

    let currDate = new Date();
    // Make to EST
    currDate.setHours(currDate.getHours() - 4);
    currDate = currDate.toISOString().substring(0,10);

    let restaurantResponse = await fetch(API_URL + '/api/restaurants/date/' + currDate);
    restaurantResponse = await restaurantResponse.json();
    let currentTime = new Date();

    let mealRequests = [];

    for (restaurant of restaurantResponse) {
        mealRequests.push(fetch(API_URL + `/api/meals/restaurant/${restaurant.id}`));
    }

    let mealResponses = await Promise.all(mealRequests);

    for (let i=0; i<restaurantResponse.length; i++) {
        let restaurant = restaurantResponse[i];

        restaurant.meals = [];

        let meals = await mealResponses[i].json();

        let isClosed = true;

        for (let meal of meals) {   
            let time_open = new Date()
            time_open.setHours(meal.time_open.substring(0,2));
            time_open.setMinutes(meal.time_open.substring(3,5));
            time_open.setSeconds(0);

            let time_closed = new Date()
            time_closed.setMinutes(meal.time_closed.substring(3,5));
            time_closed.setHours(meal.time_closed.substring(0,2));
            time_closed.setSeconds(0);

            if (time_open > time_closed) {
                time_closed.setDate(time_closed.getDate() + 1);
            }

            if (currentTime >= time_open && currentTime <= time_closed) {
                restaurant.meals.push({name: meal.name, time_open: time_open, time_closed: time_closed, closed: false});
                isClosed = false;
            }
            else {
                restaurant.meals.push({name: meal.name, time_open: time_open, time_closed: time_closed, closed: true});
            }
        }
        if (isClosed) {
            restaurant.closed = true;
        }
        else {
            restaurant.closed = false;
        }
        outputObjs.push(restaurant);
    }

    return outputObjs;
}

// Append the data from the API to the page
async function appendRestaurants() {
    let restaurants = await getRestaurants();
    
    let numRows = Math.ceil(restaurants.length / 3);

    let diningHallList = document.getElementById('diningHallList');

    for (let i=0; i<numRows; i++) {
        let row = document.createElement('div');
        row.classList.add('row');
        diningHallList.appendChild(row);
    }

    let rows = document.getElementsByClassName('row');

    let counter = 0;
    for (let restaurant of restaurants) {
        let restaurantDiv = document.createElement('div');
        restaurantDiv.classList.add('dining-hall');

        let restaurantName = document.createElement('h2');  
        restaurantName.innerText = restaurant.name;
        restaurantDiv.appendChild(restaurantName);

        if (restaurant.closed) {
            restaurantDiv.classList.add('restaurant-closed');
        }
        else {
            restaurantDiv.classList.add('restaurant-open');
        }
    

        for (meal of restaurant.meals) {
            let mealHours = document.createElement('p');
            mealHours.classList.add('hours');

            let time_open = meal.time_open.toLocaleTimeString();
            time_open = time_open.substring(0, time_open.length - 6);

            let time_closed = meal.time_closed.toLocaleTimeString();
            time_closed = time_closed.substring(0, time_closed.length - 6);

            if (meal.name == "Open" || meal.name == "Hours") {
                meal.name = "";
            }
            if (meal.closed) {
                mealHours.innerText = `${time_open} - ${time_closed} ${meal.name}`;
                mealHours.classList.add('closed');
            }
            else {
                mealHours.innerText = `${time_open} - ${time_closed} ${meal.name}`;
                mealHours.classList.add('open');
            }
            
            restaurantDiv.appendChild(mealHours);
        }

        let mealRedirect = document.createElement('a');
        mealRedirect.href = `/restaurant.html?id=${restaurant.id}`;
        mealRedirect.classList.add('restaurant-link');
        mealRedirect.appendChild(restaurantDiv);

        rows[Math.floor(counter/3)].appendChild(mealRedirect);
        counter++;
    }
}



