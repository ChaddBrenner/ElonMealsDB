const express = require("express");
const cors = require("cors");
// const { auth } = require('express-openid-connect');
// const { requiresAuth } = require('express-openid-connect');
const { expressjwt: jwt } = require("express-jwt");
const jwksRsa = require("jwks-rsa");
// const { auth, requiredScopes } = require('express-oauth2-jwt-bearer');


require('dotenv').config();



const app = express();

// const checkJwt = jwt({secret: process.env.AUTH0_SECRET, algorithms: ['RS256'], audience: 'http://localhost:3000', issuer: process.env.AUTH0_ISSUER_BASE_URL});

const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${process.env.AUTH0_ISSUER_BASE_URL}.well-known/jwks.json`
  }),
  audience: 'http://localhost:3000',
  issuer: process.env.AUTH0_ISSUER_BASE_URL,
  algorithms: ['RS256']
});


var corsOptions = {
  origin:'http://localhost:3000', 
  credentials:true,            //access-control-allow-credentials:true
  optionSuccessStatus:200
};

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
};

// Authorization middleware. When used, the Access Token must
// exist and be verified against the Auth0 JSON Web Key Set.
// const checkJwt = auth({
  // audience: 'http://localhost:3000',
  // issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  // algorithms: ['RS256'],
  // tokenSigningAlgorithm: "RS256",
  // secret: process.env.AUTH0_SECRET,
// });


// app.use(cors({origin: '*'}));
app.use(cors());

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Auth0
// app.use(auth(config));

// // simple route
// app.get("/test", (req, res) => {
//   console.log(req.oidc.accessToken);
//   res.send(req.oidc.isAuthenticated() ? 'Logged in' : 'Logged out');
//   // res.json({ message: "Welcome to bezkoder application." });
// });

// app.get('/profile', requiresAuth(), (req, res) => {
//   console.log("here");
//   res.send(JSON.stringify(req.oidc.user));
// });

// app.get(
//   "/protected",
//   jwt({ secret: process.env.AUTH0_SECRET, algorithms: ['HS256']}),
//   function (req, res) {
//     console.log(req.auth);
//     console.log("here")
//     // if (!req.auth.admin) return res.sendStatus(401);
//     res.sendStatus(200);
//   });
//   // (req, res) => {
//   //   console.log(req.headers);
//   //   res.json({abc: 'You are authenticated'});
    
//   // }
// // );

// app.get("/test", checkJwt, (req, res) => {
//   console.log(req.auth);
//   res.json({abc: 'You are authenticated'});
// });

app.get("/test", checkJwt, (req, res) => {
  console.log(req.auth);
  res.json({abc: 'You are authenticated'});
});

require("./routes/restaurant.routes.js")(app);
require("./routes/station.routes.js")(app);
require("./routes/meal.routes.js")(app);
require("./routes/food.routes.js")(app);
require("./routes/user.routes.js")(app);

// set port, listen for requests
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});