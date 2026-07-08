import { expect, test, type Page, type Route } from '@playwright/test';

const serviceDate = '2026-07-06';
const emptyDate = '2026-07-08';
const restaurantId = 101;
const secondRestaurantId = 102;
const mealId = 201;
const dinnerMealId = 202;
const cafeMealId = 203;

const allergens = {
  egg: false,
  shellfish: false,
  soy: false,
  peanut: false,
  wheat: false,
  treeNut: false,
  milk: false,
  sesame: false,
  fish: false
};

const tofuBowl = food({
  id: 1,
  externalId: 'recipe-tofu-bowl',
  shortName: 'Ginger Tofu Bowl',
  fullName: 'Ginger Tofu Bowl with Rice',
  ingredients: 'Tofu, jasmine rice, ginger, scallions',
  calories: 310,
  totalCarbohydrates: 42,
  protein: 18,
  vegan: true,
  vegetarian: true,
  glutenFree: true,
  allergens: { ...allergens, soy: true },
  mealId,
  mealName: 'Summer Break',
  mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
  mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
  stationId: 301,
  stationName: 'global greens'
});

const chickenPlate = food({
  id: 2,
  externalId: 'recipe-chicken-plate',
  shortName: 'Campus Chicken Plate',
  fullName: 'Campus Chicken Plate',
  ingredients: 'Chicken, roasted potatoes, herbs',
  calories: 520,
  totalCarbohydrates: 48,
  protein: 34,
  mealId,
  mealName: 'Summer Break',
  mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
  mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
  stationId: 302,
  stationName: 'Homestyle'
});

const yogurtParfait = food({
  id: 3,
  externalId: 'recipe-yogurt-parfait',
  shortName: 'Greek Yogurt Parfait',
  fullName: 'Greek Yogurt Parfait',
  ingredients: 'Greek yogurt, granola, blueberries',
  calories: 240,
  totalCarbohydrates: 35,
  protein: 14,
  vegetarian: true,
  mealId,
  mealName: 'Summer Break',
  mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
  mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
  stationId: 301,
  stationName: 'global greens'
});

const avocadoToast = food({
  id: 4,
  externalId: 'recipe-avocado-toast',
  shortName: 'Avocado Toast',
  fullName: 'Avocado Toast',
  ingredients: 'Avocado, sourdough, lemon, chili flakes',
  calories: 330,
  totalCarbohydrates: 38,
  protein: 11,
  vegan: true,
  vegetarian: true,
  stationId: 304,
  stationName: 'Cafe Counter',
  mealId: cafeMealId,
  mealTimeOpen: `${serviceDate}T07:30:00.000Z`,
  mealTimeClosed: `${serviceDate}T10:30:00.000Z`,
  restaurantId: secondRestaurantId,
  restaurantName: 'Acorn Coffee Shop',
  mealName: 'Breakfast'
});

