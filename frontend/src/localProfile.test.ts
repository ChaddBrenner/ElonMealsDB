import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultProfile, loadLocalProfile, saveLocalProfile } from './localProfile';

const storageKey = 'elonmealsdb.localProfile.v1';

describe('local profile storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts with an empty planner profile', () => {
    installStorage();

    const profile = loadLocalProfile();

    expect(profile.name).toBe('My dining plan');
    expect(profile.favoriteFoods).toEqual([]);
    expect(profile.meals).toEqual([]);
  });

  it('persists planner state in browser storage', () => {
    const storage = installStorage();
    const profile = {
      ...createDefaultProfile(),
      name: 'Campus lunch plan',
      dailyCaloriesGoal: 2400
    };

    saveLocalProfile(profile);

    expect(JSON.parse(storage.getItem(storageKey) || '{}')).toMatchObject({
      name: 'Campus lunch plan',
      dailyCaloriesGoal: 2400
    });
  });

  it('normalizes old or malformed stored settings before use', () => {
    const storage = installStorage();
    storage.setItem(storageKey, JSON.stringify({
      schemaVersion: 1,
      name: '  Campus   Favorites  ',
      dailyCaloriesGoal: 99999,
      dailyProteinsGoal: -1,
      dailyCarbsGoal: 'not-a-number',
      dailyFatsGoal: 0,
      satisfactionLevel: 30,
      favoriteFoods: new Array(350).fill({ foodId: 1 }),
      meals: new Array(550).fill({ id: 'meal' })
    }));

    const profile = loadLocalProfile();

    expect(profile.name).toBe('Campus Favorites');
    expect(profile.dailyCaloriesGoal).toBe(6000);
    expect(profile.dailyProteinsGoal).toBe(10);
    expect(profile.dailyCarbsGoal).toBe(260);
    expect(profile.dailyFatsGoal).toBe(10);
    expect('satisfactionLevel' in profile).toBe(false);
    expect(profile.favoriteFoods).toHaveLength(300);
    expect(profile.meals).toHaveLength(500);
  });
});

function installStorage() {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    }
  };

  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}
