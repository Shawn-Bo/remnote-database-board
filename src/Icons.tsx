import React from "react";
const paths: Record<string, React.ReactNode> = {
  table: (
    <>
      <rect x="2" y="3" width="16" height="14" rx="2" />
      <path d="M2 8h16M2 12h16M8 3v14" />
    </>
  ),
  board: (
    <>
      <rect x="2" y="3" width="16" height="14" rx="2" />
      <path d="M7 3v14M13 3v14" />
    </>
  ),
  filter: <path d="M3 5h14M5 10h10M8 15h4" />,
  sort: (
    <>
      <path d="M6 3v14m-3-3 3 3 3-3M14 17V3m-3 3 3-3 3 3" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4 4" />
    </>
  ),
  settings: (
    <>
      <path d="M2 5h7m4 0h5M2 15h3m4 0h9" />
      <circle cx="11" cy="5" r="2" />
      <circle cx="7" cy="15" r="2" />
    </>
  ),
  plus: <path d="M10 3v14M3 10h14" />,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  chevron: <path d="m7 4 6 6-6 6" />,
  down: <path d="m5 7 5 5 5-5" />,
  more: (
    <>
      <circle cx="4" cy="10" r=".75" />
      <circle cx="10" cy="10" r=".75" />
      <circle cx="16" cy="10" r=".75" />
    </>
  ),
  text: <path d="M3 5h14M3 10h14M3 15h8" />,
  number: <path d="m8 2-2 16M14 2l-2 16M3 7h14M2 13h14" />,
  select: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m7 9 3 3 3-3" />
    </>
  ),
  image: (
    <>
      <rect x="2" y="2" width="16" height="16" rx="2" />
      <circle cx="7" cy="7" r="1.5" />
      <path d="m2 15 4-4 3 3 4-6 5 7" />
    </>
  ),
  eye: (
    <>
      <path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" />
      <path d="m3 3 14 14" />
    </>
  ),
  page: (
    <>
      <path d="M4 2h8l4 4v12H4Z" />
      <path d="M12 2v4h4M7 10h6M7 14h5" />
    </>
  ),
  arrow: <path d="M5 15 15 5M5 5h10v10" />,
  refresh: (
    <>
      <path d="M17 8a7 7 0 1 0 0 5M17 2v6h-6" />
    </>
  ),
  check: <path d="m4 10 4 4 8-8" />,
};
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`db-icon ${className}`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.text}
    </svg>
  );
}
export const fieldIcon = (type: string) =>
  type.endsWith("_select")
    ? "select"
    : type === "number"
      ? "number"
      : type === "image"
        ? "image"
        : "text";
