import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Megaphone, CheckCircle2, ListChecks, Users, Mail, PartyPopper } from "lucide-react";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { useSetBreadcrumbLabel } from "../../shared/breadcrumbContextValue";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { CopyButton } from "../../components/ui/CopyButton";
import { toast } from "../../components/ui/toastBus";
import { getCourse, getCourseCurriculumHistory } from "../../services/api";

const asBullets = (items) => (items || []).map((item) => `- ${item}`).join("\n");

// Full structure as plain text, for the "Copy All" header button - one blob
// a user can paste straight into Udemy's course-creation form.
const buildStructureText = (course, curriculum) => {
  const lines = [];
  lines.push(`# ${course?.title || curriculum.title}`);
  if (curriculum.subtitle) lines.push(curriculum.subtitle);
  if (curriculum.description) lines.push("", "## Description", curriculum.description);
  if (curriculum.learningObjectives?.length) lines.push("", "## What You'll Learn", asBullets(curriculum.learningObjectives));
  if (curriculum.requirements?.length) lines.push("", "## Requirements", asBullets(curriculum.requirements));
  if (curriculum.targetAudience?.length) lines.push("", "## Who This Course Is For", asBullets(curriculum.targetAudience));
  if (curriculum.promo?.topic) lines.push("", "## Promo", curriculum.promo.topic);
  if (curriculum.welcomeMessage) lines.push("", "## Welcome Message", curriculum.welcomeMessage);
  if (curriculum.congratulationsMessage) lines.push("", "## Congratulations Message", curriculum.congratulationsMessage);
  if (curriculum.lessons?.length) {
    lines.push("", "## Curriculum");
    curriculum.lessons.forEach((lesson, index) => {
      lines.push(`${lesson.order ?? index + 1}. ${lesson.title || "Untitled lesson"}${lesson.topic ? ` - ${lesson.topic}` : ""}`);
    });
  }
  return lines.join("\n");
};

/**
 * Read-only, shareable view of a course's generated Udemy-style structure -
 * split out from the "Generate Udemy Course Structure" modal on
 * CourseDetail so the structure has its own URL instead of only being
 * visible inside that modal. Editing/regenerating still happens in the
 * modal on the course detail page; this page just displays the latest
 * saved snapshot (CourseCurriculumService, one per course).
 */
