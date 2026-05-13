import { actionForRole, capsuleEndGoal, capsuleWorkflow, currentWorkflowStep, nextWorkflowStep, type WorkflowRole } from "@/lib/capsule-workflow";

type WorkflowGuideProps = {
  status?: string | null;
  role: WorkflowRole;
  title?: string;
  justHappened?: string;
};

export function WorkflowGuide({ status, role, title = "Capsule progress", justHappened }: WorkflowGuideProps) {
  const current = currentWorkflowStep(status);
  const next = nextWorkflowStep(status);
  const currentIndex = capsuleWorkflow.findIndex((step) => step.key === current.key);

  return (
    <section className="card stack workflow-guide">
      <div className="between">
        <div>
          <p className="kicker">{title}</p>
          <h2>{current.label}</h2>
          <p>{current.purpose}</p>
        </div>
        <span className="badge strong">Step {currentIndex + 1} of {capsuleWorkflow.length}</span>
      </div>

      <div className="progress"><span style={{ width: `${((currentIndex + 1) / capsuleWorkflow.length) * 100}%` }} /></div>

      {justHappened && (
        <div className="mini-card action-callout">
          <strong>What just happened</strong>
          <p>{justHappened}</p>
        </div>
      )}

      <div className="grid workflow-grid">
        <div className="mini-card">
          <strong>Your current action</strong>
          <p>{actionForRole(current, role)}</p>
        </div>
        <div className="mini-card">
          <strong>What done looks like</strong>
          <p>{current.doneWhen}</p>
        </div>
      </div>

      <div className="mini-card">
        <strong>Next step</strong>
        <p>{next.key === current.key ? "This Capsule path is at the delivery stage." : `${next.label}: ${actionForRole(next, role)}`}</p>
      </div>

      <details className="workflow-details">
        <summary>Show full Capsule path</summary>
        <ol className="workflow-list">
          {capsuleWorkflow.map((step, index) => (
            <li key={step.key} className={index === currentIndex ? "active" : index < currentIndex ? "done" : ""}>
              <strong>{step.plainLabel}</strong>
              <span>{step.purpose}</span>
            </li>
          ))}
        </ol>
      </details>

      <div className="mini-card final-goal">
        <strong>End goal</strong>
        <p>{capsuleEndGoal()}</p>
      </div>
    </section>
  );
}
