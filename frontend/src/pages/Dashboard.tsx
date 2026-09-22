import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout';
import { Spinner } from '../components/states';

// Lazy tabs — sirf khula section load ho (mobile perf)
const ChatInterface = lazy(() => import('../components/ChatInterface'));
const ConversationHistory = lazy(() => import('../components/ConversationHistory'));
const SearchView = lazy(() => import('../components/SearchView'));
const NotesSection = lazy(() => import('../components/NotesSection'));
const FileUpload = lazy(() => import('../components/FileUpload'));
const ModelsView = lazy(() => import('../components/ModelsView'));
const UsageStats = lazy(() => import('../components/UsageStats'));
const SettingsPanel = lazy(() => import('../components/SettingsPanel'));

export default function Dashboard(): ReactNode {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Suspense fallback={<Spinner />}><ChatInterface /></Suspense>} />
        <Route path="history" element={<Suspense fallback={<Spinner />}><ConversationHistory /></Suspense>} />
        <Route path="search" element={<Suspense fallback={<Spinner />}><SearchView /></Suspense>} />
        <Route path="notes" element={<Suspense fallback={<Spinner />}><NotesSection /></Suspense>} />
        <Route path="files" element={<Suspense fallback={<Spinner />}><FileUpload /></Suspense>} />
        <Route path="models" element={<Suspense fallback={<Spinner />}><ModelsView /></Suspense>} />
        <Route path="usage" element={<Suspense fallback={<Spinner />}><UsageStats /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<Spinner />}><SettingsPanel /></Suspense>} />
        <Route path="*" element={<p className="py-10 text-center text-slate-500">Section not found.</p>} />
      </Route>
    </Routes>
  );
}
