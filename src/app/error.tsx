"use client";
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (<main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center"><h1 className="text-3xl">Something went wrong</h1><p className="mt-2 text-ink/70">We couldn't load this page. Check your connection and try again.</p><button onClick={reset} className="mt-6 rounded-lg bg-forest px-4 py-2 text-ivory">Try again</button></main>);
}
