import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, PlayCircle, Download, Eye, ChevronLeft, ChevronRight, Film } from "lucide-react";
import { getVideoJobs } from "../../services/api";
import { isPortraitResolution } from "../../shared/resolution";
import { PageHeader, LoadingState, EmptyState } from "../../components";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { toast } from "../../components/ui/toastBus";

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "educational", label: "Educational" },
  { value: "marketing", label: "Marketing" },
  { value: "story", label: "Story" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "podcast", label: "Podcast" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

const PAGE_SIZE = 12;

const CompletedVideos = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");

  const fetchJobs = async (page = 1) => {
    try {
      setLoading(true);
      const res = await getVideoJobs(page, PAGE_SIZE, { status: "COMPLETED", type: type || undefined, search: search || undefined });
      setJobs(res.data.jobs);
      setPagination(res.data.pagination);
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to fetch completed videos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchJobs(1);
  };

  const totalPages = pagination.pages || 1;

  return (
    <div>
      <PageHeader title="Completed Videos" description="Browse, preview, and download your finished renders." />

      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="min-w-56 flex-1">
            <Input
              icon={<Search className="size-4" />}
              placeholder="Search by topic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <Select value={type} onChange={setType} options={TYPE_OPTIONS} className="w-44" />
          <Button variant="secondary" size="sm" onClick={() => fetchJobs(1)} loading={loading}>
            Apply
          </Button>
        </div>
      </Card>

      {loading && jobs.length === 0 ? (
        <Card>
          <LoadingState label="Loading completed videos..." />
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <EmptyState
            description="No completed videos yet. Finished renders will show up here."
            actionLabel="Create Video"
            actionIcon={<PlayCircle className="size-4" />}
            onAction={() => navigate("/wizard")}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job, i) => {
              const vertical = isPortraitResolution(job.resolution);
              return (
                <Card key={job._id} hoverable className="animate-slide-up overflow-hidden" style={{ "--stagger-index": i }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/render?id=${job._id}`)}
                    className="group relative block w-full overflow-hidden bg-neutral-950"
                    style={{ aspectRatio: vertical ? "9/16" : "16/9" }}
                  >
                    {job.thumbnailUrl ? (
                      <img
                        src={job.thumbnailUrl}
                        alt={job.topic}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-neutral-600">
                        <Film className="size-8" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                      <PlayCircle className="size-10 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </button>

                  <div className="p-4">
                    <p className="mb-1.5 truncate text-sm font-medium text-text-primary">{job.topic}</p>
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      <Badge variant="accent">{job.type}</Badge>
                      <Badge variant="neutral">{job.resolution}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-tertiary">
                        {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : "—"}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          iconOnly
                          aria-label={`View ${job.topic}`}
                          onClick={() => navigate(`/render?id=${job._id}`)}
                          icon={<Eye className="size-4" />}
                        />
                        {job.videoUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            iconOnly
                            aria-label={`Download ${job.topic}`}
                            href={job.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            icon={<Download className="size-4" />}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-end gap-2">
              <span className="mr-2 text-xs text-text-tertiary">
                Page {pagination.page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                disabled={pagination.page <= 1}
                onClick={() => fetchJobs(pagination.page - 1)}
                icon={<ChevronLeft className="size-4" />}
              />
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                disabled={pagination.page >= totalPages}
                onClick={() => fetchJobs(pagination.page + 1)}
                icon={<ChevronRight className="size-4" />}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CompletedVideos;
