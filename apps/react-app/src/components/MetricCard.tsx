import IExampleMark from '~icons/react/mark';
import ILucideHouse from '~icons/lucide/house';
import './MetricCard.css';

export function MetricCard(props: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <article className="metric-card">
      <p>
        <IExampleMark className="metric-mark" />
        <ILucideHouse className="metric-mark" />
        {props.label}
      </p>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </article>
  );
}