test('dashboard supports search, details, favorites, and local meal planning', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await mockApi(page);
  await page.goto('/');

  await expect(page).toHaveTitle('ElonMealsDB');
  await expect(page.getByText('ElonMealsDB')).toBeVisible();
  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ })).toHaveClass(/selected/);
  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Acorn Coffee Shop/ })).toBeVisible();
  await expect(page.getByLabel('Selected foods')).toContainText('0 selected');
  await expect(page.getByRole('heading', { name: "Today's Plan" })).toHaveCount(0);
  await expect(page.locator('.brand-logo')).toBeVisible();
  await expect(page.getByText('0 meals planned')).toHaveCount(0);
  await expect(page.getByText('Data Freshness')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'System Proof' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Meal History' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Profile And Goals' })).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  await expect(page.getByRole('heading', { name: 'Nutrition Insights' })).toBeVisible();
  await expect(page.getByText('Foods indexed')).toHaveCount(0);
  await expect(page.getByLabel('Protein value scatter').getByText('Protein Value Scatter')).toBeVisible();
  await expect(page.getByLabel('Macro triangle').getByText('Macro Triangle')).toBeVisible();
  await expect(page.getByLabel('Station constraint heatmap').getByText('Station Constraint Heatmap')).toBeVisible();
  await expect(page.getByLabel('Station macro fingerprints').getByText('Station Macro Fingerprints')).toBeVisible();
  await expect(page.getByLabel('Top Protein Efficiency').getByText('Campus Chicken Plate')).toBeVisible();
  await expect(page.getByLabel('Sodium Outliers').getByText('Campus Chicken Plate')).toBeVisible();
  await expect(page.getByLabel('Constraint Coverage').getByText('Vegetarian')).toBeVisible();
  const proteinBadge = page.getByLabel('Top Protein Efficiency').locator('.insight-table-row .badge').first();
  await expect(proteinBadge).toContainText(/\d+ g/);
  const proteinBadgeMetrics = await proteinBadge.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      badgeWidth: element.getBoundingClientRect().width,
      textWidth: range.getBoundingClientRect().width
    };
  });
  expect(proteinBadgeMetrics.badgeWidth).toBeGreaterThan(proteinBadgeMetrics.textWidth + 12);
  const layoutState = await page.evaluate(() => {
    const topbar = document.querySelector('.topbar');
    const summary = document.querySelector('.plan-summary-bar');
    const timeline = document.querySelector('.restaurant-timeline');
    return {
      topbarPosition: topbar ? getComputedStyle(topbar).position : '',
      summaryPosition: summary ? getComputedStyle(summary).position : '',
      summaryBeforeTimeline: Boolean(summary && timeline && (summary.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING))
    };
  });
  expect(layoutState).toMatchObject({
    topbarPosition: 'static',
    summaryPosition: 'sticky',
    summaryBeforeTimeline: true
  });
  await page.evaluate(() => window.scrollTo(0, 260));
  await expect(page.getByLabel('Nutrition totals')).toHaveClass(/is-compact/);
  const compactSummaryState = await page.getByLabel('Nutrition totals').evaluate((element) => {
    const goal = element.querySelector('.goal');
    const labelRow = goal?.querySelector('div:first-child');
    return {
      background: getComputedStyle(element).backgroundColor,
      labelRowDisplay: labelRow ? getComputedStyle(labelRow).display : '',
      labelRowAlignItems: labelRow ? getComputedStyle(labelRow).alignItems : '',
      labelRowJustifyContent: labelRow ? getComputedStyle(labelRow).justifyContent : ''
    };
  });
  expect(compactSummaryState).toMatchObject({
    labelRowDisplay: 'flex',
    labelRowAlignItems: 'baseline',
    labelRowJustifyContent: 'space-between'
  });
  expect(compactSummaryState.background).not.toBe('rgba(255, 255, 255, 0.94)');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByLabel('Nutrition totals')).not.toHaveClass(/is-compact/);
  const triangleColors = await page.getByLabel('Macro triangle').evaluate((element) => {
    const frame = element.querySelector('.macro-triangle-frame');
    const shell = element.querySelector('.triangle-shell');
    return {
      frame: frame ? getComputedStyle(frame).backgroundColor : '',
      shell: shell ? getComputedStyle(shell).fill : ''
    };
  });
  expect(triangleColors.frame).not.toBe('rgb(19, 26, 23)');
  expect(triangleColors.shell).not.toBe('rgb(12, 19, 17)');
  await page.getByLabel('Use dark mode').click();
  const darkTriangleColors = await page.getByLabel('Macro triangle').evaluate((element) => {
    const frame = element.querySelector('.macro-triangle-frame');
    const shell = element.querySelector('.triangle-shell');
    return {
      frame: frame ? getComputedStyle(frame).backgroundColor : '',
      shell: shell ? getComputedStyle(shell).fill : ''
    };
  });
  expect(darkTriangleColors).toMatchObject({ frame: 'rgb(19, 26, 23)', shell: 'rgb(12, 19, 17)' });
  await page.getByLabel('Use light mode').click();
  await expect(page.locator('.meal-tabs button').filter({ hasText: '11:00 AM - 2:00 PM' })).toContainText('Summer Break');
  await expect(page.locator('.meal-tabs button').filter({ hasText: '5:30 - 6:30 PM' })).toContainText('Summer Break');
  await expect(page.getByText('Summer Break |')).toHaveCount(0);

  await page.getByLabel('Restaurants').getByRole('tab', { name: /Acorn Coffee Shop/ }).click();
  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Acorn Coffee Shop/ })).toHaveClass(/selected/);
  await expect(page.locator('.food-table').getByRole('button', { name: 'Avocado Toast', exact: true })).toBeVisible();
  await page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ }).click();
  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ })).toHaveClass(/selected/);

  const mealTabs = page.getByLabel('Meals');
  await mealTabs.getByRole('tab', { name: /11:00 AM - 2:00 PM/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(mealTabs.getByRole('tab', { name: /5:30 - 6:30 PM/ })).toBeFocused();
  await expect(mealTabs.getByRole('tab', { name: /5:30 - 6:30 PM/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(mealTabs.getByRole('tab', { name: /11:00 AM - 2:00 PM/ })).toBeFocused();
  await expect(mealTabs.getByRole('tab', { name: /11:00 AM - 2:00 PM/ })).toHaveAttribute('aria-selected', 'true');

  const summaryGoalsButton = page.getByRole('region', { name: 'Nutrition totals' }).getByLabel('Edit nutrition goals');
  await summaryGoalsButton.click();
  const goalsDialog = page.getByRole('dialog', { name: 'Nutrition Goals' });
  await expect(goalsDialog).toBeVisible();
  await expect(goalsDialog.getByLabel('Calories')).toBeFocused();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.goal-dialog')))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(goalsDialog).toHaveCount(0);
  await expect(summaryGoalsButton).toBeFocused();

  const stationFilters = page.getByLabel('Station filters');
  await expect(stationFilters.getByRole('button', { name: /Global Greens/ })).toBeVisible();
  await expect(stationFilters.getByRole('button', { name: /Homestyle/ })).toContainText('Different today');
  await expect(stationFilters).not.toContainText('global greens');
  await stationFilters.getByRole('button', { name: /Homestyle/ }).click();
  const foodTable = page.locator('.food-table');
  await expect(foodTable.getByRole('columnheader', { name: /Fat/ })).toBeVisible();
  await expect(foodTable.getByRole('button', { name: 'Campus Chicken Plate', exact: true })).toBeVisible();
  await expect(foodTable.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toHaveCount(0);
  await stationFilters.getByRole('button', { name: /All stations/ }).click();

  await expect(foodTable.getByText(/^Add$/)).toHaveCount(0);
  const rowActionAlignment = await foodTable.locator('tbody tr').first().evaluate((row) => {
    const foodCell = row.querySelector('[data-label="Food"]');
    const addButton = row.querySelector<HTMLButtonElement>('.row-actions .primary-row-button');
    if (!foodCell || !addButton) return null;
    const foodBox = foodCell.getBoundingClientRect();
    const buttonBox = addButton.getBoundingClientRect();
    return Math.abs((foodBox.top + foodBox.height / 2) - (buttonBox.top + buttonBox.height / 2));
  });
  expect(rowActionAlignment ?? Number.POSITIVE_INFINITY).toBeLessThan(2);
  const stickyActionHeader = await foodTable.evaluate((tableWrap) => {
    tableWrap.scrollTop = 120;
    const header = tableWrap.querySelector('th.row-actions-header');
    const bodyAction = tableWrap.querySelector('td.row-actions');
    if (!header || !bodyAction) return null;
    const headerBox = header.getBoundingClientRect();
    const bodyBox = bodyAction.getBoundingClientRect();
    const topElement = document.elementFromPoint(headerBox.left + headerBox.width / 2, headerBox.top + headerBox.height / 2);
    const owner = topElement?.closest('th, td');
    return {
      headerWidth: headerBox.width,
      bodyWidth: bodyBox.width,
      ownerTag: owner?.tagName,
      ownerClass: owner?.className
    };
  });
  expect(stickyActionHeader?.headerWidth ?? 0).toBeGreaterThanOrEqual(90);
  expect(stickyActionHeader?.bodyWidth ?? 0).toBeGreaterThanOrEqual(90);
  expect(stickyActionHeader?.ownerTag).toBe('TH');
  expect(stickyActionHeader?.ownerClass).toContain('row-actions-header');
  await foodTable.getByRole('button', { name: /Sort by Calories/ }).click();
  await expect(foodTable.locator('tbody tr').first()).toContainText('Greek Yogurt Parfait');
  await expect(foodTable.getByRole('columnheader', { name: /Calories/ })).toHaveAttribute('aria-sort', 'ascending');
  await foodTable.getByRole('button', { name: /Sort by Calories/ }).click();
  await expect(foodTable.locator('tbody tr').first()).toContainText('Campus Chicken Plate');
  await expect(foodTable.getByRole('columnheader', { name: /Calories/ })).toHaveAttribute('aria-sort', 'descending');
  await foodTable.getByRole('button', { name: /Sort by Calories/ }).click();
  await expect(foodTable.locator('tbody tr').first()).toContainText('Ginger Tofu Bowl');

  await page.getByText('Columns').click();
  await page.getByLabel('Visible columns').getByLabel('Fat').uncheck();
  await expect(foodTable.getByRole('columnheader', { name: /Fat/ })).toHaveCount(0);
  await page.getByLabel('Visible columns').getByLabel('Fat').check();
  await page.keyboard.press('Escape');
  await page.getByLabel('Avoid allergens').selectOption('soy');
  await expect(page.getByRole('button', { name: /Soy/ })).toBeVisible();
  await expect(page.getByLabel('Station filters').getByRole('button', { name: /All stations/ })).toContainText('2/3 safe');
  await expect(foodTable.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toHaveCount(0);
  const savedSafetyProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('elonmealsdb.localProfile.v1') || '{}').safetyPreferences);
  expect(savedSafetyProfile).toMatchObject({ safeModeEnabled: true, allergenFree: ['soy'] });
  await page.getByRole('button', { name: /Soy/ }).click();
  await expect(foodTable.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toBeVisible();
  await expect(page.locator('.quick-search-trigger kbd')).toContainText(process.platform === 'darwin' ? '⌘K' : 'Ctrl K');

  const menuView = page.getByLabel('Menu view');
  await menuView.getByRole('button', { name: 'Overview' }).click();
  const overview = page.getByLabel('Food overview by station');
  await expect(overview).toBeVisible();
  await expect(overview.getByText('Global Greens')).toBeVisible();
  await expect(overview.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toBeVisible();
  await expect(overview.getByLabel('Add Ginger Tofu Bowl to plan')).toBeVisible();
  await expect(overview.getByRole('button', { name: 'Campus Chicken Plate', exact: true })).toBeVisible();
  await expect(page.locator('.planner-grid')).toHaveClass(/overview-mode/);
  await menuView.getByRole('button', { name: 'Table' }).click();
  await expect(page.locator('.planner-grid')).not.toHaveClass(/overview-mode/);

  await foodTable.getByRole('button', { name: 'Ginger Tofu Bowl', exact: true }).click();
  const drawer = page.locator('.drawer.open');
  await expect(drawer.getByRole('heading', { name: 'Ginger Tofu Bowl' })).toBeVisible();
  await expect(drawer.getByText('Tofu, jasmine rice, ginger, scallions')).toBeVisible();

  await drawer.getByRole('button', { name: 'Favorite' }).click();
  await expect(drawer.getByRole('button', { name: 'Favorited' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Add to plan' }).click();
  await expect(drawer).toHaveCount(0);

  const planPanel = page.locator('.plan-panel');
  await expect(planPanel.getByText('Ginger Tofu Bowl')).toBeVisible();
  await expect(planPanel.getByRole('button', { name: /Export CSV/ })).toBeVisible();
  await expect(planPanel.getByText('310 cal')).toBeVisible();
  await expect(planPanel.getByText('Jul 6')).toHaveCount(0);
  await expect(planPanel).toContainText('1 selected');
  await expect(planPanel.getByLabel('Remove food')).toHaveCount(0);
  await expect(page.getByLabel('Nutrition totals')).toContainText('310 / 2200');
  await expect(page.locator('#favorites')).toContainText('Ginger Tofu Bowl');
  const sectionOrder = await page.locator('main > section').evaluateAll((sections) => sections.map((section) => section.id || section.className));
  expect(sectionOrder.at(-1)).toContain('lower-grid');
  await page.locator('#favorites').getByLabel('Remove Ginger Tofu Bowl favorite').click();
  await expect(page.locator('#favorites')).not.toContainText('Ginger Tofu Bowl');

  await planPanel.getByLabel('Increase quantity').click();
  await expect(planPanel).toContainText('1.25 selected');
  await expect(planPanel.locator('.quantity-stepper')).toContainText('1.25');
  await expect(page.getByLabel('Nutrition totals')).toContainText('387.5 / 2200');

  const savedProfile = await page.evaluate(() => JSON.parse(localStorage.getItem('elonmealsdb.localProfile.v1') || '{}'));
  expect(savedProfile.favoriteFoods).toHaveLength(0);
  expect(savedProfile.meals).toHaveLength(1);
  expect(savedProfile.meals[0].foods[0].food.shortName).toBe('Ginger Tofu Bowl');
  expect(savedProfile.meals[0].foods[0].quantity).toBe(1.25);
  expect(consoleErrors).toEqual([]);
});

test('date changes with no imported menu clear stale restaurant state', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ })).toHaveClass(/selected/);
  await expect(page.locator('.food-table').getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toBeVisible();

  await page.locator('input[type="date"]').fill(emptyDate);

  await expect(page.getByRole('heading', { name: 'No menu imported' })).toBeVisible();
  await expect(page.getByText('No restaurants imported for Jul 8.')).toBeVisible();
  await expect(page.getByLabel('Restaurants')).toContainText('No restaurants imported for this date');
  await expect(page.getByRole('heading', { name: 'Lakeside Dining Hall' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Use latest imported date' }).click();

  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ })).toBeVisible();
  await expect(page.getByLabel('Restaurants').getByRole('tab', { name: /Lakeside Dining Hall/ })).toHaveClass(/selected/);
  await expect(page.locator('.food-table').getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toBeVisible();
});

test('mobile layout stays compact and uses overview browsing by default', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto('/');

  await expect(page.getByText('ElonMealsDB')).toBeVisible();
  await expect(page.getByLabel('Food overview by station')).toBeVisible();
  await expect(page.locator('.planner-grid')).toHaveClass(/overview-mode/);

  const mobileLayout = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        display: getComputedStyle(element).display,
        gridTemplateColumns: getComputedStyle(element).gridTemplateColumns,
        overflowX: getComputedStyle(element).overflowX
      };
    };

    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      timeline: box('.restaurant-timeline'),
      timelineRow: box('.timeline-restaurant'),
      mealTabs: box('.meal-tabs'),
      filters: box('.filters'),
      planSummary: box('.plan-summary-bar'),
      foodOverview: box('.food-overview'),
      goalCards: Array.from(document.querySelectorAll('.plan-summary-goals .goal')).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      })
    };
  });

  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.innerWidth + 1);
  expect(mobileLayout.timelineRow?.width ?? 0).toBeLessThanOrEqual(mobileLayout.innerWidth - 20);
  expect(mobileLayout.timelineRow?.gridTemplateColumns).not.toContain('700px');
  expect(mobileLayout.mealTabs?.display).toBe('grid');
  expect(mobileLayout.mealTabs?.height ?? 0).toBeGreaterThan(100);
  expect(mobileLayout.mealTabs?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(160);
  expect(mobileLayout.filters?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(64);
  expect(mobileLayout.planSummary?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(150);
  expect(mobileLayout.goalCards).toHaveLength(4);
  for (const card of mobileLayout.goalCards) {
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(mobileLayout.innerWidth + 1);
    expect(card.width).toBeGreaterThan(120);
  }

  const overview = page.getByLabel('Food overview by station');
  await overview.getByLabel('Add Ginger Tofu Bowl to plan').click();
  await expect(page.getByLabel('Selected foods')).toContainText('1 selected');

  await page.getByLabel('Menu view').getByRole('button', { name: 'Table' }).click();
  await expect(page.locator('.food-table').getByRole('button', { name: 'Ginger Tofu Bowl', exact: true })).toBeVisible();
  const tableLayout = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    foodTableHeight: Math.round(document.querySelector('.food-table')?.getBoundingClientRect().height || 0),
    foodTableOverflowY: document.querySelector('.food-table') ? getComputedStyle(document.querySelector('.food-table') as Element).overflowY : '',
    desktopTableDisplay: document.querySelector('.food-table .data-table') ? getComputedStyle(document.querySelector('.food-table .data-table') as Element).display : '',
    mobileRowsDisplay: document.querySelector('.mobile-food-rows') ? getComputedStyle(document.querySelector('.mobile-food-rows') as Element).display : '',
    rowHeights: Array.from(document.querySelectorAll('.mobile-food-row')).slice(0, 3).map((row) => Math.round(row.getBoundingClientRect().height)),
    rowGridTemplate: document.querySelector('.mobile-food-row')
      ? getComputedStyle(document.querySelector('.mobile-food-row') as Element).gridTemplateAreas
      : ''
  }));
  expect(tableLayout.scrollWidth).toBeLessThanOrEqual(tableLayout.innerWidth + 1);
  expect(tableLayout.foodTableOverflowY).toBe('visible');
  expect(tableLayout.desktopTableDisplay).toBe('none');
  expect(tableLayout.mobileRowsDisplay).toBe('grid');
  expect(tableLayout.rowHeights.length).toBeGreaterThanOrEqual(3);
  for (const height of tableLayout.rowHeights) {
    expect(height).toBeLessThan(105);
  }
  expect(tableLayout.rowGridTemplate).toContain('title');
  expect(tableLayout.rowGridTemplate).toContain('macros');
});

