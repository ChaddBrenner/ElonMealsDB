import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Food, MenuResponse } from './types';
import { buildMenuInsightFoods, filterFoodsForSafety, formatDatabaseUpdatedAt, formatNutritionNumber, getServiceTone, getTimelineSegmentLabel, latestDatabaseUpdateAt } from './app/utils';
import { ResourceMenuState } from './components/noMenu';

describe('source-fidelity presentation', () => {
  it('distinguishes a published zero from a value Elon did not publish', () => {
    expect(formatNutritionNumber(0, 'g')).toBe('0 g');
    expect(formatNutritionNumber(null, 'g')).toBe('—');
    expect(formatNutritionNumber(undefined)).toBe('—');
  });

  it('uses the source service label verbatim in timeline segments', () => {
    expect(getTimelineSegmentLabel('Open', 20)).toBe('Open');
    expect(getTimelineSegmentLabel('Hours', 20)).toBe('Hours');
    expect(getServiceTone('Open')).toBe('open');
    expect(getServiceTone('Breakfast')).toBe('breakfast');
    expect(getServiceTone('Hours')).toBe('service');
  });

  it('does not treat unknown allergen data as allergen-free', () => {
    const food = {
      vegan: false,
      vegetarian: false,
      glutenFree: false,
      allergens: {
        egg: false,
        shellfish: false,
        soy: null,
        peanut: false,
        wheat: false,
        treeNut: false,
        milk: false,
        sesame: false,
        fish: false,
      },
    } as Food;

    expect(filterFoodsForSafety([food], false, false, false, ['soy'])).toEqual([]);
    expect(filterFoodsForSafety([food], false, false, false, ['milk'])).toEqual([food]);
  });

  it('uses the newest valid import timestamp for the database footer', () => {
    const latest = latestDatabaseUpdateAt([{
      serviceDate: '2026-07-05',
      restaurants: 1,
      meals: 1,
      stations: 1,
      foods: 1,
      foodVariants: 1,
      menuItemPlacements: 1,
      lastImportedAt: '2026-07-05T13:15:00.000Z'
    }, {
      serviceDate: '2026-07-06',
      restaurants: 1,
      meals: 1,
      stations: 1,
      foods: 1,
      foodVariants: 1,
      menuItemPlacements: 1,
      lastImportedAt: '2026-07-06T13:15:00.000Z'
    }]);

    expect(latest).toBe('2026-07-06T13:15:00.000Z');
    expect(formatDatabaseUpdatedAt(latest)).toContain('Jul 6, 2026');
    expect(formatDatabaseUpdatedAt(latest)).toContain('9:15 AM ET');
  });

  it('builds chart foods from the complete selected restaurant menu and deduplicates placements', () => {
    const chartFood = {
      id: 7,
      shortName: 'Test Bowl',
      calories: 200,
      protein: 10,
      totalCarbohydrates: 20,
      totalFat: 5,
      sodium: 100,
      vegan: true,
      vegetarian: true
    } as Food;
    const dinnerFood = {
      ...chartFood,
      id: 8,
      shortName: 'Dinner Bowl'
    } as Food;
    const menu = {
      restaurant: { id: 11, name: 'Test Hall' },
      meals: [{
        id: 12,
        name: 'Lunch',
        time_open: '2026-07-06T11:00:00.000Z',
        time_closed: '2026-07-06T14:00:00.000Z',
        stations: [{ id: 13, name: 'Test Station', foods: [chartFood, chartFood] }]
      }, {
        id: 14,
        name: 'Dinner',
        time_open: '2026-07-06T17:00:00.000Z',
        time_closed: '2026-07-06T20:00:00.000Z',
        stations: [{ id: 15, name: 'Dinner Station', foods: [dinnerFood] }]
      }]
    } as MenuResponse;

    const foods = buildMenuInsightFoods(menu, 12);
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({
      restaurantId: 11,
      mealId: 12,
      stationId: 13,
      appearanceCount: 2,
      dietGroup: 'Vegan',
      macroTotalCalories: 165
    });
    expect(foods[0].proteinShare).toBeCloseTo(40 / 165);
    expect(buildMenuInsightFoods(menu, 14).map((food) => food.shortName)).toEqual(['Dinner Bowl']);
    expect(buildMenuInsightFoods(menu)).toHaveLength(2);
  });

  it('keeps external-resource service windows on the standard green treatment', () => {
    const menu = {
      restaurant: {
        id: 21,
        name: 'External Cafe',
        url: 'https://example.com/menu',
        venue_name: 'External Cafe',
        service_date: '2026-07-06',
        source_kind: 'external_link',
        menu_status: 'external'
      },
      meals: [{
        id: 22,
        restaurant_id: 21,
        name: 'Open',
        time_open: '2026-07-06T08:00:00.000Z',
        time_closed: '2026-07-06T17:00:00.000Z',
        menu_status: 'external',
        menu_label: null,
        menu_time_label: null,
        stations: []
      }]
    } as MenuResponse;

    const markup = renderToStaticMarkup(ResourceMenuState({ menu, activeMeal: menu.meals[0] }));
    expect(markup).toContain('class="active"');
    expect(markup).not.toContain('tone-open');
    expect(markup).toContain('Open exact external resource');
  });
});
