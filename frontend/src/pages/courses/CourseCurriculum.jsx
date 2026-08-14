import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, Megaphone } from "lucide-react";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { useSetBreadcrumbLabel } from "../../shared/breadcrumbContextValue";
import { Card, CardHeader, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { toast } from "../../components/ui/toastBus";
import { getCourse, getCourseCurriculumHistory } from "../../services/api";

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
          <Button variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/courses/${id}`)}>
            Back to Course
          </Button>
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
          {(curriculum.subtitle || curriculum.promo?.topic) && (
            <Card>
              <CardBody className="space-y-4">
                {curriculum.subtitle && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Course Subtitle</p>
                    <p className="mt-1 text-sm text-text-primary">{curriculum.subtitle}</p>
                  </div>
                )}
                {curriculum.promo?.topic && (
                  <div className="rounded-lg border border-border-light p-3">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant="accent" className="flex items-center gap-1">
                        <Megaphone className="size-3" /> Promo
                      </Badge>
                      <span className="text-sm font-medium text-text-primary">
                        {curriculum.promo.title || "Course Trailer"}
                      </span>
                    </div>
                    <p className="text-[13px] leading-snug text-text-secondary">{curriculum.promo.topic}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Lessons"
              subtitle={`${curriculum.lessons.length} lesson${curriculum.lessons.length === 1 ? "" : "s"}`}
            />
            <CardBody>
              <ol className="space-y-2">
                {curriculum.lessons.map((lesson, index) => (
                  <li key={index} className="flex items-start gap-3 rounded-lg border border-border-light p-3">
                    <Badge variant="neutral" className="mt-0.5 shrink-0">
                      {lesson.order ?? index + 1}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">{lesson.title || "Untitled lesson"}</p>
                      {lesson.topic && (
                        <p className="mt-0.5 text-[13px] leading-snug text-text-secondary">{lesson.topic}</p>
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
