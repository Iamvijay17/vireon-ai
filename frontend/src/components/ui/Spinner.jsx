import { Loader2 } from "lucide-react";
import { cn } from "./cn";

const SIZES = { sm: "size-4", md: "size-6", lg: "size-9" };

export const Spinner = ({ size = "md", className }) => (
  <Loader2 className={cn("animate-spin text-accent", SIZES[size], className)} />
);

export default Spinner;
