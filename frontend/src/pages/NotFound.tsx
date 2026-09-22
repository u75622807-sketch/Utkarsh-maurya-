import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export default function NotFound(): ReactNode {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl" aria-hidden="true">🧭</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
        Back to dashboard
      </Link>
    </div>
  );
}
