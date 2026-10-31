import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ControlCenter from "./ControlCenter";

document.documentElement.style.background = "transparent";
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "transparent";

const Route = location.hash === "#control" ? ControlCenter : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Route />
  </StrictMode>,
);
