import { useMemo, useState } from "react";
import { Save, PackageOpen, Download, XCircle, AlertTriangle, Info, CheckCircle2, ExternalLink, Plus, X } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Label, FieldHint } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Switch } from "../../components/ui/Switch";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "../../components";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { saveUdemyProfile, createUdemyExport, getPublishingDownloadUrl } from "../../services/api";
import { formatBytes, isActiveStatus } from "./format";
import { usePublishingCourses, useUdemyOverview, useBusy, useLiveJobs } from "./usePublishing";
import { StatusBadge, JobProgress, ErrorNotice } from "./shared";
import { mergeLive } from "./format";

const LEVELS = ["All Levels", "Beginner", "Intermediate", "Expert"].map((v) => ({ value: v, label: v }));
const linesToText = (list) => (list || []).join("\n");
const textToLines = (text) => String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);

const ISSUE_STYLE = {
  error: { Icon: XCircle, cls: "text-danger-500", label: "Must fix" },
  warning: { Icon: AlertTriangle, cls: "text-warning-600", label: "Recommended" },
  info: { Icon: Info, cls: "text-info-500", label: "Note" },
};

const Issues = ({ title, items, severity }) => {
  if (!items?.length) return null;
  const { Icon, cls } = ISSUE_STYLE[severity];
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">{title} ({items.length})</h4>
      <ul className="space-y-1.5">
        {items.map((i, n) => (
          <li key={`${i.code}-${n}`} className="flex items-start gap-2 text-[13px]">
            <Icon className={`mt-0.5 size-4 shrink-0 ${cls}`} />
            <span className="min-w-0 text-text-secondary">
              {i.message}
              {i.where && <span className="ml-1.5 text-xs text-text-tertiary">({i.where})</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const CHECKLIST = [
  "Download the package below and unzip it. Open PUBLISHING-CHECKLIST.md - it lists every lecture with its file name.",
  "In Udemy's instructor interface, create a new course and fill in the title, subtitle, description, level and category from course-metadata.json.",
  "Add the learning objectives, prerequisites and intended audience.",
  "Create the sections and lectures in the order shown in the checklist.",
  "Upload each lecture's video from the videos/ folder (and the .srt from captions/ when present). Add the promo video if the package has one.",
  "Complete Udemy's pricing and course-landing-page steps, then use Udemy's own \"Submit for review\". Udemy reviews every course - Vireon cannot do this step.",
];

const UdemyEditor = ({ courseId, overview }) => {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const live = useLiveJobs();

  const lessons = useMemo(() => overview.plan.sections.flatMap((s) => s.lectures), [overview.plan]);
  const saved = overview.profile;

  const [subtitle, setSubtitle] = useState(saved.subtitle || "");
  const [level, setLevel] = useState(saved.level || "All Levels");
  const [description, setDescription] = useState(saved.description || overview.plan.course.description || "");
  const [objectives, setObjectives] = useState(linesToText(saved.learningObjectives));
  const [prerequisites, setPrerequisites] = useState(linesToText(saved.prerequisites));
  const [audience, setAudience] = useState(linesToText(saved.intendedAudience));
  const [sections, setSections] = useState(() => (saved.sections || []).map((s) => s.title));
  const [assign, setAssign] = useState(() => {
    const map = {};
    (saved.sections || []).forEach((s, i) => (s.lessonIds || []).forEach((id) => { map[id] = i; }));
    return map;
  });
  const [opts, setOpts] = useState({ includeMedia: true, includeCaptions: true, allowIncomplete: false });
  const [dirty, setDirty] = useState(false);

  const touch = (setter) => (value) => { setter(value); setDirty(true); };
  const payload = () => ({
    subtitle, level, description,
    learningObjectives: textToLines(objectives), prerequisites: textToLines(prerequisites), intendedAudience: textToLines(audience),
    sections: sections
      .map((title, i) => ({ title: title.trim(), lessonIds: lessons.filter((l) => assign[l.id] === i).map((l) => l.id) }))
      .filter((s) => s.title),
  });

  const save = async () => {
    const res = await run("save", () => saveUdemyProfile(courseId, payload()), { success: "Course details saved" });
    if (res) {
      setDirty(false);
      invalidate(queryKeys.publishing.udemy(courseId));
    }
  };

  const exportJob = overview.latestExport ? mergeLive(overview.latestExport, live[overview.latestExport._id]) : null;
  const building = exportJob && isActiveStatus(exportJob.status);
  const v = overview.validation;

  const build = async () => {
    const res = await run("export", () => createUdemyExport(courseId, opts), { success: "Package build queued" });
    if (res) invalidate(queryKeys.publishing.all);
  };

  const sectionOptions = [{ value: "", label: "Automatic" }, ...sections.map((t, i) => ({ value: i, label: t || `Section ${i + 1}` }))];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader title="Course details" subtitle="What Udemy's course page asks for. Saved here, included in the package." extra={<Button size="sm" variant="primary" icon={<Save className="size-4" />} loading={isBusy("save")} disabled={!dirty} onClick={save}>Save</Button>} />
        <CardBody className="space-y-4">
          <div>
            <Label required>Subtitle</Label>
            <Input value={subtitle} onChange={(e) => touch(setSubtitle)(e.target.value)} maxLength={300} placeholder="One line that sells the course" />
            <FieldHint>{subtitle.length} characters · Udemy shows about 120.</FieldHint>
          </div>
          <div>
            <Label required>Description</Label>
            <Textarea value={description} onChange={(e) => touch(setDescription)(e.target.value)} rows={6} />
            <FieldHint>{(description.match(/\S+/g) || []).length} words · Udemy recommends 200 or more.</FieldHint>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Level</Label><Select value={level} onChange={touch(setLevel)} options={LEVELS} /></div>
          </div>
          <div>
            <Label required>What students will learn</Label>
            <Textarea value={objectives} onChange={(e) => touch(setObjectives)(e.target.value)} rows={4} placeholder="One learning objective per line" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Prerequisites</Label><Textarea value={prerequisites} onChange={(e) => touch(setPrerequisites)(e.target.value)} rows={3} placeholder="One per line" /></div>
            <div><Label>Who this course is for</Label><Textarea value={audience} onChange={(e) => touch(setAudience)(e.target.value)} rows={3} placeholder="One per line" /></div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label className="mb-0">Sections</Label>
              <Button size="xs" variant="secondary" icon={<Plus className="size-3.5" />} onClick={() => touch(setSections)([...sections, `Section ${sections.length + 1}`])}>Add section</Button>
            </div>
            {sections.length === 0 ? (
              <p className="text-xs text-text-tertiary">No sections defined: all lessons go into one section called "Course content".</p>
            ) : (
              <ul className="space-y-2">
                {sections.map((title, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Input value={title} onChange={(e) => touch(setSections)(sections.map((t, n) => (n === i ? e.target.value : t)))} placeholder={`Section ${i + 1}`} />
                    <Button size="sm" variant="ghost" iconOnly aria-label="Remove section" icon={<X className="size-4" />}
                      onClick={() => {
                        touch(setSections)(sections.filter((_, n) => n !== i));
                        setAssign((prev) => Object.fromEntries(Object.entries(prev).filter(([, s]) => s !== i).map(([id, s]) => [id, s > i ? s - 1 : s])));
                      }} />
                  </li>
                ))}
              </ul>
            )}
            {sections.length > 0 && lessons.length > 0 && (
              <div className="mt-3 divide-y divide-border-light rounded-xl border border-border-light">
                {lessons.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate text-[13px] text-text-primary">{l.title || "(untitled)"}</span>
                    <Select className="w-44" value={assign[l.id] ?? ""} options={sectionOptions}
                      onChange={(val) => { setAssign((prev) => ({ ...prev, [l.id]: val === "" ? undefined : val })); setDirty(true); }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Validation report" subtitle={`${v.totals.lecturesWithVideo} of ${v.totals.lectures} lessons have a video · ${v.totals.sections} section(s) · ${v.totals.totalMinutes} min`}
            extra={<Badge variant={v.ok ? "success" : "danger"} icon={v.ok ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}>{v.ok ? "Ready" : `${v.errors.length} to fix`}</Badge>} />
          <CardBody className="space-y-4">
            {dirty && <Alert type="info">Save your changes to refresh this report.</Alert>}
            <Issues title="Must fix" items={v.errors} severity="error" />
            <Issues title="Recommended (Udemy's quality guidance)" items={v.warnings} severity="warning" />
            <Issues title="Notes" items={v.info} severity="info" />
            {v.ok && !v.warnings.length && !v.info.length && <p className="text-sm text-text-secondary">Nothing to report - this course is ready to package.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Course package" subtitle="A ZIP for you to upload to Udemy yourself" />
          <CardBody className="space-y-4">
            {[
              ["includeMedia", "Include lesson videos", "Turn off for a small manifest-only package."],
              ["includeCaptions", "Include captions (.srt)", "Only for lessons with voice-aligned timing."],
              ["allowIncomplete", "Export even if validation fails", "For a draft package; the checklist will say it is incomplete."],
            ].map(([key, title, hint]) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div><p className="text-[13px] font-medium text-text-primary">{title}</p><p className="text-xs text-text-tertiary">{hint}</p></div>
                <Switch checked={opts[key]} onChange={(val) => setOpts((p) => ({ ...p, [key]: val }))} />
              </div>
            ))}
            <Button variant="primary" className="w-full" icon={<PackageOpen className="size-4" />} loading={isBusy("export")} disabled={building || dirty || (!v.ok && !opts.allowIncomplete)} onClick={build}>
              {building ? "Building package..." : "Build Udemy package"}
            </Button>
            {dirty && <FieldHint>Save your changes before building.</FieldHint>}
            {!v.ok && !opts.allowIncomplete && <FieldHint>Fix the problems above, or allow an incomplete export.</FieldHint>}

            {exportJob && (
              <div className="space-y-3 rounded-xl border border-border-light p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-text-primary">Latest package</span>
                  <StatusBadge status={exportJob.status} />
                </div>
                <JobProgress job={exportJob} />
                <ErrorNotice error={exportJob.error} />
                {exportJob.actions?.canDownload && (
                  <Button size="sm" variant="secondary" icon={<Download className="size-4" />} href={getPublishingDownloadUrl(exportJob._id)}>
                    Download ({formatBytes(exportJob.exportResult?.size)})
                  </Button>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Publish it on Udemy" subtitle="Manual checklist" extra={<Button size="xs" variant="secondary" icon={<ExternalLink className="size-3.5" />} href={overview.capabilities.links.instructor} target="_blank" rel="noopener noreferrer">Udemy instructor</Button>} />
          <CardBody>
            <ol className="list-decimal space-y-2.5 pl-5 text-[13px] leading-relaxed text-text-secondary">
              {CHECKLIST.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

/** Udemy: export + manual publishing only - there is no Udemy API to create or publish a course. */
export const UdemyPanel = () => {
  const [courseId, setCourseId] = useState("");
  const { data: coursesData, loading: loadingCourses } = usePublishingCourses();
  const { data: overview, loading, error, refetch } = useUdemyOverview(courseId);
  const courseOptions = (coursesData?.courses || []).map((c) => ({ value: c._id, label: c.title }));
  const caps = overview?.capabilities;

  return (
    <div className="space-y-4">
      <Alert type="warning" title="Udemy can't be published to automatically">
        Udemy has no public API for creating a course, uploading lecture videos or publishing. Its Instructor API (
        <a className="text-accent underline" href="https://www.udemy.com/developers/instructor/" target="_blank" rel="noopener noreferrer">documentation</a>
        ) covers reading your courses, reviews, Q&amp;A, performance and revenue. Vireon prepares a package - manifest, organised videos, captions, validation report and checklist - that you upload yourself. <strong>Exporting a package does not create or publish anything on Udemy.</strong>
        {caps && <span className="mt-1 block text-xs text-text-tertiary">Capabilities last reviewed {caps.reviewedOn}. No Udemy login or API key is requested or stored.</span>}
      </Alert>

      <div className="max-w-md">
        <Select value={courseId} onChange={setCourseId} options={courseOptions} placeholder={loadingCourses ? "Loading courses..." : "Select a course to prepare"} />
      </div>

      {!courseId && <Card><EmptyState description="Select a course to edit its Udemy details and build a package" /></Card>}
      {courseId && loading && <LoadingState label="Checking the course..." minHeight={160} />}
      {courseId && error && <ErrorState message="Could not load the Udemy export overview" onRetry={refetch} />}
      {courseId && overview && <UdemyEditor key={courseId} courseId={courseId} overview={overview} />}
    </div>
  );
};

export default UdemyPanel;
