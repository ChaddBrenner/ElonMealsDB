async function getRestaurants() {
    let outputObjs = [];
    let currDate = new Date();
    let currDateString = currDate.toISOString().substring(0,10);

    let restaurantResponse = await fetch('http://localhost:3000/api/restaurants/date/' + currDateString);
    restaurantResponse = await restaurantResponse.json();

    let currentTime = new Date();

    let mealRequests = [];

    for (restaurant of restaurantResponse) {
        mealRequests.push(fetch(`http://localhost:3000/api/meals/restaurant/${restaurant.id}`));
    }

    let mealResponses = await Promise.all(mealRequests);

    for (let i=0; i<restaurantResponse.length; i++) {
        let restaurant = restaurantResponse[i];

        restaurant.meals = [];

        let meals = await mealResponses[i].json();

        let isClosed = true;

        for (meal of meals) {
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
                restaurant.meals.push({name: meal.name, time_open: time_open, time_closed: time_closed, closed: false, id: meal.id});
                isClosed = false;
            }
            else {
                restaurant.meals.push({name: meal.name, time_open: time_open, time_closed: time_closed, closed: true, id: meal.id});
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
    console.log(outputObjs);
    return outputObjs;
}

async function appendRestaurants2() {
    let restaurants = await getRestaurants();

    let diningHallList = document.getElementById('diningHallList');

    for (restaurant of restaurants) {
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
    

        for (let i=0; i<restaurant.meals.length; i++) {
            let meal = restaurant.meals[i];
            let mealDiv = document.createElement('div');
            mealDiv.classList.add('meal');

            let mealLink = document.createElement('a');
            mealLink.href = `/selectfoods.html?id=${restaurant.id}&meal=${meal.id}`;
            console.log(meal);
            let mealHours = document.createElement('p');
            mealHours.classList.add('hours');
            
            let time_open = meal.time_open.toLocaleTimeString();
            time_open = time_open.substring(0, time_open.length - 6);

            let time_closed = meal.time_closed.toLocaleTimeString();
            time_closed = time_closed.substring(0, time_closed.length - 6);

            if (meal.name == "Open" || meal.name == "Hours") {
                meal.name = "Open";
            }

            if (meal.closed) {
                mealHours.innerText = `${time_open} - ${time_closed} ${meal.name}`;
                mealHours.classList.add('closed');
            }
            else {
                mealHours.innerText = `${time_open} - ${time_closed} ${meal.name}`;
                mealHours.classList.add('open');
            }
            
            mealLink.appendChild(mealHours);    
            mealDiv.appendChild(mealLink);
            restaurantDiv.appendChild(mealDiv);
        }
        diningHallList.appendChild(restaurantDiv);
        // let diningHallHours = document.createElement('p');

        // let time_open = diningHall.time_open.toLocaleTimeString();
        // time_open = time_open.substring(0, time_open.length - 6);
        // diningHallHours.classList.add('hours');

        // let time_closed = diningHall.time_closed.toLocaleTimeString();
        // time_closed = time_closed.substring(0, time_closed.length - 6);

        // diningHallHours.innerText = `Open ${time_open} - ${time_closed}`;
    }
}

// getDiningHalls();
// getRestaurants();
appendRestaurants2();
// appendDiningHalls();
