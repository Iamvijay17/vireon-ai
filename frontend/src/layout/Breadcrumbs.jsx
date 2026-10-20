import { useContext } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { BreadcrumbContext } from "../shared/breadcrumbContextValue";
import { buildCrumbs } from "./crumbs";

/** The trail, compact enough for the top bar. Collapses to the current page on small screens. */
const Breadcrumbs = () => {
  const { pathname, search } = useLocation();
  const { label } = useContext(BreadcrumbContext);
  const items = buildCrumbs(pathname, search, label);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 whitespace-nowrap text-[13px]">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.title}-${i}`} className={last ? "flex min-w-0 items-center gap-1.5" : "hidden min-w-0 items-center gap-1.5 md:flex"}>
              {i > 0 && <ChevronRight className="hidden size-3.5 shrink-0 text-text-tertiary md:block" aria-hidden="true" />}
              {item.to ? (
                <Link to={item.to} className="truncate text-text-tertiary transition-colors hover:text-text-primary">
                  {item.title}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-medium text-text-primary">
                  {item.title}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