test('add actions confirm with checkmark, selected row pulse, and count bump', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const planPanel = page.getByLabel('Selected foods');
  const row = page.locator('.food-table tbody tr').filter({ hasText: 'Ginger Tofu Bowl' });
  const addButton = row.getByLabel('Add Ginger Tofu Bowl to plan');

  await addButton.click();

  await expect(addButton).toHaveClass(/is-added/);
  await expect(addButton.locator('.add-feedback-check')).toHaveCSS('opacity', '1');
  await expect(planPanel).toContainText('1 selected');

  const plannedFood = planPanel.locator('.planned-food').filter({ hasText: 'Ginger Tofu Bowl' });
  await expect(plannedFood).toHaveClass(/is-added-pulse/);
  await expect(planPanel.locator('.selected-foods-header .badge')).toHaveClass(/count-bump/);

  await expect(addButton).not.toHaveClass(/is-added/, { timeout: 1200 });
  await expect(plannedFood).not.toHaveClass(/is-added-pulse/, { timeout: 1200 });

  await addButton.click();

  await expect(addButton).toHaveClass(/is-added/);
  await expect(planPanel).toContainText('2 selected');
  await expect(plannedFood.locator('.quantity-stepper')).toContainText('2');
  await expect(planPanel.locator('.selected-foods-header .badge')).toHaveClass(/count-bump/);
});

