from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from elon_scraper.importer import parse_run_times, seconds_until_next_run, service_dates
from elon_scraper.parser import (
    ScraperError,
    parse_location_menu,
    parse_location_page,
    parse_menu_hours,
    parse_menu_hours_page,
    parse_serving_size,
)


FIXTURES_DIR = Path(__file__).parent / "fixtures"


def test_parse_menu_hours_extracts_venue_restaurant_and_meal_times():
    html = """
    <div class="location-group-wrap">
      <div class="location-venue-name">Lakeside Dining Hall</div>
      <tr class="row location">
        <td><a class="open-now-location-link" href="/locations/lakeside-dining-hall/?date=2026-07-01">Lakeside Dining Hall</a></td>
        <td>
          <div class="hours hours-row" data-name="Summer Break" data-open="1782907200" data-close="1782909000">
            <span class="hours-name">Summer Break</span>
          </div>
        </td>
      </tr>
    </div>
    """

    restaurants = parse_menu_hours(html)

    assert restaurants[0]["name"] == "Lakeside Dining Hall"
    assert restaurants[0]["venue_name"] == "Lakeside Dining Hall"
    assert restaurants[0]["url"] == "https://www.elondining.com/locations/lakeside-dining-hall/?date=2026-07-01"
    assert restaurants[0]["meals"][0]["time_open"].startswith("2026-07-01T08:00:00")


def test_parse_menu_hours_keeps_external_and_pdf_service_windows_without_scraping_them():
    html = """
    <input id="full-date" value="2026-08-21">
    <div class="location-group-wrap">
      <div class="location-venue-name">Winter Garden Cafe</div>
      <div class="row location">
        <a href="https://freshii.com/">Freshii</a>
        <div class="hours" data-name="Open" data-open="1787313600" data-close="1787335200"></div>
      </div>
      <div class="row location">
        <a href="https://www.elondining.com/wp-content/uploads/menu.pdf">PDF Cafe</a>
        <div class="hours" data-name="Open" data-open="1787313600" data-close="1787335200"></div>
      </div>
      <div class="row location">
        <a href="/locations/acorn-coffee-shop/?date=2026-08-21">Acorn Coffee Shop</a>
        <div class="hours" data-name="Open" data-open="1787313600" data-close="1787346000"></div>
      </div>
    </div>
    """

    page = parse_menu_hours_page(html, expected_date=date(2026, 8, 21))

    assert [restaurant["name"] for restaurant in page["restaurants"]] == [
        "Freshii", "PDF Cafe", "Acorn Coffee Shop",
    ]
    assert [restaurant["source_kind"] for restaurant in page["restaurants"]] == [
        "external_link", "pdf", "elon_location",
    ]
    assert [restaurant["meals"][0]["menu_status"] for restaurant in page["restaurants"]] == [
        "external", "pdf", "available",
    ]
    assert page["excluded_resources"] == []
    assert page["restaurants_discovered_count"] == 3


def test_parse_menu_hours_rejects_a_cached_document_for_the_wrong_date():
    html = '<input id="full-date" value="2026-08-20"><div class="location-group-wrap"></div>'

    with pytest.raises(ScraperError, match="date mismatch"):
        parse_menu_hours_page(html, expected_date=date(2026, 8, 21))


def test_parse_location_menu_uses_embedded_nutrition_json():
    html = """
    <div class="c-tab__content">
      <div class="menu-station">
        <h4>fruit and yogurt bar</h4>
        <ul>
          <li class="menu-item-li" data-searchable="Overnight Oats oat milk">
            <a href="#" class="show-nutrition prop-vegan prop-vegetarian" data-recipe="recipe1">Overnight Oats</a>
            <div id="recipe-nutrition-recipe1" style="display:none">
              {"name":"Overnight Oats","description":"Old fashioned oats","serving_size":"0.5 cup","ingredients_list":"Oats, oat milk","allergens_list":"","preferences":[{"html_attribute":"vegan"},{"html_attribute":"vegetarian"}],"facts":[{"label":"Calories","value":280},{"label":"Total Fat","value":5},{"label":"Total Carbohydrate","value":51},{"label":"Protein","value":6}]}
            </div>
          </li>
        </ul>
      </div>
    </div>
    """

    tabs = parse_location_menu(html)
    food = tabs[0][0]["foods"][0]

    assert tabs[0][0]["name"] == "fruit and yogurt bar"
    assert food["external_id"] == "recipe1"
    assert food["full_name"] == "Overnight Oats"
    assert food["serving_size_amount"] == 0.5
    assert food["serving_size_unit"] == "cup"
    assert food["calories"] == 280
    assert food["total_carbohydrates"] == 51
    assert food["vegan"] is True


def test_parse_location_menu_realistic_fixture_keeps_station_and_nutrition_shape():
    html = (FIXTURES_DIR / "lakeside_location_menu_sample.html").read_text()

    tabs = parse_location_menu(html)

    assert len(tabs) == 2
    assert [station["name"] for station in tabs[0]] == ["Global Greens", "Homestyle"]
    assert [station["name"] for station in tabs[1]] == ["Evening Grill"]

    lunch_foods = [food for station in tabs[0] for food in station["foods"]]
    assert [food["short_name"] for food in lunch_foods] == [
        "Ginger Tofu Bowl",
        "Fresh Fruit Salad",
        "Roasted Chicken Plate",
    ]

    tofu = lunch_foods[0]
    assert tofu["external_id"] == "recipe-ginger-tofu"
    assert tofu["calories"] == 520
    assert tofu["protein"] == 24
    assert tofu["vegan"] is True
    assert tofu["allergy_soy"] is True
    assert tofu["allergy_sesame"] is True

    fruit = lunch_foods[1]
    assert fruit["serving_size_amount"] == 0.5
    assert fruit["serving_size_unit"] == "cup"
    assert fruit["gluten_free"] is True


