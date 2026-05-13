type ActionPanelProps = {
  title: string;
  description: string;
  action?: string;
  children?: React.ReactNode;
};

export function ActionPanel({ title, description, action, children }: ActionPanelProps) {
  return (
    <section className="mini-card action-panel">
      <div className="stack">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>

        {action && (
          <div className="action-callout">
            <strong>Next move</strong>
            <p>{action}</p>
          </div>
        )}

        {children}
      </div>
    </section>
  );
}
