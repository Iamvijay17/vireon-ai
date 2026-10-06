import { Search, RefreshCw } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { TYPE_OPTIONS, STATUS_FILTERS } from "./constants";

/** Search box, type select, status pills and refresh. */
export function JobFilters({ search, onSearch, typeFilter, onTypeFilter, statusFilter, onStatusFilter, refreshing, onRefresh }) {
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon={<Search className="size-4" />}
          placeholder="Search by title..."
          className="min-w-56 flex-1"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <Select value={typeFilter} onChange={onTypeFilter} options={TYPE_OPTIONS} className="w-full sm:w-44" />
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface-hover/50 p-1 [scrollbar-width:none]">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onStatusFilter(f.value)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === f.value
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label="Refresh jobs"
          loading={refreshing}
          icon={<RefreshCw className="size-4" />}
          onClick={onRefresh}
        />
      </div>
    </Card>
  );
}