test('global command search finds foods across restaurants and adds the selected occurrence', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');

  const shortcut = process.platform === 'darwin' ? 'Meta+K' : 'Control+K';
  await page.keyboard.press(shortcut);

  const searchDialog = page.getByRole('dialog', { name: 'Global food search' });
  await expect(searchDialog).toBeVisible();
  await expect(searchDialog.getByLabel('Search everywhere')).toBeFocused();
  const searchDialogBox = await searchDialog.boundingBox();
  expect(searchDialogBox?.width ?? 0).toBeGreaterThan(900);

  await searchDialog.getByLabel('Search everywhere').fill('Summer');
  await expect(searchDialog.locator('.search-result')).toHaveCount(3);
  await expect(searchDialog.getByText('Lakeside Dining Hall · Homestyle')).toBeVisible();
  await expect(searchDialog.getByText('Summer Break · 11:00 AM - 2:00 PM').first()).toBeVisible();
  await expect(searchDialog.locator('.search-result').first()).toHaveClass(/active/);

  await page.keyboard.press('ArrowDown');
  await expect(searchDialog.locator('.search-result').nth(1)).toHaveClass(/active/);
  await page.keyboard.press('Enter');

  await expect(searchDialog).toHaveCount(0);
  await expect(page.getByLabel('Station filters').getByRole('button', { name: /Homestyle/ })).toHaveClass(/selected/);
  await expect(page.locator('.food-table tr.highlighted-row')).toContainText('Campus Chicken Plate');

  await page.keyboard.press(shortcut);
  const reopenedSearch = page.getByRole('dialog', { name: 'Global food search' });
  await reopenedSearch.getByLabel('Search everywhere').fill('Cafe');
  await expect(reopenedSearch.getByText('Acorn Coffee Shop · Cafe Counter')).toBeVisible();
  await expect(reopenedSearch.getByText('Breakfast · 7:30 - 10:30 AM')).toBeVisible();
  await reopenedSearch.getByLabel('Add Avocado Toast to plan').click();

  await expect(reopenedSearch).toBeVisible();
  await expect(page.getByLabel('Selected foods')).toContainText('Avocado Toast');
  await expect(page.getByLabel('Selected foods')).toContainText('Acorn Coffee Shop - 7:30 - 10:30 AM');
});

