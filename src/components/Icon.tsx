type IconProps = {
  name:
    | "back"
    | "calendar"
    | "download"
    | "down"
    | "logout"
    | "search"
    | "send"
    | "trash"
    | "upload";
};

const paths: Record<IconProps["name"], string> = {
  back: "m15 18-6-6 6-6",
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
  download: "M12 4v12m0 0-4-4m4 4 4-4M5 20h14",
  down: "m6 9 6 6 6-6",
  logout: "M10 5H5v14h5m4-11 4 4-4 4m4-4H9",
  search: "m20 20-4.5-4.5m2.5-5A7.5 7.5 0 1 1 3 10.5a7.5 7.5 0 0 1 15 0Z",
  send: "M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z",
  trash: "M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5",
  upload: "M12 16V4m0 0L8 8m4-4 4 4M5 20h14",
};

export function Icon({ name }: IconProps) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
