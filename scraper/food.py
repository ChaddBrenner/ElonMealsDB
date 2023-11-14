import requests
from bs4 import BeautifulSoup
import json
import time

FOOD_URL = "https://www.elondining.com/wp-content/themes/nmc_dining/ajax-content/recipe.php?recipe="

def get_food(id):
    response = requests.get(FOOD_URL + id)
    
    # Check to see if response is valid
    if response.status_code != 200:
        # Sleep for 5 seconds and try again
        time.sleep(5)
        response = requests.get(FOOD_URL + id)

    html = json.loads(response.content)
    html = html['html']
    page_soup = BeautifulSoup(html, "html.parser")

    # Name of the food
    name = page_soup.find("h2").text.strip()

    # Description of the food
    try:
        description_container = page_soup.find("div", {"id": "nutrition-info-header"}).find_previous('p')
        description = description_container.text.strip()
    except:
        description = ''

    try:
        allergens = page_soup.find("div", {"id": "nutrition-info-header"}).find('p').text.strip().split(', ')
    except:
        allergens = []

    # Nutrition information
    nutrition_table = page_soup.find('table')

    nutrition_info = nutrition_table.find_all('tr')

    serving_size = nutrition_info[0].text.strip().split("Amount Per Serving")[-1].strip()

    # amount of serving size and unit I.E. 1 cup
    try:
        serving_size_amount = float(serving_size.split(' ')[0])
        serving_size_unit = serving_size.split(' ')[1]
    except:
        serving_size_amount = 0
        serving_size_unit = ''

    output_nutrition = []

    # Nutrition information like calories, fat, etc.
    for info in nutrition_info[1:]:
        nutrition_type, serving_amount = info.find('th').text.strip().split('\n')

        serving_amount = serving_amount.strip().replace('\n', ' ').replace('\t', '').replace('', '')
        serving_amount = float(serving_amount.split(' ')[0])

        nutrition_type = nutrition_type.strip().replace('\t', '')

        output_nutrition.append({
            'name': nutrition_type,
            'amount': serving_amount
        })

    output_food = {
        'name': name,
        'description': description,
        'allergens': allergens,
        'serving_size_amount': serving_size_amount,
        'serving_size_unit': serving_size_unit,
        'nutrition': output_nutrition
    }

    return output_food