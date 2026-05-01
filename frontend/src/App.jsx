import { Navigate, Route, Routes } from "react-router-dom";
import { Slide, ToastContainer } from "react-toastify";
import AppLayout from "./layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import ContactsPage from "./pages/ContactsPage";
import TemplatesPage from "./pages/TemplatesPage";
import CampaignsPage from "./pages/CampaignsPage";
import CampaignDetailPage from "./pages/CampaignDetailPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ListDetailPage from "./pages/ListDetailPage";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const Protected = ({ children }) => (localStorage.getItem("token") ? children : <Navigate to="/" replace />);

export default function App() {
  return (
    <>
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="lists/:id" element={<ListDetailPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/:id" element={<CampaignDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
      </Route>
    </Routes>
    <ToastContainer
      position="top-right"
      autoClose={3000}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnHover
      transition={Slide}
      role="alert"
    />
    </>
  );
}
