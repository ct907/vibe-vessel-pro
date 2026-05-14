import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./store/appTint";

createRoot(document.getElementById("root")!).render(<App />);
