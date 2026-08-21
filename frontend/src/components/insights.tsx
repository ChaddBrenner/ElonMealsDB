import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import { BarChart3 } from 'lucide-react';
import type { Food, InsightFood, NutritionInsights, ConstraintCoverageInsight, StationInsight } from '../types';
import { dietClass, macroTriangleVertices } from '../app/constants';
import {
  foodRenderKey,
  formatFoodContext,
  formatStationName,
  heatmapColor,
  macroTrianglePosition,
  macroTriangleShares,
  nutritionValue,
  percentOf,
  percentText,
  round
} from '../app/utils';
import { Badge, EmptyState, PanelHeader } from './common';

export function NutritionInsightsPanel({ insights, activeMealId, chartFoods, chartScopeLabel, onSelect }: {
  insights: NutritionInsights | null;
  activeMealId: number | null;
  chartFoods: InsightFood[];
  chartScopeLabel: string;
  onSelect: (food: Food) => void;
}) {
  const stationConstraints = insights?.stationConstraints.filter((station) => !activeMealId || station.mealId === activeMealId) || [];
  const stationFingerprints = insights?.stationMacroFingerprints.filter((station) => !activeMealId || station.mealId === activeMealId) || [];

  return (
    <section className="panel nutrition-panel">
      <PanelHeader
        title="Nutrition Insights"
        subtitle=""
        icon={<BarChart3 size={18} />}
      />
      <div className="insight-canvas">
        <ProteinScatter foods={chartFoods} scopeLabel={chartScopeLabel} onSelect={onSelect} />
        <MacroTriangle foods={chartFoods} scopeLabel={chartScopeLabel} onSelect={onSelect} />
        <StationConstraintHeatmap stations={stationConstraints} />
        <StationMacroFingerprints stations={stationFingerprints} />
      </div>
      <div className="insight-tables">
        <ProteinEfficiencyTable foods={insights?.proteinEfficiency || []} onSelect={onSelect} />
        <SodiumOutliersTable foods={insights?.sodiumOutliers || []} onSelect={onSelect} />
        <ConstraintCoverageTable rows={insights?.constraintCoverage || []} />
      </div>
    </section>
  );
}

