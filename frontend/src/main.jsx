import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./context/AppContext";
import { I18nProvider } from "./i18n";
import "./index.css";
import { restoreZoom } from "./components/Accessibility";

// Apply the saved text size before the first paint, so the interface does
// not visibly jump for a user who needs it larger.
restoreZoom();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
