import requests
from bs4 import BeautifulSoup


def get_meals(url):
    response = requests.get(url)

    page_soup = BeautifulSoup(response.content, "html.parser")

    meals = page_soup.find_all(class_="c-tab__content")

    output_meals = []

    for meal in meals:
        output_stations = []
        stations = meal.find_all(class_="menu-station")
        for station in stations:
            station_name = station.find('h4').text.strip()

            output_station = {
                'name': station_name,
                'foods': []
            }

            foods = station.find_all(class_="menu-item-li")
            for food in foods:
                searchable_terms = food.get('data-searchable')
                a_tag = food.find('a')
                food_name = a_tag.text.strip()
                food_url = a_tag.get('data-recipe')
                food_attributes = a_tag.get('class')

                output_food = {
                    'name': food_name,
                    'url': food_url,
                    'attributes': food_attributes,
                    'searchable_terms': searchable_terms
                }

                output_station['foods'].append(output_food)

            output_stations.append(output_station)

        output_meals.append(output_stations)

    return output_meals