export function ProteinScatter({ foods, scopeLabel, onSelect }: { foods: InsightFood[]; scopeLabel: string; onSelect: (food: Food) => void }) {
  const points = foods.filter((food) => nutritionValue(food.calories) > 0 && nutritionValue(food.protein) > 0);
  const maxCalories = Math.max(1, ...points.map((food) => nutritionValue(food.calories)));
  const maxProtein = Math.max(1, ...points.map((food) => nutritionValue(food.protein)));
  const positionedPoints = spreadCoincidentPoints(points.map((food) => ({
    food,
    left: Math.min(94, Math.max(5, (nutritionValue(food.calories) / maxCalories) * 91)),
    top: Math.min(90, Math.max(8, 94 - (nutritionValue(food.protein) / maxProtein) * 82))
  })));

  if (!points.length) {
    return <InsightEmpty title="Protein Value Scatter" text="Protein value appears when nutrition data is available." />;
  }

  return (
    <div className="insight-card protein-map" aria-label="Protein value scatter">
      <div className="insight-section-title">
        <strong>Protein Value Scatter</strong>
        <span>{scopeLabel} · Calories vs. protein · {formatFoodCount(points.length)}</span>
      </div>
      <div className="chart-legend diet-legend" aria-hidden="true">
        <span className="diet-dot vegan" /> Vegan
        <span className="diet-dot vegetarian" /> Vegetarian
        <span className="diet-dot omnivore" /> Omnivore
      </div>
      <div className="scatter-frame">
        <span className="scatter-axis x">Calories</span>
        <span className="scatter-axis y">Protein</span>
        {positionedPoints.map((point, index) => (
          <ChartPoint
            key={foodRenderKey(point.food, index)}
            food={point.food}
            left={point.left}
            top={point.top}
            label={`${point.food.shortName}: ${round(point.food.calories)} cal, ${round(point.food.protein)} g protein`}
            ariaLabel={`${point.food.shortName}, ${round(point.food.calories)} calories, ${round(point.food.protein)} grams protein`}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function MacroTriangle({ foods, scopeLabel, onSelect }: { foods: InsightFood[]; scopeLabel: string; onSelect: (food: Food) => void }) {
  const points = foods.filter((food) => food.macroTotalCalories > 0);
  const positionedPoints = spreadCoincidentPoints(points.map((food) => {
    const position = macroTrianglePosition(food);
    return { food, left: position.x, top: position.y };
  }));

  if (!points.length) {
    return <InsightEmpty title="Macro Triangle" text="Macro balance appears when nutrition data is available." />;
  }

  return (
    <div className="insight-card macro-triangle-card" aria-label="Macro triangle">
      <div className="insight-section-title">
        <strong>Macro Triangle</strong>
        <span>{scopeLabel} · Protein, carbs, and fat · {formatFoodCount(points.length)}</span>
      </div>
      <div className="macro-triangle-frame">
        <div className="macro-triangle-plot">
          <svg
            className="macro-triangle-bg"
            viewBox="0 0 100 100"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <polygon
              className="triangle-shell"
              points={`${macroTriangleVertices.protein.x},${macroTriangleVertices.protein.y} ${macroTriangleVertices.carbs.x},${macroTriangleVertices.carbs.y} ${macroTriangleVertices.fat.x},${macroTriangleVertices.fat.y}`}
            />
          </svg>
          <span className="triangle-label protein" aria-hidden="true">Protein</span>
          <span className="triangle-label carbs" aria-hidden="true">Carbs</span>
          <span className="triangle-label fat" aria-hidden="true">Fat</span>
          <div className="macro-triangle-points">
            {positionedPoints.map((point, index) => {
              const { proteinShare, carbShare, fatShare } = macroTriangleShares(point.food);
              return (
                <ChartPoint
                  key={foodRenderKey(point.food, index)}
                  food={point.food}
                  left={point.left}
                  top={point.top}
                  className="triangle-point"
                  label={`${point.food.shortName}: ${percentText(proteinShare)} protein, ${percentText(carbShare)} carbs, ${percentText(fatShare)} fat`}
                  ariaLabel={`${point.food.shortName}: ${percentText(proteinShare)} protein, ${percentText(carbShare)} carbs, ${percentText(fatShare)} fat`}
                  onSelect={onSelect}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type PositionedInsightFood = {
  food: InsightFood;
  left: number;
  top: number;
};

function spreadCoincidentPoints(points: PositionedInsightFood[]) {
  const bucketCounts = new Map<string, number>();
  return points.map((point) => {
    const bucketKey = `${Math.round(point.left / 1.5)}:${Math.round(point.top / 1.5)}`;
    const collisionIndex = bucketCounts.get(bucketKey) || 0;
    bucketCounts.set(bucketKey, collisionIndex + 1);
    if (!collisionIndex) return point;

    const angle = collisionIndex * 137.5 * (Math.PI / 180);
    const radius = Math.min(2.4, 0.7 + Math.sqrt(collisionIndex) * 0.55);
    return {
      ...point,
      left: Math.min(96, Math.max(4, point.left + Math.cos(angle) * radius)),
      top: Math.min(94, Math.max(6, point.top + Math.sin(angle) * radius))
    };
  });
}

function formatFoodCount(count: number) {
  return `${count} ${count === 1 ? 'food' : 'foods'}`;
}

function ChartPoint({ food, left, top, className = '', label, ariaLabel, onSelect }: {
  food: InsightFood;
  left: number;
  top: number;
  className?: string;
  label: string;
  ariaLabel: string;
  onSelect: (food: Food) => void;
}) {
  return (
    <button
      className={`scatter-point ${className} ${left > 70 ? 'label-left' : ''} ${dietClass(food.dietGroup)}`}
      type="button"
      title={label}
      style={{ left: `${left}%`, top: `${top}%` }}
      onClick={() => onSelect(food)}
      aria-label={ariaLabel}
    >
      <span aria-hidden="true">{food.shortName}</span>
    </button>
  );
}

export function StationConstraintHeatmap({ stations }: { stations: StationInsight[] }) {
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null);
  const columns: Array<{ key: keyof StationInsight; label: string }> = [
    { key: 'vegetarianShare', label: 'Veg' },
    { key: 'veganShare', label: 'Vegan' },
    { key: 'glutenFreeShare', label: 'GF' },
    { key: 'noTop9Share', label: 'No Top-9' },
    { key: 'milkFreeShare', label: 'Milk Free' },
    { key: 'wheatFreeShare', label: 'Wheat Free' },
    { key: 'soyFreeShare', label: 'Soy Free' },
    { key: 'eggFreeShare', label: 'Egg Free' }
  ];

  if (!stations.length) {
    return <InsightEmpty title="Station Constraint Heatmap" text="Constraint coverage appears for the selected meal." />;
  }

  return (
    <div className="insight-card heatmap-card" aria-label="Station constraint heatmap">
      <div className="insight-section-title">
        <strong>Station Constraint Heatmap</strong>
        <span>Selected meal only</span>
      </div>
      <div className="constraint-heatmap" style={{ '--constraint-columns': columns.length } as CSSProperties}>
        <div className="heatmap-station-heading">Station</div>
        {columns.map((column) => <div className="heatmap-column-heading" key={column.label}>{column.label}</div>)}
        {stations.map((station) => (
          <Fragment key={station.stationId}>
            <div className="heatmap-station-name">
              <strong>{formatStationName(station.stationName)}</strong>
              <small>{station.foodCount} foods</small>
            </div>
            {columns.map((column) => {
              const value = Number(station[column.key] || 0);
              const cellKey = `${station.stationId}:${column.key}`;
              return (
                <span
                  className={`heatmap-cell ${activeCellKey === cellKey ? 'active' : ''}`}
                  key={cellKey}
                  style={{ background: heatmapColor(value) }}
                  tabIndex={0}
                  title={`${formatStationName(station.stationName)} ${column.label}: ${percentText(value)}`}
                  aria-label={`${formatStationName(station.stationName)} ${column.label} ${percentText(value)}`}
                  onBlur={() => setActiveCellKey(null)}
                  onClick={() => setActiveCellKey(cellKey)}
                  onFocus={() => setActiveCellKey(cellKey)}
                  onMouseEnter={() => setActiveCellKey(cellKey)}
                  onMouseLeave={() => setActiveCellKey(null)}
                >
                  <span>{percentText(value)}</span>
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="heatmap-legend" aria-hidden="true">
        <span>Fewer choices</span>
        <span />
        <span>More choices</span>
      </div>
    </div>
  );
}

export function StationMacroFingerprints({ stations }: { stations: StationInsight[] }) {
  if (!stations.length) {
    return <InsightEmpty title="Station Macro Fingerprints" text="Station macro fingerprints appear for the selected meal." />;
  }

  return (
    <div className="insight-card station-fingerprints" aria-label="Station macro fingerprints">
      <div className="insight-section-title">
        <strong>Station Macro Fingerprints</strong>
        <span>Selected meal only</span>
      </div>
      <div className="fingerprint-list">
        {stations.map((station) => (
          <div className="fingerprint-row" key={station.stationId}>
            <div>
              <strong>{formatStationName(station.stationName)}</strong>
              <small>{round(station.avgProtein)} g avg protein</small>
            </div>
            <div className="fingerprint-bar" aria-label={`${formatStationName(station.stationName)} macro mix`}>
              <span className="protein" style={{ width: `${percentOf(station.proteinShare, 1)}%` }} />
              <span className="carbs" style={{ width: `${percentOf(station.carbShare, 1)}%` }} />
              <span className="fat" style={{ width: `${percentOf(station.fatShare, 1)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="macro-stack-legend" aria-hidden="true">
        <span className="protein" /> Protein
        <span className="carbs" /> Carbs
        <span className="fat" /> Fat
      </div>
    </div>
  );
}

export function ProteinEfficiencyTable({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  return (
    <div className="insight-table-card" aria-label="Top Protein Efficiency">
      <div className="insight-section-title">
        <strong>Top Protein Efficiency</strong>
        <span>Exact grams per 100 calories</span>
      </div>
      {foods.length ? (
        <div className="insight-table-list">
          {foods.slice(0, 6).map((food, index) => (
            <button className="insight-table-row" type="button" key={foodRenderKey(food, index)} onClick={() => onSelect(food)}>
              <span className="protein-rank">{index + 1}</span>
              <div>
                <strong>{food.shortName}</strong>
                <small>{formatFoodContext(food)}</small>
              </div>
              <Badge tone="green">{round(food.proteinPer100Calories)} g</Badge>
            </button>
          ))}
        </div>
      ) : <EmptyState text="Protein rankings will appear when menu data is available." />}
    </div>
  );
}

export function SodiumOutliersTable({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  return (
    <div className="insight-table-card" aria-label="Sodium Outliers">
      <div className="insight-section-title">
        <strong>Sodium Outliers</strong>
        <span>High sodium density items</span>
      </div>
      {foods.length ? (
        <div className="insight-table-list">
          {foods.slice(0, 6).map((food, index) => (
            <button className="insight-table-row sodium-row" type="button" key={foodRenderKey(food, index)} onClick={() => onSelect(food)}>
              <span className="protein-rank">{index + 1}</span>
              <div>
                <strong>{food.shortName}</strong>
                <small>{round(food.sodium)} mg sodium · {round(food.calories)} cal</small>
              </div>
              <Badge tone="gold">{round(food.sodiumPer100Calories)} mg</Badge>
            </button>
          ))}
        </div>
      ) : <EmptyState text="Sodium outliers will appear when sodium data is available." />}
    </div>
  );
}

export function ConstraintCoverageTable({ rows }: { rows: ConstraintCoverageInsight[] }) {
  return (
    <div className="insight-table-card" aria-label="Constraint Coverage">
      <div className="insight-section-title">
        <strong>Constraint Coverage</strong>
        <span>Campus-wide menu coverage</span>
      </div>
      {rows.length ? (
        <div className="coverage-list">
          {rows.slice(0, 6).map((row) => (
            <div className="coverage-row" key={row.key}>
              <div>
                <strong>{row.label}</strong>
                <small>{row.count} of {row.total} foods</small>
              </div>
              <div className="coverage-meter" aria-label={`${row.label} ${percentText(row.share)}`}>
                <span style={{ width: `${percentOf(row.share, 1)}%` }} />
              </div>
              <Badge tone={row.share >= 0.45 ? 'green' : row.share >= 0.25 ? 'gold' : 'neutral'}>{percentText(row.share)}</Badge>
            </div>
          ))}
        </div>
      ) : <EmptyState text="Constraint coverage will appear when menu data is available." />}
    </div>
  );
}

export function MiniBar({ label, value, tone }: { label: string; value: number; tone: 'protein' | 'carbs' | 'fat' }) {
  return (
    <div className="mini-bar">
      <span>{label}</span>
      <div className={`mini-track ${tone}`} aria-label={`${label} ${value}%`}>
        <span style={{ width: `${value}%` }} />
      </div>
      <strong>{value}%</strong>
    </div>
  );
}

export function InsightEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="insight-card">
      <div className="insight-section-title">
        <strong>{title}</strong>
        <span>No data yet</span>
      </div>
      <EmptyState text={text} />
    </div>
  );
}
