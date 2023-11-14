import requests
from bs4 import BeautifulSoup
from datetime import datetime

RESTAURANT_URL = 'https://www.elondining.com/menu-hours/?date='


def get_restaurants(date):
    response = requests.get(RESTAURANT_URL + f'{date.year}-{date.month}-{date.day}')
    page_soup = BeautifulSoup(response.content, "html.parser")

    output_restaurants = []

    # Get the section of the HTML that contains the restaurants
    locations = page_soup.find_all(class_='location-group-wrap')
    # Get the groups which are the different physical locations
    for location in locations:
        # The name of the location
        location_name = location.find(class_='location-venue-name').text.strip()

        # The list of restaurants at this location
        restaurants = location.find_all(class_='row location')
        for restaurant in restaurants:
            a_tag = restaurant.find('a')
            restaurant_name = a_tag.text.strip()
            restaurant_url = a_tag.get('href')

            single_restaurant = {
                'name': restaurant_name,
                'url': restaurant_url,
                'venue_name': location_name,
                'hours': []
            }

            # Hours are the hours that the restaurant is open
            hours = restaurant.find_all(class_='hours')
            for hour in hours:
                hour_closed_epoch = hour.get('data-close')
                hour_open_epoch = hour.get('data-open')
                hour_name = hour.get('data-name')

                single_restaurant['hours'].append({
                    'name': hour_name,
                    # 'open': datetime.fromtimestamp(int(hour_open_epoch)),
                    'open': hour_open_epoch,
                    # 'close': datetime.fromtimestamp(int(hour_closed_epoch))
                    'close': hour_closed_epoch
                })

            output_restaurants.append(single_restaurant)

    return output_restaurants