async function mockApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const requestedDate = url.searchParams.get('date') || serviceDate;
    const hasMenuForDate = requestedDate !== emptyDate;

    if (url.pathname === '/api/service-dates') {
      await json(route, {
        dates: [{
          serviceDate,
          restaurants: 2,
          meals: 3,
          stations: 4,
          foods: 4,
          lastImportedAt: '2026-07-06T13:15:00.000Z'
        }]
      });
      return;
    }

    if (url.pathname === '/api/restaurants') {
      if (!hasMenuForDate) {
        await json(route, { restaurants: [] });
        return;
      }

      await json(route, {
        restaurants: [{
          id: restaurantId,
          name: 'Lakeside Dining Hall',
          url: 'https://www.elondining.com/locations/lakeside-dining-hall/',
          venue_name: 'Lakeside Dining Hall',
          service_date: serviceDate,
          meals_count: 2,
          stations_count: 3,
          foods_count: 3,
          first_open: `${serviceDate}T11:00:00.000Z`,
          last_closed: `${serviceDate}T18:30:00.000Z`
        }, {
          id: secondRestaurantId,
          name: 'Acorn Coffee Shop',
          url: 'https://www.elondining.com/locations/acorn-coffee-shop/',
          venue_name: 'Acorn Coffee Shop',
          service_date: serviceDate,
          meals_count: 1,
          stations_count: 1,
          foods_count: 1,
          first_open: `${serviceDate}T07:30:00.000Z`,
          last_closed: `${serviceDate}T10:30:00.000Z`
        }]
      });
      return;
    }

    if (url.pathname === `/api/restaurants/${restaurantId}/menu`) {
      await json(route, {
        restaurant: {
          id: restaurantId,
          name: 'Lakeside Dining Hall',
          url: 'https://www.elondining.com/locations/lakeside-dining-hall/',
          venue_name: 'Lakeside Dining Hall',
          service_date: serviceDate
        },
        meals: [{
          id: mealId,
          restaurant_id: restaurantId,
          name: 'Summer Break',
          time_open: `${serviceDate}T11:00:00.000Z`,
          time_closed: `${serviceDate}T14:00:00.000Z`,
          stations: [
            { id: 301, mealId, name: 'global greens', foods: [tofuBowl, yogurtParfait] },
            { id: 302, mealId, name: 'Homestyle', foods: [chickenPlate] }
          ]
        }, {
          id: dinnerMealId,
          restaurant_id: restaurantId,
          name: 'Summer Break',
          time_open: `${serviceDate}T17:30:00.000Z`,
          time_closed: `${serviceDate}T18:30:00.000Z`,
          stations: [
            { id: 303, mealId: dinnerMealId, name: 'Evening Grill', foods: [] }
          ]
        }]
      });
      return;
    }

    if (url.pathname === `/api/restaurants/${secondRestaurantId}/menu`) {
      await json(route, {
        restaurant: {
          id: secondRestaurantId,
          name: 'Acorn Coffee Shop',
          url: 'https://www.elondining.com/locations/acorn-coffee-shop/',
          venue_name: 'Acorn Coffee Shop',
          service_date: serviceDate
        },
        meals: [{
          id: cafeMealId,
          restaurant_id: secondRestaurantId,
          name: 'Breakfast',
          time_open: `${serviceDate}T07:30:00.000Z`,
          time_closed: `${serviceDate}T10:30:00.000Z`,
          stations: [
            { id: 304, mealId: cafeMealId, name: 'Cafe Counter', foods: [avocadoToast] }
          ]
        }]
      });
      return;
    }

    if (url.pathname === '/api/metrics/coverage') {
      if (!hasMenuForDate) {
        await json(route, {
          serviceDate: requestedDate,
          restaurants: 0,
          meals: 0,
          stations: 0,
          foods: 0,
          vegan_items: 0,
          vegetarian_items: 0,
          gluten_free_items: 0,
          avg_calories: null,
          scraperRun: null,
          topProtein: []
        });
        return;
      }

      await json(route, {
        serviceDate,
          restaurants: 2,
          meals: 3,
          stations: 4,
          foods: 4,
          vegan_items: 2,
          vegetarian_items: 3,
          gluten_free_items: 1,
        avg_calories: 356.7,
        scraperRun: {
          id: 1,
          source_url: 'https://www.elondining.com/menu-hours/',
          target_date: serviceDate,
          started_at: '2026-07-06T13:15:00.000Z',
          finished_at: '2026-07-06T13:15:04.000Z',
          status: 'success',
          restaurants_count: 1,
          meals_count: 1,
          foods_count: 3
        },
        topProtein: [chickenPlate, tofuBowl, yogurtParfait]
      });
      return;
    }

    if (url.pathname === '/api/metrics/stations') {
      if (!hasMenuForDate) {
        await json(route, { serviceDate: requestedDate, stations: [] });
        return;
      }

      await json(route, {
        serviceDate,
        stations: [{
          serviceDate,
          restaurantId,
          restaurantName: 'Lakeside Dining Hall',
          mealId,
          mealName: 'Summer Break',
          mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
          mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
          stationId: 302,
          stationName: 'Homestyle',
          foodCount: 1,
          avgCalories: 520,
          avgProtein: 34,
          veganItems: 0,
          vegetarianItems: 0,
          glutenFreeItems: 0
        }, {
          serviceDate,
          restaurantId,
          restaurantName: 'Lakeside Dining Hall',
          mealId,
          mealName: 'Summer Break',
          mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
          mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
          stationId: 301,
          stationName: 'Global Greens',
          foodCount: 2,
          avgCalories: 275,
          avgProtein: 16,
          veganItems: 1,
          vegetarianItems: 2,
          glutenFreeItems: 1
        }, {
          serviceDate,
          restaurantId: secondRestaurantId,
          restaurantName: 'Acorn Coffee Shop',
          mealId: cafeMealId,
          mealName: 'Breakfast',
          mealTimeOpen: `${serviceDate}T07:30:00.000Z`,
          mealTimeClosed: `${serviceDate}T10:30:00.000Z`,
          stationId: 304,
          stationName: 'Cafe Counter',
          foodCount: 1,
          avgCalories: 330,
          avgProtein: 11,
          veganItems: 1,
          vegetarianItems: 1,
          glutenFreeItems: 0
        }]
      });
      return;
    }

    if (url.pathname === '/api/metrics/nutrition-insights') {
      if (!hasMenuForDate) {
        await json(route, emptyNutritionInsights(requestedDate));
        return;
      }

      await json(route, {
        serviceDate,
        mealWindows: [{
          serviceDate,
          restaurantId,
          restaurantName: 'Lakeside Dining Hall',
          url: 'https://www.elondining.com/locations/lakeside-dining-hall/',
          venueName: 'Lakeside Dining Hall',
          mealId,
          mealName: 'Summer Break',
          mealPeriod: 'Lunch',
          timeOpen: `${serviceDate}T11:00:00.000Z`,
          timeClosed: `${serviceDate}T14:00:00.000Z`,
          stationCount: 2
        }, {
          serviceDate,
          restaurantId,
          restaurantName: 'Lakeside Dining Hall',
          url: 'https://www.elondining.com/locations/lakeside-dining-hall/',
          venueName: 'Lakeside Dining Hall',
          mealId: dinnerMealId,
          mealName: 'Summer Break',
          mealPeriod: 'Dinner',
          timeOpen: `${serviceDate}T17:30:00.000Z`,
          timeClosed: `${serviceDate}T18:30:00.000Z`,
          stationCount: 1
        }, {
          serviceDate,
          restaurantId: secondRestaurantId,
          restaurantName: 'Acorn Coffee Shop',
          url: 'https://www.elondining.com/locations/acorn-coffee-shop/',
          venueName: 'Acorn Coffee Shop',
          mealId: cafeMealId,
          mealName: 'Breakfast',
          mealPeriod: 'Breakfast',
          timeOpen: `${serviceDate}T07:30:00.000Z`,
          timeClosed: `${serviceDate}T10:30:00.000Z`,
          stationCount: 1
        }],
        proteinScatter: [chickenPlate, tofuBowl, yogurtParfait, avocadoToast].map(insightFood),
        proteinEfficiency: [chickenPlate, tofuBowl, yogurtParfait, avocadoToast].map(insightFood),
        macroFoods: [chickenPlate, tofuBowl, yogurtParfait, avocadoToast].map(insightFood),
        sodiumOutliers: [chickenPlate, avocadoToast, tofuBowl].map(insightFood),
        constraintCoverage: [{
          key: 'vegetarian',
          label: 'Vegetarian',
          count: 3,
          total: 4,
          share: 0.75
        }, {
          key: 'vegan',
          label: 'Vegan',
          count: 2,
          total: 4,
          share: 0.5
        }, {
          key: 'glutenFree',
          label: 'Gluten free',
          count: 1,
          total: 4,
          share: 0.25
        }],
        stationConstraints: stationInsightRows(),
        stationMacroFingerprints: stationInsightRows(),
        specialStations: [{
          serviceDate,
          restaurantId,
          restaurantName: 'Lakeside Dining Hall',
          mealId,
          mealName: 'Summer Break',
          mealPeriod: 'Lunch',
          mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
          mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
          stationId: 302,
          stationName: 'Homestyle',
          foodCount: 1,
          comparisonDates: 5,
          matchingDates: 0,
          currentShare: 0,
          baselineShare: 0.8,
          differentToday: true
        }]
      });
      return;
    }

    if (url.pathname === '/api/foods') {
      if (!hasMenuForDate) {
        await json(route, { foods: [] });
        return;
      }

      const query = (url.searchParams.get('q') || '').toLowerCase();
      const allergenFree = (url.searchParams.get('allergenFree') || '').split(',').map((item) => item.trim()).filter(Boolean);
      const foods = [tofuBowl, chickenPlate, yogurtParfait, avocadoToast]
        .filter((item) => !query || `${item.shortName} ${item.fullName} ${item.ingredients} ${item.restaurantName} ${item.mealName} ${item.stationName}`.toLowerCase().includes(query))
        .filter((item) => url.searchParams.get('vegan') !== 'true' || item.vegan)
        .filter((item) => url.searchParams.get('vegetarian') !== 'true' || item.vegetarian)
        .filter((item) => url.searchParams.get('glutenFree') !== 'true' || item.glutenFree)
        .filter((item) => allergenFree.every((allergen) => !hasAllergen(item, allergen)));
      await json(route, { foods });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } })
    });
  });
}

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

