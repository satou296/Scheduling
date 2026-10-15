import { STATUS_CLASS, STATUS_LABEL } from "@/lib/status";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}
