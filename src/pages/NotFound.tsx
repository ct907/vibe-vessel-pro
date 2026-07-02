import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper text-foreground">
      <div className="text-center">
        <h1 className="mb-4 font-display text-4xl font-bold">404</h1>
        <p className="mb-6 text-xl" style={{ color: "var(--ink-soft)" }}>
          Oops! Page not found
        </p>
        <Link to="/" className="btn-sculpt-amber inline-flex items-center justify-center gap-2 rounded-lg px-4 h-9 font-semibold text-sm">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
