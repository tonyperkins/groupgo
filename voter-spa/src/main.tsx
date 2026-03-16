import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { applyTheme } from "./tokens";

const savedTheme = (localStorage.getItem("gg_theme") as "dark" | "light") ?? "dark";
applyTheme(savedTheme);
document.body.style.margin = "0";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
