async function addFavoriteFoodRequest(foodId) {
    let response = await fetch("http://localhost:3000/api/user/favorite/" + foodId, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    return response;
}

function addFavoriteFoodUI(foodId) {
    let foodButtons = document.querySelectorAll("button[data-food-id='" + foodId + "'].food-favorite-button");
    for (let foodButton of foodButtons) {
        foodButton.innerText = "💖";
        foodButton.removeAttribute("onclick");
        foodButton.setAttribute("onclick", "removeFavoriteFood('" + foodId + "')");
    }
}
async function addFavoriteFood(foodId) {
    let response = await addFavoriteFoodRequest(foodId);

    if (response.status == 200) {
        console.log("Food favorited!");
        addFavoriteFoodUI(foodId);
    }
    else {
        // alert("Failed to add food to your favorites!")
    }
}

async function removeFavoriteFoodRequest(foodId) {
    let response = await fetch("http://localhost:3000/api/user/favorite/" + foodId, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    return response;
}

function removeFavoriteFoodUI(foodId) {
    let foodButtons = document.querySelectorAll("button[data-food-id='" + foodId + "'].food-favorite-button");
    for (let foodButton of foodButtons) {
        foodButton.innerText = "❤️";
        foodButton.removeAttribute("onclick");
        foodButton.setAttribute("onclick", "addFavoriteFood('" + foodId + "')");
    }
}

async function removeFavoriteFood(foodId) {
    let response = await removeFavoriteFoodRequest(foodId);

    if (response.status == 200) {
        console.log("Food unfavorited!");
        removeFavoriteFoodUI(foodId);
    }
    else {
        // alert("Failed to remove food from your favorites!")
    }
}

async function getFavoriteFoodsRequest(restaurantId) {
    let response = await fetch("http://localhost:3000/api/user/favorites/" + restaurantId, {
        headers: {
            Authorization: `Bearer ${await auth0Client.getTokenSilently()}`,
        }
    });

    return response;
}

function getFavoriteFoodsUI(favoriteFoods) {
    for (let food of favoriteFoods) {
        let foodButtons = document.querySelectorAll("button[data-food-id='" + food.id + "'].food-favorite-button");
        for (let foodButton of foodButtons) {
            foodButton.innerText = "💖";
            foodButton.removeAttribute("onclick");
            foodButton.setAttribute("onclick", "removeFavoriteFood('" + food.id + "')");
        }
    }
}

async function getFavoriteFoods(restaurantId) {
    let favoriteFoods = await getFavoriteFoodsRequest(restaurantId);

    if (favoriteFoods.status == 200) {
        console.log("Got favorite foods!");
        favoriteFoods = await favoriteFoods.json();

        getFavoriteFoodsUI(favoriteFoods);
    }
    else {
        // alert("Failed to get favorite foods!");
    }
}