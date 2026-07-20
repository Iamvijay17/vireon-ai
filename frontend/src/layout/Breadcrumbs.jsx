import { useContext } from "react";
import { ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { BreadcrumbContext } from "../shared/breadcrumbContextValue";

const STATIC_LABELS = {
  wizard: "Create Video",
  render: "Render",
  studio: "Studio",
  projects: "Projects",
  analytics: "Analytics",
  settings: "Settings",
  courses: "Courses",
  editor: "Editor",
  complete: "Complete",
  videos: null, // structural segment, not shown
};

const isObjectId = (segment) => /^[0-9a-fA-F]{24}$/.test(segment);

const Breadcrumbs = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { label } = useContext(BreadcrumbContext);

  const segments = location.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const items = [{ title: "Dashboard", onClick: () => navigate("/") }];
  let path = "";

  segments.forEach((segment, index) => {
    path += `/${segment}`;
    const isLast = index === segments.length - 1;

    if (isObjectId(segment)) {
      items.push({ title: (isLast && label) || "Details" });
      return;
    }

    const staticLabel = STATIC_LABELS[segment];
    if (staticLabel === null) return; // skip structural segments like "videos"

    const title = staticLabel || segment;
    items.push(isLast ? { title } : { title, onClick: () => navigate(path) });
  });

  if (items.length <= 1) return null;

  return (
    <div className="border-b border-border-light bg-surface px-6 py-2.5">
      <nav className="flex items-center gap-1.5 text-[13px]">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 text-text-tertiary" />}
            {item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                className="text-text-secondary transition-colors hover:text-text-primary"
              >
                {item.title}
              </button>
            ) : (
              <span className="font-medium text-text-primary">{item.title}</span>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
};

export default Breadcrumbs;
