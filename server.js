const express = require("express");
const cors = require("cors");
const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');


const app = express();

var corsOptions = {
  origin: "http://localhost:8081"
};

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: 'gb5PkM5M-zwre7zf6sYRPQTyBiCW4RFLA7swdt9IBtshwiiR9tIL7y_fluPZ1jdq',
  baseURL: 'http://localhost:3000',
  clientID: 'Q5vXLbd5NoMtXFAiPjjXHuC0POe4Cqdf',
  issuerBaseURL: 'https://dev-ilbuu4john1p274i.us.auth0.com'
};

app.use(cors(corsOptions));

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Auth0
app.use(auth(config));

exports.onExecutePostLogin = async (event, api) => {
  console.log("Here");
  if (event.stats.logins_count !== 1) {
    // do nothing for subsequent logins, only care about the first one.
    return;
  }

  try {
    // post to our backend here with the user id from the meta data.
  } catch (e) {
    // very rare but incase our backend is unavailable
    console.log(e);
    api.access.deny('Could not log you in at this time');
  }
};


// simple route
app.get("/", (req, res) => {
  res.send(req.oidc.isAuthenticated() ? 'Logged in' : 'Logged out');
  // res.json({ message: "Welcome to bezkoder application." });
});


app.get('/profile', requiresAuth(), (req, res) => {
  // res.send(JSON.stringify(req.oidc.user.sub));
  res.send(JSON.stringify(req.oidc.user));
  // const userInfo = await req.oidc.fetchUserInfo();
  // res.json(userInfo);
});

require("./app/routes/restaurant.routes.js")(app);
require("./app/routes/station.routes.js")(app);
require("./app/routes/meal.routes.js")(app);
require("./app/routes/food.routes.js")(app);
require("./app/routes/user.routes.js")(app);

// set port, listen for requests
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});