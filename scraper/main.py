from insert_database import insert_restaurant, insert_meal, insert_station, insert_food

from restaurant import get_restaurants
from food import get_food
from meal import get_meals

from datetime import datetime
from tqdm import tqdm
import json
import time


# Get current date
curr_date = datetime.now().date()

# Set the date to 2023-11-13
curr_date = datetime(2023, 11, 13).date()

def collect_data():
    restaurants = get_restaurants(curr_date)

    for restaurant in tqdm(restaurants, position=0, leave=False, desc='Restaurants'):
        if 'locations' in restaurant['url']:
            meals = get_meals(restaurant['url'])
            restaurant['meals'] = meals
            for i in tqdm(range(len(meals)), position=1, leave=False, desc='Meals'):
                meal = meals[i]
                restaurant['hours'][i]['meals'] = meal
                for station in tqdm(meal, position=2, leave=False, desc='Stations'):
                    for food in tqdm(station['foods'], position=3, leave=False, desc='Foods'):
                        time.sleep(0.1)
                        food['information'] = get_food(food['url'])

    # Output the data to a file
    with open('data.json', 'w') as outfile:
        json.dump(restaurants, outfile, indent=4)

    return restaurants

def load_data():
    with open('data.json') as json_file:
        data = json.load(json_file)
        return data
    

def insert_data(data):
    print('Inserting data into database')
    for restaurant in tqdm(data, position=0, leave=False, desc='Restaurants'):
        restaurant_id = insert_restaurant((restaurant['name'], restaurant['url'], curr_date))

        for meal in tqdm(restaurant['hours'], position=1, leave=False, desc='Meals'):
            meal_id = insert_meal((meal['name'], datetime.fromtimestamp(int(meal['open'])), datetime.fromtimestamp(int(meal['close'])), restaurant_id))

            if 'meals' not in meal:
                continue

            for station in tqdm(meal['meals'], position=2, leave=False, desc='Stations'):
                station_id = insert_station((station['name'], meal_id))

                for food in tqdm(station['foods'], position=3, leave=False, desc='Foods'):
                    new_food = (food['name'], food['information']['description'], food['information']['serving_size_amount'], food['information']['serving_size_unit'])
                    
                    # Append the nutrition information
                    for i in range(0, 11):
                        new_food += (food['information']['nutrition'][i]['amount'],)

        
                    potential_attributes = [
                        'prop-vegetarian',
                        'prop-vegan',
                        'prop-made_without_gluten',
                    ]

                    for attribute in potential_attributes:
                        if attribute in food['attributes']:
                            new_food += (True,)
                        else:
                            new_food += (False,)

                    new_food += (food['url'],)

                    potential_allergens = [
                        'allergen-has_egg',
                        'allergen-has_shellfish',
                        'allergen-has_soy',
                        'allergen-has_peanut',
                        'allergen-has_wheat',
                        'allergen-has_tree_nuts',
                        'allergen-has_milk',
                        'allergen-has_sesame',
                        'allergen-has_fish'
                    ]

                    for allergen in potential_allergens:
                        if allergen in food['attributes']:
                            new_food += (True,)
                        else:
                            new_food += (False,)

                    insert_food(new_food, station_id, food['url'])

data = load_data()
# data = collect_data()
insert_data(data)
# collect_data()