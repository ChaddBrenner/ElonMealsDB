let currDate = new Date();
// Make date EST
currDate.setHours(currDate.getHours() - 4);
currDate = currDate.toISOString().substring(0, 10);

let amountServed = fetch(`http://localhost:3000/api/foods/date/${currDate}`)
    .then(response => response.json())
    .then(data => {
        document.getElementById("amount-served").innerHTML = `Today, ${data.count} foods have been served.`;
});