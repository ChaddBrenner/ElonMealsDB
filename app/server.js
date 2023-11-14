const express = require("express");
const cors = require("cors");
const { expressjwt: jwt } = require("express-jwt");
const jwksRsa = require("jwks-rsa");


require('dotenv').config();

const app = express();

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

app.use(cors());

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));


app.get("/test", checkJwt, async (req, res) => {
  console.log(req.auth);
  res.json({abc: 'You are authenticated'});
});

require("./routes/restaurant.routes.js")(app);
require("./routes/station.routes.js")(app);
require("./routes/meal.routes.js")(app);
require("./routes/food.routes.js")(app);
require("./routes/user.routes.js")(app, checkJwt);

// Handle unauthorized requests so that the sever does not send out a stack trace
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
      res.status(401).send('Invalid token, or no token supplied');
  } else {
      // Log the error for server monitoring
      console.error(err);
      res.status(500).send('An internal server error occurred');
  }
});

// set port, listen for requests
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});