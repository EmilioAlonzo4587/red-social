function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-11 w-11 text-sm",
    lg: "h-20 w-20 text-xl",
  }[size];

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${sizeClasses}`}
    >
      {getInitials(name)}
    </div>
  );
}