const CourseCurriculum = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  useSetBreadcrumbLabel(course?.title ? `${course.title} - Structure` : null);
  const [curriculum, setCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getCourse(id), getCourseCurriculumHistory(id, { page: 1, limit: 1 })])
      .then(([courseRes, curriculumRes]) => {
        if (cancelled) return;
        setCourse(courseRes.data.course);
        setCurriculum(curriculumRes.data?.curricula?.[0] || null);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.friendlyMessage || "Failed to load course structure");
        navigate(`/courses/${id}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  if (loading) return <LoadingState label="Loading course structure..." />;

  return (
    <div>
      <PageHeader
        title={course ? `${course.title} - Course Structure` : "Course Structure"}
        description="Read-only view of the generated lesson outline. Edit or regenerate it from the course page."
        extra={
          <div className="flex items-center gap-2">
            {curriculum && (
              <CopyButton
                value={() => buildStructureText(course, curriculum)}
                label="Copy full structure"
                variant="secondary"
                size="md"
              />
            )}
            <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/courses/${id}`)}>
              Back to Course
            </Button>
          </div>
        }
      />

      {!curriculum ? (
        <Card>
          <CardBody>
            <EmptyState
              description="No structure has been generated for this course yet."
              actionLabel="Go generate one"
              actionIcon={<Sparkles className="size-4" />}
              onAction={() => navigate(`/courses/${id}`)}
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Landing Page */}
          {(curriculum.subtitle || curriculum.description || curriculum.promo?.topic) && (
            <Card>
              <CardHeader title="Landing Page" subtitle="What a prospective student sees before enrolling" />
              <CardBody className="space-y-4">
                {curriculum.subtitle && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Course Subtitle</p>
                      <CopyButton value={curriculum.subtitle} label="Copy subtitle" />
                    </div>
                    <p className="mt-1 text-sm text-text-primary">{curriculum.subtitle}</p>
                  </div>
                )}
                {curriculum.description && (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Description</p>
                      <CopyButton value={curriculum.description} label="Copy description" />
                    </div>
                    <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">
                      {curriculum.description}
                    </p>
                  </div>
                )}
                {curriculum.promo?.topic && (
                  <div className="rounded-lg border border-border-light p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="accent" className="flex items-center gap-1">
                          <Megaphone className="size-3" /> Promo
                        </Badge>
                        <span className="text-sm font-medium text-text-primary">
                          {curriculum.promo.title || "Course Trailer"}
                        </span>
                      </div>
                      <CopyButton value={curriculum.promo.topic} label="Copy promo pitch" />
                    </div>
                    <p className="text-[13px] leading-snug text-text-secondary">{curriculum.promo.topic}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Intended Learners */}
          {(curriculum.learningObjectives?.length > 0 ||
            curriculum.requirements?.length > 0 ||
            curriculum.targetAudience?.length > 0) && (
            <Card>
              <CardHeader title="Intended Learners" subtitle="What you'll learn, requirements, and who this course is for" />
              <CardBody>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {curriculum.learningObjectives?.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        <CheckCircle2 className="size-3.5" /> What You'll Learn
                      </div>
                      <ul className="space-y-1.5">
                        {curriculum.learningObjectives.map((item, index) => (
                          <li key={index} className="flex items-start gap-2 text-[13px] leading-snug text-text-secondary">
                            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-500" />
                            <span className="min-w-0 flex-1">{item}</span>
                            <CopyButton value={item} label="Copy" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {curriculum.requirements?.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        <ListChecks className="size-3.5" /> Requirements
                      </div>
                      <ul className="space-y-1.5">
                        {curriculum.requirements.map((item, index) => (
                          <li key={index} className="flex items-start gap-2 text-[13px] leading-snug text-text-secondary">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-tertiary" />
                            <span className="min-w-0 flex-1">{item}</span>
                            <CopyButton value={item} label="Copy" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {curriculum.targetAudience?.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        <Users className="size-3.5" /> Who This Course Is For
                      </div>
                      <ul className="space-y-1.5">
                        {curriculum.targetAudience.map((item, index) => (
                          <li key={index} className="flex items-start gap-2 text-[13px] leading-snug text-text-secondary">
                            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-text-tertiary" />
                            <span className="min-w-0 flex-1">{item}</span>
                            <CopyButton value={item} label="Copy" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Course Messages */}
          {(curriculum.welcomeMessage || curriculum.congratulationsMessage) && (
            <Card>
              <CardHeader title="Course Messages" subtitle="Automatic messages sent to enrolled students" />
              <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {curriculum.welcomeMessage && (
                  <div className="rounded-lg border border-border-light p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        <Mail className="size-3.5" /> Welcome Message
                      </div>
                      <CopyButton value={curriculum.welcomeMessage} label="Copy message" />
                    </div>
                    <p className="text-[13px] leading-snug text-text-secondary">{curriculum.welcomeMessage}</p>
                  </div>
                )}
                {curriculum.congratulationsMessage && (
                  <div className="rounded-lg border border-border-light p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                        <PartyPopper className="size-3.5" /> Congratulations Message
                      </div>
                      <CopyButton value={curriculum.congratulationsMessage} label="Copy message" />
                    </div>
                    <p className="text-[13px] leading-snug text-text-secondary">{curriculum.congratulationsMessage}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Curriculum"
              subtitle={`${curriculum.lessons.length} lesson${curriculum.lessons.length === 1 ? "" : "s"}`}
              extra={
                <CopyButton
                  value={() =>
                    curriculum.lessons
                      .map((lesson, index) => `${lesson.order ?? index + 1}. ${lesson.title || "Untitled lesson"}`)
                      .join("\n")
                  }
                  label="Copy lesson list"
                />
              }
            />
            <CardBody>
              <ol className="space-y-2">
                {curriculum.lessons.map((lesson, index) => (
                  <li key={index} className="flex items-start gap-3 rounded-lg border border-border-light p-3">
                    <Badge variant="neutral" className="mt-0.5 shrink-0">
                      {lesson.order ?? index + 1}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-text-primary">{lesson.title || "Untitled lesson"}</p>
                        <CopyButton value={lesson.title || "Untitled lesson"} label="Copy title" />
                      </div>
                      {lesson.topic && (
                        <div className="mt-0.5 flex items-start justify-between gap-2">
                          <p className="text-[13px] leading-snug text-text-secondary">{lesson.topic}</p>
                          <CopyButton value={lesson.topic} label="Copy description" />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CourseCurriculum;
