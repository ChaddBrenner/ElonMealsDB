import type { ReactNode } from 'react';
import { Check, Columns3Cog, LayoutGrid, Leaf, List, X } from 'lucide-react';
import type { Meal } from '../types';
import type { MenuViewMode, TableColumn, VisibleColumns } from '../app/constants';
import { allergenOptions, visibleColumnOptions } from '../app/constants';
import { formatAllergen, formatStationName } from '../app/utils';
import { Badge, EmptyState } from './common';

export function FilterBar(props: {
  viewMode: MenuViewMode;
  vegan: boolean;
  vegetarian: boolean;
  glutenFree: boolean;
  allergenFree: string[];
  visibleColumns: VisibleColumns;
  onViewMode: (mode: MenuViewMode) => void;
  onVegan: (value: boolean) => void;
  onVegetarian: (value: boolean) => void;
  onGlutenFree: (value: boolean) => void;
  onAllergenFree: (value: string[]) => void;
  onVisibleColumn: (column: TableColumn, visible: boolean) => void;
}) {
  return (
    <div className="filters" aria-label="Food filters">
      <Toggle active={props.vegan} onClick={() => props.onVegan(!props.vegan)} icon={<Leaf size={15} />} label="Vegan" />
      <Toggle active={props.vegetarian} onClick={() => props.onVegetarian(!props.vegetarian)} icon={<Leaf size={15} />} label="Vegetarian" />
      <Toggle active={props.glutenFree} onClick={() => props.onGlutenFree(!props.glutenFree)} icon={<Check size={15} />} label="Gluten free" />
      <label className="avoid-select">
        <select
          aria-label="Avoid allergens"
          value=""
          onChange={(event) => {
            const value = event.target.value;
            if (value && !props.allergenFree.includes(value)) props.onAllergenFree([...props.allergenFree, value]);
          }}
        >
          <option value="">Avoid</option>
          {allergenOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      {props.allergenFree.map((allergen) => (
        <button className="chip allergen-chip" type="button" key={allergen} onClick={() => props.onAllergenFree(props.allergenFree.filter((item) => item !== allergen))}>
          {formatAllergen(allergen)} <X size={13} />
        </button>
      ))}
      <div className="filter-actions">
        <ViewModeToggle mode={props.viewMode} onMode={props.onViewMode} />
        {props.viewMode === 'table' && <ColumnPicker visibleColumns={props.visibleColumns} onVisibleColumn={props.onVisibleColumn} />}
      </div>
    </div>
  );
}

export function ViewModeToggle({ mode, onMode }: { mode: MenuViewMode; onMode: (mode: MenuViewMode) => void }) {
  return (
    <div className="view-mode-toggle" role="group" aria-label="Menu view">
      <button
        className={mode === 'table' ? 'active' : undefined}
        type="button"
        onClick={() => onMode('table')}
        aria-pressed={mode === 'table'}
      >
        <List size={15} />
        <span>Table</span>
      </button>
      <button
        className={mode === 'overview' ? 'active' : undefined}
        type="button"
        onClick={() => onMode('overview')}
        aria-pressed={mode === 'overview'}
      >
        <LayoutGrid size={15} />
        <span>Overview</span>
      </button>
    </div>
  );
}

export function ColumnPicker(props: {
  visibleColumns: VisibleColumns;
  onVisibleColumn: (column: TableColumn, visible: boolean) => void;
}) {
  return (
    <details className="column-picker">
      <summary aria-label="Choose table columns">
        <Columns3Cog size={15} />
        <span>Columns</span>
      </summary>
      <div className="column-menu" role="group" aria-label="Visible columns">
        {visibleColumnOptions.map((column) => (
          <label key={column.key}>
            <input
              type="checkbox"
              checked={props.visibleColumns[column.key]}
              onChange={(event) => props.onVisibleColumn(column.key, event.target.checked)}
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

export function StationFilter(props: {
  stations: Meal['stations'];
  selectedStationId: number | null;
  specialStationIds: Set<number>;
  showSafeCounts: boolean;
  safeCounts: Map<number, number>;
  visibleFoodCount: number;
  onSelect: (stationId: number | null) => void;
}) {
  const totalFoods = props.stations.reduce((sum, station) => sum + station.foods.length, 0);

  if (!props.stations.length) {
    return <div className="station-strip"><EmptyState text="No stations for this meal." /></div>;
  }

  return (
    <div className="station-strip" aria-label="Station filters">
      <button
        className={props.selectedStationId === null ? 'selected' : undefined}
        type="button"
        onClick={() => props.onSelect(null)}
      >
        <span>All stations</span>
        <Badge tone={props.showSafeCounts ? 'green' : 'neutral'}>
          {props.showSafeCounts ? `${props.visibleFoodCount}/${totalFoods} safe` : totalFoods}
        </Badge>
      </button>
      {props.stations.map((station) => (
        <button
          className={props.selectedStationId === station.id ? 'selected' : undefined}
          type="button"
          key={station.id}
          onClick={() => props.onSelect(props.selectedStationId === station.id ? null : station.id)}
        >
          <span>{formatStationName(station.name)}</span>
          {props.specialStationIds.has(station.id) && (
            <span className="station-special-badge" aria-label="Different today" title="This station is different today">Different today</span>
          )}
          <Badge tone={props.showSafeCounts ? 'green' : 'neutral'}>
            {props.showSafeCounts ? `${props.safeCounts.get(station.id) ?? 0}/${station.foods.length} safe` : station.foods.length}
          </Badge>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button className={`toggle ${active ? 'active' : ''}`} type="button" onClick={onClick}>{icon}{label}</button>;
}
