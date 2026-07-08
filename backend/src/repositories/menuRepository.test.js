import { describe, expect, it } from 'vitest';
import { rankSemanticRows } from './menuRepository.js';

describe('food search ranking', () => {
  it('keeps direct food-name matches ahead of semantic-only matches', () => {
    const rows = [{
      short_name: 'Balsamic Vinaigrette',
      station_name: 'Dressings',
      meal_time_open: '2026-07-08T11:00:00.000Z',
      food_search_boost: 6,
      food_search_score: 0,
      search_embedding: vectorBuffer([1, 0])
    }, {
      short_name: 'Fresh Fruit Salad',
      station_name: 'Fruit and Yogurt Bar',
      meal_time_open: '2026-07-08T08:00:00.000Z',
      food_search_boost: 72,
      food_search_score: 0.1,
      search_embedding: vectorBuffer([0.4, 0.916515])
    }];

    const ranked = rankSemanticRows(rows, [1, 0], 'salad');

    expect(ranked.map((row) => row.short_name)).toEqual([
      'Fresh Fruit Salad',
      'Balsamic Vinaigrette'
    ]);
  });
});

function vectorBuffer(values) {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}
