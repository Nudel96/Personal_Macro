export function PageLoading() {
  return (
    <div className="loading-page">
      {Array.from({ length: 9 }, (_, index) => (
        <div className="skeleton" key={index} />
      ))}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <div className="card error-card negative-text">{message}</div>;
}
