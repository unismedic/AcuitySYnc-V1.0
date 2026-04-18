import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) {
  let message = 'An unexpected error occurred.';
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.error) {
      message = `Firestore Error: ${parsed.error} (${parsed.operationType} at ${parsed.path})`;
    }
  } catch {
    message = error.message || message;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-red-100">
        <h2 className="text-2xl font-bold text-red-600 mb-4">System Error</h2>
        <p className="text-gray-600 mb-6">{message}</p>
        <button
          onClick={resetErrorBoundary}
          className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

export function ErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      {children}
    </ReactErrorBoundary>
  );
}
