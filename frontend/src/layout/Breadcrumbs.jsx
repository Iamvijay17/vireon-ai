import { useContext } from "react";
import { Breadcrumb } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemeContext } from "../shared/themeContextValue";
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
  const { colors } = useContext(ThemeContext);
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
    items.push(
      isLast
        ? { title }
        : { title, onClick: () => navigate(path) }
    );
  });

  if (items.length <= 1) return null;

  return (
    <div
      style={{
        padding: "10px 24px",
        borderBottom: `1px solid ${colors.borderLight}`,
        background: colors.surface,
      }}
    >
      <Breadcrumb
        items={items.map((item, i) => ({
          title: item.onClick ? (
            <a onClick={item.onClick} style={{ color: colors.textSecondary }}>
              {item.title}
            </a>
          ) : (
            <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{item.title}</span>
          ),
          key: i,
        }))}
      />
    </div>
  );
};

export default Breadcrumbs;
