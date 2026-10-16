import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 border-b border-black/10 bg-[var(--background)]">
      <nav className="flex h-14 items-center px-4">
        <Link href="/" className="text-lg font-bold">
          Mini Red Social
        </Link>
      </nav>
    </header>
  );
}
