const sql = require("../models/db.js");

exports.isNumber = (string) => {
    const numRegex = new RegExp('^[0-9]+$');
    return numRegex.test(string);
}
  
exports.isDate = (string) => {
    const dateRegex = new RegExp('^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
    return dateRegex.test(string);
}

exports.isDateTime = (string) => {
    const dateTimeRegex = new RegExp('^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$');
    return dateTimeRegex.test(string);
}

exports.escape = (string) => {
    return sql.escape(string);
}
  