import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { ThemeProvider } from "@/context/theme-provider";
import { MigrationProvider } from "@/context/migration-context";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <MigrationProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MigrationProvider>
    </ThemeProvider>
  </StrictMode>
);
