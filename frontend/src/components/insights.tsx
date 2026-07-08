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

export function NutritionInsightsPanel({ insights, activeMealId, onSelect }: {
  insights: NutritionInsights | null;
  activeMealId: number | null;
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
        <ProteinScatter foods={insights?.proteinScatter || []} onSelect={onSelect} />
        <MacroTriangle foods={insights?.macroFoods || []} onSelect={onSelect} />
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

export function ProteinScatter({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  const points = foods.filter((food) => nutritionValue(food.calories) > 0 && nutritionValue(food.protein) > 0).slice(0, 36);
  const maxCalories = Math.max(1, ...points.map((food) => nutritionValue(food.calories)));
  const maxProtein = Math.max(1, ...points.map((food) => nutritionValue(food.protein)));

  if (!points.length) {
    return <InsightEmpty title="Protein Value Scatter" text="Protein value appears when nutrition data is available." />;
  }

  return (
    <div className="insight-card protein-map" aria-label="Protein value scatter">
      <div className="insight-section-title">
        <strong>Protein Value Scatter</strong>
        <span>Lean choices rise toward the upper left</span>
      </div>
      <div className="chart-legend diet-legend" aria-hidden="true">
        <span className="diet-dot vegan" /> Vegan
        <span className="diet-dot vegetarian" /> Vegetarian
        <span className="diet-dot omnivore" /> Omnivore
      </div>
      <div className="scatter-frame">
        <span className="scatter-axis x">Calories</span>
        <span className="scatter-axis y">Protein</span>
        {points.map((food, index) => {
          const calories = nutritionValue(food.calories);
          const protein = nutritionValue(food.protein);
          return (
            <button
              key={foodRenderKey(food, index)}
              className={`scatter-point ${dietClass(food.dietGroup)}`}
              type="button"
              title={`${food.shortName}: ${round(calories)} cal, ${round(protein)} g protein`}
              style={{
                left: `${Math.min(94, Math.max(5, (calories / maxCalories) * 91))}%`,
                top: `${Math.min(90, Math.max(8, 94 - (protein / maxProtein) * 82))}%`
              }}
              onClick={() => onSelect(food)}
              aria-label={`${food.shortName}, ${round(calories)} calories, ${round(protein)} grams protein`}
            >
              <span>{food.shortName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MacroTriangle({ foods, onSelect }: { foods: InsightFood[]; onSelect: (food: Food) => void }) {
  const points = foods.filter((food) => food.macroTotalCalories > 0).slice(0, 42);

  if (!points.length) {
    return <InsightEmpty title="Macro Triangle" text="Macro balance appears when nutrition data is available." />;
  }

  return (
    <div className="insight-card macro-triangle-card" aria-label="Macro triangle">
      <div className="insight-section-title">
        <strong>Macro Triangle</strong>
        <span>Where each item leans by calories</span>
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
            {points.map((food, index) => {
              const position = macroTrianglePosition(food);
              const { proteinShare, carbShare, fatShare } = macroTriangleShares(food);
              return (
                <button
                  key={foodRenderKey(food, index)}
                  className={`scatter-point triangle-point ${position.x > 68 ? 'label-left' : ''} ${dietClass(food.dietGroup)}`}
                  type="button"
                  style={{ left: `${position.x}%`, top: `${position.y}%` }}
                  title={`${food.shortName}: ${percentText(proteinShare)} protein, ${percentText(carbShare)} carbs, ${percentText(fatShare)} fat`}
                  onClick={() => onSelect(food)}
                  aria-label={`${food.shortName}: ${percentText(proteinShare)} protein, ${percentText(carbShare)} carbs, ${percentText(fatShare)} fat`}
                >
                  <span>{food.shortName}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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
