export const TRAVEL_MODES = {
  TRANSIT: "電車・バス",
  DRIVE: "車",
  WALK: "徒歩",
  BICYCLE: "自転車",
} as const;

export type TravelMode = keyof typeof TRAVEL_MODES;

export function isTravelMode(v: string): v is TravelMode {
  return v in TRAVEL_MODES;
}

export type RouteQuery = {
  origin: string;
  destination: string;
  mode: TravelMode;
  /** outbound: time は到着したい時刻 / return: time は出発する時刻 */
  direction: "outbound" | "return";
  time: Date;
};

export type RouteResult =
  | { ok: true; minutes: number }
  | { ok: false; reason: "QUOTA" | "ERROR" | "NOT_FOUND" };

export interface RouteProvider {
  readonly name: string;
  compute(q: RouteQuery): Promise<RouteResult>;
}
