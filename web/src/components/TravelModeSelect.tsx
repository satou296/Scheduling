import { TRAVEL_MODES } from "@/lib/routes/types";

export function TravelModeSelect({ value }: { value: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(TRAVEL_MODES).map(([k, label]) => (
        <label
          key={k}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-background"
        >
          <input type="radio" name="travelMode" value={k} defaultChecked={value === k} />
          {label}
        </label>
      ))}
    </div>
  );
}