def test_parse_location_page_uses_tab_ids_and_preserves_richer_nutrition_data():
    service_timestamp = int(datetime(2026, 8, 21, 10, 0, tzinfo=ZoneInfo("America/New_York")).timestamp())
    html = f"""
    <html>
      <head><link rel="canonical" href="https://www.elondining.com/locations/lakeside-dining-hall/"></head>
      <body class="single single-locations postid-409">
        <input id="date-timestamp" value="{service_timestamp}">
        <div id="location-header-content">
          <h1>Lakeside Dining Hall</h1>
          <h2 class="location-header-venue">Lakeside Dining Hall</h2>
        </div>
        <div id="single-location-wrap">
          <div id="menu-tabs">
            <div class="c-tabs-nav">
              <a class="c-tabs-nav__link" data-tabid="1">Lunch (11am-2pm)</a>
              <a class="c-tabs-nav__link" data-tabid="0">Breakfast (6am-9:30am)</a>
            </div>
            <div class="c-tab">
              <div class="c-tab__content">
                <div class="menu-station">
                  <h4 data-id="station-breakfast">Breakfast Bar</h4>
                  <li class="menu-item-li" data-searchable="Vegan Yogurt soy">
                    <a class="show-nutrition prop-vegan prop-vegetarian" data-recipe="cmVjaXBlOjExOTgxNA">Vegan Yogurt</a>
                    <div id="recipe-nutrition-cmVjaXBlOjExOTgxNA">
                      {{"name":"Vegan Yogurt","description":"Cultured soy yogurt","disclaimer":"Ingredients may change.","serving_size":"1 1/2 cup","ingredients_list":"Soymilk","allergens_list":"Soy","attributes":[{{"icon":"vegan","name":"Vegan"}},{{"icon":"cool_foods","name":"Coolfood"}}],"facts":[{{"label":"Calories","unit":"","value":130,"percent_drv":6}},{{"label":"Added Sugars","unit":"g","value":14,"percent_drv":28}},{{"label":"Potassium","unit":"mg","value":338.3,"percent_drv":7}}]}}
                    </div>
                  </li>
                </div>
              </div>
            </div>
            <div class="c-tab">
              <div class="c-tab__content">
                <div class="menu-station"><h4 data-id="station-lunch">Lunch Grill</h4></div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
    """

    page = parse_location_page(html, expected_date=date(2026, 8, 21))

    assert page["source_post_id"] == 409
    assert [meal["name"] for meal in page["menu_meals"]] == ["Lunch", "Breakfast"]
    assert page["menu_meals"][0]["source_tab_id"] == 1
    assert page["menu_meals"][0]["stations"][0]["source_id"] == "station-lunch"
    breakfast_food = page["menu_meals"][1]["stations"][0]["foods"][0]
    assert breakfast_food["source_recipe_id"] == "119814"
    assert len(breakfast_food["content_hash"]) == 64
    assert breakfast_food["serving_size_amount"] == 1.5
    assert breakfast_food["disclaimer"] == "Ingredients may change."
    assert breakfast_food["added_sugars"] == 14
    assert breakfast_food["potassium"] == 338.3
    assert breakfast_food["dietary_attributes"] == [
        {"key": "vegan", "name": "Vegan"},
        {"key": "cool_foods", "name": "Coolfood"},
    ]


def test_parse_location_page_recognizes_a_valid_hours_only_location():
    service_timestamp = int(datetime(2026, 8, 21, 10, 0, tzinfo=ZoneInfo("America/New_York")).timestamp())
    html = f"""
    <html><body class="single-locations postid-419">
      <input id="date-timestamp" value="{service_timestamp}">
      <div id="location-header-content"><h1>Fountain Market</h1><h2 class="location-header-venue">Clohan Hall</h2></div>
      <div id="single-location-wrap"></div>
    </body></html>
    """

    page = parse_location_page(html, expected_date=date(2026, 8, 21))

    assert page["menu_status"] == "hours_only"
    assert page["menu_meals"] == []


def test_parse_serving_size_handles_mixed_fractions_and_unknown_text():
    assert parse_serving_size("1 1/2 cup") == (1.5, "cup")
    assert parse_serving_size("portion varies") == (None, "portion varies")


def test_service_dates_include_requested_window():
    assert service_dates(date(2026, 7, 1), days_back=1, days_ahead=2) == [
        date(2026, 6, 30),
        date(2026, 7, 1),
        date(2026, 7, 2),
        date(2026, 7, 3),
    ]


def test_parse_run_times_and_next_run():
    run_times = parse_run_times("06:30, 12:15, 15:15")
    assert [item.strftime("%H:%M") for item in run_times] == ["06:30", "12:15", "15:15"]

    now = datetime(2026, 7, 1, 6, 0, tzinfo=ZoneInfo("America/New_York"))
    assert seconds_until_next_run(run_times, now=now) == 30 * 60
