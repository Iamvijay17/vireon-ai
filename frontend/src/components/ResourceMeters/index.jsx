import { Meter } from "../ui/Meter";
import { formatBytes, formatMb } from "../../lib/format";

/**
 * GPU load, VRAM, RAM and CPU as four meters, from one resources snapshot.
 * Any figure the server could not measure renders "Unavailable" - including
 * everything, if `resources` is null (the request failed).
 */
const ResourceMeters = ({ resources, columns = "grid-cols-1 sm:grid-cols-2", showGpuName = true }) => {
  const gpu = resources?.gpu ?? null;
  const memory = resources?.memory ?? null;
  const cpu = resources?.cpu ?? null;

  return (
    <div className={`grid gap-4 ${columns}`}>
      <Meter
        label="GPU load"
        value={gpu?.utilizationPercent ?? null}
        caption={showGpuName ? (gpu ? gpu.name + (gpu.temperatureC != null ? ` · ${gpu.temperatureC}°C` : "") : "No NVIDIA GPU reported") : undefined}
      />
      <Meter
        label="VRAM"
        value={gpu ? gpu.memoryUsedMb : null}
        max={gpu?.memoryTotalMb}
        display={gpu ? `${formatMb(gpu.memoryUsedMb)} / ${formatMb(gpu.memoryTotalMb)}` : undefined}
      />
      <Meter
        label="System memory"
        value={memory ? memory.usedBytes : null}
        max={memory?.totalBytes}
        display={memory ? `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}` : undefined}
      />
      <Meter
        label="CPU"
        value={cpu?.percent ?? null}
        caption={cpu?.cores ? `${cpu.cores} logical cores` : undefined}
      />
    </div>
  );
};

export default ResourceMeters;
