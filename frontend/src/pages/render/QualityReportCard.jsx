import { AlertTriangle, CheckCircle2, CircleSlash, ShieldCheck, XCircle } from "lucide-react";
import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../components/ui/cn";
import { describeQualityReport } from "../../lib/qualityReport";

const CHECK_ICON = {
  pass: { Icon: CheckCircle2, cls: "text-success-600" },
  warn: { Icon: AlertTriangle, cls: "text-warning-600" },
  fail: { Icon: XCircle, cls: "text-danger-600" },
  skipped: { Icon: CircleSlash, cls: "text-text-tertiary" },
};

const SHOWN = 6;

/**
 * What the output quality check found on the finished render: a verdict, each
 * check's result, and the problems in plain language. Renders nothing until the
 * job has been rendered (or for jobs from before the check existed).
 */
export const QualityReportCard = ({ report }) => {
  const view = describeQualityReport(report);
  if (!view) return null;

  const problems = view.issues;
  const visible = problems.slice(0, SHOWN);
  const hidden = problems.slice(SHOWN);

  return (
    <Card className="animate-slide-up" aria-label="Quality report">
      <CardHeader
        title="Quality report"
        subtitle={view.summary}
        extra={
          <Badge variant={view.variant} icon={<ShieldCheck className="size-3" />}>
            {view.label}
          </Badge>
        }
      />
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {problems.length > 0 && (
          <ul className="flex flex-col gap-2">
            {visible.map((issue) => (
              <ProblemRow key={issue.key} issue={issue} />
            ))}
            {hidden.length > 0 && (
              <li>
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-accent">
                    Show {hidden.length} more
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {hidden.map((issue) => (
                      <ProblemRow key={issue.key} issue={issue} />
                    ))}
                  </ul>
                </details>
              </li>
            )}
          </ul>
        )}

        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {view.checks.map((check) => {
            const { Icon, cls } = CHECK_ICON[check.state] || CHECK_ICON.skipped;
            return (
              <li
                key={check.id}
                title={check.note}
                className={cn("flex items-center gap-2 text-[13px]", check.state === "skipped" ? "text-text-tertiary" : "text-text-secondary")}
              >
                <Icon className={cn("size-4 shrink-0", cls)} />
                <span className="truncate">{check.name}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
};

const ProblemRow = ({ issue }) => (
  <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
    {issue.severity === "error" ? (
      <XCircle className="mt-0.5 size-4 shrink-0 text-danger-600" />
    ) : (
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-600" />
    )}
    <span className="min-w-0 flex-1 text-text-primary">{issue.text}</span>
    {issue.when && <span className="shrink-0 tabular-nums text-xs text-text-tertiary">{issue.when}</span>}
  </li>
);