type FoodFixture = {
  id: number;
  externalId: string;
  shortName: string;
  fullName: string;
  description: string;
  ingredients: string;
  servingSizeAmount: number;
  servingSizeUnit: string;
  calories: number;
  caloriesFromFat: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  totalCarbohydrates: number;
  dietaryFiber: number;
  sugars: number;
  protein: number;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  allergens: typeof allergens;
  restaurantId: number;
  restaurantName: string;
  mealId: number;
  mealName: string;
  mealTimeOpen: string;
  mealTimeClosed: string;
  stationId: number;
  stationName: string;
};

function food(overrides: Partial<FoodFixture>): FoodFixture {
  return {
    id: 0,
    externalId: '',
    shortName: '',
    fullName: '',
    description: '',
    ingredients: '',
    servingSizeAmount: 1,
    servingSizeUnit: 'serving',
    calories: 0,
    caloriesFromFat: 0,
    totalFat: 8,
    saturatedFat: 1,
    transFat: 0,
    cholesterol: 0,
    sodium: 300,
    totalCarbohydrates: 0,
    dietaryFiber: 4,
    sugars: 5,
    protein: 0,
    vegetarian: false,
    vegan: false,
    glutenFree: false,
    allergens,
    restaurantId,
    restaurantName: 'Lakeside Dining Hall',
    mealId,
    mealName: 'Lunch',
    mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
    mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
    stationId: 0,
    stationName: '',
    ...overrides
  };
}

