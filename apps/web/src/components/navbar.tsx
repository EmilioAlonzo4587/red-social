import Link from "next/link";

export function Navbar() {
  return (
    <header className="sticky top-0 border-b border-border bg-surface">
      <nav className="flex h-14 items-center px-4">
        <Link href="/" className="text-lg font-bold text-primary">
          ChatInit
        </Link>
      </nav>
    </header>
  );
}
