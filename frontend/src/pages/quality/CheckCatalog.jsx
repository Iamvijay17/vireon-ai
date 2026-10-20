import { Card, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { CHECK_CATALOG } from "../../lib/qualityModel";

/**
 * The ten checks the server runs, and how often each has actually run on the
 * videos listed above. "Operational" is a statement about the code - every
 * check here exists in backend/src/services/qc/video - and the numbers beside
 * it are what the stored reports show, so a check that keeps being skipped is
 * visible instead of silently counted as passing.
 */
export function CheckCatalog({ coverage, videos }) {
  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader title="What is checked" subtitle={videos > 0 ? `Run counts are across the ${videos} video${videos === 1 ? "" : "s"} with a report` : "Run counts appear once a video has a report"} />
      <ul className="divide-y divide-border-light">
        {CHECK_CATALOG.map((check) => {
          const c = coverage[check.id];
          return (
            <li key={check.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-text-primary">{check.name}</span>
                  <Badge variant="success">Operational</Badge>
                </div>
                <p className="mt-0.5 text-xs text-text-tertiary">{check.what}</p>
              </div>
              <p className="tabular shrink-0 text-xs text-text-tertiary">
                {videos === 0 ? "—" : `Ran on ${c.ran} · ${c.fail} failed · ${c.warn} warned${c.skipped ? ` · ${c.skipped} skipped` : ""}`}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
