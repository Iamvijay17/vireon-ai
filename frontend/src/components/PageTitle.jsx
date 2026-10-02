import { useContext, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { BreadcrumbContext } from "../shared/breadcrumbContextValue";
import { documentTitle } from "../lib/pageTitle";

// Renders nothing; keeps the browser tab title in sync with the route (and
// with the record name a detail page registers for the breadcrumb).
export default function PageTitle() {
  const { pathname } = useLocation();
  const { label } = useContext(BreadcrumbContext);

  useEffect(() => {
    document.title = documentTitle(pathname, label);
  }, [pathname, label]);

  return null;
}
