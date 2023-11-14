    // // script.js
// document.getElementById('loginBtn').addEventListener('click', () => {
//     window.location.href = 'localhost:3000/login';
// });


  
// document.getElementById('logoutBtn').addEventListener('click', () => {
//     window.location.href = 'localhost:3000/logout';
// });

// // Check if user is authenticated and adjust UI accordingly
// fetch('/user')
//     .then(response => response.json())
//         .then(data => {
//             if (data.isAuthenticated) {
//                 document.getElementById('loginBtn').style.display = 'none';
//                 document.getElementById('logoutBtn').style.display = 'block';
//             } else {
//                 document.getElementById('loginBtn').style.display = 'block';
//                 document.getElementById('logoutBtn').style.display = 'none';
//     }
// });

console.log(window.location.origin);

auth0.createAuth0Client({
    domain: "dev-ilbuu4john1p274i.us.auth0.com",
    clientId: "Q5vXLbd5NoMtXFAiPjjXHuC0POe4Cqdf",
    authorizationParams: {
        redirect_uri: window.location.origin,
        audience: 'http://localhost:3000', 
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
    const userProfile = await auth0Client.getUser();
  
    // Assumes an element with id "profile" in the DOM
    const profileElement = document.getElementById("profile");
  
    if (isAuthenticated) {
      profileElement.style.display = "block";
      profileElement.innerHTML = `
              <p>${userProfile.name}</p>
              <img src="${userProfile.picture}" />
            `;
    } else {
      profileElement.style.display = "none";
    }


    //with async/await
    document.getElementById('call-api').addEventListener('click', async () => {
        console.log('clicked');
        const accessToken = await auth0Client.getTokenSilently();
        console.log(accessToken);
        const result = await fetch('http://localhost:3000/test', {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        }
        });
        const data = await result.json();
        console.log(data);
    });
});



// let auth0 = null;

// const configureClient = async () => {
//   auth0 = await createAuth0Client({
//     domain: "dev-ilbuu4john1p274i.us.auth0.com",
//     client_id: "Q5vXLbd5NoMtXFAiPjjXHuC0POe4Cqdf",
//   });
// };

// window.onload = async () => {
//     await configureClient();
//     const isAuthenticated = await auth0.isAuthenticated();
//     console.log(isAuthenticated);
//     // updateUI();
//     // const query = window.location.search;
//     // if (query.includes("code=") && query.includes("state=")) {
//       // Process the login state
//     //   await auth0.handleRedirectCallback();
//     //   updateUI();
//       // Use replaceState to redirect the user away and remove the querystring parameters
//     //   window.history.replaceState({}, document.title, "/");
//     // }
// };

// console.log(window.location.origin);
// const login = async () => {
//     await auth0.loginWithRedirect({
//       redirect_uri: window.location.origin
//     });
//   };
  
//   const logout = () => {
//     auth0.logout({
//       returnTo: window.location.origin
//     });
// };

async function getRestaurants() {
    let outputObjs = [];

    let restaurantResponse = await fetch('http://localhost:3000/api/restaurants/date/2023-11-09');
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
    console.log(outputObjs);
    return outputObjs;
}

// async function appendRestaurants() {
//     let restaurants = await getRestaurants();
//     let diningHallList = document.getElementById('diningHallList');

//     for (restaurant of restaurants) {
//         mealRedirect.classList.add('restaurant-link');

//         let restaurantDiv = document.createElement('div');
//         restaurantDiv.classList.add('dining-hall');

//         let restaurantName = document.createElement('h2');  
//         restaurantName.innerText = restaurant.name;
//         restaurantDiv.appendChild(restaurantName);
//         console.log(restaurant.closed)
//         if (restaurant.closed) {
//             restaurantDiv.classList.add('restaurant-closed');
            
//         }
//         else {
//             restaurantDiv.classList.add('restaurant-open');
//         }

//         for (meal of restaurant.meals) {
//             let mealHours = document.createElement('p');
//             mealHours.classList.add('hours');

//             let time_open = meal.time_open.toLocaleTimeString();
//             time_open = time_open.substring(0, time_open.length - 6);

//             let time_closed = meal.time_closed.toLocaleTimeString();
//             time_closed = time_closed.substring(0, time_closed.length - 6);

//             if (meal.name == "Open" || meal.name == "Hours") {
//                 meal.name = "Open";
//             }
//             if (meal.closed) {
//                 mealHours.innerText = `${time_open} - ${time_closed} ${meal.name}`;
//                 mealHours.classList.add('closed');
//             }
//             else {
//                 mealHours.innerText = `${time_open} - ${time_closed} ${meal.name}`;
//                 mealHours.classList.add('open');
//                 currentlyOpen = true;
//             }
            
            
//             restaurantDiv.appendChild(mealHours);
//         }
//         // let diningHallHours = document.createElement('p');

//         // let time_open = diningHall.time_open.toLocaleTimeString();
//         // time_open = time_open.substring(0, time_open.length - 6);
//         // diningHallHours.classList.add('hours');

//         // let time_closed = diningHall.time_closed.toLocaleTimeString();
//         // time_closed = time_closed.substring(0, time_closed.length - 6);

//         // diningHallHours.innerText = `Open ${time_open} - ${time_closed}`;

//         diningHallList.appendChild(restaurantDiv);
//     }
// }

async function appendRestaurants2() {
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
    

        for (meal of restaurant.meals) {
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
            
            restaurantDiv.appendChild(mealHours);
        }
        // let diningHallHours = document.createElement('p');

        // let time_open = diningHall.time_open.toLocaleTimeString();
        // time_open = time_open.substring(0, time_open.length - 6);
        // diningHallHours.classList.add('hours');

        // let time_closed = diningHall.time_closed.toLocaleTimeString();
        // time_closed = time_closed.substring(0, time_closed.length - 6);

        // diningHallHours.innerText = `Open ${time_open} - ${time_closed}`;

        let mealRedirect = document.createElement('a');
        mealRedirect.href = `/restaurant.html?id=${restaurant.id}`;
        mealRedirect.classList.add('restaurant-link');
        mealRedirect.appendChild(restaurantDiv);

        rows[Math.floor(counter/3)].appendChild(mealRedirect);
        counter++;
    }
}

// getDiningHalls();
// getRestaurants();
appendRestaurants2();
// appendDiningHalls();
