import { useState } from "react";
import { SidebarContext } from "./sidebarContextValue";

export const SidebarProvider = ({ children }) => {
  const [forceCollapsed, setForceCollapsed] = useState(null);

  return (
    <SidebarContext.Provider value={{ forceCollapsed, setForceCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
};

export default SidebarProvider;
