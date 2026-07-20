import { useState } from "react";
import { BreadcrumbContext } from "./breadcrumbContextValue";

export const BreadcrumbProvider = ({ children }) => {
  const [label, setLabel] = useState(null);

  return (
    <BreadcrumbContext.Provider value={{ label, setLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export default BreadcrumbProvider;
