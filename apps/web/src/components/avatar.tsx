import Image from "next/image";
import { cloudinaryImageUrl } from "@/lib/media";

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
  avatarPublicId,
  size = "md",
}: {
  name: string;
  avatarPublicId?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}) {
  const sizeClasses = {
    xs: "h-7 w-7 text-[11px]",
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-lg",
    xl: "h-20 w-20 text-xl",
  }[size];

  if (avatarPublicId) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full ${sizeClasses}`}
      >
        <Image
          src={cloudinaryImageUrl(avatarPublicId)}
          alt=""
          fill
          sizes="80px"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white ${sizeClasses}`}
    >
      {getInitials(name)}
    </div>
  );
}
