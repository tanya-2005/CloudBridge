import { Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HomePage } from "@/pages/home-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { TransferPage } from "@/pages/transfer-page";
import { ProgressPage } from "@/pages/progress-page";

function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transfer" element={<TransferPage />} />
        <Route path="/progress" element={<ProgressPage />} />
      </Routes>
    </TooltipProvider>
  );
}

export default App;
