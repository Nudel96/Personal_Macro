import { AlertCircle, LoaderCircle } from "lucide-react";

export function PageLoading() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <div className="loading-caption">
        <LoaderCircle size={16} className="spin" aria-hidden="true" /> Ansicht
        wird geladen …
      </div>
      <div className="loading-page" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <div className="skeleton" key={index} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card error-card" role="alert">
      <AlertCircle size={22} aria-hidden="true" />
      <div>
        <strong>Ansicht konnte nicht geladen werden</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}