function insightFood(item: FoodFixture) {
  const proteinCalories = item.protein * 4;
  const carbCalories = item.totalCarbohydrates * 4;
  const fatCalories = item.totalFat * 9;
  const macroTotalCalories = Math.max(1, proteinCalories + carbCalories + fatCalories);
  return {
    ...item,
    appearanceCount: 1,
    dietGroup: item.vegan ? 'Vegan' : item.vegetarian ? 'Vegetarian' : 'Omnivore',
    proteinPer100Calories: item.calories ? Math.round((item.protein / item.calories) * 1000) / 10 : 0,
    sodiumPer100Calories: item.calories ? Math.round((item.sodium / item.calories) * 1000) / 10 : 0,
    sodiumScore: item.calories ? Math.round((item.sodium / item.calories) * 1000) / 10 : 0,
    macroTotalCalories,
    proteinShare: proteinCalories / macroTotalCalories,
    carbShare: carbCalories / macroTotalCalories,
    fatShare: fatCalories / macroTotalCalories
  };
}

function stationInsightRows() {
  return [{
    serviceDate,
    restaurantId,
    restaurantName: 'Lakeside Dining Hall',
    mealId,
    mealName: 'Summer Break',
    mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
    mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
    stationId: 301,
    stationName: 'Global Greens',
    foodCount: 2,
    avgCalories: 275,
    avgProtein: 16,
    vegetarianShare: 1,
    veganShare: 0.5,
    glutenFreeShare: 0.5,
    noTop9Share: 0,
    milkFreeShare: 0.5,
    wheatFreeShare: 1,
    soyFreeShare: 0.5,
    eggFreeShare: 1,
    proteinShare: 0.2,
    carbShare: 0.6,
    fatShare: 0.2
  }, {
    serviceDate,
    restaurantId,
    restaurantName: 'Lakeside Dining Hall',
    mealId,
    mealName: 'Summer Break',
    mealTimeOpen: `${serviceDate}T11:00:00.000Z`,
    mealTimeClosed: `${serviceDate}T14:00:00.000Z`,
    stationId: 302,
    stationName: 'Homestyle',
    foodCount: 1,
    avgCalories: 520,
    avgProtein: 34,
    vegetarianShare: 0,
    veganShare: 0,
    glutenFreeShare: 0,
    noTop9Share: 1,
    milkFreeShare: 1,
    wheatFreeShare: 1,
    soyFreeShare: 1,
    eggFreeShare: 1,
    proteinShare: 0.28,
    carbShare: 0.39,
    fatShare: 0.33
  }, {
    serviceDate,
    restaurantId: secondRestaurantId,
    restaurantName: 'Acorn Coffee Shop',
    mealId: cafeMealId,
    mealName: 'Breakfast',
    mealTimeOpen: `${serviceDate}T07:30:00.000Z`,
    mealTimeClosed: `${serviceDate}T10:30:00.000Z`,
    stationId: 304,
    stationName: 'Cafe Counter',
    foodCount: 1,
    avgCalories: 330,
    avgProtein: 11,
    vegetarianShare: 1,
    veganShare: 1,
    glutenFreeShare: 0,
    noTop9Share: 0,
    milkFreeShare: 1,
    wheatFreeShare: 0,
    soyFreeShare: 1,
    eggFreeShare: 1,
    proteinShare: 0.13,
    carbShare: 0.45,
    fatShare: 0.42
  }];
}

function emptyNutritionInsights(requestedDate: string) {
  return {
    serviceDate: requestedDate,
    mealWindows: [],
    proteinScatter: [],
    proteinEfficiency: [],
    macroFoods: [],
    sodiumOutliers: [],
    constraintCoverage: [],
    stationConstraints: [],
    stationMacroFingerprints: [],
    specialStations: []
  };
}

function hasAllergen(item: FoodFixture, allergen: string) {
  if (allergen === 'tree_nut') return item.allergens.treeNut;
  if (allergen === 'egg') return item.allergens.egg;
  if (allergen === 'shellfish') return item.allergens.shellfish;
  if (allergen === 'soy') return item.allergens.soy;
  if (allergen === 'peanut') return item.allergens.peanut;
  if (allergen === 'wheat') return item.allergens.wheat;
  if (allergen === 'milk') return item.allergens.milk;
  if (allergen === 'sesame') return item.allergens.sesame;
  if (allergen === 'fish') return item.allergens.fish;
  return false;
}
