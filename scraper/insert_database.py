from dotenv import load_dotenv
import os
import mysql.connector


# Load environment variables
load_dotenv()

db_host = os.getenv('DBHOST')
db_user = os.getenv('DBUSER')
db_password = os.getenv('DBPASSWORD')


# Connect to the database and return the cursor and the connection
mydb = mysql.connector.connect(
    host=db_host,
    user=db_user,
    password=db_password,
    database="mydb"
)

if mydb.is_connected():
    print("Connected to database")
else:
    raise Exception("Could not connect to database")

cursor = mydb.cursor(buffered=True)


def insert_restaurant(restaurant):
    try:
        query = "INSERT INTO restaurant (name, url, date) VALUES (%s, %s, %s)"
        cursor.execute(query, restaurant)
        mydb.commit()
        restaurant_id = cursor.lastrowid
        return restaurant_id
    
    except mysql.connector.Error as err:
        print("Something went wrong: {}".format(err))


def insert_meal(meal):
    try:
        query = "INSERT INTO meal (name, time_open, time_closed, restaurant_id) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, meal)
        mydb.commit()
        meal_id = cursor.lastrowid
        return meal_id
    
    except mysql.connector.Error as err:
        print("Something went wrong: {}".format(err))


def insert_station(station):
    try:
        query = "INSERT INTO station (name, meal_id) VALUES (%s, %s)"
        cursor.execute(query, station)
        mydb.commit()
        station_id = cursor.lastrowid
        return station_id
    
    except mysql.connector.Error as err:
        print("Something went wrong: {}".format(err))


def insert_food(food, station_id, food_id):
    try:
        # Check if the food is already in the database using the food_id from the API, assuming that the food_id is unique in their database
        query = """SELECT id from food WHERE food_id=%s LIMIT 0, 1;"""
        values = (food_id,)
        cursor.execute(query, values)
        mydb.commit()
        food_database_id = cursor.fetchall()
        if food_database_id:
            food_database_id = food_database_id[0][0]
            # Even if the food is already in the database, we still need to link it to the station, but first we need to see if it is already linked
            query_link = "INSERT INTO station_food (station_id, food_id) VALUES (%s, %s)"
            values = (station_id, food_database_id)
            cursor.execute(query_link, values)
            mydb.commit()
        else:
            query = """INSERT INTO food (
            short_name,
            full_name,
            amount_per_serving,
            type_per_serving,
            calories,
            calories_from_fat,
            total_fat,
            saturated_fat,
            trans_fat,
            cholesterol,
            sodium,
            total_carbohydrates,
            dietary_fiber,
            sugars,
            protein,
            vegetarian,
            vegan,
            gluten_free,
            food_id,
            allergy_egg,
            allergy_shellfish,
            allergy_soy,
            allergy_peanut,
            allergy_wheat,
            allergy_tree_nut,
            allergy_milk,
            allergy_sesame,
            allergy_fish
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"""
            cursor.execute(query, food)
            mydb.commit()
            food_id = cursor.lastrowid
            query = "INSERT INTO station_food (station_id, food_id) VALUES (%s, %s)"
            cursor.execute(query, (station_id, food_id))
            mydb.commit()
            return food_id
        
    except mysql.connector.Error as err:
        print("Something went wrong: {}".format(err))


def reset_db():
    query = """DELETE FROM user_meal;"""
    cursor.execute(query)
    query = """DELETE FROM user_meal_has_food;"""
    cursor.execute(query)
    query = """DELETE FROM user;"""
    cursor.execute(query)
    query = """DELETE FROM user_favorite_food;"""
    cursor.execute(query)
    query = """DELETE FROM station_food;"""
    cursor.execute(query)
    query = """DELETE FROM station;"""
    cursor.execute(query)
    query =  """DELETE FROM food;"""
    cursor.execute(query)
    query = """DELETE FROM meal;"""
    cursor.execute(query)
    query = """DELETE FROM restaurant;"""
    cursor.execute(query)
    mydb.commit()
    