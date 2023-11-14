
async function getStations(mealId) {
    let stations = await fetch("http://localhost:3000/api/stations/meal/" + mealId);
    stations = await stations.json();
    for (station of stations) {
        try {
            let foods = await fetch("http://localhost:3000/api/foods/station/" + station.id);
            foods = await foods.json();
            station.foods = foods;
        } catch (err) {
            console.log(err);
        }
    }

    return stations;

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

async function displayFoods(restaurantId, mealId) {
    let stations = await getStations(mealId);

    let stationList = document.getElementById("station-list");

    for (let station of stations) {
        let stationDiv = document.createElement("div");
        stationDiv.classList.add("station");
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

            let appendFood = document.createElement("button");
            appendFood.classList.add("append-food");
            appendFood.setAttribute("id", food.id);
            appendFood.innerText = "+";

            foodDiv.appendChild(appendFood);

            let foodName = document.createElement("p");
            foodName.classList.add("food-name");
            console.log(food);
            foodName.innerText = food.short_name;
            foodDiv.appendChild(foodName);

            
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
            foodList.appendChild(foodItem);
        }

        stationDiv.appendChild(foodList);


        stationList.appendChild(stationDiv);
    }
}

let urlParams = new URLSearchParams(window.location.search);
let restaurantId = urlParams.get('id');
let mealId = urlParams.get('meal');
displayFoods(restaurantId, mealId);