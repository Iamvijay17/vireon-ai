import { Rocket } from "lucide-react";
import { Card } from "../../components/ui/Card";

const PlaceholderPage = ({ title, description }) => (
  <div>
    <h1 className="mb-4 text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
    <Card className="flex min-h-80 items-center justify-center">
      <div className="max-w-sm px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <Rocket className="size-6" />
        </div>
        <h2 className="mb-2 text-base font-semibold text-text-primary">Coming soon</h2>
        <p className="text-[15px] text-text-secondary">{description || `The ${title} page is coming soon.`}</p>
      </div>
    </Card>
  </div>
);

export default PlaceholderPage;
