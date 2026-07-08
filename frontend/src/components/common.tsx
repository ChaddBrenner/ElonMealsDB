import type { ReactNode } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';
import type { MacroTone } from '../app/constants';

export function BrandLogo() {
  return (
    <svg className="brand-logo" viewBox="0 0 40 40" role="img" aria-label="ElonMealsDB logo">
      <rect className="brand-logo-bg" x="2" y="2" width="36" height="36" rx="8" />
      <path className="brand-logo-database" d="M12 12.8c0-2.2 3.6-4 8-4s8 1.8 8 4v13.8c0 2.2-3.6 4-8 4s-8-1.8-8-4V12.8Z" />
      <path className="brand-logo-database-line" d="M12 12.8c0 2.2 3.6 4 8 4s8-1.8 8-4M12 19.5c0 2.2 3.6 4 8 4s8-1.8 8-4" />
      <path className="brand-logo-utensil" d="M14.5 8.8v6.6M16.4 8.8v6.6M18.3 8.8v6.6M16.4 15.4v13.2M25.8 8.7c2.1 2.2 2 6.8-1 8.9v10.9" />
    </svg>
  );
}

export function PanelHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon: ReactNode }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="panel-icon">{icon}</div>
    </div>
  );
}

export function AddFeedbackIcon({ active, size }: { active: boolean; size: number }) {
  return (
    <span className={`add-feedback-icon ${active ? 'is-added' : ''}`} aria-hidden="true">
      <Plus className="add-feedback-plus" size={size} />
      <Check className="add-feedback-check" size={size} />
    </span>
  );
}

export function Badge({ children, tone, className = '' }: { children: ReactNode; tone: 'green' | 'gold' | 'red' | 'neutral'; className?: string }) {
  return <span className={`badge ${tone} ${className}`.trim()}>{children}</span>;
}

export function MetricBlock({ label, tone, value }: { label: string; tone: MacroTone; value: string | number }) {
  return <div className={`metric-block ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

export function Fact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

export function LoadingState() {
  return <div className="empty"><Loader2 size={18} className="spin" /> Loading menu data...</div>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
