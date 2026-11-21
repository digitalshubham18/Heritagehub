import Link from "next/link";
export default function NotFound() {
  return (<main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center"><h1 className="text-4xl">Page not found</h1><p className="mt-2 text-ink/70">That page doesn't exist or has moved.</p><Link href="/destinations" className="mt-6 rounded-lg bg-forest px-4 py-2 text-ivory">Explore destinations</Link></main>);
}
