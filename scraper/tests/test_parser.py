from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from elon_scraper.importer import parse_run_times, seconds_until_next_run, service_dates
from elon_scraper.parser import parse_location_menu, parse_menu_hours


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


def test_service_dates_include_requested_window():
    assert service_dates(date(2026, 7, 1), days_back=1, days_ahead=2) == [
        date(2026, 6, 30),
        date(2026, 7, 1),
        date(2026, 7, 2),
        date(2026, 7, 3),
    ]


def test_parse_run_times_and_next_run():
    run_times = parse_run_times("05:15, 12:15, 15:15")
    assert [item.strftime("%H:%M") for item in run_times] == ["05:15", "12:15", "15:15"]

    now = datetime(2026, 7, 1, 6, 0, tzinfo=ZoneInfo("America/New_York"))
    assert seconds_until_next_run(run_times, now=now) == 6 * 60 * 60 + 15 * 60
